'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ref, onValue, set, update, get, push, onDisconnect, serverTimestamp } from 'firebase/database';
import { database } from '@/lib/firebase';
import { LOCATIONS, TIMER_DURATION } from '@/lib/gameData';
import Image from 'next/image';
import { Users, Clock, Crown, CheckCircle, Play, Eye, Target, Vote, Copy, Check, MessageCircle, Send, Map, Lightbulb, Volume2, VolumeX, UserMinus } from 'lucide-react';


interface Player {
  ready: boolean;
  score: number;
  online?: boolean;
  lastSeen?: number;
}


interface GameState {
  host: string;
  players: Record<string, Player>;
  status: 'lobby' | 'playing' | 'voting' | 'results';
  timer?: number;
  timerRunning?: boolean;
  currentRound?: number;
  roles?: Record<string, { role: string; location: string | null; isSpy: boolean }>;
  votes?: Record<string, string>;
  messages?: Record<string, { sender: string; text: string; timestamp: number }>;
  spyHintUsed?: boolean;
  lastVoteCallTime?: number;
}


export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomCode = params.code as string;
  const playerName = searchParams.get('player') || '';


  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myRole, setMyRole] = useState<{ role: string; location: string | null; isSpy: boolean } | null>(null);
  const [showRole, setShowRole] = useState(false);
  const [selectedVote, setSelectedVote] = useState('');
  const [copied, setCopied] = useState(false);
  const [showLocations, setShowLocations] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [recentlyLeft, setRecentlyLeft] = useState<string[]>([]);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const tickSoundRef = useRef<HTMLAudioElement | null>(null);
  const voteSoundRef = useRef<HTMLAudioElement | null>(null);
  const winSoundRef = useRef<HTMLAudioElement | null>(null);
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);
  const previousPlayersRef = useRef<string[]>([]);


  // Initialize sounds
  useEffect(() => {
    if (typeof window !== 'undefined') {
      tickSoundRef.current = new Audio('/sounds/tick.mp3');
      voteSoundRef.current = new Audio('/sounds/vote.mp3');
      winSoundRef.current = new Audio('/sounds/win.mp3');
      
      backgroundMusicRef.current = new Audio('/sounds/background.mp3');
      backgroundMusicRef.current.loop = true;
      backgroundMusicRef.current.volume = 0.3;
    }
  }, []);


  // Démarre/arrête la musique
  useEffect(() => {
    if (gameState?.status === 'playing' && soundEnabled && backgroundMusicRef.current) {
      backgroundMusicRef.current.play().catch(() => {});
    } else if (backgroundMusicRef.current) {
      backgroundMusicRef.current.pause();
      backgroundMusicRef.current.currentTime = 0;
    }
  }, [gameState?.status, soundEnabled]);


  useEffect(() => {
    if (backgroundMusicRef.current) {
      if (soundEnabled && gameState?.status === 'playing') {
        backgroundMusicRef.current.play().catch(() => {});
      } else {
        backgroundMusicRef.current.pause();
      }
    }
  }, [soundEnabled]);


  useEffect(() => {
    if (!playerName) {
      router.push('/');
      return;
    }

    const roomRef = ref(database, `rooms/${roomCode}`);
    const playerPresenceRef = ref(database, `rooms/${roomCode}/players/${playerName}/online`);
    const lastSeenRef = ref(database, `rooms/${roomCode}/players/${playerName}/lastSeen`);
    
    // Marquer le joueur comme en ligne avec timestamp
    set(playerPresenceRef, true);
    set(lastSeenRef, Date.now());
    
    // Configurer la déconnexion automatique
    const disconnectRef = onDisconnect(playerPresenceRef);
    disconnectRef.set(false);
    
    onDisconnect(lastSeenRef).set(serverTimestamp());
    
    // Heartbeat toutes les 30 secondes pour confirmer la présence
    const heartbeatInterval = setInterval(() => {
      set(lastSeenRef, Date.now());
    }, 30000);
    
    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (!snapshot.exists()) {
        alert('Room not found');
        router.push('/');
        return;
      }

      const data = snapshot.val() as GameState;
      setGameState(data);

      // Détecter les joueurs qui ont quitté (online = false)
      const currentPlayers = Object.keys(data.players);
      const onlinePlayers = currentPlayers.filter(p => data.players[p].online !== false);
      const offlinePlayers = currentPlayers.filter(p => data.players[p].online === false);
      
      const previousPlayers = previousPlayersRef.current;
      
      if (previousPlayers.length > 0) {
        // Détecter les nouveaux joueurs offline
        const newlyOffline = offlinePlayers.filter(p => {
          return previousPlayers.includes(p);
        });
        
        if (newlyOffline.length > 0) {
          setRecentlyLeft(prev => [...new Set([...prev, ...newlyOffline])]);
          
          // Effacer la notification après 5 secondes
          setTimeout(() => {
            setRecentlyLeft(prev => prev.filter(p => !newlyOffline.includes(p)));
          }, 5000);
        }
      }
      
      previousPlayersRef.current = onlinePlayers;

      // Créer le joueur s'il n'existe pas
      if (!data.players[playerName]) {
        update(ref(database, `rooms/${roomCode}/players/${playerName}`), {
          ready: false,
          score: 0,
          online: true,
          lastSeen: Date.now()
        });
      }

      if (data.status === 'playing' && data.roles && data.roles[playerName]) {
        setMyRole(data.roles[playerName]);
      }
    });

    return () => {
      clearInterval(heartbeatInterval);
      unsubscribe();
      set(playerPresenceRef, false);
      set(lastSeenRef, Date.now());
    };
  }, [roomCode, playerName, router]);


  // Nettoyage automatique des joueurs déconnectés (optionnel)
  useEffect(() => {
    if (!gameState || gameState.status !== 'lobby') return;
    
    const cleanupInterval = setInterval(async () => {
      const snapshot = await get(ref(database, `rooms/${roomCode}/players`));
      const players = snapshot.val();
      
      if (!players) return;
      
      const now = Date.now();
      const updates: Record<string, any> = {};
      
      Object.entries(players).forEach(([name, player]: [string, any]) => {
        // Supprimer les joueurs offline depuis plus de 2 minutes
        if (player.online === false && player.lastSeen && (now - player.lastSeen > 120000)) {
          updates[`players/${name}`] = null;
        }
      });
      
      if (Object.keys(updates).length > 0) {
        await update(ref(database, `rooms/${roomCode}`), updates);
      }
    }, 60000); // Check toutes les minutes
    
    return () => clearInterval(cleanupInterval);
  }, [gameState?.status, roomCode]);


  // Auto-start quand tout le monde est prêt
  useEffect(() => {
    if (!gameState || gameState.status !== 'lobby') return;
    
    const playerList = Object.keys(gameState.players).filter(name => gameState.players[name].online !== false);
    const allReady = playerList.length >= 3 && playerList.every(name => gameState.players[name].ready);
    
    if (allReady && gameState.host === playerName) {
      setTimeout(() => {
        startGame();
      }, 2000);
    }
  }, [gameState?.players]);


  // Timer avec son
  useEffect(() => {
    if (!gameState?.timerRunning) return;

    const interval = setInterval(async () => {
      const timerRef = ref(database, `rooms/${roomCode}/timer`);
      const snapshot = await get(timerRef);
      const currentTime = snapshot.val() || 0;

      if (currentTime <= 10 && currentTime > 0 && soundEnabled && tickSoundRef.current) {
        tickSoundRef.current.play().catch(() => {});
      }

      if (currentTime > 0) {
        await set(timerRef, currentTime - 1);
      } else {
        await update(ref(database, `rooms/${roomCode}`), {
          status: 'voting',
          timerRunning: false
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState?.timerRunning, roomCode, soundEnabled]);


  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState?.messages]);


  const toggleReady = async () => {
    if (!gameState) return;
    const currentReady = gameState.players[playerName]?.ready || false;
    await update(ref(database, `rooms/${roomCode}/players/${playerName}`), {
      ready: !currentReady
    });
  };


  const startGame = async () => {
    if (!gameState || gameState.host !== playerName) return;

    const playerNames = Object.keys(gameState.players).filter(name => gameState.players[name].online !== false);
    if (playerNames.length < 3) {
      alert('Need at least 3 players to start');
      return;
    }

    const location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    const spyIndex = Math.floor(Math.random() * playerNames.length);
    const spy = playerNames[spyIndex];

    const roles: Record<string, { role: string; location: string | null; isSpy: boolean }> = {};
    playerNames.forEach((name, index) => {
      const isSpy = name === spy;
      const role = isSpy 
        ? '❓ Spy' 
        : location.roles[index % location.roles.length];
      
      roles[name] = {
        role,
        location: isSpy ? null : location.name,
        isSpy
      };
    });

    await update(ref(database, `rooms/${roomCode}`), {
      status: 'playing',
      timer: TIMER_DURATION,
      timerRunning: true,
      currentRound: (gameState.currentRound || 0) + 1,
      roles,
      votes: {},
      messages: {},
      spyHintUsed: false,
      lastVoteCallTime: 0
    });
  };


  const revealAsSpy = async () => {
    if (!myRole?.isSpy) return;
    
    const guess = prompt(`You are the spy! Guess the location:\n\n${LOCATIONS.map((l, i) => `${i + 1}. ${l.name}`).join('\n')}`);
    if (!guess) return;

    const guessedLocation = LOCATIONS.find(l => 
      l.name.toLowerCase() === guess.toLowerCase() || 
      LOCATIONS.indexOf(l) === parseInt(guess) - 1
    );

    if (guessedLocation && myRole.location === null) {
      const actualLocation = Object.values(gameState?.roles || {}).find(r => !r.isSpy)?.location;
      if (guessedLocation.name === actualLocation) {
        alert('Correct! Spy wins! 🕵️');
        if (soundEnabled && winSoundRef.current) winSoundRef.current.play().catch(() => {});
        await endRound(playerName, true);
      } else {
        alert('Wrong guess! Non-spies win! ❌');
        await endRound(null, false);
      }
    }
  };


  const requestSpyHint = async () => {
    if (!myRole?.isSpy || gameState?.spyHintUsed) return;
    
    const timer = gameState?.timer || 0;
    if (timer > 240) {
      alert('You can only request a hint after 4 minutes have passed!');
      return;
    }

    const actualLocation = Object.values(gameState?.roles || {}).find(r => !r.isSpy)?.location;
    const locationData = LOCATIONS.find(l => l.name === actualLocation);
    
    if (!locationData) return;

    const hints = [
      `The location is related to ${locationData.name.includes('Geode') ? 'Geodes' : locationData.name.includes('Tower') ? 'combat' : 'exploration'}`,
      `This place has ${locationData.roles.length} different roles`,
      `Players often ${locationData.name.includes('Hub') ? 'hang out' : locationData.name.includes('Delves') ? 'farm gems' : 'complete objectives'} here`
    ];
    
    const hint = hints[Math.floor(Math.random() * hints.length)];
    alert(`💡 Hint: ${hint}`);
    
    await update(ref(database, `rooms/${roomCode}`), {
      spyHintUsed: true
    });
  };


  const callForVote = async () => {
    if (!gameState) return;

    const now = Date.now();
    const lastCall = gameState.lastVoteCallTime || 0;
    const cooldownTime = 120000;
    const timeLeft = cooldownTime - (now - lastCall);

    if (timeLeft > 0) {
      const secondsLeft = Math.ceil(timeLeft / 1000);
      alert(`Please wait ${secondsLeft} seconds before calling another vote!`);
      return;
    }

    if (confirm('End discussion and start voting?')) {
      await update(ref(database, `rooms/${roomCode}`), {
        status: 'voting',
        timerRunning: false,
        lastVoteCallTime: now
      });
    }
  };


  const castVote = async () => {
    if (!selectedVote || !gameState) return;
    
    if (soundEnabled && voteSoundRef.current) {
      voteSoundRef.current.play().catch(() => {});
    }
    
    await set(ref(database, `rooms/${roomCode}/votes/${playerName}`), selectedVote);

    const votes = gameState.votes || {};
    const totalVotes = Object.keys(votes).length + 1;
    const activePlayers = Object.keys(gameState.players).filter(name => gameState.players[name].online !== false);
    
    if (totalVotes === activePlayers.length) {
      await processVotes();
    }
  };


  const processVotes = async () => {
    if (!gameState?.votes) return;

    const voteCounts: Record<string, number> = {};
    Object.entries(gameState.votes).forEach(([voter, votedFor]) => {
      voteCounts[votedFor] = (voteCounts[votedFor] || 0) + 1;
    });

    const accused = Object.entries(voteCounts).sort((a, b) => b[1] - a[1])[0][0];
    const isSpyAccused = gameState.roles?.[accused]?.isSpy;

    if (isSpyAccused) {
      alert(`${accused} was the spy! Non-spies win! 🎉`);
      if (soundEnabled && winSoundRef.current) winSoundRef.current.play().catch(() => {});
      await endRound(null, false);
    } else {
      alert(`${accused} was not the spy! Spy wins! 🕵️`);
      if (soundEnabled && winSoundRef.current) winSoundRef.current.play().catch(() => {});
      const spy = Object.entries(gameState.roles || {}).find(([_, r]) => r.isSpy)?.[0];
      await endRound(spy || null, true);
    }
  };


  const endRound = async (winner: string | null, spyWon: boolean) => {
    if (!gameState) return;

    const updates: Record<string, any> = {};
    
    // Mettre à jour les scores
    Object.keys(gameState.players).forEach(name => {
      const currentScore = gameState.players[name].score;
      if (spyWon && gameState.roles?.[name]?.isSpy) {
        updates[`players/${name}/score`] = currentScore + 2;
      } else if (!spyWon && !gameState.roles?.[name]?.isSpy) {
        updates[`players/${name}/score`] = currentScore + 1;
      }
      
      // RESET READY À FALSE pour tous les joueurs
      updates[`players/${name}/ready`] = false;
    });

    await update(ref(database, `rooms/${roomCode}`), {
      status: 'lobby',
      timer: TIMER_DURATION,
      timerRunning: false,
      roles: null,
      votes: null,
      messages: null,
      spyHintUsed: false,
      lastVoteCallTime: 0,
      ...updates
    });

    setMyRole(null);
    setShowRole(false);
  };


  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  const sendMessage = async () => {
    if (!chatMessage.trim() || !gameState) return;
    
    const messagesRef = ref(database, `rooms/${roomCode}/messages`);
    await push(messagesRef, {
      sender: playerName,
      text: chatMessage.trim(),
      timestamp: Date.now()
    });
    
    setChatMessage('');
  };


  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };


  const getVoteCooldown = () => {
    if (!gameState?.lastVoteCallTime) return 0;
    const now = Date.now();
    const cooldownTime = 120000;
    const timeLeft = cooldownTime - (now - gameState.lastVoteCallTime);
    return Math.max(0, Math.ceil(timeLeft / 1000));
  };


  if (!gameState) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }


  const isHost = gameState.host === playerName;
  const playerList = Object.keys(gameState.players).filter(name => gameState.players[name].online !== false);
  const messages = gameState.messages ? Object.values(gameState.messages).sort((a, b) => a.timestamp - b.timestamp) : [];
  const allReady = playerList.length >= 3 && playerList.every(name => gameState.players[name].ready);
  const voteCooldown = getVoteCooldown();


  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      {/* Notification de déconnexion */}
      {recentlyLeft.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {recentlyLeft.map((player, index) => (
            <div 
              key={player}
              className="bg-red-600/95 backdrop-blur-lg border border-red-500 rounded-lg p-4 shadow-2xl animate-slide-in-right max-w-sm"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-center gap-3">
                <div className="bg-red-500 rounded-full p-2">
                  <UserMinus className="w-5 h-5 text-white flex-shrink-0" />
                </div>
                <div>
                  <div className="font-bold text-white text-sm">
                    Player disconnected!
                  </div>
                  <div className="text-red-100 text-xs mt-1">
                    <strong>{player}</strong> left the game
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}


      {/* Hero Section */}
      <div className="relative w-full h-[30vh] max-h-[250px]">
        <Image
          src="/trovefall.jpg"
          alt="Trovefall"
          fill
          className="object-cover brightness-[0.4]"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0a0e1a]" />
        
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-2 px-4">
            <h1 className="text-4xl md:text-5xl font-bold text-white">
              Trovefall
            </h1>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 bg-black/30 px-3 py-1.5 rounded-lg">
                <span className="text-sm text-blue-300">Room:</span>
                <span className="font-mono font-bold text-blue-400">{roomCode}</span>
                <button
                  onClick={copyRoomCode}
                  className="hover:bg-white/10 p-1 rounded transition-all"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-blue-400" />
                  )}
                </button>
              </div>
              <div className="bg-black/30 px-3 py-1.5 rounded-lg text-sm text-white">
                Playing as: <span className="font-medium">{playerName}</span>
              </div>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="bg-black/30 p-2 rounded-lg hover:bg-black/50 transition-all"
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-blue-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>


      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Lobby */}
        {gameState.status === 'lobby' && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* Players */}
            <div className="bg-[#141b2d]/50 rounded-lg p-5 border border-blue-900/30">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-bold text-white">
                  Players ({playerList.length})
                </h2>
              </div>
              
              {allReady && playerList.length >= 3 && (
                <div className="mb-4 bg-green-600/20 border border-green-500/50 rounded-lg p-3 text-center">
                  <p className="text-green-400 text-sm font-semibold">
                    🎮 Starting game in 2 seconds...
                  </p>
                </div>
              )}

              <div className="space-y-2 mb-4">
                {playerList.map(name => (
                  <div
                    key={name}
                    className="flex items-center justify-between bg-[#0a0e1a]/50 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm">{name}</span>
                      {name === gameState.host && (
                        <Crown className="w-4 h-4 text-yellow-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-sm">
                        {gameState.players[name].score}
                      </span>
                      {gameState.players[name].ready && (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={toggleReady}
                className={`w-full py-2.5 rounded-lg font-medium transition-all text-sm ${
                  gameState.players[playerName]?.ready
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-[#0a0e1a] hover:bg-[#0d1221] text-blue-300 border border-blue-800/50'
                }`}
              >
                {gameState.players[playerName]?.ready ? '✓ Ready' : 'Ready Up'}
              </button>
            </div>

            {/* Rules */}
            <div className="bg-[#141b2d]/50 rounded-lg p-5 border border-blue-900/30">
              <h2 className="text-lg font-bold text-white mb-4">How to Play</h2>
              <div className="space-y-3 text-sm text-gray-300 mb-4">
                <p>• One player is the <strong className="text-blue-400">Spy</strong></p>
                <p>• Others know the <strong className="text-blue-400">Location</strong></p>
                <p>• Ask questions to find suspicious players</p>
                <p>• Vote to eliminate the spy before time ends</p>
              </div>

              <button
                onClick={() => setShowLocations(!showLocations)}
                className="w-full py-2 mb-3 bg-[#0a0e1a] text-blue-300 font-medium rounded-lg border border-blue-800/50 hover:bg-[#0d1221] transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Map className="w-4 h-4" />
                {showLocations ? 'Hide' : 'View'} All Locations
              </button>

              {showLocations && (
                <div className="bg-[#0a0e1a]/50 rounded-lg p-3 mb-3 max-h-40 overflow-y-auto">
                  <div className="space-y-1 text-xs text-gray-300">
                    {LOCATIONS.map((loc, i) => (
                      <div key={i}>• {loc.name}</div>
                    ))}
                  </div>
                </div>
              )}

              {isHost && (
                <button
                  onClick={startGame}
                  className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <Play className="w-4 h-4" />
                  Start Game (Manual)
                </button>
              )}
            </div>
          </div>
        )}

        {/* Playing */}
        {gameState.status === 'playing' && myRole && (
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-[#141b2d]/50 rounded-lg p-5 border border-blue-900/30 text-center">
                <Clock className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                <div className={`text-5xl font-bold mb-1 ${(gameState.timer || 0) <= 10 ? 'text-red-400 animate-pulse' : 'text-blue-400'}`}>
                  {formatTime(gameState.timer || 0)}
                </div>
                <div className="text-sm text-gray-400">Time Remaining</div>
              </div>

              <div className="bg-[#141b2d]/50 rounded-lg p-5 border border-blue-900/30">
                {!showRole ? (
                  <button
                    onClick={() => setShowRole(true)}
                    className="w-full py-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-lg rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all flex items-center justify-center gap-2"
                  >
                    <Eye className="w-5 h-5" />
                    Reveal Your Role
                  </button>
                ) : (
                  <div className="text-center">
                    {myRole.isSpy ? (
                      <div className="space-y-3">
                        <div className="text-4xl">🕵️</div>
                        <h3 className="text-2xl font-bold text-red-400">
                          You are the SPY!
                        </h3>
                        <p className="text-gray-300 text-sm">
                          Role: <span className="font-semibold">{myRole.role}</span>
                        </p>
                        <p className="text-xs text-gray-400 mb-3">
                          Figure out the location or reveal to guess!
                        </p>
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={revealAsSpy}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-all flex items-center gap-2 text-sm"
                          >
                            <Target className="w-4 h-4" />
                            Reveal & Guess
                          </button>
                          {!gameState.spyHintUsed && (
                            <button
                              onClick={requestSpyHint}
                              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-lg transition-all flex items-center gap-2 text-sm"
                            >
                              <Lightbulb className="w-4 h-4" />
                              Get Hint
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-4xl">📍</div>
                        <h3 className="text-2xl font-bold text-blue-400">
                          {myRole.location}
                        </h3>
                        <p className="text-gray-300 text-sm">
                          Role: <span className="font-semibold">{myRole.role}</span>
                        </p>
                        <p className="text-xs text-gray-400">
                          Find the spy by asking questions!
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-[#141b2d]/50 rounded-lg p-5 border border-blue-900/30">
                <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  Players
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {playerList.map(name => (
                    <div
                      key={name}
                      className="bg-[#0a0e1a]/50 rounded-lg p-3 text-center"
                    >
                      <div className="text-white font-medium text-sm">{name}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {gameState.players[name].score} pts
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={callForVote}
                disabled={voteCooldown > 0}
                className={`w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 text-sm ${
                  voteCooldown > 0
                    ? 'bg-gray-600 cursor-not-allowed opacity-50 text-gray-300'
                    : 'bg-orange-600 hover:bg-orange-700 text-white'
                }`}
              >
                <Vote className="w-4 h-4" />
                {voteCooldown > 0 ? `Wait ${voteCooldown}s to vote again` : 'Call for Vote'}
              </button>
            </div>

            <div className="bg-[#141b2d]/50 rounded-lg p-4 border border-blue-900/30 flex flex-col h-[600px]">
              <div className="flex items-center gap-2 mb-3">
                <MessageCircle className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Chat</h3>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-2 mb-3">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 text-sm py-8">
                    No messages yet. Start the discussion!
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`p-2 rounded-lg text-sm ${
                        msg.sender === playerName
                          ? 'bg-blue-600/20 ml-4'
                          : 'bg-[#0a0e1a]/50 mr-4'
                      }`}
                    >
                      <div className="font-semibold text-blue-400 text-xs mb-1">
                        {msg.sender}
                      </div>
                      <div className="text-gray-200">{msg.text}</div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 bg-[#0a0e1a] border border-blue-900/50 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={200}
                />
                <button
                  onClick={sendMessage}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Voting */}
        {gameState.status === 'voting' && (
          <div className="max-w-3xl mx-auto bg-[#141b2d]/50 rounded-lg p-5 border border-blue-900/30">
            <div className="text-center mb-5">
              <Vote className="w-8 h-8 text-blue-400 mx-auto mb-2" />
              <h2 className="text-xl font-bold text-white mb-1">
                Voting Phase
              </h2>
              <p className="text-sm text-gray-400">
                Who do you think is the spy?
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {playerList.map(name => (
                <button
                  key={name}
                  onClick={() => setSelectedVote(name)}
                  disabled={name === playerName}
                  className={`p-3 rounded-lg font-medium transition-all text-sm ${
                    selectedVote === name
                      ? 'bg-blue-600 text-white'
                      : name === playerName
                      ? 'bg-[#0a0e1a]/30 text-gray-600 cursor-not-allowed'
                      : 'bg-[#0a0e1a] text-white hover:bg-[#0d1221] border border-blue-900/30'
                  }`}
                >
                  {name}
                  {gameState.votes?.[playerName] === name && ' ✓'}
                </button>
              ))}
            </div>
            <button
              onClick={castVote}
              disabled={!selectedVote || Boolean(gameState.votes?.[playerName])}
              className="w-full py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {gameState.votes?.[playerName] ? 'Vote Cast ✓' : 'Cast Vote'}
            </button>
            <div className="mt-3 text-center text-gray-400 text-xs">
              Votes: {Object.keys(gameState.votes || {}).length} / {playerList.length}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
