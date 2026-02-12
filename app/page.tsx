'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ref, set, get } from 'firebase/database';
import { database } from '@/lib/firebase';
import { LOCATIONS } from '@/lib/gameData';
import Image from 'next/image';
import { Users, Clock, MapPin, Sparkles, KeyRound, User, ArrowRight, Play, AlertCircle, X } from 'lucide-react';


export default function Home() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  // Charger le nom sauvegardé
  useEffect(() => {
    const savedName = localStorage.getItem('trovefall_player_name');
    if (savedName) setPlayerName(savedName);
  }, []);

  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(''), 4000);
  };

  const validatePlayerName = (name: string) => {
    if (!name.trim()) return 'Please enter your name';
    if (name.trim().length < 2) return 'Name must be at least 2 characters';
    if (name.trim().length > 20) return 'Name must be less than 20 characters';
    if (!/^[a-zA-Z0-9\s_-]+$/.test(name)) return 'Name can only contain letters, numbers, spaces, _ and -';
    return null;
  };

  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const createRoom = async () => {
    const nameError = validatePlayerName(playerName);
    if (nameError) {
      showError(nameError);
      return;
    }

    setIsCreating(true);
    const code = generateRoomCode();
    const roomRef = ref(database, `rooms/${code}`);

    try {
      // Sauvegarder le nom
      localStorage.setItem('trovefall_player_name', playerName.trim());

      await set(roomRef, {
        host: playerName.trim(),
        players: { 
          [playerName.trim()]: { 
            ready: false, 
            score: 0,
            online: true,
            lastSeen: Date.now()
          } 
        },
        status: 'lobby',
        createdAt: Date.now()
      });

      router.push(`/room/${code}?player=${encodeURIComponent(playerName.trim())}`);
    } catch (error) {
      showError('Error creating room. Please try again.');
      setIsCreating(false);
    }
  };

  const joinRoom = async () => {
    const nameError = validatePlayerName(playerName);
    if (nameError) {
      showError(nameError);
      return;
    }

    if (!roomCode.trim()) {
      showError('Please enter a room code');
      return;
    }

    if (roomCode.trim().length !== 6) {
      showError('Room code must be 6 characters');
      return;
    }

    setIsJoining(true);
    const roomRef = ref(database, `rooms/${roomCode.toUpperCase()}`);

    try {
      const snapshot = await get(roomRef);

      if (!snapshot.exists()) {
        showError('Room not found. Check the code and try again.');
        setIsJoining(false);
        return;
      }

      const roomData = snapshot.val();
      if (roomData.status !== 'lobby') {
        showError('Game already started. Wait for next round.');
        setIsJoining(false);
        return;
      }

      // Sauvegarder le nom
      localStorage.setItem('trovefall_player_name', playerName.trim());

      router.push(`/room/${roomCode.toUpperCase()}?player=${encodeURIComponent(playerName.trim())}`);
    } catch (error) {
      showError('Error joining room. Please try again.');
      setIsJoining(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, action: 'create' | 'join') => {
    if (e.key === 'Enter') {
      if (action === 'create') createRoom();
      else joinRoom();
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      {/* Toast Error */}
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-600/95 backdrop-blur-lg border border-red-500 rounded-lg p-4 shadow-2xl animate-slide-in-right max-w-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-white flex-shrink-0" />
            <div className="flex-1">
              <div className="font-bold text-white text-sm">Error</div>
              <div className="text-red-100 text-xs mt-1">{error}</div>
            </div>
            <button
              onClick={() => setError('')}
              className="hover:bg-red-500/50 p-1 rounded transition-all"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <div className="relative w-full h-[50vh] max-h-[400px]">
        <Image
          src="/trovefall.jpg"
          alt="Trovefall"
          fill
          className="object-cover brightness-[0.4]"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0a0e1a]" />
        
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-3 px-4 animate-fade-in">
            <h1 className="text-5xl md:text-7xl font-bold text-white">
              Trovefall
            </h1>
            <p className="text-lg text-blue-200/80">Find the spy among you</p>
            <div className="flex items-center justify-center gap-6 text-blue-300/70 text-sm pt-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>3-8 players</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>8 min</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Form Column */}
          <div className="space-y-4 animate-fade-in-up">
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">
                Your name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400" />
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onKeyPress={(e) => handleKeyPress(e, 'create')}
                  placeholder="Enter your name"
                  className="w-full pl-11 pr-4 py-3 bg-[#141b2d] border border-blue-900/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  maxLength={20}
                />
              </div>
            </div>

            <button
              onClick={createRoom}
              disabled={isCreating}
              className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
            >
              {isCreating ? (
                'Creating...'
              ) : (
                <>
                  Create game
                  <Play className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-blue-900/30"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-[#0a0e1a] text-gray-500">or join with code</span>
              </div>
            </div>

            <div>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400" />
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  onKeyPress={(e) => handleKeyPress(e, 'join')}
                  placeholder="ABC123"
                  className="w-full pl-11 pr-4 py-3 bg-[#141b2d] border border-blue-900/50 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase font-mono tracking-wider transition-all"
                  maxLength={6}
                />
              </div>
            </div>

            <button
              onClick={joinRoom}
              disabled={isJoining}
              className="w-full py-3 bg-[#141b2d] text-blue-300 font-medium rounded-lg border border-blue-800/50 hover:bg-[#1a2236] hover:border-blue-700 transition-all flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isJoining ? (
                'Joining...'
              ) : (
                <>
                  Join game
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </div>

          {/* How to Play Column */}
          <div className="bg-[#141b2d]/50 rounded-xl p-6 border border-blue-900/30 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            <h2 className="text-xl font-bold text-white mb-4">How to play</h2>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">
                  1
                </div>
                <div>
                  <p className="text-sm text-gray-300">One player is the <strong className="text-blue-400">spy</strong> and doesn&apos;t know the location</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">
                  2
                </div>
                <div>
                  <p className="text-sm text-gray-300">Ask questions to find <strong className="text-blue-400">suspicious behavior</strong></p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">
                  3
                </div>
                <div>
                  <p className="text-sm text-gray-300">Vote to <strong className="text-blue-400">eliminate the spy</strong> before time runs out</p>
                </div>
              </div>
            </div>

            {/* Preview des locations */}
            <div className="mt-6 pt-6 border-t border-blue-900/30">
              <h3 className="text-sm font-semibold text-blue-200 mb-3">Sample Locations</h3>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                {LOCATIONS.slice(0, 6).map((loc, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <MapPin className="w-3 h-3 text-blue-500" />
                    <span>{loc.name}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">+ {LOCATIONS.length - 6} more locations</p>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 mb-8 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <div className="bg-[#141b2d]/50 rounded-lg p-4 border border-blue-900/30 text-center hover:border-blue-700/50 transition-all">
            <MapPin className="w-5 h-5 text-blue-400 mx-auto mb-2" />
            <div className="text-sm font-semibold text-white">{LOCATIONS.length} Locations</div>
            <div className="text-xs text-gray-400 mt-1">Trove worlds</div>
          </div>

          <div className="bg-[#141b2d]/50 rounded-lg p-4 border border-blue-900/30 text-center hover:border-blue-700/50 transition-all">
            <Users className="w-5 h-5 text-blue-400 mx-auto mb-2" />
            <div className="text-sm font-semibold text-white">3-8 Players</div>
            <div className="text-xs text-gray-400 mt-1">Multiplayer</div>
          </div>

          <div className="bg-[#141b2d]/50 rounded-lg p-4 border border-blue-900/30 text-center hover:border-blue-700/50 transition-all">
            <Sparkles className="w-5 h-5 text-blue-400 mx-auto mb-2" />
            <div className="text-sm font-semibold text-white">Real-time</div>
            <div className="text-xs text-gray-400 mt-1">Live sync</div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-500">
          Made with ❤️ for the Trove community
        </div>
      </div>
    </div>
  );
}
