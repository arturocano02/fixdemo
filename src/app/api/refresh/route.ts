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

// Ask Claude to match an extracted issue against existing canonical issues
async function matchIssueWithClaude(
  extractedName: string,
  existingIssues: Array<{ id: string; name: string; description: string | null; aliases: string[] }>
): Promise<{ match: 'existing' | 'new'; canonicalId?: string; description?: string }> {
  if (existingIssues.length === 0) {
    return { match: 'new' }
  }

  const issueList = existingIssues.map((issue, i) => {
    let entry = `${i + 1}. "${issue.name}"`
    if (issue.description) entry += ` — ${issue.description}`
    if (issue.aliases && issue.aliases.length > 0) entry += ` (also known as: ${issue.aliases.join(', ')})`
    return entry
  }).join('\n')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `I extracted the political issue "${extractedName}" from a user's conversation.

Here are the existing canonical issues in our database:

${issueList}

Does "${extractedName}" match any of these existing issues? Consider semantic meaning, not just string similarity. For example, "gun control" and "Second Amendment rights" are the same issue. "Climate action" and "Carbon emissions policy" are the same issue.

Respond with ONLY a JSON object:
- If it matches an existing issue: {"match": "existing", "index": <1-based index from the list>}
- If it's genuinely new: {"match": "new", "description": "<brief 1-sentence description of this issue>"}`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { match: 'new' }
    const result = JSON.parse(jsonMatch[0])

    if (result.match === 'existing' && typeof result.index === 'number') {
      const idx = result.index - 1
      if (idx >= 0 && idx < existingIssues.length) {
        return { match: 'existing', canonicalId: existingIssues[idx].id }
      }
    }

    return { match: 'new', description: result.description || undefined }
  } catch {
    return { match: 'new' }
  }
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

    // 5. Fetch ALL existing canonical issues for smart matching
    const { data: existingIssues } = await admin
      .from('canonical_issues')
      .select('id, name, description, aliases')
      .eq('is_active', true)
      .is('merged_into_id', null)

    const existingForMatching = (existingIssues || []).map((issue) => ({
      id: issue.id as string,
      name: issue.name as string,
      description: issue.description as string | null,
      aliases: (issue.aliases || []) as string[],
    }))

    const canonicalMap = new Map<string, string>() // extracted issue name -> canonical issue id

    // 6. Process each extracted issue with Claude-based smart matching
    for (const issue of analysis.issues) {
      let canonicalId: string = ''

      // Use Claude to match against existing issues
      const matchResult = await matchIssueWithClaude(issue.name, existingForMatching)

      if (matchResult.match === 'existing' && matchResult.canonicalId) {
        canonicalId = matchResult.canonicalId
        canonicalMap.set(issue.name, canonicalId)

        // Add extracted name as an alias if it's not already there
        const matched = existingForMatching.find((e) => e.id === canonicalId)
        if (matched) {
          const currentAliases = matched.aliases || []
          const nameLower = issue.name.toLowerCase()
          const alreadyKnown =
            matched.name.toLowerCase() === nameLower ||
            currentAliases.some((a) => a.toLowerCase() === nameLower)

          if (!alreadyKnown) {
            await admin
              .from('canonical_issues')
              .update({ aliases: [...currentAliases, issue.name] })
              .eq('id', canonicalId)
            // Update local copy for subsequent matches
            matched.aliases = [...currentAliases, issue.name]
          }
        }
      } else {
        // Create new canonical issue
        const { data: newIssue, error: insertError } = await admin
          .from('canonical_issues')
          .insert({
            name: issue.name,
            description: matchResult.description || null,
          })
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
          // Add to local list for subsequent matching in this batch
          existingForMatching.push({
            id: newIssue.id,
            name: issue.name,
            description: matchResult.description || null,
            aliases: [],
          })
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

      // Update aggregate issues with proper confidence weighting
      const { data: currentAggregate } = await admin
        .from('aggregate_issues')
        .select('*')
        .eq('canonical_issue_id', canonicalId)
        .single()

      const weight = issue.intensity * confidenceWeight(issue.confidence)

      if (currentAggregate) {
        const histogram = currentAggregate.stance_histogram || {}
        const stanceKey = issue.stance.substring(0, 50)
        histogram[stanceKey] = (histogram[stanceKey] || 0) + 1

        // Calculate consensus: 1.0 = everyone agrees, 0.0 = maximally divided
        const totalVotes = Object.values(histogram).reduce((s: number, v) => s + (v as number), 0)
        const maxVotes = Math.max(...Object.values(histogram).map(v => v as number))
        const consensusScore = totalVotes > 0 ? maxVotes / totalVotes : 0

        // Energy = cumulative weighted intensity (higher confidence = more energy contribution)
        const newTotalUsers = currentAggregate.total_users + 1
        const newEnergyScore = currentAggregate.energy_score + weight

        await admin
          .from('aggregate_issues')
          .update({
            total_users: newTotalUsers,
            energy_score: newEnergyScore,
            stance_histogram: histogram,
            consensus_score: consensusScore,
            updated_at: new Date().toISOString(),
          })
          .eq('canonical_issue_id', canonicalId)
      } else {
        const histogram: Record<string, number> = {}
        histogram[issue.stance.substring(0, 50)] = 1

        await admin.from('aggregate_issues').insert({
          canonical_issue_id: canonicalId,
          total_users: 1,
          energy_score: weight,
          stance_histogram: histogram,
          consensus_score: 1.0, // First user = full consensus
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

    // 10. Generate reflection prompt (non-blocking — don't fail the whole refresh)
    let reflectionPrompt: string | null = null
    if (analysis.issues.length > 0) {
      try {
        const issuesSummary = analysis.issues
          .map((i) => `${i.name}: ${i.stance}`)
          .join('\n')

        const reflectionResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          messages: [
            {
              role: 'user',
              content: `Based on these political positions a user just expressed:\n\n${issuesSummary}\n\nGenerate ONE thought-provoking reflection question (1-2 sentences) that could help them think more deeply about their views. The question should highlight a tension, an assumption, or a connection they might not have considered. Be specific to their actual views, not generic.\n\nReturn ONLY the question, nothing else.`,
            },
          ],
        })

        reflectionPrompt =
          reflectionResponse.content[0].type === 'text'
            ? reflectionResponse.content[0].text.trim()
            : null

        if (reflectionPrompt) {
          await admin.from('reflection_prompts').insert({
            user_id: user.id,
            prompt_text: reflectionPrompt,
          })
        }
      } catch (e) {
        console.error('Reflection prompt generation failed (non-fatal):', e)
      }
    }

    return NextResponse.json({
      success: true,
      issuesExtracted: analysis.issues.length,
      connectionsExtracted: analysis.connections.length,
      messagesProcessed: messages.length,
      reflectionPrompt,
    })
  } catch (error) {
    console.error('Refresh API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
