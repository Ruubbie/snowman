import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Pause, Play, Trash2 } from 'lucide-react';
import { useApp } from '../../lib/app-context.js';
import { navigate, useLoad } from '../../lib/hooks.js';
import { errorMessage } from '../../lib/api.js';
import {
  fmtDateTime,
  fmtDay,
  fmtDistance,
  fmtDuration,
  fmtInt,
  fmtKm,
  fmtNum,
  fmtPace,
  fmtSpeedKmh,
  fmtTime,
  humanEventType,
} from '../../lib/format.js';
import { Badge, Button, Card, Empty, ErrorNote, IconButton, Loading, Metric, Page, Section, Tabs } from '../../components/ui.jsx';
import { useOverlay } from '../../components/overlay.jsx';
import { LineChart } from '../../charts/LineChart.jsx';
import { RouteMap, SpeedLegend } from '../../charts/RouteMap.jsx';
import { SOURCE_LABEL, SOURCE_TONE, SUSPECT_LABEL, describeRun, indexAtTime, prepareRun } from './derive.js';

const REPLAY_SPEED = 30; // 30 s of run per second of replay

export function WorkoutDetail({ id }) {
  const { client } = useApp();
  const { toast, confirm } = useOverlay();
  const { data, error, loading } = useLoad(() => client.admin.running.run(id), [client, id]);
  const [leavingPage, setLeavingPage] = useState(false);

  async function remove() {
    const r = data.run;
    const ok = await confirm({
      title: 'Delete this run?',
      body: 'This removes the run and everything recorded with it. It cannot be undone.',
      what: describeRun({ ...r, sampleCount: data.samples.length, eventCount: data.events.length, cueCount: data.cues.length }),
      note: r.session?.status === 'done' ? `Its planned session (${r.session.title}) goes back to planned.` : null,
      confirmLabel: 'Delete run',
    });
    if (!ok) return;
    setLeavingPage(true);
    try {
      const res = await client.admin.running.deleteRun(r.id);
      toast({ tone: 'success', title: 'Run deleted', body: `${fmtInt(res.deleted.samples)} samples, ${fmtInt(res.deleted.events)} events and ${fmtInt(res.deleted.cues)} cues removed.` });
      setTimeout(() => navigate('/m/running/workouts'), 240);
    } catch (err) {
      setLeavingPage(false);
      toast({ tone: 'danger', title: 'Could not delete', body: errorMessage(err) });
    }
  }

  const back = (
    <Button variant="ghost" size="sm" iconLeft={ArrowLeft} iconRight={null} onClick={() => navigate('/m/running/workouts')}>
      All runs
    </Button>
  );

  if (loading && !data) {
    return (
      <Page eyebrow="Running · Workout" title="Loading…" ghost="Run" back={back}>
        <Loading rows={6} />
      </Page>
    );
  }
  if (error || !data) {
    return (
      <Page eyebrow="Running · Workout" title="Run not found" ghost="Run" back={back}>
        <ErrorNote error={errorMessage(error)} />
      </Page>
    );
  }
  return (
    <div className={`exit${leavingPage ? ' exit--leaving' : ''}`}>
      <div className="exit__inner">
        <Detail data={data} back={back} onDelete={remove} />
      </div>
    </div>
  );
}

function Detail({ data, back, onDelete }) {
  const { run, samples, events, cues, session, brief, debrief, analysis } = data;
  const prep = useMemo(() => prepareRun(samples, session), [samples, session]);
  const [scrubT, setScrubT] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [chartMode, setChartMode] = useState('pace');
  const raf = useRef(0);

  const idx = scrubT == null ? null : indexAtTime(prep.rows, scrubT);
  const at = idx == null ? null : prep.rows[idx];
  const routeIdx = at ? prep.routeIndexOf.get(at) ?? nearestRouteIndex(prep, idx) : null;

  useEffect(() => {
    if (!playing) return undefined;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      let done = false;
      setScrubT((t) => {
        const next = (t ?? 0) + dt * REPLAY_SPEED;
        if (next >= prep.duration) {
          done = true;
          return prep.duration;
        }
        return next;
      });
      if (done) setPlaying(false);
      else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, prep.duration]);

  const hasSamples = prep.rows.length > 0;
  const pacePoints = useMemo(() => prep.rows.map((r) => ({ x: r.t, y: r.pace && r.pace < 1200 ? r.pace : null })), [prep]);
  const speedPoints = useMemo(() => prep.rows.map((r) => ({ x: r.t, y: r.speed != null ? r.speed * 3.6 : null })), [prep]);
  const altPoints = useMemo(() => prep.rows.map((r) => ({ x: r.t, y: r.alt })), [prep]);
  const cadPoints = useMemo(() => prep.rows.map((r) => ({ x: r.t, y: r.cadence })), [prep]);
  const segKind = at?.segment != null ? session?.segments?.[at.segment]?.kind : null;

  const avgPace = run.avgPaceSPerKm || (run.distanceM ? ((run.movingTimeS || run.durationS) / run.distanceM) * 1000 : null);
  const splits = analysis?.splits?.length ? analysis.splits.map((s) => ({ km: s.km, pace: s.paceSPerKm })) : (run.splits || []).map((p, i) => ({ km: i + 1, pace: p }));
  const targets = brief?.brief?.targets || [];
  // Stored summary first; fall back to the live analysis of the samples.
  const hasAnalysis = samples.length > 0;
  const maxSpeed = run.maxSpeedMps ?? (hasAnalysis ? analysis?.maxSpeedMps : null);
  const elevGain = run.elevGainM ?? (hasAnalysis ? analysis?.elevGainM : null);
  const cadence = run.avgCadenceSpm ?? (hasAnalysis ? analysis?.avgCadenceSpm : null);

  return (
    <Page
      back={back}
      eyebrow={`${fmtDay(run.startedAt)} · ${fmtTime(run.startedAt)}${session?.title ? ` · ${session.title}` : ''}`}
      title={
        <>
          {fmtKm(run.distanceM, 2)}
          <span className="unit" style={{ fontSize: 22 }}>
            km
          </span>
        </>
      }
      ghost="Run"
      actions={
        <Button variant="outline" iconLeft={Trash2} onClick={onDelete}>
          Delete run
        </Button>
      }
    >
      <div className="row row--wrap rise" style={{ gap: 8, marginTop: -18, marginBottom: 28, '--i': 1 }}>
        <Badge tone={SOURCE_TONE[run.source]}>{SOURCE_LABEL[run.source]}</Badge>
        {run.suspect.map((f) => (
          <Badge key={f} tone="warning" dot>
            {SUSPECT_LABEL[f] || f}
          </Badge>
        ))}
        {run.completedPlan && <Badge tone="success">Plan completed</Badge>}
        {run.effort != null && <Badge>Effort {run.effort}/10</Badge>}
      </div>

      <div className="metrics">
        <Metric label="Time" value={fmtDuration(run.movingTimeS || run.durationS)} size={32} i={0} />
        <Metric label="Avg pace" value={fmtPace(avgPace)} unit="/km" size={32} i={1} />
        <Metric label="Max speed" value={maxSpeed != null ? fmtSpeedKmh(maxSpeed) : '–'} unit="km/h" size={32} i={2} />
        <Metric label="Elevation" value={elevGain != null ? `+${fmtNum(elevGain, 0)}` : '–'} unit="m" size={32} i={3} />
        <Metric label="Cadence" value={cadence != null ? fmtNum(cadence, 0) : '–'} unit="spm" size={32} i={4} />
        <Metric label="Samples" count={samples.length} size={32} i={5} />
      </div>

      {!hasSamples && (
        <div className="notice section rise">
          <div>
            <strong className="strong">No GPS samples.</strong>{' '}
            {run.imported ? 'This run was imported from RunCoach, so only the summary exists.' : 'Nothing was recorded — this is likely a test upload.'}
          </div>
        </div>
      )}

      {hasSamples && (
        <Section title="Replay" eyebrow="Route coloured by speed" i={2} actions={prep.speedRange && <SpeedLegend lo={`${fmtSpeedKmh(prep.speedRange[0])} km/h`} hi={`${fmtSpeedKmh(prep.speedRange[1])}`} />}>
          <div className="grid grid--main-side">
            <div>
              <RouteMap points={prep.route} scrubIndex={routeIdx} onPick={(i) => setScrubT(prep.route[i].t)} />
              <div className="scrubber">
                <IconButton
                  icon={playing ? Pause : Play}
                  variant="dark"
                  size={40}
                  label={playing ? 'Pause replay' : 'Replay run'}
                  onClick={() => {
                    if (!playing && (scrubT == null || scrubT >= prep.duration)) setScrubT(0);
                    setPlaying((p) => !p);
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={prep.duration}
                  step={1}
                  value={scrubT ?? 0}
                  style={{ '--p': `${((scrubT ?? 0) / (prep.duration || 1)) * 100}%` }}
                  onChange={(e) => {
                    setPlaying(false);
                    setScrubT(Number(e.target.value));
                  }}
                  aria-label="Scrub through the run"
                />
                <span className="mono muted" style={{ minWidth: 92, textAlign: 'right' }}>
                  {fmtDuration(scrubT ?? 0)} / {fmtDuration(prep.duration)}
                </span>
              </div>
            </div>
            <Card tone="white" padding={24}>
              <div className="eyebrow eyebrow--accent" style={{ marginBottom: 18 }}>
                {at ? `At ${fmtDuration(at.t)}` : 'Move the scrubber'}
              </div>
              <div className="readout">
                <Metric label="Distance" value={at?.distM != null ? fmtKm(at.distM, 2) : '–'} unit="km" size={26} />
                <Metric label="Pace" value={fmtPace(at?.pace)} unit="/km" size={26} />
                <Metric label="Speed" value={at?.speed != null ? fmtSpeedKmh(at.speed) : '–'} unit="km/h" size={26} />
                <Metric label="Cadence" value={at?.cadence != null ? fmtNum(at.cadence, 0) : '–'} unit="spm" size={26} />
                <Metric label="Altitude" value={at?.alt != null ? fmtNum(at.alt, 1) : '–'} unit="m" size={26} />
                <Metric label="GPS accuracy" value={at?.hAcc != null ? `±${fmtNum(at.hAcc, 0)}` : '–'} unit="m" size={26} />
              </div>
              <p className="small muted" style={{ margin: '20px 0 0' }}>
                {at ? (segKind ? `Segment ${at.segment + 1}: ${segKind}.` : 'No planned segment.') : 'Click the route or drag along a chart to jump there.'}
                {at?.ts ? ` Clock ${fmtTime(at.ts)}.` : ''}
              </p>
            </Card>
          </div>
        </Section>
      )}

      {hasSamples && (
        <Section
          title={chartMode === 'pace' ? 'Pace over time' : 'Speed over time'}
          i={3}
          actions={<Tabs variant="pill" items={[{ value: 'pace', label: 'Pace' }, { value: 'speed', label: 'Speed' }]} value={chartMode} onChange={setChartMode} />}
        >
          <LineChart
            key={chartMode}
            series={[{ points: chartMode === 'pace' ? pacePoints : speedPoints, color: 'var(--ink-800)' }]}
            invert={chartMode === 'pace'}
            height={200}
            bands={prep.bands.filter((b) => b.tone === 'run')}
            formatY={chartMode === 'pace' ? (v) => fmtPace(v) : (v) => `${v.toFixed(1)}`}
            formatX={(v) => fmtDuration(v)}
            scrubX={scrubT}
            onScrub={(x) => {
              setPlaying(false);
              setScrubT(x);
            }}
            refLines={chartMode === 'pace' && avgPace ? [{ y: avgPace, label: `avg ${fmtPace(avgPace)}` }] : []}
          />
          <p className="small faint" style={{ margin: '8px 0 0' }}>
            Shaded: planned run segments. Smoothed over ~10 s.
          </p>
        </Section>
      )}

      {hasSamples && (prep.hasAlt || prep.hasCadence) && (
        <div className="grid grid--2">
          {prep.hasAlt && (
            <Section title="Elevation" i={4}>
              <LineChart series={[{ points: altPoints, color: 'var(--ice-500)', area: true }]} height={140} formatY={(v) => `${v.toFixed(0)} m`} formatX={fmtDuration} scrubX={scrubT} onScrub={setScrubT} />
            </Section>
          )}
          {prep.hasCadence && (
            <Section title="Cadence" i={5}>
              <LineChart series={[{ points: cadPoints, color: 'var(--ink-600)' }]} height={140} formatY={(v) => `${v.toFixed(0)}`} formatX={fmtDuration} scrubX={scrubT} onScrub={setScrubT} />
            </Section>
          )}
        </div>
      )}

      <div className="grid grid--2">
        <Section title="Splits" i={6}>
          {splits.length ? <Splits splits={splits} /> : <Empty>No full kilometre recorded.</Empty>}
        </Section>
        <Section title="Segments vs targets" i={7}>
          <Segments stats={analysis?.segmentStats || []} segments={session?.segments || []} targets={targets} />
        </Section>
      </div>

      <Section title="Timeline" eyebrow={`${events.length} events · ${cues.length} Olaf cues`} i={8}>
        <Timeline events={events} cues={cues} duration={Math.max(prep.duration, run.durationS || 0, ...events.map((e) => e.t_s), ...cues.map((c) => c.elapsedS))} scrubT={scrubT} onPick={setScrubT} />
        <div className="grid grid--2" style={{ marginTop: 20 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Events
            </div>
            {events.length ? (
              <table className="table">
                <tbody>
                  {events.map((e) => (
                    <tr key={e.seq} onClick={() => setScrubT(e.t_s)} style={{ cursor: 'pointer' }}>
                      <td className="mono" style={{ width: 70 }}>
                        {fmtDuration(e.t_s)}
                      </td>
                      <td className="strong">{humanEventType(`x.${e.type}`)}</td>
                      <td className="mono muted">{e.data ? JSON.stringify(e.data).slice(0, 60) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>No events recorded.</Empty>
            )}
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Olaf cues
            </div>
            {cues.length ? (
              <table className="table">
                <tbody>
                  {cues.map((c) => (
                    <tr key={c.id} onClick={() => setScrubT(c.elapsedS)} style={{ cursor: 'pointer' }}>
                      <td className="mono" style={{ width: 70 }}>
                        {fmtDuration(c.elapsedS)}
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                          <Badge tone="neutral">{c.trigger.replace(/_/g, ' ')}</Badge>
                          <Badge tone={c.source === 'live' ? 'info' : 'neutral'}>{c.source}</Badge>
                        </div>
                        <span className="strong">{c.text || <span className="muted">(stayed silent)</span>}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>Olaf said nothing during this run.</Empty>
            )}
          </div>
        </div>
      </Section>

      <div className="grid grid--2">
        <Section title="Debrief" i={9}>
          {debrief ? (
            <Card tone="tint" padding={24}>
              <div className="olaf-says">
                <span className="olaf-says__name">olaf</span>
                <p className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {debrief.text}
                </p>
              </div>
              <p className="mono faint" style={{ margin: '14px 0 0' }}>
                {fmtDateTime(debrief.at)}
              </p>
            </Card>
          ) : (
            <Empty>No debrief stored for this run.</Empty>
          )}
        </Section>
        <Section title="Pre-run brief" i={10}>
          {brief ? <BriefBody brief={brief} /> : <Empty>{session ? 'No brief stored for this session.' : 'This run was not linked to a planned session.'}</Empty>}
        </Section>
      </div>

      <Section title="Details" i={11}>
        <dl className="kv">
          <dt>Run id</dt>
          <dd className="mono">{run.id}</dd>
          <dt>Client id</dt>
          <dd className="mono">{run.clientId}</dd>
          <dt>Session</dt>
          <dd>{session ? `${session.title} · ${session.date} · ${session.status}` : '–'}</dd>
          <dt>Uploaded</dt>
          <dd>{fmtDateTime(run.createdAt)}</dd>
          <dt>Distance</dt>
          <dd>{fmtDistance(run.distanceM)}</dd>
          {run.note && (
            <>
              <dt>Note</dt>
              <dd>{run.note}</dd>
            </>
          )}
          {run.device && (
            <>
              <dt>Device</dt>
              <dd className="mono">{JSON.stringify(run.device)}</dd>
            </>
          )}
          {run.weather && (
            <>
              <dt>Weather</dt>
              <dd className="mono">{JSON.stringify(run.weather)}</dd>
            </>
          )}
        </dl>
      </Section>
    </Page>
  );
}

function nearestRouteIndex(prep, rowIdx) {
  const t = prep.rows[rowIdx]?.t ?? 0;
  if (!prep.route.length) return null;
  return indexAtTime(prep.route, t);
}

function Splits({ splits }) {
  const valid = splits.filter((s) => s.pace > 0);
  const max = Math.max(...valid.map((s) => s.pace));
  const best = Math.min(...valid.map((s) => s.pace));
  return (
    <div className="stack" style={{ gap: 12 }}>
      {splits.map((s, i) => (
        <div key={s.km} className="split-row rise" style={{ '--i': i }}>
          <span className="mono muted">{s.km}</span>
          <div className="bar">
            <div className={`bar__fill${s.pace === best ? ' bar__fill--accent' : ''}`} style={{ width: `${(s.pace / max) * 100}%`, '--i': i }} />
          </div>
          <span className="mono strong" style={{ textAlign: 'right' }}>
            {fmtPace(s.pace)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Segments({ stats, segments, targets }) {
  if (!segments.length && !stats.length) return <Empty>No planned segments for this run.</Empty>;
  const byIndex = new Map(stats.map((s) => [s.segmentIndex, s]));
  const tByIndex = new Map(targets.map((t) => [t.segment_index, t]));
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Kind</th>
            <th className="num">Planned</th>
            <th className="num">Target</th>
            <th className="num">Actual</th>
            <th className="num">In target</th>
          </tr>
        </thead>
        <tbody>
          {(segments.length ? segments : stats.map((s) => ({ kind: s.kind }))).map((seg, i) => {
            const s = byIndex.get(i);
            const t = tByIndex.get(i);
            const range = t && (t.pace_min_s_per_km || t.pace_max_s_per_km) ? `${fmtPace(t.pace_min_s_per_km)}–${fmtPace(t.pace_max_s_per_km)}` : '–';
            const pct = s?.timeInTargetPct;
            return (
              <tr key={i}>
                <td className="mono">{i + 1}</td>
                <td className="strong">{seg.kind || "–"}</td>
                <td className="num mono">{seg.seconds ? fmtDuration(seg.seconds) : '–'}</td>
                <td className="num mono">{range}</td>
                <td className="num mono">{fmtPace(s?.avgPaceSPerKm)}</td>
                <td className="num">{pct != null ? <Badge tone={pct >= 70 ? 'success' : pct >= 40 ? 'warning' : 'danger'}>{Math.round(pct)}%</Badge> : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Timeline({ events, cues, duration, scrubT, onPick }) {
  if (!duration) return <Empty>Nothing to place on a timeline.</Empty>;
  const pct = (t) => `${Math.min(100, Math.max(0, (t / duration) * 100))}%`;
  return (
    <div className="timeline">
      <span className="timeline__lane-label" style={{ top: 0 }}>
        Events
      </span>
      <div className="timeline__lane" style={{ top: 26 }} />
      {events.map((e, i) => (
        <button key={`e${e.seq}`} type="button" className="timeline__mark" style={{ left: pct(e.t_s), top: 26, '--i': i }} title={`${fmtDuration(e.t_s)} · ${e.type}`} onClick={() => onPick(e.t_s)} />
      ))}
      <span className="timeline__lane-label" style={{ top: 40 }}>
        Olaf cues
      </span>
      <div className="timeline__lane" style={{ top: 66 }} />
      {cues.map((c, i) => (
        <button
          key={`c${c.id}`}
          type="button"
          className={`timeline__mark timeline__mark--cue${c.source === 'fallback' ? ' timeline__mark--fallback' : ''}`}
          style={{ left: pct(c.elapsedS), top: 66, '--i': i }}
          title={`${fmtDuration(c.elapsedS)} · ${c.trigger}${c.text ? ` · ${c.text}` : ''}`}
          onClick={() => onPick(c.elapsedS)}
        />
      ))}
      {scrubT != null && <div className="chart__scrub" style={{ left: pct(scrubT) }} />}
    </div>
  );
}

export function BriefBody({ brief }) {
  const b = brief.brief || {};
  return (
    <Card tone="outline" padding={24}>
      {b.opening_line && (
        <div className="olaf-says" style={{ marginBottom: 16 }}>
          <span className="olaf-says__name">olaf</span>
          <p className="small strong" style={{ margin: 0 }}>
            “{b.opening_line}”
          </p>
        </div>
      )}
      {b.focus?.length > 0 && (
        <ul className="small" style={{ margin: '0 0 14px', paddingLeft: 18 }}>
          {b.focus.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}
      {b.targets?.length > 0 && (
        <div className="row row--wrap" style={{ gap: 6, marginBottom: 14 }}>
          {b.targets.map((t) => (
            <Badge key={t.segment_index} tone="info" title={t.feel}>
              {t.segment_index + 1} {t.kind} {t.pace_min_s_per_km || t.pace_max_s_per_km ? `${fmtPace(t.pace_min_s_per_km)}–${fmtPace(t.pace_max_s_per_km)}` : ''}
            </Badge>
          ))}
        </div>
      )}
      {(b.lines || b.fallback_lines) && (
        <details>
          <summary className="link-btn" style={{ listStyle: 'none' }}>
            Everything I'll say
          </summary>
          <dl className="kv" style={{ marginTop: 12 }}>
            {Object.entries(b.switch_lines || {}).map(([i, v]) => (
              <FragmentKV key={`s${i}`} k={`switch to part ${Number(i) + 1}`} v={v} />
            ))}
            {Object.entries(b.lines || b.fallback_lines).map(([k, v]) => (
              <FragmentKV key={k} k={k.replace(/_/g, ' ')} v={Array.isArray(v) ? v.join('  ·  ') : v} />
            ))}
          </dl>
        </details>
      )}
      <p className="mono faint" style={{ margin: '14px 0 0' }}>
        {brief.model} · {fmtDateTime(brief.createdAt)}
      </p>
    </Card>
  );
}

function FragmentKV({ k, v }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}
