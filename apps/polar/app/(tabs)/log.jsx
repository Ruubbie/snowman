import { useCallback, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { View, Pressable } from 'react-native';
import { Screen, GhostWord, Text, Tabs, Metric, Tag, Badge, Icon, EmptyState, useTheme } from '@snowman/ui';
import { getClient } from '../../src/lib/client.js';
import { inferRunKind } from '../../src/lib/runKind.js';

const RANGES = ['Week', 'Month', 'Year'];
const FILTERS = ['All', 'Easy', 'Tempo', 'Long'];

function rangeStart(range) {
  const now = new Date();
  if (range === 'Week') {
    const d = new Date(now);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (range === 'Month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getFullYear(), 0, 1);
}

function totalsFor(runs, range) {
  const start = rangeStart(range);
  const inRange = runs.filter((r) => new Date(r.startedAt) >= start);
  const km = inRange.reduce((s, r) => s + (r.distanceM || 0), 0) / 1000;
  const s = inRange.reduce((s, r) => s + (r.durationS || 0), 0);
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return { km: km.toFixed(1), count: inRange.length, time: `${h}:${String(m).padStart(2, '0')}`, list: inRange };
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtDuration(s) {
  if (s == null) return '--';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
function fmtPace(sPerKm) {
  if (sPerKm == null) return '--';
  const t = Math.round(sPerKm);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export default function Log() {
  const theme = useTheme();
  const c = theme.colors;
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('Week');
  const [filter, setFilter] = useState('All');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const client = await getClient();
          const res = await client.running.runs({ limit: 200 });
          if (!cancelled) setRuns(res.runs);
        } catch (err) {
          if (!cancelled) setError(err.message || 'Failed to load runs');
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const totals = totalsFor(runs || [], range);
  const filtered = totals.list.filter((r) => filter === 'All' || inferRunKind(r).label === filter);

  return (
    <Screen contentStyle={{ flexGrow: 1 }} staggerChildren={false}>
      <GhostWord size={150} style={{ position: 'absolute', top: 10, right: -40 }}>Runs</GhostWord>
      <View style={{ padding: 24, paddingTop: 14, paddingBottom: 28 }}>
        <Text style={{ fontFamily: theme.typography.display.fontFamily, fontWeight: '800', fontSize: 36, lineHeight: 38, marginTop: 40, marginBottom: 22 }}>
          Your runs
        </Text>

        {error && <Text color={c.danger}>{error}</Text>}

        <Tabs variant="pill" items={RANGES} value={range} onChange={setRange} />

        <View style={{ flexDirection: 'row', gap: 30, marginTop: 24, marginBottom: 26 }}>
          <Metric label="Distance" value={totals.km} unit="km" size={30} />
          <Metric label="Runs" value={totals.count} size={30} />
          <Metric label="Time" value={totals.time} unit="h" size={30} />
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <Tag key={f} selected={filter === f} onPress={() => setFilter(f)}>{f}</Tag>
          ))}
        </View>

        {runs && filtered.length === 0 && <EmptyState title="No runs yet" subtitle="Finish a run and it will show up here." />}

        {filtered.map((run) => {
          const kind = inferRunKind(run);
          return (
            <Pressable
              key={run.id}
              onPress={() => router.push(`/runs/${run.id}`)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.borderHair }}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '700', fontSize: 15 }}>{fmtDate(run.startedAt)}</Text>
                  <Badge tone={kind.tone}>{kind.label}</Badge>
                </View>
                <Text variant="dataMedium" muted>
                  {fmtDuration(run.durationS)} · {fmtPace(run.avgPaceSPerKm)} /km
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={{ fontFamily: theme.typography.display.fontFamily, fontWeight: '800', fontSize: 24, fontVariant: ['tabular-nums'] }}>
                  {((run.distanceM || 0) / 1000).toFixed(1)}
                </Text>
                <Text variant="caption" muted> km</Text>
              </View>
              <Icon name="chevron-right" size={18} color={c.frost[400]} />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
