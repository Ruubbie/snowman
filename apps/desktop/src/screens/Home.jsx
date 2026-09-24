import { HousePlug, Car, Calendar, ListTodo } from 'lucide-react';
import { useApp } from '../lib/app-context.js';
import { navigate, useLoad } from '../lib/hooks.js';
import { errorMessage } from '../lib/api.js';
import { fmtAgo, fmtUsd, fmtTime, humanEventType, fmtShortDate } from '../lib/format.js';
import { Bar, Badge, Button, Card, ErrorNote, Icon, Loading, Metric, Page, Ring, Section } from '../components/ui.jsx';
import { modules } from '../modules/index.js';

const FUTURE = [
  { icon: HousePlug, name: 'Smart home' },
  { icon: Car, name: 'Car' },
  { icon: Calendar, name: 'Calendar' },
  { icon: ListTodo, name: 'Lists' },
];

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 6) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Home() {
  const { client } = useApp();
  const { data, error, loading, reload } = useLoad(() => client.admin.overview(), [client]);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  if (loading && !data) {
    return (
      <Page eyebrow={today} title={greeting()} ghost="olaf">
        <Loading rows={6} />
      </Page>
    );
  }
  if (!data) {
    return (
      <Page eyebrow={today} title={greeting()} ghost="olaf">
        <ErrorNote error={errorMessage(error)} onRetry={reload} />
      </Page>
    );
  }
  const { counts, ai } = data;
  const pct = ai.budgetUsd > 0 ? ai.monthUsd / ai.budgetUsd : 0;
  const month = new Date(ai.monthStart).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });

  return (
    <Page
      eyebrow={today}
      title={greeting()}
      ghost="olaf"
      sub={`This month I made ${counts.monthAiCalls} AI calls and spent ${fmtUsd(ai.monthUsd)} of your ${fmtUsd(ai.budgetUsd)}. Here is everything I know and did.`}
      actions={
        <Badge tone={data.olaf.available ? 'success' : 'neutral'} dot>
          {data.olaf.available ? 'Olaf online' : 'Olaf offline'}
        </Badge>
      }
    >
      <ErrorNote error={error && errorMessage(error)} onRetry={reload} />
      <div className="metrics">
        <Metric label="Conversations" count={counts.conversations} size={40} i={0} />
        <Metric label="Messages" count={counts.messages} size={40} i={1} />
        <Metric label="AI calls" count={counts.aiCalls} size={40} i={2} delta={`${counts.monthAiCalls} this month`} />
        <Metric label="Events" count={counts.events} size={40} i={3} />
        <Metric label="Devices" count={counts.devices} size={40} i={4} />
      </div>

      <div className="grid grid--main-side section">
        <Card tone="white" i={1} interactive onClick={() => navigate('/usage')}>
          <div className="row" style={{ alignItems: 'flex-start', gap: 28 }}>
            <Ring size={96} weight={10} progress={pct} color={pct >= 0.8 ? 'var(--warning)' : 'var(--accent)'}>
              <span className="mono strong">{Math.round(pct * 100)}%</span>
            </Ring>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ol-card__eyebrow">AI spend · {month}</div>
              <Metric value={fmtUsd(ai.monthUsd)} unit={`of ${fmtUsd(ai.budgetUsd)}`} size={40} />
              <div style={{ marginTop: 18 }} className="stack">
                {ai.byPurpose.slice(0, 4).map((p, i) => (
                  <div key={p.key} className="split-row" style={{ gridTemplateColumns: '130px 1fr 70px' }}>
                    <span className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.key}
                    </span>
                    <Bar value={p.costUsd} max={ai.byPurpose[0].costUsd || 1} i={i} />
                    <span className="mono strong" style={{ textAlign: 'right' }}>
                      {fmtUsd(p.costUsd)}
                    </span>
                  </div>
                ))}
                {!ai.byPurpose.length && <span className="small muted">No AI calls yet this month.</span>}
              </div>
            </div>
          </div>
        </Card>
        <Card tone="tint" i={2}>
          <div className="ol-card__eyebrow">Last seen</div>
          <dl className="kv">
            <dt>Message</dt>
            <dd>{fmtAgo(data.lastActivity.message)}</dd>
            <dt>AI call</dt>
            <dd>{fmtAgo(data.lastActivity.aiCall)}</dd>
            <dt>Event</dt>
            <dd>{fmtAgo(data.lastActivity.event)}</dd>
            {modules.map((m) => (
              <FragmentRow key={m.id} label={`${m.name}`} value={fmtAgo(data.modules?.[m.id]?.lastActivity?.run)} />
            ))}
          </dl>
        </Card>
      </div>

      <Section title="Modules" eyebrow="What I look after" i={3}>
        <div className="grid grid--2">
          {modules.map((m, i) => (
            <m.OverviewCard key={m.id} data={data.modules?.[m.id]} i={i} />
          ))}
          <Card tone="outline" i={modules.length}>
            <div className="ol-card__eyebrow">Coming later</div>
            <p className="small muted" style={{ margin: '0 0 18px' }}>
              More modules plug in here, each with its own screens and card.
            </p>
            <div className="row row--wrap" style={{ gap: 18 }}>
              {FUTURE.map((f) => (
                <span key={f.name} className="row small muted" style={{ gap: 8 }}>
                  <Icon icon={f.icon} size={18} /> {f.name}
                </span>
              ))}
            </div>
          </Card>
        </div>
      </Section>

      <div className="grid grid--2">
        <Section title="Recent AI calls" i={4} actions={<Button variant="ghost" size="sm" onClick={() => navigate('/usage')}>All usage</Button>}>
          <div className="list">
            {data.recentAi.map((r, i) => (
              <div key={r.id} className="list-row rise" style={{ '--i': i, padding: '12px 2px' }}>
                <div className="list-row__main">
                  <div className="list-row__title" style={{ fontSize: 14 }}>
                    {r.purpose}
                  </div>
                  <div className="list-row__meta">
                    <span>{r.model}</span>
                    <span>
                      {fmtShortDate(r.at)} {fmtTime(r.at)}
                    </span>
                  </div>
                </div>
                <span className="mono strong">{fmtUsd(r.costUsd)}</span>
              </div>
            ))}
            {!data.recentAi.length && <p className="small muted">No AI calls yet.</p>}
          </div>
        </Section>
        <Section title="What happened" i={5} actions={<Button variant="ghost" size="sm" onClick={() => navigate('/activity')}>Activity</Button>}>
          <div className="list">
            {data.recentEvents.map((e, i) => (
              <div key={e.id} className="list-row rise" style={{ '--i': i, padding: '12px 2px' }}>
                <div className="list-row__main">
                  <div className="list-row__title" style={{ fontSize: 14 }}>
                    {humanEventType(e.type)}
                  </div>
                  <div className="list-row__meta">
                    <span>{e.type}</span>
                  </div>
                </div>
                <span className="mono muted">{fmtAgo(e.createdAt)}</span>
              </div>
            ))}
            {!data.recentEvents.length && <p className="small muted">Nothing logged yet.</p>}
          </div>
        </Section>
      </div>
    </Page>
  );
}

function FragmentRow({ label, value }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
