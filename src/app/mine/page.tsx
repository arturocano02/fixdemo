'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UserIssue {
  id: string
  stance: string
  intensity: number
  confidence: string
  quotes: string[]
  updated_at: string
  canonical_issues: { id: string; name: string }
}

interface UserConnection {
  id: string
  connection_type: string
  evidence: string
  issue_a: { name: string }
  issue_b: { name: string }
}

const confidenceMeta: Record<string, { label: string; cls: string }> = {
  high:   { label: 'Strong',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  medium: { label: 'Moderate', cls: 'bg-amber-50  text-amber-700  border-amber-200'  },
  low:    { label: 'Weak',     cls: 'bg-slate-50  text-slate-500  border-slate-200'  },
}

function IntensityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 75 ? '#4f46e5' : pct >= 45 ? '#818cf8' : '#a5b4fc'
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Intensity</span>
        <span className="text-[11px] font-semibold text-slate-500 tabular-nums">{pct}%</span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div className="space-y-1.5 flex-1">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-3/4 rounded" />
        </div>
        <div className="skeleton h-5 w-14 rounded-full ml-3" />
      </div>
      <div className="skeleton h-1.5 w-full rounded-full" />
    </div>
  )
}

export default function MinePage() {
  const [issues, setIssues] = useState<UserIssue[]>([])
  const [connections, setConnections] = useState<UserConnection[]>([])
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [refreshResult, setRefreshResult] = useState<string | null>(null)
  const supabase = createClient()

  const loadData = useCallback(async () => {
    const { data: issuesData } = await supabase
      .from('user_issues')
      .select('*, canonical_issues(id, name)')
      .order('intensity', { ascending: false })

    if (issuesData) setIssues(issuesData as unknown as UserIssue[])

    const { data: connectionsData } = await supabase
      .from('user_connections')
      .select('*, issue_a:canonical_issues!user_connections_issue_a_id_fkey(name), issue_b:canonical_issues!user_connections_issue_b_id_fkey(name)')

    if (connectionsData) setConnections(connectionsData as unknown as UserConnection[])

    const { data: profile } = await supabase.from('profiles').select('last_refresh_at').single()
    if (profile?.last_refresh_at) setLastRefresh(profile.last_refresh_at)

    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const handleRefresh = async () => {
    setRefreshing(true)
    setRefreshResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      })
      const result = await res.json()
      if (result.success) {
        await loadData()
        setRefreshResult(
          result.issuesExtracted > 0
            ? `Found ${result.issuesExtracted} issue${result.issuesExtracted !== 1 ? 's' : ''}`
            : 'No new views to extract'
        )
      } else {
        setRefreshResult(result.message || 'Nothing new to process')
      }
    } catch {
      setRefreshResult('Something went wrong')
    } finally {
      setRefreshing(false)
      setTimeout(() => setRefreshResult(null), 4000)
    }
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div className="px-5 pt-6 pb-32 max-w-lg mx-auto">

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">Your Views</h1>
          <div className="flex items-center gap-2 mt-1">
            {loading ? (
              <div className="skeleton h-3.5 w-28 rounded" />
            ) : (
              <>
                <span className="text-sm text-slate-500">
                  {issues.length} {issues.length === 1 ? 'issue' : 'issues'} mapped
                </span>
                {lastRefresh && (
                  <>
                    <span className="text-slate-300 text-xs">•</span>
                    <span className="text-sm text-slate-400">Updated {formatDate(lastRefresh)}</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-full mb-5 py-3 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 active:scale-[0.99]"
        >
          {refreshing ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              Refresh Views
            </>
          )}
        </button>

        {/* Refresh result toast */}
        {refreshResult && (
          <div className="mb-4 text-sm text-center text-slate-600 bg-white border border-[#eaedf2] rounded-xl py-2.5 px-4 animate-fade-in shadow-sm">
            {refreshResult}
          </div>
        )}

        {/* Skeletons */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && issues.length === 0 && (
          <div className="text-center py-14 px-8 animate-fade-up">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1.5">Nothing mapped yet</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Have a conversation, then tap Refresh Views to see your political landscape take shape.
            </p>
          </div>
        )}

        {/* Issue cards */}
        {!loading && (
          <div className="space-y-3">
            {issues.map((issue, i) => {
              const cm = confidenceMeta[issue.confidence] ?? confidenceMeta.low
              const isExpanded = expandedId === issue.id
              return (
                <div
                  key={issue.id}
                  className="card overflow-hidden animate-fade-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : issue.id)}
                    className="w-full text-left p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 text-[14px] leading-snug">
                          {issue.canonical_issues?.name}
                        </h3>
                        <p className="text-[13px] text-slate-500 mt-1 leading-relaxed line-clamp-2">
                          {issue.stance}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${cm.cls}`}>
                          {cm.label}
                        </span>
                        <svg
                          className={`w-4 h-4 text-slate-300 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </div>
                    <div className="mt-3.5">
                      <IntensityBar value={issue.intensity} />
                    </div>
                  </button>

                  {isExpanded && issue.quotes && issue.quotes.length > 0 && (
                    <div className="px-4 pb-4 border-t border-[#eaedf2] animate-scale-in">
                      <p className="text-[11px] uppercase tracking-wide font-medium text-slate-400 mt-3 mb-2.5">Your words</p>
                      <div className="space-y-2">
                        {issue.quotes.map((q, qi) => (
                          <div key={qi} className="text-[13px] text-slate-600 bg-slate-50 rounded-xl px-3.5 py-2.5 italic border border-[#eaedf2] leading-relaxed">
                            &ldquo;{q}&rdquo;
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Connections */}
        {!loading && connections.length > 0 && (
          <div className="mt-8 animate-fade-up delay-200">
            <h2 className="text-[13px] uppercase font-semibold tracking-wide text-slate-400 mb-3">Connections</h2>
            <div className="space-y-2">
              {connections.map((conn) => (
                <div key={conn.id} className="card flex items-center gap-2 text-[13px] text-slate-700 px-4 py-3">
                  <span className="font-medium truncate">{conn.issue_a?.name}</span>
                  <svg className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                  <span className="font-medium truncate">{conn.issue_b?.name}</span>
                  <span className={`ml-auto flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full border font-medium ${
                    conn.connection_type === 'causal'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}>
                    {conn.connection_type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
