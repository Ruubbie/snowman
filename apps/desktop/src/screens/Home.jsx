import { useEffect, useRef, useState } from 'react';
import { Mic, Plus, Send } from 'lucide-react';
import { useApp } from '../lib/app-context.js';
import { useLoad } from '../lib/hooks.js';
import { errorMessage } from '../lib/api.js';
import { Badge, Button, Card, ErrorNote, IconButton, Loading, Page, Section, Tag } from '../components/ui.jsx';

const SUGGESTIONS = ['How does my week look?', 'How did my last run go?', 'Can we move tomorrow to the day after?'];

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 6) return 'Still up?';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function chatError(err) {
  if (err?.body?.error === 'olaf_unavailable') return "I can't think right now: the server has no AI key set.";
  if (err?.body?.error === 'olaf_over_budget') return "I've used this month's AI budget. Raise it in the server config to keep talking.";
  if (err?.body?.error === 'olaf_refusal') return "I'd rather not answer that one.";
  if (err?.networkError === 'timeout' || /timeout/i.test(err?.message || '')) return 'That took too long. Try again?';
  return errorMessage(err);
}

/** How long a reply takes to type out: quick for a line, never more than a few seconds for a long one. */
const TYPE_TICK_MS = 24;
const TYPE_MAX_MS = 3200;

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Olaf's newest reply appears as if he's typing it; older ones are shown whole. */
function TypedText({ text, active, onGrow, onDone }) {
  const [shown, setShown] = useState(active ? 0 : text.length);

  useEffect(() => {
    if (!active || prefersReducedMotion()) {
      setShown(text.length);
      if (active) onDone?.();
      return undefined;
    }
    const step = Math.max(1, Math.ceil(text.length / (TYPE_MAX_MS / TYPE_TICK_MS)));
    let n = 0;
    let hold = 0;
    const t = setInterval(() => {
      if (hold > 0) {
        hold -= 1;
        return;
      }
      const next = Math.min(text.length, n + step);
      // A short beat after each sentence, like someone thinking mid-reply.
      if (/[.!?]\s/.test(text.slice(n, next + 1))) hold = 7;
      n = next;
      setShown(n);
      if (n >= text.length) {
        clearInterval(t);
        onDone?.();
      }
    }, TYPE_TICK_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, active]);

  useEffect(() => {
    onGrow?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  const typing = active && shown < text.length;
  return (
    <>
      {text.slice(0, shown)}
      {typing && <span className="chat-caret" aria-hidden="true" />}
    </>
  );
}

export function Home() {
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <Page eyebrow={today} title={greeting()} ghost="olaf" sub="Talk to me about anything. Here's what I have planned for you in the next few days.">
      <div className="grid grid--main-side">
        <Chat />
        <ComingUp />
      </div>
    </Page>
  );
}

function Chat() {
  const { client } = useApp();
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const scroller = useRef(null);
  const input = useRef(null);

  // The chat is shared with the iPhone: show the conversation last talked in on any device,
  // and pick it up again whenever this window comes back into focus.
  const seen = useRef(null); // latest conversation as last taken; a change means another device talked
  const busy = useRef(false);
  useEffect(() => {
    let alive = true;
    async function pickUp() {
      if (busy.current) return;
      try {
        const res = await client.olaf.latestConversation();
        const key = `${res.conversationId}:${res.messages.length}`;
        if (!alive || busy.current || key === seen.current) return;
        seen.current = key;
        setConversationId(res.conversationId);
        setMessages(res.messages);
      } catch {
        // offline: keep what is on screen
      } finally {
        if (alive) setLoadingHistory(false);
      }
    }
    pickUp();
    window.addEventListener('focus', pickUp);
    return () => {
      alive = false;
      window.removeEventListener('focus', pickUp);
    };
  }, [client]);

  function scrollToEnd() {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  useEffect(scrollToEnd, [messages, sending]);

  async function send(text = draft) {
    const message = text.trim();
    if (!message || sending) return;
    setDraft('');
    setError(null);
    setSending(true);
    busy.current = true;
    // Sending cuts short a reply still being typed out.
    setMessages((m) => [...m.map((x) => (x.typing ? { ...x, typing: false } : x)), { role: 'user', text: message }]);
    try {
      const res = await client.olaf.chat({ message, conversationId });
      setConversationId(res.conversationId);
      setMessages((m) => [...m, { role: 'olaf', text: res.reply || '…', typing: true }]);
    } catch (err) {
      setMessages((m) => m.slice(0, -1));
      setDraft(message);
      setError(chatError(err));
    } finally {
      setSending(false);
      busy.current = false;
      input.current?.focus();
    }
  }

  function newChat() {
    setConversationId(null);
    setMessages([]);
    setError(null);
    input.current?.focus();
  }

  return (
    <Card tone="white" padding={0} i={1} className="chat-card">
      <div className="row chat-card__head">
        <span className="olaf-says__name">olaf</span>
        <span className="small muted">{conversationId ? 'Picking up where we left off' : 'New conversation'}</span>
        <span className="spacer" />
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" iconLeft={Plus} iconRight={null} onClick={newChat} disabled={sending}>
            New chat
          </Button>
        )}
      </div>

      <div className="chat" ref={scroller}>
        {loadingHistory ? (
          <Loading rows={3} />
        ) : messages.length === 0 ? (
          <div className="chat__empty">
            <div className="bubble bubble--assistant">
              Hi! Ask me how your week looks, move a session, or tell me how you're feeling. I can see your plan and your runs.
            </div>
            <div className="row row--wrap" style={{ gap: 8 }}>
              {SUGGESTIONS.map((s) => (
                <Tag key={s} onClick={() => send(s)}>
                  {s}
                </Tag>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role === 'user' ? 'bubble--user' : 'bubble--assistant'}`}>
              {m.role === 'olaf' ? (
                <TypedText
                  text={m.text}
                  active={Boolean(m.typing)}
                  onGrow={scrollToEnd}
                  onDone={() => setMessages((ms) => ms.map((x, j) => (j === i ? { ...x, typing: false } : x)))}
                />
              ) : (
                m.text
              )}
            </div>
          ))
        )}
        {sending && (
          <div className="bubble bubble--assistant bubble--thinking" aria-label="Olaf is typing">
            <span className="typing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '0 24px' }}>
          <ErrorNote error={error} />
        </div>
      )}

      <form
        className="row chat-card__composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="ol-inputwrap" style={{ flex: 1 }}>
          <input
            ref={input}
            className="ol-input"
            placeholder="Message Olaf"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            disabled={loadingHistory}
          />
        </div>
        <IconButton icon={Mic} variant="outline" label="Voice (coming later)" disabled />
        <IconButton icon={Send} variant="dark" label="Send" disabled={!draft.trim() || sending} onClick={() => send()} />
      </form>
    </Card>
  );
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayLabel(date, today) {
  const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

function minutes(s) {
  return `${Math.round(s / 60)} min`;
}

/** "3 × 5 min run, 2 min walks · 31 min" */
export function workoutLine(segments = []) {
  if (!segments.length) return '';
  const total = segments.reduce((t, s) => t + (s.seconds || 0), 0);
  const runs = segments.filter((s) => s.kind === 'run');
  if (!runs.length) return `${minutes(total)} walk`;
  if (runs.length === 1 && segments.length === 1) return `${minutes(runs[0].seconds)} run`;
  // The walk after the first run is the recovery between runs (the first walk is the warm-up).
  const gap = segments[segments.indexOf(runs[0]) + 1];
  const between = runs.length > 1 && gap?.kind === 'walk' ? `, ${minutes(gap.seconds)} walks` : '';
  return `${runs.length} × ${minutes(runs[0].seconds)} run${between} · ${minutes(total)}`;
}

function VoiceNote({ session }) {
  if (session.kind === 'rest') return null;
  if (session.status !== 'planned') return null;
  if (!session.brief) return <span className="small faint">I'll write the lines for this soon</span>;
  const v = session.voice;
  if (!v) return <span className="small faint">Lines written</span>;
  if (v.ready >= v.total) return <Badge tone="success" dot>My lines are recorded</Badge>;
  return (
    <Badge tone="warning" dot title="Recording takes about half a minute per line on the server">
      Recording my lines · {v.ready} of {v.total}
    </Badge>
  );
}

const STATUS_TONE = { done: 'success', skipped: 'neutral', moved: 'info', replaced: 'info' };

function ComingUp() {
  const { client } = useApp();
  const { data, error, loading, reload } = useLoad(() => client.running.upcoming({ days: 5 }), [client]);

  // Recording runs in the background on the server: refresh while it's busy.
  const recording = data?.sessions.some((s) => s.voice && s.voice.ready < s.voice.total);
  useEffect(() => {
    if (!recording) return undefined;
    const t = setInterval(reload, 30000);
    return () => clearInterval(t);
  }, [recording, reload]);

  return (
    <Section title="Coming up" eyebrow="The plan for now · it can still change" i={2}>
      <ErrorNote error={error && errorMessage(error)} onRetry={reload} />
      {loading && !data && <Loading rows={4} />}
      {data && !data.sessions.length && <p className="small muted">Nothing planned yet. Set a program start in Polar's settings.</p>}
      <div className="list">
        {data?.sessions.map((s, i) => (
          <div key={s.id} className="list-row rise" style={{ '--i': i, alignItems: 'flex-start', padding: '14px 2px' }}>
            <div style={{ width: 92, flex: 'none' }}>
              <div className="strong small" style={s.date === data.today ? { color: 'var(--accent)' } : undefined}>
                {dayLabel(s.date, data.today)}
              </div>
              <div className="mono faint" style={{ fontSize: 11, marginTop: 2 }}>
                {s.date.slice(8)}/{s.date.slice(5, 7)}
              </div>
            </div>
            <div className="list-row__main">
              <div className="row" style={{ gap: 8 }}>
                <span className="list-row__title" style={{ fontSize: 15 }}>
                  {s.kind === 'rest' ? 'Rest day' : s.title}
                </span>
                {STATUS_TONE[s.status] && <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>}
              </div>
              {s.kind !== 'rest' && (
                <div className="small muted" style={{ marginTop: 4 }}>
                  {workoutLine(s.segments) || s.summary}
                </div>
              )}
              {s.brief?.focus?.[0] && s.status === 'planned' && (
                <div className="small" style={{ marginTop: 6 }}>
                  “{s.brief.focus[0]}”
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <VoiceNote session={s} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
