import './global.css'
import type { Metadata } from 'next'
import Navbar from './components/Navbar'

export const metadata: Metadata = {
  title: 'Trovefall - Spy Game',
  description: 'A Spyfall-inspired game set in the Trove universe',
  icons: {
    icon: '/favicon.ico',
    apple: '/favicon.ico',
  },
  openGraph: {
    title: 'Trovefall - Spy Game',
    description: 'A Spyfall-inspired game set in the Trove universe',
    images: ['/trovefall.jpg'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trovefall - Spy Game',
    description: 'A Spyfall-inspired game set in the Trove universe',
    images: ['/trovefall.jpg'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-[#0a0e1a]">
        <Navbar />
        
        <div className="pt-16">
          {children}
        </div>
      </body>
    </html>
  )
}
