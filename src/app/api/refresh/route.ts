import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const ANALYSIS_PROMPT = `You are the Nexo analysis engine. Your job is to extract political views from a conversation between a user and a political debater.

Analyze ONLY the user's messages (ignore the debater's messages — they're playing devil's advocate).

Extract the following as a JSON object:

{
  "issues": [
    {
      "name": "string — a clear, specific issue name like 'Housing affordability' or 'AI regulation in hiring'. Be specific but not hyper-local. 'Housing affordability' not 'my rent in London'.",
      "stance": "string — a 1-2 sentence summary of the user's position on this issue",
      "intensity": "number 0-1 — how strongly do they feel? 0.2 = mentioned in passing, 0.5 = clear opinion, 0.8 = passionate argument, 1.0 = core conviction",
      "confidence": "low | medium | high — based on quality of evidence: low = mentioned once vaguely, medium = argued with some reasoning, high = argued consistently with specific evidence",
      "quotes": ["array of direct quotes from the user that support this stance — verbatim, max 3"]
    }
  ],
  "connections": [
    {
      "issue_a": "string — name of first issue (must match an issue name above)",
      "issue_b": "string — name of second issue (must match an issue name above)",
      "type": "co_occurrence | causal",
      "evidence": "string — brief explanation of why these are connected"
    }
  ]
}

Rules:
- Only extract issues the user actually expressed a view on. Don't infer views they didn't state.
- Issue names should be general enough to aggregate across users but specific enough to be meaningful.
- If the user didn't express any clear political views in these messages, return empty arrays.
- Be conservative with 'causal' connections — only use when the user explicitly argued that one issue affects another.
- Quotes must be verbatim from the user's messages.

Return ONLY the JSON object, no other text.`

// Confidence to weight mapping
function confidenceWeight(confidence: string): number {
  switch (confidence) {
    case 'high': return 1.0
    case 'medium': return 0.6
    case 'low': return 0.3
    default: return 0.5
  }
}

// Simple string similarity (Levenshtein-based)
function similarity(a: string, b: string): number {
  const al = a.toLowerCase().trim()
  const bl = b.toLowerCase().trim()
  if (al === bl) return 1.0

  const longer = al.length > bl.length ? al : bl
  const shorter = al.length > bl.length ? bl : al

  if (longer.length === 0) return 1.0

  const costs: number[] = []
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) {
        costs[j] = j
      } else if (j > 0) {
        let newValue = costs[j - 1]
        if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
        }
        costs[j - 1] = lastValue
        lastValue = newValue
      }
    }
    if (i > 0) costs[shorter.length] = lastValue
  }
  return (longer.length - costs[shorter.length]) / longer.length
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const authHeader = request.headers.get('authorization')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: authHeader ? { Authorization: authHeader } : {},
        },
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin client for writes that bypass RLS
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Fetch unprocessed messages
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', user.id)

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ message: 'No conversations found', issues: [] })
    }

    const conversationIds = conversations.map((c) => c.id)

    const { data: messages } = await admin
      .from('messages')
      .select('*')
      .in('conversation_id', conversationIds)
      .eq('included_in_refresh', false)
      .order('created_at', { ascending: true })

    if (!messages || messages.length === 0) {
      return NextResponse.json({ message: 'No new messages to process', issues: [] })
    }

    // 2. Format messages for analysis
    const formattedMessages = messages
      .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
      .join('\n\n')

    // 3. Send to Claude for analysis
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `Here is the conversation to analyze:\n\n${formattedMessages}`,
        },
      ],
      system: ANALYSIS_PROMPT,
    })

    const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

    // 4. Parse JSON response
    let analysis: {
      issues: Array<{
        name: string
        stance: string
        intensity: number
        confidence: string
        quotes: string[]
      }>
      connections: Array<{
        issue_a: string
        issue_b: string
        type: string
        evidence: string
      }>
    }

    try {
      // Try to extract JSON from the response (handle potential markdown wrapping)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found in response')
      analysis = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      console.error('Failed to parse analysis response:', parseError)
      console.error('Response was:', responseText)
      return NextResponse.json(
        { error: 'Failed to parse analysis', issues: [] },
        { status: 500 }
      )
    }

    if (!analysis.issues) analysis.issues = []
    if (!analysis.connections) analysis.connections = []

    // 5. Fetch existing canonical issues for matching
    const { data: existingIssues } = await admin
      .from('canonical_issues')
      .select('*')
      .eq('is_active', true)

    const canonicalMap = new Map<string, string>() // issue name -> canonical issue id

    // 6. Process each extracted issue
    for (const issue of analysis.issues) {
      // Find matching canonical issue
      let canonicalId: string = ''

      if (existingIssues) {
        for (const existing of existingIssues) {
          if (similarity(issue.name, existing.name) > 0.8) {
            canonicalId = existing.id
            canonicalMap.set(issue.name, canonicalId)
            break
          }
        }
      }

      // Create new canonical issue if no match
      if (canonicalId === '') {
        const { data: newIssue, error: insertError } = await admin
          .from('canonical_issues')
          .insert({ name: issue.name })
          .select()
          .single()

        if (insertError) {
          // Handle unique constraint — might have been created by another request
          const { data: existing } = await admin
            .from('canonical_issues')
            .select('id')
            .ilike('name', issue.name)
            .single()

          if (existing) {
            canonicalId = existing.id
          } else {
            console.error('Failed to create canonical issue:', insertError)
            continue
          }
        } else {
          canonicalId = newIssue.id
        }
        canonicalMap.set(issue.name, canonicalId)
      }

      // Upsert user issue
      const { error: upsertError } = await admin
        .from('user_issues')
        .upsert(
          {
            user_id: user.id,
            canonical_issue_id: canonicalId,
            stance: issue.stance,
            intensity: issue.intensity,
            confidence: issue.confidence,
            quotes: issue.quotes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,canonical_issue_id' }
        )

      if (upsertError) {
        console.error('Failed to upsert user issue:', upsertError)
      }

      // Update aggregate issues
      // First get current aggregate
      const { data: currentAggregate } = await admin
        .from('aggregate_issues')
        .select('*')
        .eq('canonical_issue_id', canonicalId)
        .single()

      const weight = issue.intensity * confidenceWeight(issue.confidence)

      if (currentAggregate) {
        // Update existing
        const histogram = currentAggregate.stance_histogram || {}
        const stanceKey = issue.stance.substring(0, 50) // Truncate for key
        histogram[stanceKey] = (histogram[stanceKey] || 0) + 1

        await admin
          .from('aggregate_issues')
          .update({
            total_users: currentAggregate.total_users + 1,
            energy_score: currentAggregate.energy_score + weight,
            stance_histogram: histogram,
            updated_at: new Date().toISOString(),
          })
          .eq('canonical_issue_id', canonicalId)
      } else {
        // Create new aggregate
        const histogram: Record<string, number> = {}
        histogram[issue.stance.substring(0, 50)] = 1

        await admin.from('aggregate_issues').insert({
          canonical_issue_id: canonicalId,
          total_users: 1,
          energy_score: weight,
          stance_histogram: histogram,
        })
      }
    }

    // 7. Process connections
    for (const conn of analysis.connections) {
      const issueAId = canonicalMap.get(conn.issue_a)
      const issueBId = canonicalMap.get(conn.issue_b)

      if (!issueAId || !issueBId) continue

      // Sort IDs for consistent edge direction
      const [sortedA, sortedB] =
        issueAId < issueBId ? [issueAId, issueBId] : [issueBId, issueAId]

      await admin.from('user_connections').insert({
        user_id: user.id,
        issue_a_id: sortedA,
        issue_b_id: sortedB,
        connection_type: conn.type === 'causal' ? 'causal' : 'co_occurrence',
        evidence: conn.evidence,
      })

      // Update aggregate connections
      const { data: existingConn } = await admin
        .from('aggregate_connections')
        .select('*')
        .eq('issue_a_id', sortedA)
        .eq('issue_b_id', sortedB)
        .single()

      if (existingConn) {
        await admin
          .from('aggregate_connections')
          .update({
            total_weight: existingConn.total_weight + 1,
            user_count: existingConn.user_count + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingConn.id)
      } else {
        await admin.from('aggregate_connections').insert({
          issue_a_id: sortedA,
          issue_b_id: sortedB,
          total_weight: 1,
          user_count: 1,
        })
      }
    }

    // 8. Mark messages as processed
    const messageIds = messages.map((m) => m.id)
    await admin
      .from('messages')
      .update({ included_in_refresh: true })
      .in('id', messageIds)

    // 9. Update user profile
    await admin
      .from('profiles')
      .update({
        last_refresh_at: new Date().toISOString(),
        total_refreshes: (await admin
          .from('profiles')
          .select('total_refreshes')
          .eq('id', user.id)
          .single()
          .then((r) => r.data?.total_refreshes || 0)) + 1,
      })
      .eq('id', user.id)

    return NextResponse.json({
      success: true,
      issuesExtracted: analysis.issues.length,
      connectionsExtracted: analysis.connections.length,
      messagesProcessed: messages.length,
    })
  } catch (error) {
    console.error('Refresh API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
