import { useCallback, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { View } from 'react-native';
import { Screen, SplitFrame, GhostWord, Text, Card, Button, Badge, Metric, IconButton, EmptyState, useTheme } from '@snowman/ui';
import { getClient } from '../../src/lib/client.js';
import { inferRunKind } from '../../src/lib/runKind.js';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function mondayOf(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weeklyBars(runs, today) {
  const monday = mondayOf(today);
  const lastMonday = new Date(monday);
  lastMonday.setDate(lastMonday.getDate() - 7);
  const perDay = Array(7).fill(0);
  let thisWeekKm = 0;
  let lastWeekKm = 0;
  for (const run of runs || []) {
    const started = new Date(run.startedAt);
    const km = (run.distanceM || 0) / 1000;
    if (started >= monday) {
      const idx = Math.floor((started - monday) / 86400000);
      if (idx >= 0 && idx < 7) perDay[idx] += km;
      thisWeekKm += km;
    } else if (started >= lastMonday && started < monday) {
      lastWeekKm += km;
    }
  }
  return { perDay, thisWeekKm, lastWeekKm };
}

function headlineLines(session) {
  if (!session) return ['Nothing', 'planned'];
  if (session.kind === 'rest') return ['Rest day', 'take it easy'];
  const segs = session.segments || [];
  const runSegs = segs.filter((s) => s.kind === 'run');
  if (session.kind === 'walk') {
    const totalMin = Math.round(segs.reduce((s, x) => s + (x.seconds || 0), 0) / 60);
    return ['Recovery', totalMin ? `walk ${totalMin} min` : 'easy walk'];
  }
  if (runSegs.length > 1) {
    const mins = Math.round((runSegs[0].seconds || 0) / 60);
    return [`${runSegs.length} × ${mins} min`, 'run–walk'];
  }
  if (runSegs.length === 1) return [`${Math.round((runSegs[0].seconds || 0) / 60)} min`, 'easy run'];
  return ['Easy run', 'at your pace'];
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Today() {
  const theme = useTheme();
  const c = theme.colors;
  const [data, setData] = useState(null);
  const [brief, setBrief] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [week, setWeek] = useState({ perDay: Array(7).fill(0), thisWeekKm: 0, lastWeekKm: 0 });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = await getClient();
      const res = await client.running.today();
      setData(res);

      const session = res.session;
      if (session?.id && (session.kind === 'run' || session.kind === 'walk')) {
        client.running
          .brief(session.id)
          .then((b) => setBrief(b.brief && { ...b.brief, audio: b.audio }))
          .catch(() => {});
      }

      const runsRes = await client.running.runs({ limit: 30 });
      setLastRun(runsRes.runs?.[0] || null);
      setWeek(weeklyBars(runsRes.runs, new Date()));
    } catch (err) {
      setError(err.message || 'Failed to load today');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const session = data?.session;
  const [strongLine, lightLine] = headlineLines(session);
  const weekday = WEEKDAY_NAMES[new Date().getDay()];
  const eyebrow = session?.programWeek ? `${weekday} · Week ${session.programWeek}` : weekday;
  const canStart = session?.id && (session.kind === 'run' || session.kind === 'walk') && session.status !== 'done';
  const goToSession = canStart
    ? () =>
        router.push({
          pathname: '/run',
          params: { sessionId: session.id, runClientId: `${session.id}-${Date.now()}`, segments: JSON.stringify(session.segments || []) },
        })
    : undefined;

  const olafNote = brief?.focus?.[0] || (session?.kind === 'rest' ? "Take the day. I'll have tomorrow ready." : "I'll keep an eye on your pace today.");
  const kind = inferRunKind(lastRun);
  const ghostWord = session?.kind === 'walk' ? 'Walk' : session?.kind === 'rest' ? 'Rest' : 'Run';

  return (
    <Screen scroll contentStyle={{ flexGrow: 1 }} staggerChildren={false}>
      <SplitFrame panelSide="right" panelWidth="46%" panelHeight={330} style={{ minHeight: '100%' }}>
        <GhostWord size={150} style={{ position: 'absolute', top: 40, right: -30 }}>
          {ghostWord}
        </GhostWord>
        <View style={{ padding: 24, paddingTop: 14, paddingBottom: 28 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontFamily: theme.typography.h1.fontFamily, fontWeight: '800', fontSize: 22, letterSpacing: -0.03 * 22 }}>polar</Text>
            <IconButton icon="settings" variant="plain" label="Settings" iconSize={22} onPress={() => router.push('/settings')} />
          </View>

          {loading && !data ? (
            <Text muted style={{ marginTop: 44 }}>Loading…</Text>
          ) : error ? (
            <Card tone="outline" style={{ marginTop: 30 }}>
              <Text color={c.danger}>{error}</Text>
              <Button variant="secondary" onPress={load} style={{ marginTop: 12 }}>Retry</Button>
            </Card>
          ) : (
            <>
              <Text variant="eyebrow" color={c.accent} style={{ marginTop: 44, marginBottom: 14 }}>
                {eyebrow}
              </Text>
              <Text style={{ fontFamily: theme.typography.h1.fontFamily, fontWeight: '800', fontSize: 44, lineHeight: 46, letterSpacing: -0.025 * 44 }}>
                {strongLine}
                {'\n'}
                {lightLine}
              </Text>
              <Text variant="small" muted style={{ marginTop: 16, marginBottom: 26, maxWidth: 260 }}>
                {brief?.opening_line || session?.summary || "Nothing scheduled — check back tomorrow, or open Settings to set your program start."}
              </Text>

              {canStart && (
                <Button size="lg" block iconRight="arrow-right" onPress={goToSession}>
                  {session?.kind === 'walk' ? 'Start walk' : 'Start run'}
                </Button>
              )}

              <View style={{ marginTop: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Metric
                  label="This week"
                  value={week.thisWeekKm.toFixed(1)}
                  unit="km"
                  delta={`${week.thisWeekKm - week.lastWeekKm >= 0 ? '+' : ''}${(week.thisWeekKm - week.lastWeekKm).toFixed(1)} km vs last`}
                  deltaTone={week.thisWeekKm >= week.lastWeekKm ? 'up' : 'down'}
                  size={40}
                />
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', height: 64 }}>
                  {week.perDay.map((v, i) => {
                    const isToday = i === (new Date().getDay() + 6) % 7;
                    return (
                      <View key={i} style={{ alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: Math.max(2, v * 6), backgroundColor: isToday ? c.accent : v ? c.ink[800] : c.snow[300] }} />
                        <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '700', fontSize: 10 }} color={isToday ? c.accent : c.textFaint}>
                          {DAY_LABELS[i]}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <Card tone="tint" padding={20} style={{ marginTop: 26, flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                <Text style={{ fontFamily: theme.typography.display.fontFamily, fontWeight: '800', fontSize: 12, lineHeight: 17 }}>olaf</Text>
                <Text variant="small" style={{ flex: 1 }}>{olafNote}</Text>
              </Card>

              {lastRun ? (
                <>
                  <View style={{ marginTop: 26, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="h3">Last run</Text>
                    <Badge tone={kind.tone}>{kind.label}</Badge>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 28, marginTop: 14 }}>
                    <Metric label="Distance" value={(lastRun.distanceM / 1000).toFixed(1)} unit="km" size={24} />
                    <Metric label="Time" value={formatDuration(lastRun.durationS)} size={24} />
                    <Metric label="Pace" value={formatPaceValue(lastRun.avgPaceSPerKm)} unit="/km" size={24} />
                  </View>
                </>
              ) : (
                <EmptyState title="No runs yet" subtitle="Finish your first run and it will show up here." />
              )}
            </>
          )}
        </View>
      </SplitFrame>
    </Screen>
  );
}

function formatDuration(totalS) {
  if (totalS == null) return '--';
  const s = Math.round(totalS);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatPaceValue(sPerKm) {
  if (sPerKm == null) return '--';
  const total = Math.round(sPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
