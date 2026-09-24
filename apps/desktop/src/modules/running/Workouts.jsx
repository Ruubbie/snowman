import { useMemo, useState } from 'react';
import { ChevronRight, Trash2, TriangleAlert, RefreshCw } from 'lucide-react';
import { useApp } from '../../lib/app-context.js';
import { navigate, useLeaving, useLoad } from '../../lib/hooks.js';
import { errorMessage } from '../../lib/api.js';
import { fmtDay, fmtDuration, fmtKm, fmtPace, fmtTime, fmtInt, plural, fmtHours } from '../../lib/format.js';
import { Badge, Button, Checkbox, Empty, ErrorNote, Exit, Icon, Loading, Metric, Page, Tag } from '../../components/ui.jsx';
import { useOverlay } from '../../components/overlay.jsx';
import { SOURCE_LABEL, SOURCE_TONE, SUSPECT_LABEL, describeRun } from './derive.js';
import { WorkoutDetail } from './WorkoutDetail.jsx';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'suspect', label: 'Looks fake' },
  { value: 'native', label: 'iPhone' },
  { value: 'imported', label: 'Imported' },
  { value: 'simulated', label: 'Simulated' },
];

export function Workouts({ param }) {
  if (param) return <WorkoutDetail id={param} />;
  return <WorkoutList />;
}

function WorkoutList() {
  const { client } = useApp();
  const { toast, confirm } = useOverlay();
  const { data, error, loading, reload, setData } = useLoad(() => client.admin.running.runs({ limit: 500 }), [client]);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [leaving, leave, restore] = useLeaving();

  const runs = data?.runs || [];
  const visible = useMemo(
    () =>
      runs.filter((r) => {
        if (filter === 'all') return true;
        if (filter === 'suspect') return r.suspect.length > 0;
        return r.source === filter;
      }),
    [runs, filter],
  );
  const counts = useMemo(() => {
    const c = { all: runs.length, suspect: 0, native: 0, imported: 0, simulated: 0 };
    for (const r of runs) {
      if (r.suspect.length) c.suspect++;
      if (c[r.source] != null) c[r.source]++;
    }
    return c;
  }, [runs]);
  const totals = useMemo(
    () => runs.reduce((t, r) => ({ m: t.m + (r.distanceM || 0), s: t.s + (r.movingTimeS || r.durationS || 0) }), { m: 0, s: 0 }),
    [runs],
  );

  const toggle = (id, on) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const someSelected = visible.some((r) => selected.has(r.id));

  async function remove(ids) {
    const chosen = runs.filter((r) => ids.includes(r.id));
    if (!chosen.length) return;
    const sum = (k) => chosen.reduce((n, r) => n + (r[k] || 0), 0);
    const ok = await confirm(
      chosen.length === 1
        ? {
            title: 'Delete this run?',
            body: 'This removes the run and everything recorded with it. It cannot be undone.',
            what: describeRun(chosen[0]),
            note: chosen[0].session?.status === 'done' ? `Its planned session (${chosen[0].session.title}) goes back to planned.` : null,
            confirmLabel: 'Delete run',
          }
        : {
            title: `Delete ${chosen.length} runs?`,
            body: 'These runs and everything recorded with them will be removed. It cannot be undone.',
            what: `${plural(chosen.length, 'run')} — ${plural(sum('sampleCount'), 'sample')}, ${plural(sum('eventCount'), 'event')}, ${plural(sum('cueCount'), 'cue')}`,
            items: chosen.map(describeRun),
            confirmLabel: `Delete ${chosen.length} runs`,
          },
    );
    if (!ok) return;
    // Optimistic: animate out now, drop from state after the exit.
    leave(ids, () => setData((d) => ({ ...d, total: d.total - ids.length, runs: d.runs.filter((r) => !ids.includes(r.id)) })));
    setSelected((s) => new Set([...s].filter((id) => !ids.includes(id))));
    try {
      const res = ids.length === 1 ? { deleted: [(await client.admin.running.deleteRun(ids[0])).deleted] } : await client.admin.running.deleteRuns(ids);
      const n = res.deleted.length;
      toast({
        tone: 'success',
        title: n === 1 ? 'Run deleted' : `${n} runs deleted`,
        body: `${plural(res.deleted.reduce((a, d) => a + d.samples, 0), 'sample')}, ${plural(res.deleted.reduce((a, d) => a + d.events, 0), 'event')} and ${plural(
          res.deleted.reduce((a, d) => a + d.cues, 0),
          'cue',
        )} removed.`,
      });
    } catch (err) {
      restore(ids);
      toast({ tone: 'danger', title: 'Could not delete', body: errorMessage(err) });
      reload();
    }
  }

  return (
    <Page
      eyebrow="Running · Workouts"
      title="Your runs"
      ghost="Runs"
      sub="Every workout Polar sent me, with its route, samples and my cues. Rows marked “looks fake” are probably test data."
      actions={<Button variant="outline" size="sm" iconLeft={RefreshCw} onClick={reload}>Refresh</Button>}
    >
      <div className="metrics" style={{ marginBottom: 32 }}>
        <Metric label="Runs" count={runs.length} size={36} i={0} />
        <Metric label="Distance" count={totals.m / 1000} format={(v) => v.toFixed(1)} unit="km" size={36} i={1} />
        <Metric label="Time" value={fmtHours(totals.s)} unit="h" size={36} i={2} />
        <Metric label="Looks fake" count={counts.suspect} size={36} i={3} delta={counts.suspect ? 'worth a look' : 'all clean'} deltaTone={counts.suspect ? 'accent' : 'muted'} />
      </div>

      <div className="toolbar rise" style={{ '--i': 2 }}>
        <Checkbox
          checked={allVisibleSelected}
          indeterminate={!allVisibleSelected && someSelected}
          onChange={(on) => setSelected(on ? new Set([...selected, ...visible.map((r) => r.id)]) : new Set([...selected].filter((id) => !visible.some((r) => r.id === id))))}
        />
        {FILTERS.map((f) => (
          <Tag key={f.value} selected={filter === f.value} onClick={() => setFilter(f.value)} count={counts[f.value]} icon={f.value === 'suspect' ? TriangleAlert : undefined}>
            {f.label}
          </Tag>
        ))}
        <span className="spacer" />
        {counts.suspect > 0 && (
          <button type="button" className="link-btn" onClick={() => setSelected(new Set(runs.filter((r) => r.suspect.length).map((r) => r.id)))}>
            Select all that look fake
          </button>
        )}
        <Button variant="secondary" size="sm" iconLeft={Trash2} disabled={!selected.size} onClick={() => remove([...selected])}>
          Delete{selected.size ? ` ${selected.size}` : ''}
        </Button>
      </div>

      <ErrorNote error={error && errorMessage(error)} onRetry={reload} />
      {loading && !data && <Loading rows={5} />}
      {data && !visible.length && <Empty title="Nothing here">No runs match this filter.</Empty>}

      <div className="list">
        {visible.map((r, i) => (
          <Exit key={r.id} leaving={leaving.has(r.id)}>
            <div
              className={`list-row list-row--link rise${selected.has(r.id) ? ' list-row--selected' : ''}`}
              style={{ '--i': Math.min(i, 12) }}
              onClick={() => navigate(`/m/running/workouts/${encodeURIComponent(r.id)}`)}
            >
              <Checkbox checked={selected.has(r.id)} onChange={(on) => toggle(r.id, on)} />
              <div className="list-row__main">
                <div className="row row--wrap" style={{ gap: 8 }}>
                  <span className="list-row__title">{fmtDay(r.startedAt)}</span>
                  <span className="mono muted">{fmtTime(r.startedAt)}</span>
                  {r.session?.title && <span className="small muted">· {r.session.title}</span>}
                  {r.source !== 'simulated' && <Badge tone={SOURCE_TONE[r.source]}>{SOURCE_LABEL[r.source]}</Badge>}
                  {r.suspect.map((f) => (
                    <Badge key={f} tone="warning" dot title="Looks like test or false data">
                      {SUSPECT_LABEL[f] || f}
                    </Badge>
                  ))}
                </div>
                <div className="list-row__meta">
                  <span>{fmtDuration(r.movingTimeS || r.durationS)}</span>
                  <span>{fmtPace(r.avgPaceSPerKm || (r.distanceM ? (r.durationS / r.distanceM) * 1000 : null))} /km</span>
                  <span>
                    {fmtInt(r.sampleCount)} samples · {fmtInt(r.eventCount)} events · {fmtInt(r.cueCount)} cues
                  </span>
                </div>
              </div>
              <span className="big-num">
                {fmtKm(r.distanceM, 2)}
                <span className="unit">km</span>
              </span>
              <span className="chev">
                <Icon icon={ChevronRight} size={18} />
              </span>
            </div>
          </Exit>
        ))}
      </div>
    </Page>
  );
}
