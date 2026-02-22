'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type ProfileForm = {
  fullName: string
  username: string
  bio: string
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ProfileForm>({
    fullName: '',
    username: '',
    bio: '',
  })
  const [email, setEmail] = useState('')
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setEmail(user.email ?? '')
      setCreatedAt(user.created_at ?? null)
      setForm({
        fullName: String(user.user_metadata?.full_name ?? ''),
        username: String(user.user_metadata?.username ?? ''),
        bio: String(user.user_metadata?.bio ?? ''),
      })
      setLoading(false)
    }

    loadUser()
  }, [router, supabase.auth])

  const onChange =
    (key: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
    }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    setError(null)

    try {
      const payload = {
        full_name: form.fullName.trim(),
        username: form.username.trim(),
        bio: form.bio.trim(),
      }

      const { error: updateError } = await supabase.auth.updateUser({
        data: payload,
      })

      if (updateError) throw updateError

      // Sync display_name to profiles table
      if (payload.full_name) {
        await supabase
          .from('profiles')
          .update({ display_name: payload.full_name })
          .eq('id', (await supabase.auth.getUser()).data.user?.id)
      }

      setMessage('Profile updated.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const joinedText = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Unknown'

  if (loading) {
    return (
      <div className="h-full overflow-y-auto" style={{ background: 'var(--bg)' }}>
        <div className="px-5 pt-6 pb-32 max-w-lg mx-auto space-y-4">
          <div className="skeleton h-7 w-40 rounded" />
          <div className="card p-4 space-y-3">
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton h-10 w-full rounded-xl" />
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton h-10 w-full rounded-xl" />
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton h-20 w-full rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div className="px-5 pt-6 pb-32 max-w-lg mx-auto">
        <div className="mb-5">
          <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your account details and session.</p>
        </div>

        <form onSubmit={saveProfile} className="card p-4 space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-slate-600 mb-1.5 uppercase tracking-wide">
              Email
            </label>
            <input
              id="email"
              value={email}
              disabled
              className="input-field opacity-70 cursor-not-allowed"
            />
            <p className="text-[12px] text-slate-400 mt-1.5">
              Email is managed by Supabase Auth. Use your auth flow to change it.
            </p>
          </div>

          <div>
            <label htmlFor="fullName" className="block text-xs font-medium text-slate-600 mb-1.5 uppercase tracking-wide">
              Full name
            </label>
            <input
              id="fullName"
              value={form.fullName}
              onChange={onChange('fullName')}
              maxLength={80}
              className="input-field"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="username" className="block text-xs font-medium text-slate-600 mb-1.5 uppercase tracking-wide">
              Username
            </label>
            <input
              id="username"
              value={form.username}
              onChange={onChange('username')}
              maxLength={40}
              className="input-field"
              placeholder="@username"
            />
          </div>

          <div>
            <label htmlFor="bio" className="block text-xs font-medium text-slate-600 mb-1.5 uppercase tracking-wide">
              Bio
            </label>
            <textarea
              id="bio"
              value={form.bio}
              onChange={onChange('bio')}
              maxLength={280}
              className="input-field min-h-24 resize-none"
              placeholder="Tell people about yourself"
            />
          </div>

          <div className="rounded-xl border border-[#eaedf2] bg-slate-50 px-3.5 py-2.5 text-[13px] text-slate-600">
            Joined {joinedText}
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3.5 py-2.5 rounded-xl">
              {error}
            </div>
          )}

          {message && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 px-3.5 py-2.5 rounded-xl">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        <div className="card p-4 mt-4">
          <button
            onClick={signOut}
            className="w-full py-3 px-4 rounded-xl text-sm font-medium transition-all border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 active:scale-[0.99]"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
