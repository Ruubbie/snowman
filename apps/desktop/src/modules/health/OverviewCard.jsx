import { useApp } from '../../lib/app-context.js';
import { useLoad, navigate } from '../../lib/hooks.js';
import { Card, Metric } from '../../components/ui.jsx';
import { METRICS, trendOf } from './Trends.jsx';

const SHOWN = ['sleep_min', 'hrv_ms', 'resting_hr'];

/** Loads its own week (the backend has no admin overview for health). */
export function HealthOverviewCard({ i }) {
  const { client } = useApp();
  const { data } = useLoad(() => client.healthData.summary({ days: 30 }), [client]);
  const days = data?.days || [];
  return (
    <Card tone="white" eyebrow="Health" title="Last 7 days" interactive onClick={() => navigate('/m/health/trends')} i={i}>
      {days.length ? (
        <div className="row row--wrap" style={{ gap: 28 }}>
          {METRICS.filter((m) => SHOWN.includes(m.id)).map((m) => {
            const { recent } = trendOf(days, m.id);
            return <Metric key={m.id} label={m.label} value={recent == null ? '—' : m.fmt(recent)} unit={m.unit} size={28} />;
          })}
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>No Apple Health data yet. Open Olaf on your iPhone to sync.</p>
      )}
    </Card>
  );
}
