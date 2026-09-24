import { useState } from 'react';
import { useApp } from '../lib/app-context.js';
import { useLoad } from '../lib/hooks.js';
import { errorMessage } from '../lib/api.js';
import { fmtDateTime, fmtInt, fmtUsd } from '../lib/format.js';
import { Bar, Button, Card, Empty, ErrorNote, Loading, Metric, Page, Section, Tabs } from '../components/ui.jsx';

const PAGE = 100;

export function Usage() {
  const { client } = useApp();
  const [limit, setLimit] = useState(PAGE);
  const [group, setGroup] = useState('byPurpose');
  const { data, error, loading, reload } = useLoad(() => client.admin.aiUsage({ limit }), [client, limit]);

  if (loading && !data) {
    return (
      <Page eyebrow="Olaf · Usage" title="What I cost" ghost="Cost">
        <Loading rows={6} />
      </Page>
    );
  }
  if (!data) {
    return (
      <Page eyebrow="Olaf · Usage" title="What I cost" ghost="Cost">
        <ErrorNote error={errorMessage(error)} onRetry={reload} />
      </Page>
    );
  }
  const pct = data.budgetUsd > 0 ? data.monthUsd / data.budgetUsd : 0;
  const tone = pct >= 1 ? 'danger' : pct >= 0.8 ? 'warning' : 'accent';
  const month = new Date(data.monthStart).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const groups = data.month[group];
  const maxGroup = Math.max(0.000001, ...groups.map((g) => g.costUsd));
  const maxMonth = Math.max(0.000001, ...data.byMonth.map((m) => m.costUsd));
  const monthCalls = data.month.byPurpose.reduce((n, g) => n + g.calls, 0);

  return (
    <Page eyebrow={`Olaf · Usage · ${month}`} title="What I cost" ghost="Cost" sub="Every AI call I made: what for, which model, tokens (including cache) and cost. The budget resets on the 1st (UTC).">
      <ErrorNote error={error && errorMessage(error)} onRetry={reload} />
      <Card tone="white" i={1}>
        <div className="row row--wrap" style={{ gap: 40, alignItems: 'flex-end' }}>
          <Metric label="Spent this month" value={fmtUsd(data.monthUsd)} unit={`of ${fmtUsd(data.budgetUsd)}`} size={48} />
          <Metric label="Calls this month" count={monthCalls} size={32} />
          <Metric label="Left" value={fmtUsd(Math.max(0, data.budgetUsd - data.monthUsd))} size={32} />
        </div>
        <div style={{ marginTop: 24 }}>
          <Bar value={data.monthUsd} max={data.budgetUsd} tone={tone} thick />
          <div className="row mono muted" style={{ marginTop: 8, justifyContent: 'space-between' }}>
            <span>{Math.round(pct * 100)}% of budget</span>
            <span>{pct >= 1 ? 'Over budget: I refuse new calls until next month.' : ''}</span>
          </div>
        </div>
      </Card>

      <div className="grid grid--main-side">
        <Section title="This month" i={2} actions={<Tabs variant="pill" items={[{ value: 'byPurpose', label: 'Purpose' }, { value: 'byModel', label: 'Model' }]} value={group} onChange={setGroup} />}>
          {groups.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{group === 'byPurpose' ? 'Purpose' : 'Model'}</th>
                    <th className="num">Calls</th>
                    <th className="num hide-narrow">In</th>
                    <th className="num hide-narrow">Out</th>
                    <th className="num hide-narrow">Cache r/w</th>
                    <th style={{ width: '22%' }} />
                    <th className="num">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, i) => (
                    <tr key={g.key} className="rise" style={{ '--i': i }}>
                      <td className="strong">{g.key}</td>
                      <td className="num mono">{fmtInt(g.calls)}</td>
                      <td className="num mono hide-narrow">{fmtInt(g.inputTokens)}</td>
                      <td className="num mono hide-narrow">{fmtInt(g.outputTokens)}</td>
                      <td className="num mono hide-narrow">
                        {fmtInt(g.cacheRead)} / {fmtInt(g.cacheWrite)}
                      </td>
                      <td style={{ verticalAlign: 'middle' }}>
                        <Bar value={g.costUsd} max={maxGroup} i={i} />
                      </td>
                      <td className="num mono strong">{fmtUsd(g.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No calls this month.</Empty>
          )}
        </Section>
        <Section title="By month" i={3}>
          <div className="row" style={{ alignItems: 'flex-end', gap: 10, height: 160 }}>
            {[...data.byMonth].reverse().map((m, i) => (
              <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }} title={`${m.month}: ${fmtUsd(m.costUsd)}, ${m.calls} calls`}>
                <span className="mono faint" style={{ fontSize: 10 }}>
                  {fmtUsd(m.costUsd)}
                </span>
                <div
                  style={{
                    width: '100%',
                    maxWidth: 28,
                    height: `${Math.max(2, (m.costUsd / maxMonth) * 110)}px`,
                    background: i === data.byMonth.length - 1 ? 'var(--accent)' : 'var(--ink-800)',
                    transformOrigin: 'bottom',
                    animation: 'grow-y var(--dur-drift) var(--ease-out) both',
                    animationDelay: `${i * 40}ms`,
                  }}
                />
                <span className="mono muted" style={{ fontSize: 11 }}>
                  {m.month.slice(5)}
                </span>
              </div>
            ))}
            {!data.byMonth.length && <Empty>No history yet.</Empty>}
          </div>
        </Section>
      </div>

      <Section title="Every call" eyebrow={`${fmtInt(data.total)} in total`} i={4}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Purpose</th>
                <th className="hide-narrow">Model</th>
                <th className="num">In</th>
                <th className="num">Out</th>
                <th className="num hide-narrow">Cache read</th>
                <th className="num hide-narrow">Cache write</th>
                <th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.id} className="rise" style={{ '--i': Math.min(i, 16) }}>
                  <td className="mono">{fmtDateTime(r.at)}</td>
                  <td className="strong">{r.purpose}</td>
                  <td className="mono hide-narrow">{r.model}</td>
                  <td className="num mono">{fmtInt(r.inputTokens)}</td>
                  <td className="num mono">{fmtInt(r.outputTokens)}</td>
                  <td className="num mono hide-narrow">{fmtInt(r.cacheRead)}</td>
                  <td className="num mono hide-narrow">{fmtInt(r.cacheWrite)}</td>
                  <td className="num mono strong">{fmtUsd(r.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.rows.length && <Empty>No AI calls yet.</Empty>}
        {data.total > data.rows.length && (
          <div style={{ marginTop: 20 }}>
            <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)} disabled={loading}>
              Show more
            </Button>
          </div>
        )}
      </Section>
    </Page>
  );
}
