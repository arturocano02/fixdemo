'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface AggregateIssue {
  canonical_issue_id: string
  total_users: number
  energy_score: number
  momentum: number
  consensus_score: number
  canonical_issues: {
    name: string
  }
}

interface AggregateConnection {
  id: string
  total_weight: number
  user_count: number
  issue_a: { name: string }
  issue_b: { name: string }
}

export default function SharedPage() {
  const [issues, setIssues] = useState<AggregateIssue[]>([])
  const [connections, setConnections] = useState<AggregateConnection[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      const { data: issuesData } = await supabase
        .from('aggregate_issues')
        .select('*, canonical_issues(name)')
        .order('energy_score', { ascending: false })

      if (issuesData) {
        setIssues(issuesData as unknown as AggregateIssue[])
      }

      const { data: connectionsData } = await supabase
        .from('aggregate_connections')
        .select('*, issue_a:canonical_issues!aggregate_connections_issue_a_id_fkey(name), issue_b:canonical_issues!aggregate_connections_issue_b_id_fkey(name)')
        .order('total_weight', { ascending: false })

      if (connectionsData) {
        setConnections(connectionsData as unknown as AggregateConnection[])
      }

      setLoading(false)
    }
    loadData()
  }, [supabase])

  const maxEnergy = issues.length > 0 ? Math.max(...issues.map((i) => i.energy_score)) : 1
  const totalUsers = issues.length > 0 ? Math.max(...issues.map((i) => i.total_users)) : 0

  const consensusColor = (score: number) => {
    if (score > 0.7) return 'bg-emerald-400'
    if (score > 0.4) return 'bg-amber-400'
    return 'bg-red-400'
  }

  const getIssueConnections = (issueId: string) => {
    return connections.filter((c) => {
      // Find matching canonical issue
      const issue = issues.find((i) => i.canonical_issue_id === issueId)
      if (!issue) return false
      return c.issue_a?.name === issue.canonical_issues?.name ||
             c.issue_b?.name === issue.canonical_issues?.name
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-slate-400 text-sm">Loading collective views...</div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="px-5 pt-6 pb-32">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">
            What Everyone&apos;s Talking About
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {totalUsers} {totalUsers === 1 ? 'person' : 'people'} contributing
          </p>
        </div>

        {/* Empty state */}
        {issues.length === 0 && (
          <div className="text-center py-16 px-8">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              No collective data yet
            </h3>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              As more people share their views, the collective landscape will emerge here.
            </p>
          </div>
        )}

        {/* Ranked issue cards */}
        <div className="space-y-3">
          {issues.map((issue, index) => {
            const issueConns = getIssueConnections(issue.canonical_issue_id)
            return (
              <div
                key={issue.canonical_issue_id}
                className="border border-slate-150 rounded-2xl overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() =>
                    setExpandedId(
                      expandedId === issue.canonical_issue_id
                        ? null
                        : issue.canonical_issue_id
                    )
                  }
                  className="w-full text-left p-4"
                >
                  <div className="flex items-start gap-3">
                    {/* Rank */}
                    <span className="text-lg font-bold text-slate-300 w-7 flex-shrink-0 text-right tabular-nums">
                      {index + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-slate-900 text-sm truncate">
                          {issue.canonical_issues?.name}
                        </h3>
                        {/* Consensus dot */}
                        <div
                          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${consensusColor(issue.consensus_score)}`}
                          title={`Consensus: ${Math.round(issue.consensus_score * 100)}%`}
                        />
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-slate-500">
                          {issue.total_users} {issue.total_users === 1 ? 'person' : 'people'}
                        </span>
                      </div>

                      {/* Energy bar */}
                      <div className="mt-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-400">Energy</span>
                          <span className="text-xs text-slate-500 font-medium tabular-nums">
                            {Math.round((issue.energy_score / maxEnergy) * 100)}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                            style={{
                              width: `${(issue.energy_score / maxEnergy) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expanded connections */}
                {expandedId === issue.canonical_issue_id && issueConns.length > 0 && (
                  <div className="px-4 pb-4 pt-0 border-t border-slate-100">
                    <p className="text-xs text-slate-400 font-medium mt-3 mb-2">
                      Connected issues
                    </p>
                    <div className="space-y-1.5">
                      {issueConns.map((conn) => (
                        <div
                          key={conn.id}
                          className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2"
                        >
                          <span>{conn.issue_a?.name}</span>
                          <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                          </svg>
                          <span>{conn.issue_b?.name}</span>
                          <span className="text-slate-400 ml-auto">
                            {conn.user_count} {conn.user_count === 1 ? 'person' : 'people'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
