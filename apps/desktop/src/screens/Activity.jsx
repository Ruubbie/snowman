import { useState } from 'react';
import { useApp } from '../lib/app-context.js';
import { useLoad } from '../lib/hooks.js';
import { errorMessage } from '../lib/api.js';
import { fmtAgo, fmtDateTime, fmtInt, humanEventType } from '../lib/format.js';
import { Button, Empty, ErrorNote, Loading, Page, Tag } from '../components/ui.jsx';

const PAGE = 50;

/** The event log: Olaf's running memory of what happened, across modules. */
export function Activity() {
  const { client } = useApp();
  const [type, setType] = useState(null);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState(null);
  const { data, error, loading, reload } = useLoad(() => client.admin.events({ limit, type: type || undefined }), [client, type, limit]);

  const prefixes = [...new Set((data?.types || []).map((t) => `${t.type.split('.')[0]}.*`))];

  return (
    <Page eyebrow="Olaf · Activity" title="What happened" ghost="Log" sub="Everything the backbone logged: runs, plan changes, debriefs, deletions. Newest first.">
      <div className="toolbar rise" style={{ '--i': 1 }}>
        <Tag selected={!type} onClick={() => setType(null)}>
          All
        </Tag>
        {prefixes.map((p) => (
          <Tag key={p} selected={type === p} onClick={() => setType(p)}>
            {p.replace('.*', '')}
          </Tag>
        ))}
        <span className="spacer" />
        {data && <span className="mono muted">{fmtInt(data.total)} events</span>}
      </div>
      <ErrorNote error={error && errorMessage(error)} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && !data.events.length && <Empty title="Nothing logged">No events of this kind yet.</Empty>}
      <div className="list">
        {data?.events.map((e, i) => (
          <div key={e.id} className="rise" style={{ '--i': Math.min(i, 14) }}>
            <div className="list-row list-row--link" onClick={() => setOpen(open === e.id ? null : e.id)}>
              <div className="list-row__main">
                <div className="list-row__title">{humanEventType(e.type)}</div>
                <div className="list-row__meta">
                  <span>{e.type}</span>
                  <span>{fmtDateTime(e.createdAt)}</span>
                </div>
              </div>
              <span className="mono muted">{fmtAgo(e.createdAt)}</span>
            </div>
            {open === e.id && (
              <pre className="json fade-in" style={{ margin: '8px 0 12px' }}>
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
      {data && data.total > data.events.length && (
        <div style={{ marginTop: 20 }}>
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)} disabled={loading}>
            Show more
          </Button>
        </div>
      )}
    </Page>
  );
}
