import React, { useEffect, useState } from 'react';
import { Sparkles, Send, MessageSquare, BarChart2, X, Bot } from 'lucide-react';
import { chatWithZidAi, type ZidAiChatTurn } from '../lib/aiService';
import { getZidAiSmartFallback } from '../lib/zidAiFallback';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

const CHAT_STORAGE_KEY = 'zid_ai_assistant_history';

const WELCOME_MESSAGE =
  'Hello! I am Zid AI — your Sales Copilot & Platform Support Specialist. Ask me about products, orders, payments, plans/subscriptions, or how to grow your sales.\n\n' +
  'আমি বাংলা ও ইংরেজি — দুই ভাষাতেই উত্তর দিতে পারি। যে ভাষায় লিখবেন, সেই ভাষায়ই উত্তর পাবেন।';

/** Loads the persisted conversation so multi-turn chat survives reloads. */
function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* ignore malformed storage */
  }
  return [{ role: 'ai', content: WELCOME_MESSAGE }];
}

export const ZidAiAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  // Persist the chat stream so the merchant can hold a multi-turn conversation
  // across drawer open/close and page reloads.
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* storage full or unavailable — chat still works in-memory */
    }
  }, [messages]);

  const sendQuery = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || isThinking) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const history = messages.concat(userMsg);
    setMessages(history);
    setInput('');
    setIsThinking(true);

    // Send the FULL conversation to the live endpoint so the model keeps
    // language + topic context across turns.
    const turns: ZidAiChatTurn[] = history.map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    let answer: string;
    try {
      const result = await chatWithZidAi(turns);
      // Live answer when available, otherwise the smart fallback engine — never
      // a generic "temporarily unavailable" message.
      answer = result.ok && result.reply ? result.reply : getZidAiSmartFallback(trimmed);
    } catch {
      answer = getZidAiSmartFallback(trimmed);
    }

    setMessages((prev) => [...prev, { role: 'ai', content: answer }]);
    setIsThinking(false);
  };

  const quickAsk = (query: string) => {
    void sendQuery(query);
  };

  if (!isOpen) return (
    <button onClick={() => setIsOpen(true)} aria-label="Open Zid AI Assistant" title="Open Zid AI Assistant" className="zid-ai-trigger group fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-gradient-to-br from-[#1A2235] via-[#151923] to-[#0F1420] text-amber-300 shadow-[0_12px_35px_rgba(0,0,.55)] transition-all duration-300 hover:-translate-y-1 hover:scale-105 hover:border-amber-300/60 hover:text-amber-200 hover:shadow-amber-500/25">
      {/* Pulse ring */}
      <span className="absolute inset-0 rounded-2xl border border-amber-400/30 opacity-0 group-hover:opacity-100 animate-ping" aria-hidden="true" style={{ animationDuration: '2s' }} />
      {/* Glow behind icon */}
      <span className="absolute inset-2 rounded-xl bg-amber-400/10 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" aria-hidden="true" />
      <Sparkles className="relative z-10 h-7 w-7 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]" />
      <span className="zid-ai-trigger__badge absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 shadow-[0_8px_rgba(251,191,36,0.6)]" aria-hidden="true">
        <Sparkles className="h-2.5 w-2.5 text-[#0F1420]" />
      </span>
    </button>
  );
  return (
    <div className="fixed bottom-6 right-6 w-96 h-[500px] bg-[#181B26] border border-amber-400/15 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden shadow-amber-500/5">
      <header className="relative flex items-center justify-between border-b border-amber-400/15 bg-gradient-to-r from-[#0B0F1A] via-[#12172B] to-[#0B0F1A] px-5 py-4">
        {/* Top accent line — Zid gold */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
        {/* Header glow */}
        <div className="absolute -top-10 left-1/2 h-20 w-3/4 -translate-x-1/2 rounded-full bg-amber-400/5 blur-2xl" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-400/20 to-amber-500/5 text-amber-300 shadow-inner shadow-amber-400/10">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-wide text-white">Zid AI</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
              </span>
              Sales copilot online
            </p>
          </div>
        </div>
        <button onClick={() => setIsOpen(false)} aria-label="Close Zid AI Assistant" title="Close assistant" className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-[#111827] to-[#0F172A] p-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-600">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[88%] whitespace-pre-wrap rounded-2xl border px-4 py-3 text-sm leading-6 shadow-sm ${
              m.role === 'user'
                ? 'ml-auto rounded-br-md border-amber-400/30 bg-gradient-to-br from-amber-500 to-amber-600 font-semibold text-white shadow-lg shadow-amber-500/25'
                : 'mr-auto rounded-bl-md border-amber-400/20 bg-gradient-to-br from-[#1E293B] to-[#18202D] text-slate-100 shadow-lg shadow-black/20'
            }`}
          >
            {m.content}
          </div>
        ))}
        {isThinking && (
          <div className="mr-auto flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-amber-400/20 bg-gradient-to-br from-[#1E293B] to-[#18202D] px-4 py-3.5 shadow-lg shadow-black/20" aria-label="Zid AI is typing">
            <span className="zid-ai-dot h-2 w-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="zid-ai-dot h-2 w-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="zid-ai-dot h-2 w-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
      <footer className="border-t border-amber-400/15 bg-gradient-to-r from-[#0B0F1A] via-[#12172B] to-[#0B0F1A] p-4">
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => quickAsk('Summarize my sales performance and give me growth tips / আমার বিক্রয় পরিসংখ্যান ও গ্রোথ টিপস দিন')}
            className="flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-300 transition hover:border-amber-400/40 hover:bg-slate-700/50 hover:text-amber-300"
            title="Growth insights"
          >
            <BarChart2 className="h-3.5 w-3.5" />
            <span>Growth</span>
          </button>
          <button
            onClick={() => quickAsk('My plan upgrade is still pending. Why? / আমার প্ল্যান আপগ্রেড এখনো পেন্ডিং কেন?')}
            className="flex items-center gap-1.5 rounded-lg border border-amber-400/20 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-300 transition hover:border-amber-400/40 hover:bg-slate-700/50 hover:text-amber-300"
            title="Plan / subscription support"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Plan</span>
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-[#0F172A] p-1.5 shadow-inner shadow-black/20 transition-all duration-200 focus-within:border-amber-400/50 focus-within:shadow-amber-400/10">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void sendQuery(input); }}
            className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition placeholder:text-slate-500"
            placeholder="Ask Zid AI anything..."
            aria-label="Ask Zid AI"
          />
          <button
            onClick={() => void sendQuery(input)}
            disabled={isThinking || !input.trim()}
            aria-label="Send message"
            title="Send message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/25 transition-all duration-200 hover:from-amber-400 hover:to-amber-500 hover:shadow-amber-400/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </div>
  );
};
