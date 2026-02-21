import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const DEBATER_SYSTEM_PROMPT = `You are Nexo's political debater — a sharp, witty, no-nonsense conversationalist who challenges people to think clearly about politics.

Your personality:
- You play devil's advocate. Whatever position the user takes, you push back. Not to be contrarian, but to make them defend their views with logic and evidence.
- You're provocative but not cruel. You use humor, directness, and occasionally pointed observations to keep the conversation engaging.
- You're concise. No walls of text. You match the user's energy — short replies to casual comments, longer responses when they make a substantive argument.
- You use real-world examples, data, and counterarguments. Don't be vague.
- You never tell the user what to think. You ask questions that make them think harder.
- You're comfortable with disagreement. You don't try to reach consensus.
- You don't moralize or lecture. If someone holds a view you'd normally push back on, you push back with arguments, not with disapproval.
- You adapt. If someone is clearly knowledgeable, raise your game. If someone is exploring a topic for the first time, be more Socratic.

What you never do:
- Never say "that's a great point" or "I see what you mean" as empty filler
- Never summarize what the user just said back to them
- Never both-sides everything into meaningless mush
- Never refuse to engage with a political topic (you're a political debater — this is your job)
- Never give your "true opinion" — you're a sparring partner, not a pundit

Your goal: make the user think harder, articulate more clearly, and discover what they actually believe — not what they think they're supposed to believe.

Keep responses under 150 words unless the user is making a long, detailed argument that warrants a longer response.`

// Helper to get supabase client with user's auth
function getSupabaseClient(authHeader: string | null) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    }
  )
}

const MAX_MESSAGE_LENGTH = 2000
const MAX_MESSAGES_HISTORY = 40

export async function POST(request: NextRequest) {
  try {
    // Reject oversized payloads early
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > 200_000) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    const authHeader = request.headers.get('authorization')
    const supabase = getSupabaseClient(authHeader)

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { messages, conversationId } = body

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array required' }, { status: 400 })
    }

    // Validate each message
    for (const msg of messages) {
      if (!msg.role || !['user', 'assistant'].includes(msg.role)) {
        return NextResponse.json({ error: 'Invalid message role' }, { status: 400 })
      }
      if (typeof msg.content !== 'string' || msg.content.length > MAX_MESSAGE_LENGTH) {
        return NextResponse.json({ error: 'Message content too long' }, { status: 400 })
      }
    }

    // Truncate history to prevent runaway context
    const truncatedMessages = messages.slice(-MAX_MESSAGES_HISTORY)

    // Format messages for Anthropic
    const anthropicMessages = truncatedMessages.map((msg: { role: string; content: string }) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }))

    // Stream response from Anthropic
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: DEBATER_SYSTEM_PROMPT,
      messages: anthropicMessages,
    })

    // Create a ReadableStream that emits SSE events
    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        let fullResponse = ''

        stream.on('text', (text) => {
          fullResponse += text
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'text', text })}\n\n`)
          )
        })

        stream.on('end', async () => {
          // Save assistant message to Supabase
          if (conversationId && fullResponse) {
            const adminClient = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
              { auth: { autoRefreshToken: false, persistSession: false } }
            )
            await adminClient.from('messages').insert({
              conversation_id: conversationId,
              role: 'assistant',
              content: fullResponse,
            })
          }
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
          )
          controller.close()
        })

        stream.on('error', (error) => {
          console.error('Anthropic stream error:', error)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', error: 'Stream error' })}\n\n`
            )
          )
          controller.close()
        })
      },
    })

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
