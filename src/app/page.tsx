'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';

type Message = { id: string; role: 'user' | 'assistant'; content: string; pending?: boolean };
type Conversation = { id: string; title: string; updatedAt: number; messages: Message[] };
type EngineStatus = 'idle' | 'loading' | 'generating' | 'ready' | 'error';
type WorkerReply =
  | { type: 'status'; status: 'loading' | 'generating' | 'ready'; message: string }
  | { type: 'progress'; progress: number; file?: string }
  | { type: 'response'; text: string }
  | { type: 'error'; message: string };

const STORAGE_KEY = 'nexora.conversations.v1';
const starterPrompts = [
  { icon: '✦', title: 'Explain something', text: 'Jelaskan konsep yang sulit dengan bahasa sederhana.' },
  { icon: '⌘', title: 'Write code', text: 'Bantu saya membuat aplikasi web sederhana.' },
  { icon: '↗', title: 'Explore an idea', text: 'Bantu saya mengembangkan sebuah ide menjadi rencana praktis.' },
  { icon: '▤', title: 'Work with files', text: 'Saya ingin memahami dan merangkum sebuah dokumen.' },
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
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [engineMessage, setEngineMessage] = useState('Model belum dimuat');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const workerRef = useRef<Worker | null>(null);
  const activeRequestRef = useRef<{ conversationId: string; assistantMessageId: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const active = conversations.find((item) => item.id === activeId);
  const messages = active?.messages ?? [];
  const isBusy = engineStatus === 'loading' || engineStatus === 'generating';

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

  useEffect(() => {
    return () => workerRef.current?.terminate();
  }, []);

  function getWorker() {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL('../lib/ai/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      if (reply.type === 'status') {
        setEngineStatus(reply.status);
        setEngineMessage(reply.message);
      } else if (reply.type === 'progress') {
        setDownloadProgress(reply.progress);
        setEngineStatus('loading');
        setEngineMessage('Mengunduh model AI…');
      } else if (reply.type === 'response') {
        const request = activeRequestRef.current;
        if (request) {
          setConversations((current) => current.map((conversation) => conversation.id !== request.conversationId ? conversation : {
            ...conversation,
            updatedAt: Date.now(),
            messages: conversation.messages.map((message) => message.id === request.assistantMessageId
              ? { ...message, content: reply.text, pending: false }
              : message),
          }));
        }
        activeRequestRef.current = null;
        setEngineStatus('ready');
        setEngineMessage('Model siap di perangkat ini');
        setErrorMessage('');
      } else if (reply.type === 'error') {
        const request = activeRequestRef.current;
        if (request) {
          setConversations((current) => current.map((conversation) => conversation.id !== request.conversationId ? conversation : {
            ...conversation,
            messages: conversation.messages.map((message) => message.id === request.assistantMessageId
              ? { ...message, content: `Maaf, AI belum dapat menjawab. ${reply.message}`, pending: false }
              : message),
          }));
        }
        activeRequestRef.current = null;
        setEngineStatus('error');
        setEngineMessage('Model gagal dijalankan');
        setErrorMessage(reply.message);
      }
    };
    worker.onerror = (event) => {
      setEngineStatus('error');
      setEngineMessage('AI worker mengalami error');
      setErrorMessage(event.message || 'Worker AI gagal dijalankan.');
    };
    workerRef.current = worker;
    return worker;
  }

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
    if (!content || !activeId || isBusy) return;

    const conversationId = activeId;
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content };
    const assistantMessage: Message = { id: crypto.randomUUID(), role: 'assistant', content: '', pending: true };
    const currentConversation = conversations.find((conversation) => conversation.id === conversationId);
    const nextMessages = [...(currentConversation?.messages ?? []), userMessage];

    setConversations((current) => current.map((conversation) => conversation.id !== conversationId ? conversation : {
      ...conversation,
      title: conversation.messages.length ? conversation.title : content.slice(0, 34),
      updatedAt: Date.now(),
      messages: [...conversation.messages, userMessage, assistantMessage],
    }));
    setInput('');
    setErrorMessage('');
    setDownloadProgress(0);
    activeRequestRef.current = { conversationId, assistantMessageId: assistantMessage.id };
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const worker = getWorker();
    worker.postMessage({ type: 'generate', messages: [...nextMessages, assistantMessage].filter((message) => !message.pending).map(({ role, content: text }) => ({ role, content: text })) });
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

  const statusLabel = engineStatus === 'loading' ? 'Downloading model' : engineStatus === 'generating' ? 'Thinking' : engineStatus === 'ready' ? 'On-device AI ready' : engineStatus === 'error' ? 'AI needs attention' : 'AI not loaded';

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
          <button className="nav-item" onClick={() => alert('Memory settings akan ditambahkan pada tahap berikutnya.')}><span>✧</span> Memory <span className="soon-tag">SOON</span></button>
          <button className="nav-item" onClick={() => alert('File workspace akan ditambahkan pada tahap berikutnya.')}><span>▤</span> My files <span className="soon-tag">SOON</span></button>
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
          <button className="profile-row" onClick={() => alert('Akun opsional akan ditambahkan pada tahap berikutnya.')}>
            <div className="avatar">G</div><div className="profile-copy"><strong>Guest user</strong><span>Using NEXORA for free</span></div><span className="profile-more">···</span>
          </button>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-toggle" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>☰</button>
            <div className="mobile-brand"><span className="brand-mark small">N</span><strong>NEXORA AI</strong></div>
            <div className="model-selector"><span className={`model-indicator ${engineStatus === 'error' ? 'offline' : ''}`} /> NEXORA <span className="model-version">Qwen 0.5B</span><span className="chevron">⌄</span></div>
          </div>
          <div className="topbar-right">
            <span className={`engine-status ${engineStatus}`}>{statusLabel}</span>
            <button className="login-button" onClick={() => alert('Account sign-in akan tersedia pada tahap berikutnya.')}>Sign in <span>↗</span></button>
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
              <div className="model-intro"><strong>Private, on-device AI</strong><span>Model akan diunduh saat kamu mengirim pesan pertama. Unduhan awal cukup besar dan memerlukan koneksi internet.</span></div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article className={`message-row ${message.role}`} key={message.id}>
                  {message.role === 'assistant' && <div className="assistant-avatar">N</div>}
                  <div className="message-content">
                    <div className="message-author">{message.role === 'user' ? 'You' : 'NEXORA AI'}</div>
                    <p>{message.pending ? (engineStatus === 'loading' ? `Menyiapkan model AI… ${Math.round(downloadProgress)}%` : 'NEXORA sedang berpikir…') : message.content}</p>
                  </div>
                </article>
              ))}
              {engineStatus === 'loading' && <div className="download-progress"><div className="download-progress-fill" style={{ width: `${downloadProgress}%` }} /></div>}
              {errorMessage && <div className="stage-note error-note">{errorMessage}</div>}
              {engineStatus === 'loading' && <div className="stage-note"><span>✦</span> Model sedang diunduh dari Hugging Face. Jangan tutup tab sampai proses awal selesai. Setelah tersimpan di cache browser, unduhan berikutnya mungkin tidak diperlukan.</div>}
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
              placeholder={isBusy ? 'NEXORA sedang memproses…' : 'Message NEXORA…'}
              rows={1}
              aria-label="Message NEXORA AI"
              disabled={isBusy}
            />
            <div className="composer-tools">
              <div className="tool-buttons">
                <button type="button" className="tool-button" title="File upload coming in a later stage" onClick={() => alert('Upload file akan ditambahkan pada tahap berikutnya.')}>＋ <span>Attach</span></button>
                <button type="button" className="tool-button" title="Web search coming in a later stage" onClick={() => alert('Web search akan ditambahkan pada tahap berikutnya.')}>◎ <span>Search</span></button>
              </div>
              <button type="submit" className="send-button" disabled={!input.trim() || isBusy} aria-label="Send message">↑</button>
            </div>
          </form>
          <p className="composer-disclaimer">AI runs on your device. First model download requires internet and device resources.</p>
        </div>
        <footer className="bottom-footer"><span>© 2026 NEXORA AI</span><span>Built for curiosity <b>✳</b></span><a href="https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct" target="_blank" rel="noreferrer">Open model card ↗</a></footer>
      </section>
    </main>
  );
}
