import Link from 'next/link';
import Image from 'next/image';

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#141b2d]/80 backdrop-blur-lg border-b border-blue-900/30">
      <div className="max-w-7xl mx-auto px-4 py-2">
        <div className="flex items-center justify-center">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Image
              src="/favicon.ico"
              alt="Trovefall Logo"
              width={80}
              height={30}
              className="object-contain rounded"
              priority
            />
          </Link>
        </div>
      </div>
    </nav>
  );
}
