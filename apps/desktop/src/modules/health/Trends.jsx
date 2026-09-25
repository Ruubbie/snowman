import { useState } from 'react';
import { useApp } from '../../lib/app-context.js';
import { useLoad } from '../../lib/hooks.js';
import { errorMessage } from '../../lib/api.js';
import { fmtDistance, fmtDuration, fmtNum, fmtShortDate, fmtDateTime } from '../../lib/format.js';
import { LineChart } from '../../charts/LineChart.jsx';
import { Card, Empty, ErrorNote, Loading, Metric, Page, Section, Tabs } from '../../components/ui.jsx';

/** One trend per metric; value picks the number from a day, fmt formats it. */
export const METRICS = [
  { id: 'sleep_min', label: 'Sleep', unit: 'h', fmt: (v) => fmtNum(v / 60, 1), lowerIsBetter: false },
  { id: 'hrv_ms', label: 'HRV', unit: 'ms', fmt: (v) => fmtNum(v, 0), lowerIsBetter: false },
  { id: 'resting_hr', label: 'Resting heart rate', unit: 'bpm', fmt: (v) => fmtNum(v, 0), lowerIsBetter: true },
  { id: 'steps', label: 'Steps', unit: '', fmt: (v) => fmtNum(v, 0), lowerIsBetter: false },
  { id: 'active_kcal', label: 'Active energy', unit: 'kcal', fmt: (v) => fmtNum(v, 0), lowerIsBetter: false },
  { id: 'exercise_min', label: 'Exercise', unit: 'min', fmt: (v) => fmtNum(v, 0), lowerIsBetter: false },
  { id: 'walking_hr', label: 'Walking heart rate', unit: 'bpm', fmt: (v) => fmtNum(v, 0), lowerIsBetter: true },
  { id: 'respiratory_rate', label: 'Breathing rate', unit: '/min', fmt: (v) => fmtNum(v, 1), lowerIsBetter: true },
  { id: 'spo2_pct', label: 'Blood oxygen', unit: '%', fmt: (v) => fmtNum(v, 0), lowerIsBetter: false },
  { id: 'daylight_min', label: 'Time in daylight', unit: 'min', fmt: (v) => fmtNum(v, 0), lowerIsBetter: false },
  { id: 'vo2max', label: 'VO2 max', unit: 'ml/kg·min', fmt: (v) => fmtNum(v, 1), lowerIsBetter: false },
  { id: 'body_mass_kg', label: 'Weight', unit: 'kg', fmt: (v) => fmtNum(v, 1), lowerIsBetter: true },
  { id: 'body_fat_pct', label: 'Body fat', unit: '%', fmt: (v) => fmtNum(v, 1), lowerIsBetter: true },
];

const RANGES = [
  { value: 14, label: '2 weeks' },
  { value: 30, label: 'Month' },
  { value: 90, label: '3 months' },
];

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Last 7 days' average vs. the personal baseline over the whole range. */
export function trendOf(days, id) {
  const values = days.map((d) => d[id]).filter((v) => v != null);
  const recent = avg(days.slice(0, 7).map((d) => d[id]).filter((v) => v != null));
  return { values, recent, baseline: avg(values) };
}

function deltaTone(metric, recent, baseline) {
  if (recent == null || baseline == null || Math.abs(recent - baseline) / baseline < 0.03) return 'muted';
  const better = metric.lowerIsBetter ? recent < baseline : recent > baseline;
  return better ? 'up' : 'accent';
}

function TrendCard({ metric, days, i }) {
  const { values, recent, baseline } = trendOf(days, metric.id);
  if (!values.length) return null;
  // Oldest -> newest along x.
  const ordered = [...days].reverse();
  const points = ordered.map((d, x) => ({ x, y: d[metric.id] }));
  const pct = recent != null && baseline ? ((recent - baseline) / baseline) * 100 : null;
  return (
    <Card tone="white" i={i}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <Metric
          label={metric.label}
          value={recent == null ? '—' : metric.fmt(recent)}
          unit={metric.unit}
          size={36}
          delta={pct == null ? null : Math.round(pct) === 0 ? 'same as your average' : `${pct > 0 ? '+' : ''}${Math.round(pct)}% vs your average`}
          deltaTone={deltaTone(metric, recent, baseline)}
        />
        <span className="small muted">7-day average</span>
      </div>
      <LineChart
        series={[{ points, color: 'var(--accent)', width: 2, area: true }]}
        xMax={Math.max(1, points.length - 1)}
        height={140}
        formatY={(v) => metric.fmt(v)}
        formatX={(x) => fmtShortDate(ordered[Math.round(x)]?.date)}
        refLines={baseline == null ? [] : [{ y: baseline, label: 'avg' }]}
      />
    </Card>
  );
}

export function Trends() {
  const { client } = useApp();
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useLoad(() => client.healthData.summary({ days }), [client, days]);

  const head = { eyebrow: 'Health · Apple Health', title: 'How you are doing', ghost: 'Health' };
  if (loading && !data) return <Page {...head}><Loading rows={6} /></Page>;
  if (!data) return <Page {...head}><ErrorNote error={errorMessage(error)} onRetry={reload} /></Page>;

  const hasDays = data.days.length > 0;
  return (
    <Page
      {...head}
      sub="Everything the iPhone app sent from Apple Health, compared with your own average."
      actions={<Tabs variant="pill" items={RANGES} value={days} onChange={setDays} />}
    >
      <ErrorNote error={error && errorMessage(error)} onRetry={reload} />
      {!hasDays && !data.workouts.length ? (
        <Empty title="No health data yet">Open the Olaf app on your iPhone and allow Apple Health; it syncs every time you open it.</Empty>
      ) : (
        <>
          <div className="grid grid--2">
            {METRICS.map((m, i) => <TrendCard key={m.id} metric={m} days={data.days} i={i} />)}
          </div>
          <Section title="Workouts" eyebrow={`${data.workouts.length} in this period`} i={METRICS.length}>
            {data.workouts.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>When</th><th>Activity</th><th>Duration</th><th>Distance</th><th>Avg HR</th><th>Max HR</th><th>kcal</th></tr>
                  </thead>
                  <tbody>
                    {data.workouts.map((w) => (
                      <tr key={`${w.start_at}-${w.activity}`}>
                        <td>{fmtDateTime(w.start_at)}</td>
                        <td style={{ textTransform: 'capitalize' }}>{w.activity.replace(/_/g, ' ')}</td>
                        <td className="mono">{fmtDuration(w.duration_s)}</td>
                        <td className="mono">{w.distance_m ? fmtDistance(w.distance_m) : '—'}</td>
                        <td className="mono">{w.avg_hr ? Math.round(w.avg_hr) : '—'}</td>
                        <td className="mono">{w.max_hr ? Math.round(w.max_hr) : '—'}</td>
                        <td className="mono">{w.energy_kcal ? Math.round(w.energy_kcal) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No workouts in this period" />
            )}
          </Section>
        </>
      )}
    </Page>
  );
}
