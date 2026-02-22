'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  {
    href: '/chat',
    label: 'Chat',
    icon: (active: boolean) => (
      <svg className="w-[22px] h-[22px]" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.8} stroke="currentColor">
        {active ? (
          <path fillRule="evenodd" clipRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223 19.76 19.76 0 00-.004-.002z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        )}
      </svg>
    ),
  },
  {
    href: '/mine',
    label: 'Mine',
    icon: (active: boolean) => (
      <svg className="w-[22px] h-[22px]" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.8} stroke="currentColor">
        {active ? (
          <path fillRule="evenodd" clipRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        )}
      </svg>
    ),
  },
  {
    href: '/shared',
    label: 'Shared',
    icon: (active: boolean) => (
      <svg className="w-[22px] h-[22px]" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.8} stroke="currentColor">
        {active ? (
          <path fillRule="evenodd" clipRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM6.262 6.072a8.25 8.25 0 1010.562-.766 4.5 4.5 0 01-1.318 1.357L14.25 7.5l.165.33a.809.809 0 01-1.086 1.085l-.604-.302a1.125 1.125 0 00-1.298.21l-.132.131c-.439.44-.439 1.152 0 1.591l.296.296c.256.257.622.374.98.314l1.17-.195c.323-.054.654.036.905.245l1.33 1.108c.32.267.46.694.358 1.1a8.7 8.7 0 01-2.288 4.04l-.723.724a1.125 1.125 0 01-1.298.21l-.153-.076a1.125 1.125 0 01-.622-1.006v-1.089c0-.298-.119-.585-.33-.796l-1.347-1.347a1.125 1.125 0 01-.21-1.298L9.75 12l-1.64-1.64a6 6 0 01-1.676-3.257l-.172-1.03z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
        )}
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: (active: boolean) => (
      <svg className="w-[22px] h-[22px]" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={active ? 0 : 1.8} stroke="currentColor">
        {active ? (
          <path fillRule="evenodd" clipRule="evenodd" d="M10.68 2.243a1.125 1.125 0 012.64 0l.187.779a1.125 1.125 0 001.675.72l.7-.391a1.125 1.125 0 011.869 1.32l-.392.699a1.125 1.125 0 00.72 1.676l.779.186a1.125 1.125 0 010 2.64l-.779.187a1.125 1.125 0 00-.72 1.675l.392.7a1.125 1.125 0 01-1.32 1.869l-.699-.392a1.125 1.125 0 00-1.676.72l-.186.779a1.125 1.125 0 01-2.64 0l-.187-.779a1.125 1.125 0 00-1.675-.72l-.7.392a1.125 1.125 0 01-1.869-1.32l.392-.699a1.125 1.125 0 00-.72-1.676l-.779-.186a1.125 1.125 0 010-2.64l.779-.187a1.125 1.125 0 00.72-1.675l-.392-.7a1.125 1.125 0 011.32-1.869l.699.392a1.125 1.125 0 001.676-.72l.186-.779zM12 9a3 3 0 100 6 3 3 0 000-6z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0112.75-5.303l1.06-1.06a.75.75 0 111.06 1.06l-1.06 1.06A7.5 7.5 0 1112 4.5m0 5.25a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" />
        )}
      </svg>
    ),
  },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid #eaedf2',
      }}
    >
      <div className="flex items-stretch h-16 pb-safe">
        {tabs.map((tab) => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors duration-150 ${active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <div className={`absolute top-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full bg-indigo-600 transition-all duration-200 ${active ? 'w-6 opacity-100' : 'w-0 opacity-0'}`} />
              {tab.icon(active)}
              <span className={`text-[10px] font-semibold tracking-wide ${active ? 'text-indigo-600' : 'text-slate-400'}`}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
