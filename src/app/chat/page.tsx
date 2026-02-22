'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const MAX_MESSAGE_LENGTH = 2000

interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
}

const CONVERSATION_STARTERS = [
  'Is free speech under threat?',
  'Should billionaires exist?',
  'Is democracy broken?',
]

function DebaterAvatar() {
  return (
    <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
      <svg width="14" height="14" viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="3" fill="white" fillOpacity="0.9" />
        <circle cx="25" cy="11" r="3" fill="white" fillOpacity="0.9" />
        <circle cx="11" cy="25" r="3" fill="white" fillOpacity="0.9" />
        <circle cx="25" cy="25" r="3" fill="white" fillOpacity="0.9" />
        <line x1="11" y1="11" x2="11" y2="25" stroke="white" strokeWidth="2" strokeOpacity="0.6" strokeLinecap="round" />
        <line x1="25" y1="11" x2="25" y2="25" stroke="white" strokeWidth="2" strokeOpacity="0.6" strokeLinecap="round" />
        <line x1="11" y1="11" x2="25" y2="25" stroke="white" strokeWidth="2.5" strokeOpacity="0.9" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()
  const router = useRouter()

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch('/api/conversations', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const conversation = await res.json()

      if (conversation?.id) {
        setConversationId(conversation.id)
        const msgRes = await fetch(`/api/messages?conversationId=${conversation.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const msgs = await msgRes.json()
        if (Array.isArray(msgs)) {
          setMessages(msgs.map((m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })))
        }
      }
      setLoading(false)
    }
    load()
  }, [supabase.auth])

  const sendMessage = async (text?: string) => {
    const messageText = (text ?? input).trim()
    if (!messageText || isStreaming) return
    if (messageText.length > MAX_MESSAGE_LENGTH) return

    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'

    const newMessages: Message[] = [...messages, { role: 'user', content: messageText }]
    setMessages(newMessages)
    setIsStreaming(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      let currentConvId = conversationId
      if (!currentConvId) {
        const convRes = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        })
        const conv = await convRes.json()
        currentConvId = conv.id
        setConversationId(conv.id)
      }

      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ conversationId: currentConvId, role: 'user', content: messageText }),
      })

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          conversationId: currentConvId,
        }),
      })

      if (!response.ok) throw new Error('Chat request failed')

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader')

      const decoder = new TextDecoder()
      let assistantContent = ''
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'text') {
                assistantContent += data.text
                setMessages((prev) => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { role: 'assistant', content: assistantContent }
                  return updated
                })
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ])
    } finally {
      setIsStreaming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value.slice(0, MAX_MESSAGE_LENGTH)
    setInput(val)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleNewConversation = async () => {
    if (isStreaming) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Deactivate current conversation
      if (conversationId) {
        await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        })
      }

      setMessages([])
      setConversationId(null)
    } catch {
      // Silently fail — user can try again
    }
  }

  const charsLeft = MAX_MESSAGE_LENGTH - input.length
  const showCharWarning = charsLeft < 200

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-[#f8f9fc]">
        <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-[#eaedf2]">
          <div className="skeleton w-16 h-5" />
          <div className="skeleton w-7 h-7 rounded-full" />
        </div>
        <div className="flex-1 px-4 pt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
              <div className={`skeleton h-10 rounded-2xl ${i % 2 === 0 ? 'w-2/3' : 'w-1/2'}`} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-[#eaedf2] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 36 36" fill="none" aria-hidden="true">
            <rect width="36" height="36" rx="10" fill="#4f46e5" />
            <circle cx="11" cy="11" r="3" fill="white" fillOpacity="0.9" />
            <circle cx="25" cy="11" r="3" fill="white" fillOpacity="0.9" />
            <circle cx="11" cy="25" r="3" fill="white" fillOpacity="0.9" />
            <circle cx="25" cy="25" r="3" fill="white" fillOpacity="0.9" />
            <line x1="11" y1="11" x2="11" y2="25" stroke="white" strokeWidth="2" strokeOpacity="0.6" strokeLinecap="round" />
            <line x1="25" y1="11" x2="25" y2="25" stroke="white" strokeWidth="2" strokeOpacity="0.6" strokeLinecap="round" />
            <line x1="11" y1="11" x2="25" y2="25" stroke="white" strokeWidth="2.5" strokeOpacity="0.9" strokeLinecap="round" />
          </svg>
          <span className="text-[15px] font-semibold text-slate-900 tracking-tight">nexo</span>
        </div>
        <div className="flex items-center gap-1.5">
          {messages.length > 0 && (
            <button
              onClick={handleNewConversation}
              disabled={isStreaming}
              className="h-8 px-3 rounded-full flex items-center justify-center gap-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all text-[12px] font-medium disabled:opacity-30"
              title="New conversation"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New
            </button>
          )}
          <button
            onClick={handleSignOut}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
            title="Sign out"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 animate-fade-up">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center mb-5 shadow-lg shadow-indigo-200">
              <svg width="26" height="26" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="3" fill="white" fillOpacity="0.9" />
                <circle cx="25" cy="11" r="3" fill="white" fillOpacity="0.9" />
                <circle cx="11" cy="25" r="3" fill="white" fillOpacity="0.9" />
                <circle cx="25" cy="25" r="3" fill="white" fillOpacity="0.9" />
                <line x1="11" y1="11" x2="11" y2="25" stroke="white" strokeWidth="2" strokeOpacity="0.6" strokeLinecap="round" />
                <line x1="25" y1="11" x2="25" y2="25" stroke="white" strokeWidth="2" strokeOpacity="0.6" strokeLinecap="round" />
                <line x1="11" y1="11" x2="25" y2="25" stroke="white" strokeWidth="2.5" strokeOpacity="0.9" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-[17px] font-semibold text-slate-900 mb-1.5">
              The debater is ready.
            </h2>
            <p className="text-sm text-slate-500 max-w-[240px] leading-relaxed mb-7">
              Say anything. Every opinion will be challenged — that&apos;s the point.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-[280px]">
              {CONVERSATION_STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="w-full py-2.5 px-4 text-sm text-slate-700 bg-white border border-[#eaedf2] rounded-xl hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-all text-left shadow-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex items-end gap-2 animate-fade-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              style={{ animationDelay: `${Math.min(i * 30, 200)}ms` }}
            >
              {msg.role === 'assistant' && <DebaterAvatar />}
              <div
                className={`max-w-[78%] px-4 py-3 rounded-2xl text-[14.5px] leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-[6px]'
                    : 'bg-white border border-[#eaedf2] text-slate-800 rounded-bl-[6px]'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
        </div>

        {isStreaming && messages[messages.length - 1]?.content === '' && (
          <div className="flex items-end gap-2 mt-4 animate-fade-in">
            <DebaterAvatar />
            <div className="bg-white border border-[#eaedf2] px-4 py-3.5 rounded-2xl rounded-bl-[6px] shadow-sm">
              <div className="flex gap-1.5">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-2" />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-[#eaedf2] px-4 pt-3 pb-safe flex-shrink-0">
        <div className="flex items-end gap-2.5">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="What's on your mind?"
              rows={1}
              maxLength={MAX_MESSAGE_LENGTH}
              className="w-full resize-none px-4 py-3 bg-[#f8f9fc] rounded-2xl text-[14.5px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white border border-[#e2e6ee] transition-all pr-4"
              disabled={isStreaming}
            />
            {showCharWarning && (
              <span className="absolute right-3 bottom-3 text-[10px] tabular-nums text-slate-400">
                {charsLeft}
              </span>
            )}
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isStreaming}
            className="flex-shrink-0 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md hover:shadow-indigo-200 active:scale-95"
          >
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
