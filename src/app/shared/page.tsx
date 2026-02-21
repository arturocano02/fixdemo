'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface AggregateIssue {
  canonical_issue_id: string
  total_users: number
  energy_score: number
  momentum: number
  consensus_score: number
  canonical_issues: { name: string }
}

interface AggregateConnection {
  id: string
  total_weight: number
  user_count: number
  issue_a: { name: string }
  issue_b: { name: string }
}

function ConsensusIndicator({ score }: { score: number }) {
  const { color, label, bg } =
    score > 0.7 ? { color: '#10b981', label: 'Consensus',  bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    : score > 0.4 ? { color: '#f59e0b', label: 'Mixed',      bg: 'bg-amber-50  text-amber-700  border-amber-200'  }
    :               { color: '#ef4444', label: 'Divided',    bg: 'bg-red-50    text-red-700    border-red-200'    }
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${bg}`}>
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: color }} />
      {label}
    </span>
  )
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return (
    <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
      <span className="text-white text-xs font-bold">1</span>
    </div>
  )
  return (
    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
      <span className="text-slate-500 text-xs font-semibold tabular-nums">{rank}</span>
    </div>
  )
}

function SkeletonCard({ rank }: { rank: number }) {
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="skeleton w-7 h-7 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex justify-between">
            <div className="skeleton h-4 w-40 rounded" />
            <div className="skeleton h-4 w-16 rounded-full" />
          </div>
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-1.5 w-full rounded-full" />
        </div>
      </div>
    </div>
  )
}

export default function SharedPage() {
  const [issues, setIssues] = useState<AggregateIssue[]>([])
  const [connections, setConnections] = useState<AggregateConnection[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: issuesData } = await supabase
        .from('aggregate_issues')
        .select('*, canonical_issues(name)')
        .order('energy_score', { ascending: false })
      if (issuesData) setIssues(issuesData as unknown as AggregateIssue[])

      const { data: connectionsData } = await supabase
        .from('aggregate_connections')
        .select('*, issue_a:canonical_issues!aggregate_connections_issue_a_id_fkey(name), issue_b:canonical_issues!aggregate_connections_issue_b_id_fkey(name)')
        .order('total_weight', { ascending: false })
      if (connectionsData) setConnections(connectionsData as unknown as AggregateConnection[])

      setLoading(false)
    }
    load()
  }, [supabase])

  const maxEnergy = issues.length > 0 ? Math.max(...issues.map((i) => i.energy_score)) : 1
  const totalUsers = issues.length > 0 ? Math.max(...issues.map((i) => i.total_users)) : 0

  const getIssueConnections = (issueId: string) => {
    const issue = issues.find((i) => i.canonical_issue_id === issueId)
    if (!issue) return []
    return connections.filter(
      (c) => c.issue_a?.name === issue.canonical_issues?.name || c.issue_b?.name === issue.canonical_issues?.name
    )
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--bg)' }}>
      <div className="px-5 pt-6 pb-32 max-w-lg mx-auto">

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">Collective Views</h1>
          <p className="text-sm text-slate-500 mt-1">
            {loading
              ? <span className="skeleton inline-block w-28 h-3.5 rounded" />
              : `${totalUsers} ${totalUsers === 1 ? 'person' : 'people'} contributing`}
          </p>
        </div>

        {/* Skeletons */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} rank={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && issues.length === 0 && (
          <div className="text-center py-14 px-8 animate-fade-up">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1.5">No collective data yet</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              As people share their views, the collective landscape emerges here.
            </p>
          </div>
        )}

        {/* Ranked cards */}
        {!loading && (
          <div className="space-y-3">
            {issues.map((issue, index) => {
              const issueConns = getIssueConnections(issue.canonical_issue_id)
              const isExpanded = expandedId === issue.canonical_issue_id
              const energyPct = Math.round((issue.energy_score / maxEnergy) * 100)
              const isTop = index === 0

              return (
                <div
                  key={issue.canonical_issue_id}
                  className={`card overflow-hidden animate-fade-up ${isTop ? 'ring-1 ring-indigo-200' : ''}`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : issue.canonical_issue_id)}
                    className="w-full text-left p-4"
                  >
                    <div className="flex items-start gap-3">
                      <RankBadge rank={index + 1} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className={`font-semibold text-[14px] leading-snug ${isTop ? 'text-slate-900' : 'text-slate-800'}`}>
                            {issue.canonical_issues?.name}
                          </h3>
                          <ConsensusIndicator score={issue.consensus_score} />
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[12px] text-slate-500">
                            {issue.total_users} {issue.total_users === 1 ? 'person' : 'people'}
                          </span>
                          {issueConns.length > 0 && (
                            <span className="text-[12px] text-slate-400">
                              {issueConns.length} connection{issueConns.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div className="mt-3">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[11px] uppercase tracking-wide font-medium text-slate-400">Energy</span>
                            <span className="text-[11px] font-semibold text-slate-500 tabular-nums">{energyPct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${energyPct}%`,
                                background: isTop ? '#4f46e5' : '#818cf8',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>

                  {isExpanded && issueConns.length > 0 && (
                    <div className="px-4 pb-4 border-t border-[#eaedf2] animate-scale-in">
                      <p className="text-[11px] uppercase tracking-wide font-medium text-slate-400 mt-3 mb-2.5">Connected issues</p>
                      <div className="space-y-1.5">
                        {issueConns.map((conn) => (
                          <div key={conn.id} className="flex items-center gap-2 text-[13px] text-slate-600 bg-slate-50 rounded-xl px-3.5 py-2.5 border border-[#eaedf2]">
                            <span className="truncate">{conn.issue_a?.name}</span>
                            <svg className="w-3 h-3 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                            <span className="truncate">{conn.issue_b?.name}</span>
                            <span className="ml-auto text-[11px] text-slate-400 flex-shrink-0 tabular-nums">
                              {conn.user_count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {isExpanded && issueConns.length === 0 && (
                    <div className="px-4 pb-4 border-t border-[#eaedf2] animate-scale-in">
                      <p className="text-[13px] text-slate-400 mt-3">No connections mapped yet.</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
