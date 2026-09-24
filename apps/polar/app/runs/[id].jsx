import { useEffect, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { View } from 'react-native';
import { Screen, SplitFrame, Text, Metric, Tabs, Card, RouteMap, Badge, EmptyState, useTheme } from '@snowman/ui';
import { PolarHeader } from '../../src/components/PolarHeader.jsx';
import { getClient } from '../../src/lib/client.js';
import { formatPace } from '../../src/lib/format.js';
import { inferRunKind } from '../../src/lib/runKind.js';

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

export default function RunDetail() {
  const theme = useTheme();
  const c = theme.colors;
  const { id } = useLocalSearchParams();
  const [run, setRun] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [samples, setSamples] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('Splits');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = await getClient();
        const [runRes, analysisRes, samplesRes] = await Promise.all([
          client.running.run(id),
          client.running.analysis(id),
          client.running.samples(id, { every: 3 }),
        ]);
        if (cancelled) return;
        setRun(runRes);
        setAnalysis(analysisRes);
        setSamples(samplesRes.samples);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load run');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const points = (samples || []).filter((s) => s.lat != null && s.lon != null).map((s) => ({ lat: s.lat, lon: s.lon }));
  const paceValues = (analysis?.paceSeries || []).map((p) => p.paceSPerKm).filter((v) => v != null);
  const fastestPace = paceValues.length ? Math.min(...paceValues) : null;
  const km = run ? (run.distanceM || 0) / 1000 : 0;
  const kind = inferRunKind(run);

  return (
    <Screen contentStyle={{ flexGrow: 1 }} staggerChildren={false}>
      <SplitFrame panelSide="left" panelWidth="58%" panelHeight={260} style={{ minHeight: '100%' }}>
        <View style={{ padding: 24, paddingTop: 14, paddingBottom: 28, gap: 4 }}>
          <PolarHeader icon="x" label="Close" onPress={() => router.back()} />

          {error && <Text color={c.danger} style={{ marginTop: 20 }}>{error}</Text>}

          {run && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 26, marginBottom: 14 }}>
                <Text variant="eyebrow" color={c.accent}>{eyebrowFor(run)}</Text>
                <Badge tone={kind.tone}>{kind.label}</Badge>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={{ fontFamily: theme.typography.display.fontFamily, fontWeight: '800', fontSize: 88, lineHeight: 88, letterSpacing: -0.04 * 88, fontVariant: ['tabular-nums'] }}>
                  {km.toFixed(2)}
                </Text>
                <Text variant="h4" muted> km</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 30, marginVertical: 30 }}>
                <Metric label="Time" value={sfmt(run.durationS)} size={26} />
                <Metric label="Avg pace" value={formatPace(run.avgPaceSPerKm).replace('/km', '')} unit="/km" size={26} />
                <Metric label="Avg cadence" value={run.avgCadenceSpm ? Math.round(run.avgCadenceSpm) : '--'} unit="spm" size={26} />
              </View>

              <Tabs items={['Splits', 'Pace', 'Map']} value={tab} onChange={setTab} />

              {tab === 'Splits' && (
                <View style={{ gap: 12, marginTop: 20 }}>
                  {!analysis?.splits?.length ? (
                    <Text variant="small" muted>No km splits recorded.</Text>
                  ) : (
                    analysis.splits.map((s, i) => {
                      const vals = analysis.splits.map((x) => x.paceSPerKm);
                      const max = Math.max(...vals);
                      const isFastest = s.paceSPerKm === Math.min(...vals);
                      return (
                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <Text variant="dataMedium" muted style={{ width: 20 }}>{i + 1}</Text>
                          <View style={{ flex: 1, height: 6, backgroundColor: c.snow[200] }}>
                            <View style={{ height: '100%', width: `${(s.paceSPerKm / max) * 100}%`, backgroundColor: isFastest ? c.accent : c.ink[800] }} />
                          </View>
                          <Text variant="dataMedium" style={{ width: 52, textAlign: 'right' }}>{sfmt(s.paceSPerKm)}</Text>
                        </View>
                      );
                    })
                  )}
                </View>
              )}

              {tab === 'Pace' && (
                <View style={{ flexDirection: 'row', gap: 3, alignItems: 'flex-end', height: 120, marginTop: 20 }}>
                  {paceValues.length === 0 ? (
                    <Text variant="small" muted>No pace samples recorded.</Text>
                  ) : (
                    paceValues
                      .filter((_, i) => i % Math.max(1, Math.floor(paceValues.length / 40)) === 0)
                      .map((p, i) => {
                        const maxP = Math.max(...paceValues);
                        const minP = Math.min(...paceValues);
                        const heightPct = 100 - ((p - minP) / (maxP - minP || 1)) * 80;
                        return <View key={i} style={{ flex: 1, height: `${heightPct}%`, backgroundColor: p === fastestPace ? c.accent : c.ice[300] }} />;
                      })
                  )}
                </View>
              )}

              {tab === 'Map' && (
                <View style={{ marginTop: 20 }}>
                  {points.length > 0 ? (
                    <RouteMap points={points} height={150} />
                  ) : (
                    <Card tone="tint" padding={20}>
                      <EmptyState title="No route recorded" subtitle="This run has no GPS samples (likely an imported run)." />
                    </Card>
                  )}
                </View>
              )}

              {analysis?.segmentStats?.length > 0 && (
                <View style={{ marginTop: 26 }}>
                  <Text variant="eyebrow" muted style={{ marginBottom: 12 }}>Segments vs target</Text>
                  <View style={{ gap: 1 }}>
                    {analysis.segmentStats.map((s) => (
                      <View key={s.segmentIndex} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderHair }}>
                        <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '600', fontSize: 14, textTransform: 'capitalize' }}>
                          {s.kind || `segment ${s.segmentIndex + 1}`}
                        </Text>
                        <Text variant="dataMedium" muted>
                          {formatPace(s.avgPaceSPerKm)}{s.timeInTargetPct != null ? ` · ${s.timeInTargetPct}% in target` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </SplitFrame>
    </Screen>
  );
}
