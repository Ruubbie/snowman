import { useState } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { useApp } from '../../lib/app-context.js';
import { useLeaving, useLoad } from '../../lib/hooks.js';
import { errorMessage } from '../../lib/api.js';
import { fmtDateTime, fmtDay } from '../../lib/format.js';
import { Badge, Button, Empty, ErrorNote, Exit, Icon, Loading, Page, Tabs } from '../../components/ui.jsx';
import { useOverlay } from '../../components/overlay.jsx';
import { BriefBody } from './WorkoutDetail.jsx';

const ACTOR_TONE = { olaf: 'accent', user: 'info', system: 'neutral' };

export function Plan() {
  const [tab, setTab] = useState('decisions');
  return (
    <Page
      eyebrow="Running · Plan"
      title="How the plan changed"
      ghost="Plan"
      sub="Every move, skip and replacement — by you or by me — and the pre-run briefs I wrote."
    >
      <div className="rise" style={{ marginBottom: 24, '--i': 1 }}>
        <Tabs
          items={[
            { value: 'decisions', label: 'Decisions' },
            { value: 'briefs', label: 'Briefs' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'decisions' ? <Decisions /> : <Briefs />}
    </Page>
  );
}

function summarize(state) {
  if (!state || typeof state !== 'object') return {};
  const out = {};
  for (const k of ['date', 'status', 'title', 'kind', 'programStart', 'summary']) if (state[k] != null) out[k] = state[k];
  if (Array.isArray(state.segments)) out.segments = `${state.segments.length} segments`;
  return out;
}

function Diff({ before, after }) {
  const a = summarize(before);
  const b = summarize(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  if (!keys.length) return <span className="small muted">No visible change.</span>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      {keys.map((k) => (
        <div key={k} className="row row--wrap small" style={{ gap: 8 }}>
          <span className="eyebrow" style={{ minWidth: 88 }}>
            {k}
          </span>
          <span className="muted" style={{ textDecoration: 'line-through' }}>
            {String(a[k] ?? '–')}
          </span>
          <Icon icon={ArrowRight} size={14} />
          <span className="strong">{String(b[k] ?? '–')}</span>
        </div>
      ))}
    </div>
  );
}

function Decisions() {
  const { client } = useApp();
  const { data, error, loading, reload } = useLoad(() => client.admin.running.planDecisions({ limit: 200 }), [client]);
  if (loading && !data) return <Loading />;
  return (
    <>
      <ErrorNote error={error && errorMessage(error)} onRetry={reload} />
      {data && !data.decisions.length && <Empty title="No changes yet">The plan has run exactly as the program says.</Empty>}
      <div className="list">
        {data?.decisions.map((d, i) => (
          <div key={d.id} className="list-row rise" style={{ '--i': Math.min(i, 12), alignItems: 'flex-start' }}>
            <div style={{ width: 150, flex: 'none' }}>
              <div className="strong small">{fmtDateTime(d.at)}</div>
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                <Badge tone={ACTOR_TONE[d.actor]}>{d.actor}</Badge>
                <Badge>{d.action.replace(/_/g, ' ')}</Badge>
              </div>
            </div>
            <div className="list-row__main">
              {d.reason && (
                <p className="small strong" style={{ margin: '0 0 10px' }}>
                  {d.reason}
                </p>
              )}
              <Diff before={d.before} after={d.after} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Briefs() {
  const { client } = useApp();
  const { toast, confirm } = useOverlay();
  const { data, error, loading, reload, setData } = useLoad(() => client.admin.running.briefs({ limit: 100 }), [client]);
  const [leaving, leave, restore] = useLeaving();

  async function forget(b) {
    const ok = await confirm({
      title: 'Regenerate this brief next time?',
      body: 'I will forget this stored brief. The next time Polar opens this session I will write a fresh one — that is one AI call.',
      what: `Brief for ${b.session ? `${b.session.title}, ${fmtDay(b.session.date)}` : b.sessionId} (${b.model})`,
      confirmLabel: 'Forget brief',
      icon: null,
    });
    if (!ok) return;
    leave([b.sessionId], () => setData((d) => ({ ...d, total: d.total - 1, briefs: d.briefs.filter((x) => x.sessionId !== b.sessionId) })));
    try {
      await client.admin.running.deleteBrief(b.sessionId);
      toast({ tone: 'success', title: 'Brief forgotten', body: 'A new one will be written next time.' });
    } catch (err) {
      restore([b.sessionId]);
      toast({ tone: 'danger', title: 'Could not delete', body: errorMessage(err) });
    }
  }

  if (loading && !data) return <Loading />;
  return (
    <>
      <ErrorNote error={error && errorMessage(error)} onRetry={reload} />
      {data && !data.briefs.length && <Empty title="No briefs stored">I write one when Polar opens a planned session.</Empty>}
      <div className="grid grid--2">
        {data?.briefs.map((b, i) => (
          <Exit key={b.sessionId} leaving={leaving.has(b.sessionId)}>
            <div className="rise" style={{ '--i': i }}>
              <div className="row" style={{ marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div className="strong">{b.session ? b.session.title : 'Unknown session'}</div>
                  <div className="mono muted" style={{ marginTop: 4 }}>
                    {b.session ? `${fmtDay(b.session.date)} · ${b.session.status}` : b.sessionId}
                  </div>
                </div>
                <Button variant="ghost" size="sm" iconLeft={RotateCcw} iconRight={null} onClick={() => forget(b)}>
                  Regenerate next time
                </Button>
              </div>
              <BriefBody brief={b} />
            </div>
          </Exit>
        ))}
      </div>
    </>
  );
}
