import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Screen, SplitFrame, Text, Metric, Tabs, Card, Toast, Tag, Input, Button, RouteMap, EmptyState, useTheme } from '@snowman/ui';
import { getClient } from '../../src/lib/client.js';
import { getPendingRun, clearPendingRun } from '../../src/lib/pendingRun.js';
import { getSyncQueue } from '../../src/sync/index.js';
import { formatDistance, formatDuration } from '../../src/lib/format.js';

function sfmt(s) {
  if (s == null) return '--';
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

function eyebrowFor(run) {
  if (!run?.startedAt) return 'Run';
  const d = new Date(run.startedAt);
  const hour = d.getHours();
  const label = hour < 12 ? 'Morning run' : hour < 18 ? 'Afternoon run' : 'Evening run';
  const time = `${String(hour).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${label} · ${time}`;
}

function computeSplits(samples) {
  const accepted = (samples || []).filter((s) => s.dist_m != null).sort((a, b) => a.t_s - b.t_s);
  const splits = [];
  let kmIndex = 1;
  let segStart = 0;
  for (let i = 0; i < accepted.length; i++) {
    if (accepted[i].dist_m >= kmIndex * 1000) {
      splits.push(accepted[i].t_s - accepted[segStart].t_s);
      kmIndex++;
      segStart = i;
    }
  }
  return splits;
}

export default function RunSummary() {
  const theme = useTheme();
  const c = theme.colors;
  const [effort, setEffort] = useState(5);
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState('form'); // form | uploading | queued | debriefing | done
  const [debrief, setDebrief] = useState(null);
  const [tab, setTab] = useState('Splits');
  // Snapshot once at mount: clearPendingRun() (called right after a
  // successful upload) would otherwise null this out from under a later
  // re-render (phase change) and blank the numbers already on screen.
  const [pending] = useState(() => getPendingRun());

  async function handleSubmit() {
    if (!pending?.run) {
      router.replace('/(tabs)/today');
      return;
    }
    const run = { ...pending.run, effort, note: note || null };
    setPhase('uploading');
    try {
      const client = await getClient();
      const res = await client.running.uploadRun({ run, samples: pending.samples, events: pending.events });
      clearPendingRun();
      setPhase('debriefing');
      try {
        const d = await client.running.debrief(res.id);
        setDebrief(d.text);
      } catch {
        // Olaf may be unavailable/still working async server-side - fine to skip
      }
      setPhase('done');
    } catch {
      const queue = await getSyncQueue();
      await queue.enqueue({ run, samples: pending.samples, events: pending.events });
      clearPendingRun();
      setPhase('queued');
    }
  }

  if (!pending?.run && phase === 'form') {
    return (
      <Screen>
        <Text>No run to summarize.</Text>
        <Button onPress={() => router.replace('/(tabs)/today')}>Back to Today</Button>
      </Screen>
    );
  }

  const run = pending?.run || {};
  const km = Math.max((run.distanceM || 0) / 1000, 0.01);
  const samples = pending?.samples || [];
  const splits = computeSplits(samples);
  const paceValues = samples.map((s) => s.pace_s_per_km).filter((v) => v != null);
  const fastestPace = paceValues.length ? Math.min(...paceValues) : null;
  const points = samples.filter((s) => s.lat != null && s.lon != null).map((s) => ({ lat: s.lat, lon: s.lon }));
  const avgCadence = samples.length ? Math.round(samples.reduce((s, x) => s + (x.cadence_spm || 0), 0) / samples.length) : null;
  const showToast = phase === 'debriefing' || phase === 'done';

  return (
    <Screen contentStyle={{ flexGrow: 1 }} staggerChildren={false}>
      <SplitFrame panelSide="left" panelWidth="58%" panelHeight={260} style={{ minHeight: '100%' }}>
        <View style={{ padding: 24, paddingTop: 14, paddingBottom: 28 }}>
          <Text variant="eyebrow" color={c.accent} style={{ marginTop: 26, marginBottom: 14 }}>
            {eyebrowFor(run)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ fontFamily: theme.typography.display.fontFamily, fontWeight: '800', fontSize: 88, lineHeight: 88, letterSpacing: -0.04 * 88, fontVariant: ['tabular-nums'] }}>
              {km.toFixed(2)}
            </Text>
            <Text variant="h4" muted> km</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 30, marginVertical: 30 }}>
            <Metric label="Time" value={sfmt(run.durationS)} size={26} />
            <Metric label="Avg pace" value={sfmt(run.durationS != null ? run.durationS / km : null)} unit="/km" size={26} />
            <Metric label="Avg cadence" value={avgCadence || '--'} unit="spm" size={26} />
          </View>

          <Tabs items={['Splits', 'Pace', 'Map']} value={tab} onChange={setTab} />

          {tab === 'Splits' && (
            <View style={{ gap: 12, marginTop: 20 }}>
              {splits.length === 0 ? (
                <Text variant="small" muted>No km splits yet.</Text>
              ) : (
                splits.map((s, i) => {
                  const max = Math.max(...splits);
                  const isFastest = s === Math.min(...splits);
                  return (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Text variant="dataMedium" muted style={{ width: 20 }}>{i + 1}</Text>
                      <View style={{ flex: 1, height: 6, backgroundColor: c.snow[200] }}>
                        <View style={{ height: '100%', width: `${(s / max) * 100}%`, backgroundColor: isFastest ? c.accent : c.ink[800] }} />
                      </View>
                      <Text variant="dataMedium" style={{ width: 52, textAlign: 'right' }}>{sfmt(s)}</Text>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {tab === 'Pace' && (
            <View style={{ flexDirection: 'row', gap: 3, alignItems: 'flex-end', height: 120, marginTop: 20 }}>
              {paceValues.length === 0 ? (
                <Text variant="small" muted>No pace samples yet.</Text>
              ) : (
                paceValues
                  .filter((_, i) => i % Math.max(1, Math.floor(paceValues.length / 40)) === 0)
                  .map((p, i) => {
                    const maxP = Math.max(...paceValues);
                    const minP = Math.min(...paceValues);
                    const heightPct = 100 - ((p - minP) / (maxP - minP || 1)) * 80;
                    return (
                      <View key={i} style={{ flex: 1, height: `${heightPct}%`, backgroundColor: p === fastestPace ? c.accent : c.ice[300] }} />
                    );
                  })
              )}
            </View>
          )}

          {tab === 'Map' && (
            <View style={{ marginTop: 20 }}>
              {points.length > 0 ? <RouteMap points={points} height={150} /> : (
                <Card tone="tint" padding={20}>
                  <Text variant="small" muted style={{ textAlign: 'center' }}>No route recorded</Text>
                </Card>
              )}
            </View>
          )}

          {phase === 'form' && (
            <View style={{ marginTop: 28, gap: 16 }}>
              <View>
                <Text variant="eyebrow" muted style={{ marginBottom: 10 }}>Effort (1–10)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <Tag key={n} selected={effort === n} onPress={() => setEffort(n)}>{n}</Tag>
                  ))}
                </View>
              </View>
              <Input label="Note" value={note} onChangeText={setNote} multiline placeholder="How did it feel?" />
              <Button block size="lg" onPress={handleSubmit}>Save run</Button>
            </View>
          )}

          {phase === 'uploading' && <Text muted style={{ marginTop: 20 }}>Uploading…</Text>}

          {phase === 'queued' && (
            <Card tone="outline" style={{ marginTop: 20 }}>
              <Text variant="small">Saved offline — will upload automatically once you're back online.</Text>
            </Card>
          )}

          {showToast && (
            <Toast visible tone="success" title="Run saved" style={{ marginTop: 26 }}>
              {debrief || (phase === 'debriefing' ? 'Olaf is looking at your run.' : "Nice work — I'll have more thoughts next time.")}
            </Toast>
          )}

          {(phase === 'done' || phase === 'queued') && (
            <Button block size="lg" variant="secondary" onPress={() => router.replace('/(tabs)/today')} style={{ marginTop: 20 }}>
              Done
            </Button>
          )}
        </View>
      </SplitFrame>
    </Screen>
  );
}
