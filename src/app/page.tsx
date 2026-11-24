'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';

type Message = { id: string; role: 'user' | 'assistant'; content: string };
type Conversation = { id: string; title: string; updatedAt: number; messages: Message[] };

const STORAGE_KEY = 'nexora.conversations.v1';
const starterPrompts = [
  { icon: '✦', title: 'Explain something', text: 'Explain a difficult topic in simple terms.' },
  { icon: '⌘', title: 'Write code', text: 'Help me plan a small web application.' },
  { icon: '↗', title: 'Explore an idea', text: 'Help me develop an idea into a practical plan.' },
  { icon: '▤', title: 'Work with files', text: 'I want to understand and summarize a document.' },
];

function makeConversation(): Conversation {
  return { id: crypto.randomUUID(), title: 'New conversation', updatedAt: Date.now(), messages: [] };
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState('');
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const active = conversations.find((item) => item.id === activeId);
  const messages = active?.messages ?? [];

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved: Conversation[] = raw ? JSON.parse(raw) : [];
      if (saved.length) {
        setConversations(saved);
        setActiveId(saved[0].id);
      } else {
        const first = makeConversation();
        setConversations([first]);
        setActiveId(first.id);
      }
    } catch {
      const first = makeConversation();
      setConversations([first]);
      setActiveId(first.id);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations, ready]);

  function newChat() {
    const next = makeConversation();
    setConversations((current) => [next, ...current]);
    setActiveId(next.id);
    setInput('');
    setSidebarOpen(false);
    textareaRef.current?.focus();
  }

  function sendMessage(value = input) {
    const content = value.trim();
    if (!content || !activeId) return;
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content };
    setConversations((current) => current.map((conversation) => {
      if (conversation.id !== activeId) return conversation;
      const nextMessages = [...conversation.messages, userMessage];
      return {
        ...conversation,
        title: conversation.messages.length ? conversation.title : content.slice(0, 34),
        updatedAt: Date.now(),
        messages: nextMessages,
      };
    }));
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function deleteConversation(id: string) {
    const remaining = conversations.filter((item) => item.id !== id);
    if (remaining.length) {
      setConversations(remaining);
      if (activeId === id) setActiveId(remaining[0].id);
    } else {
      const next = makeConversation();
      setConversations([next]);
      setActiveId(next.id);
    }
  }

  return (
    <main className="app-shell">
      {sidebarOpen && <button className="mobile-scrim" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark">N</div>
          <span className="brand-name">NEXORA<span> AI</span></span>
          <button className="icon-button mobile-close" aria-label="Close menu" onClick={() => setSidebarOpen(false)}>×</button>
        </div>
        <button className="new-chat-button" onClick={newChat}><span>＋</span> New chat <kbd>⌘ K</kbd></button>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="nav-list">
          <button className="nav-item active"><span>◈</span> Chat</button>
          <button className="nav-item" onClick={() => alert('Memory settings will be added in a later stage.')}><span>✧</span> Memory <span className="soon-tag">SOON</span></button>
          <button className="nav-item" onClick={() => alert('File workspace will be added in a later stage.')}><span>▤</span> My files <span className="soon-tag">SOON</span></button>
        </nav>
        <div className="history-heading"><span className="sidebar-label">RECENTS</span><span className="history-count">{conversations.length}</span></div>
        <div className="history-list">
          {conversations.map((conversation) => (
            <div className={`history-entry ${activeId === conversation.id ? 'selected' : ''}`} key={conversation.id}>
              <button className="history-item" onClick={() => { setActiveId(conversation.id); setSidebarOpen(false); }} title={conversation.title}>
                <span className="history-dot">·</span><span>{conversation.title}</span>
              </button>
              <button className="delete-chat" aria-label="Delete conversation" onClick={() => deleteConversation(conversation.id)}>×</button>
            </div>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="local-status"><span className="status-dot" /><span>Local workspace</span><span className="status-lock">⌑</span></div>
          <button className="profile-row" onClick={() => alert('Optional accounts will be added in a later stage.')}>
            <div className="avatar">G</div><div className="profile-copy"><strong>Guest user</strong><span>Using NEXORA for free</span></div><span className="profile-more">···</span>
          </button>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-toggle" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>☰</button>
            <div className="mobile-brand"><span className="brand-mark small">N</span><strong>NEXORA AI</strong></div>
            <div className="model-selector"><span className="model-indicator" /> NEXORA <span className="model-version">Preview</span><span className="chevron">⌄</span></div>
          </div>
          <div className="topbar-right">
            <span className="preview-label">EARLY PREVIEW</span>
            <button className="login-button" onClick={() => alert('Account sign-in will be available in a later stage.')}>Sign in <span>↗</span></button>
          </div>
        </header>

        <div className={`chat-area ${messages.length ? 'has-messages' : ''}`}>
          {messages.length === 0 ? (
            <div className="welcome-wrap">
              <div className="welcome-eyebrow"><span className="sparkle">✳</span> YOUR SPACE TO THINK</div>
              <h1>Ideas start <span>somewhere.</span></h1>
              <p className="welcome-subtitle">A new kind of AI workspace. Open to everyone.</p>
              <div className="prompt-grid">
                {starterPrompts.map((prompt) => (
                  <button className="prompt-card" key={prompt.title} onClick={() => setInput(prompt.text)}>
                    <span className="prompt-icon">{prompt.icon}</span><strong>{prompt.title}</strong><span className="prompt-description">{prompt.text}</span><span className="prompt-arrow">↗</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article className={`message-row ${message.role}`} key={message.id}>
                  {message.role === 'assistant' && <div className="assistant-avatar">N</div>}
                  <div className="message-content">
                    <div className="message-author">{message.role === 'user' ? 'You' : 'NEXORA AI'}</div>
                    <p>{message.content}</p>
                  </div>
                </article>
              ))}
              <div className="stage-note"><span>✦</span> The AI engine is not connected yet. This preview currently saves your messages locally. Model integration is the next development stage.</div>
            </div>
          )}
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={onSubmit}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                event.target.style.height = 'auto';
                event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={onKeyDown}
              placeholder="Message NEXORA..."
              rows={1}
              aria-label="Message NEXORA AI"
            />
            <div className="composer-tools">
              <div className="tool-buttons">
                <button type="button" className="tool-button" title="Attach files — coming soon" onClick={() => alert('File upload will be added in a later stage.')}>＋ <span>Attach</span></button>
                <button type="button" className="tool-button" title="Web search — coming soon" onClick={() => alert('Web search will be added in a later stage.')}>◎ <span>Search</span></button>
              </div>
              <button type="submit" className="send-button" disabled={!input.trim()} aria-label="Send message">↑</button>
            </div>
          </form>
          <p className="composer-disclaimer">NEXORA is an early preview. AI responses, web search and file tools are not active yet.</p>
        </div>
        <footer className="bottom-footer"><span>© 2026 NEXORA AI</span><span>Built for curiosity <b>✳</b></span><a href="https://vercel.com" target="_blank" rel="noreferrer">Deployment-ready ↗</a></footer>
      </section>
    </main>
  );
}
