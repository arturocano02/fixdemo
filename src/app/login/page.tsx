'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

function NexoLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect width="36" height="36" rx="10" fill="#4f46e5" />
      {/* Node graph mark — 4 nodes connected in an N pattern */}
      <circle cx="11" cy="11" r="3" fill="white" fillOpacity="0.9" />
      <circle cx="25" cy="11" r="3" fill="white" fillOpacity="0.9" />
      <circle cx="11" cy="25" r="3" fill="white" fillOpacity="0.9" />
      <circle cx="25" cy="25" r="3" fill="white" fillOpacity="0.9" />
      <line x1="11" y1="11" x2="11" y2="25" stroke="white" strokeWidth="2" strokeOpacity="0.6" strokeLinecap="round" />
      <line x1="25" y1="11" x2="25" y2="25" stroke="white" strokeWidth="2" strokeOpacity="0.6" strokeLinecap="round" />
      <line x1="11" y1="11" x2="25" y2="25" stroke="white" strokeWidth="2.5" strokeOpacity="0.9" strokeLinecap="round" />
    </svg>
  )
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (email.length > 254 || password.length > 128) {
      setError('Input too long')
      return
    }
    setLoading(true)
    setError(null)

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
      router.push('/chat')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-12"
      style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(79,70,229,0.12) 0%, transparent 70%), #f8f9fc',
      }}
    >
      <div className="w-full max-w-[360px] animate-fade-up">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <NexoLogo />
            <span className="text-[28px] font-semibold tracking-tight text-slate-900">nexo</span>
          </div>
          <p className="text-sm text-slate-500 leading-relaxed">
            Discover what you actually believe
          </p>
        </div>

        {/* Mode pills */}
        <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
          <button
            type="button"
            onClick={() => { setIsSignUp(false); setError(null) }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              !isSignUp
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setIsSignUp(true); setError(null) }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              isSignUp
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Create account
          </button>
        </div>

        {/* Card */}
        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-600 mb-1.5 uppercase tracking-wide">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.slice(0, 254))}
                required
                autoComplete="email"
                className="input-field"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-slate-600 mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value.slice(0, 128))}
                required
                minLength={6}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                className="input-field"
                placeholder={isSignUp ? 'At least 6 characters' : '••••••••'}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2.5 text-sm text-red-700 bg-red-50 border border-red-100 px-4 py-3 rounded-xl animate-fade-in">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {isSignUp ? 'Creating account…' : 'Signing in…'}
                </>
              ) : (
                isSignUp ? 'Create account' : 'Sign in'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-6 leading-relaxed px-4">
          A space to argue, reflect, and discover where you actually stand.
        </p>
      </div>
    </div>
  )
}
