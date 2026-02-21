'use client'

import { usePathname } from 'next/navigation'
import BottomNav from './BottomNav'

const protectedPaths = ['/chat', '/mine', '/shared', '/settings']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const showNav = protectedPaths.some((p) => pathname.startsWith(p))

  return (
    <div className="h-screen flex flex-col">
      <main className={`flex-1 overflow-hidden ${showNav ? 'pb-16' : ''}`}>
        {children}
      </main>
      {showNav && <BottomNav />}
    </div>
  )
}
