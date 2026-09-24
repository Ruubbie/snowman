import { Footprints } from 'lucide-react';
import { navigate } from '../../lib/hooks.js';
import { fmtAgo, fmtDay, fmtHours, fmtKm } from '../../lib/format.js';
import { Badge, Button, Card, Icon, Metric } from '../../components/ui.jsx';
import { SUSPECT_LABEL } from './derive.js';

/** The running module's card on Olaf's home. `data` = overview.modules.running. */
export function RunningOverviewCard({ data, i }) {
  if (!data || data.error) {
    return (
      <Card tone="outline" i={i} eyebrow="Running">
        <p className="small muted" style={{ margin: 0 }}>
          Running data is unavailable right now.
        </p>
      </Card>
    );
  }
  const suspect = data.recentRuns.filter((r) => r.suspect.length).length;
  return (
    <Card tone="white" i={i}>
      <div className="row" style={{ marginBottom: 20 }}>
        <Icon icon={Footprints} size={22} />
        <span className="h3" style={{ flex: 1 }}>
          Running
        </span>
        <span className="mono muted">polar</span>
      </div>
      <div className="metrics" style={{ gap: 20, marginBottom: 22 }}>
        <Metric label="Runs" count={data.counts.runs} size={28} />
        <Metric label="Distance" count={data.totals.distanceM / 1000} format={(v) => v.toFixed(1)} unit="km" size={28} />
        <Metric label="Time" value={fmtHours(data.totals.timeS)} unit="h" size={28} />
        <Metric label="Cues" count={data.counts.cues} size={28} />
      </div>
      {data.nextSession && (
        <p className="small" style={{ margin: '0 0 14px' }}>
          <span className="eyebrow eyebrow--accent">Next</span>{' '}
          <span className="strong">{data.nextSession.title}</span> <span className="muted">· {fmtDay(data.nextSession.date)}</span>
        </p>
      )}
      <div className="list" style={{ marginBottom: 16 }}>
        {data.recentRuns.slice(0, 3).map((r) => (
          <div key={r.id} className="list-row list-row--link" style={{ padding: '10px 2px' }} onClick={() => navigate(`/m/running/workouts/${encodeURIComponent(r.id)}`)}>
            <span className="small strong" style={{ flex: 1 }}>
              {fmtDay(r.startedAt)}
            </span>
            {r.suspect.length > 0 && (
              <Badge tone="warning" dot>
                {SUSPECT_LABEL[r.suspect[0]]}
              </Badge>
            )}
            <span className="mono strong">{fmtKm(r.distanceM, 2)} km</span>
          </div>
        ))}
        {!data.recentRuns.length && <p className="small muted">No runs yet.</p>}
      </div>
      <div className="row">
        <span className="small muted" style={{ flex: 1 }}>
          Last run {fmtAgo(data.lastActivity.run)}
          {suspect ? ` · ${suspect} look fake` : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={() => navigate('/m/running/workouts')}>
          Workouts
        </Button>
      </div>
    </Card>
  );
}
