import { ArrowLeft, ChevronRight, Trash2, Wrench } from 'lucide-react';
import { useApp } from '../lib/app-context.js';
import { navigate, useLeaving, useLoad } from '../lib/hooks.js';
import { errorMessage } from '../lib/api.js';
import { fmtAgo, fmtDateTime, plural } from '../lib/format.js';
import { Badge, Button, Empty, ErrorNote, Exit, Icon, Loading, Page } from '../components/ui.jsx';
import { useOverlay } from '../components/overlay.jsx';

export function Conversations({ id }) {
  const { client } = useApp();
  const { toast, confirm } = useOverlay();
  const list = useLoad(() => client.admin.conversations({ limit: 200 }), [client]);
  const [leaving, leave, restore] = useLeaving();

  async function remove(c) {
    const ok = await confirm({
      title: 'Delete this conversation?',
      body: 'The conversation and all its messages are removed. It cannot be undone.',
      what: `“${c.title || 'Untitled'}” — ${plural(c.messageCount, 'message')}`,
      confirmLabel: 'Delete conversation',
    });
    if (!ok) return;
    if (id === c.id) navigate('/conversations');
    leave([c.id], () => list.setData((d) => ({ ...d, total: d.total - 1, conversations: d.conversations.filter((x) => x.id !== c.id) })));
    try {
      const res = await client.admin.deleteConversation(c.id);
      toast({ tone: 'success', title: 'Conversation deleted', body: `${plural(res.deleted.messages, 'message')} removed.` });
    } catch (err) {
      restore([c.id]);
      toast({ tone: 'danger', title: 'Could not delete', body: errorMessage(err) });
    }
  }

  const convs = list.data?.conversations || [];
  const current = convs.find((c) => c.id === id);

  return (
    <Page eyebrow="Olaf · Conversations" title="What we talked about" ghost="Talk" sub="Every conversation with me, from any paired device.">
      <ErrorNote error={list.error && errorMessage(list.error)} onRetry={list.reload} />
      {list.loading && !list.data && <Loading />}
      {list.data && !convs.length && <Empty title="No conversations yet">Talk to me from the phone and they show up here.</Empty>}
      {convs.length > 0 && (
        <div className={`split-pane${id ? ' split-pane--detail' : ''}`}>
          <div className="list">
            {convs.map((c, i) => (
              <Exit key={c.id} leaving={leaving.has(c.id)}>
                <div
                  className={`list-row list-row--link rise${c.id === id ? ' list-row--selected' : ''}`}
                  style={{ '--i': Math.min(i, 12) }}
                  onClick={() => navigate(`/conversations/${encodeURIComponent(c.id)}`)}
                >
                  <div className="list-row__main">
                    <div className="list-row__title">{c.title || 'Untitled'}</div>
                    <div className="small muted" style={{ marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.lastMessage ? `${c.lastMessage.role === 'user' ? 'You' : 'Olaf'}: ${c.lastMessage.preview}` : 'No messages'}
                    </div>
                    <div className="list-row__meta">
                      <span>{plural(c.messageCount, 'message')}</span>
                      <span>{c.device?.name || 'unknown device'}</span>
                      <span>{fmtAgo(c.updatedAt)}</span>
                    </div>
                  </div>
                  <span className="chev">
                    <Icon icon={ChevronRight} size={18} />
                  </span>
                </div>
              </Exit>
            ))}
          </div>
          <div>{id ? <Thread key={id} id={id} summary={current} onDelete={remove} /> : <Empty>Pick a conversation to read it.</Empty>}</div>
        </div>
      )}
    </Page>
  );
}

function blocksOf(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content : [];
}

function Thread({ id, summary, onDelete }) {
  const { client } = useApp();
  const { data, error, loading } = useLoad(() => client.admin.conversation(id), [client, id]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote error={errorMessage(error)} />;
  return (
    <div className="fade-in">
      <div className="row" style={{ marginBottom: 20 }}>
        <Button variant="ghost" size="sm" iconLeft={ArrowLeft} iconRight={null} onClick={() => navigate('/conversations')}>
          All
        </Button>
        <span className="spacer" />
        <span className="mono muted">
          {fmtDateTime(data.createdAt)} · {data.device?.name || 'unknown device'}
        </span>
        <Button variant="outline" size="sm" iconLeft={Trash2} onClick={() => onDelete(summary || { id, title: data.title, messageCount: data.messages.length })}>
          Delete
        </Button>
      </div>
      <div className="stack" style={{ gap: 14 }}>
        {data.messages.map((m, i) => {
          const blocks = blocksOf(m.content);
          const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
          const tools = blocks.filter((b) => b.type === 'tool_use');
          const results = blocks.filter((b) => b.type === 'tool_result');
          const isUser = m.role === 'user' && !results.length;
          return (
            <div key={m.id} className={`bubble rise ${isUser ? 'bubble--user' : 'bubble--assistant'}`} style={{ '--i': Math.min(i, 14) }}>
              {!isUser && m.role === 'assistant' && (
                <div className="olaf-says__name" style={{ marginBottom: 6 }}>
                  olaf
                </div>
              )}
              {text && <div>{text}</div>}
              {tools.map((t) => (
                <div key={t.id} className="row" style={{ gap: 6, marginTop: 8 }}>
                  <Badge tone="info">
                    <Icon icon={Wrench} size={12} /> {t.name}
                  </Badge>
                  <span className="mono muted">{JSON.stringify(t.input).slice(0, 80)}</span>
                </div>
              ))}
              {results.map((r) => (
                <details key={r.tool_use_id} style={{ marginTop: 4 }}>
                  <summary className="link-btn">Tool result</summary>
                  <pre className="json" style={{ marginTop: 8 }}>
                    {typeof r.content === 'string' ? r.content : JSON.stringify(r.content, null, 2)}
                  </pre>
                </details>
              ))}
              <div className="mono faint" style={{ marginTop: 8, fontSize: 11 }}>
                {fmtDateTime(m.createdAt)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
