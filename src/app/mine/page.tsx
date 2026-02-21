'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UserIssue {
  id: string
  stance: string
  intensity: number
  confidence: string
  quotes: string[]
  updated_at: string
  canonical_issues: {
    id: string
    name: string
  }
}

interface UserConnection {
  id: string
  connection_type: string
  evidence: string
  issue_a: { name: string }
  issue_b: { name: string }
}

export default function MinePage() {
  const [issues, setIssues] = useState<UserIssue[]>([])
  const [connections, setConnections] = useState<UserConnection[]>([])
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const supabase = createClient()

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // Fetch user issues with canonical issue names
    const { data: issuesData } = await supabase
      .from('user_issues')
      .select('*, canonical_issues(id, name)')
      .order('intensity', { ascending: false })

    if (issuesData) {
      setIssues(issuesData as unknown as UserIssue[])
    }

    // Fetch connections
    const { data: connectionsData } = await supabase
      .from('user_connections')
      .select('*, issue_a:canonical_issues!user_connections_issue_a_id_fkey(name), issue_b:canonical_issues!user_connections_issue_b_id_fkey(name)')

    if (connectionsData) {
      setConnections(connectionsData as unknown as UserConnection[])
    }

    // Fetch profile for last refresh
    const { data: profile } = await supabase
      .from('profiles')
      .select('last_refresh_at')
      .single()

    if (profile?.last_refresh_at) {
      setLastRefresh(profile.last_refresh_at)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch('/api/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      const result = await res.json()
      if (result.success) {
        await loadData()
      }
    } catch (error) {
      console.error('Refresh error:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const confidenceColor = (c: string) => {
    switch (c) {
      case 'high': return 'bg-emerald-100 text-emerald-700'
      case 'medium': return 'bg-amber-100 text-amber-700'
      case 'low': return 'bg-slate-100 text-slate-600'
      default: return 'bg-slate-100 text-slate-600'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-slate-400 text-sm">Loading your views...</div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="px-5 pt-6 pb-32">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Your Views</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-slate-500">
              {issues.length} {issues.length === 1 ? 'issue' : 'issues'} mapped
            </span>
            {lastRefresh && (
              <>
                <span className="text-slate-300">|</span>
                <span className="text-sm text-slate-400">
                  Last refresh {new Date(lastRefresh).toLocaleDateString()}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-full mb-6 py-3 px-4 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
        >
          {refreshing ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analyzing conversations...
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

        {/* Empty state */}
        {issues.length === 0 && (
          <div className="text-center py-16 px-8">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              No views mapped yet
            </h3>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              Start a conversation with the debater, then hit Refresh Views to see your political landscape emerge.
            </p>
          </div>
        )}

        {/* Issue cards */}
        <div className="space-y-3">
          {issues.map((issue) => (
            <div
              key={issue.id}
              className="border border-slate-150 rounded-2xl overflow-hidden transition-all duration-200"
            >
              <button
                onClick={() => setExpandedId(expandedId === issue.id ? null : issue.id)}
                className="w-full text-left p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-slate-900 text-sm">
                      {issue.canonical_issues?.name}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                      {issue.stance}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${confidenceColor(issue.confidence)}`}>
                    {issue.confidence}
                  </span>
                </div>

                {/* Intensity bar */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">Intensity</span>
                    <span className="text-xs text-slate-500 font-medium">
                      {Math.round(issue.intensity * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${issue.intensity * 100}%` }}
                    />
                  </div>
                </div>
              </button>

              {/* Expanded quotes */}
              {expandedId === issue.id && issue.quotes && issue.quotes.length > 0 && (
                <div className="px-4 pb-4 pt-0 border-t border-slate-100">
                  <p className="text-xs text-slate-400 font-medium mt-3 mb-2">Supporting evidence</p>
                  <div className="space-y-2">
                    {issue.quotes.map((quote, qi) => (
                      <div key={qi} className="text-xs text-slate-600 bg-slate-50 rounded-xl px-3 py-2 italic">
                        &ldquo;{quote}&rdquo;
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Connections */}
        {connections.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">
              Connections
            </h2>
            <div className="space-y-2">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-3"
                >
                  <span className="font-medium">{conn.issue_a?.name}</span>
                  <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                  <span className="font-medium">{conn.issue_b?.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ml-auto flex-shrink-0 ${
                    conn.connection_type === 'causal'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
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
