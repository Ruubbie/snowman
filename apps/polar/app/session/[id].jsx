import { useEffect, useState, useCallback } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { View } from 'react-native';
import { Screen, SplitFrame, GhostWord, Text, Card, Button, PulseDot, DashPager, useTheme } from '@snowman/ui';
import { PolarHeader } from '../../src/components/PolarHeader.jsx';
import { getClient } from '../../src/lib/client.js';
import tracker from '../../src/tracker/index.js';

function fmtMin(seconds) {
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

export default function SessionBrief() {
  const theme = useTheme();
  const c = theme.colors;
  const { id, session: sessionParam } = useLocalSearchParams();
  const [session] = useState(() => (sessionParam ? JSON.parse(sessionParam) : null));
  const [brief, setBrief] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gpsReady, setGpsReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [segIndex, setSegIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = await getClient();
        const res = await client.running.brief(id);
        if (!cancelled) setBrief(res.brief && { ...res.brief, audio: res.audio });
      } catch (err) {
        if (!cancelled) setError(err.message || 'Brief unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }
      try {
        await tracker.prepare();
        if (!cancelled) setGpsReady(true);
      } catch {
        // readiness stays false; Start still works, GPS just warms up live
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleStart = useCallback(() => {
    setStarting(true);
    router.push({
      pathname: '/run',
      params: {
        sessionId: id,
        runClientId: `${id}-${Date.now()}`,
        segments: JSON.stringify(session?.segments || []),
        brief: brief ? JSON.stringify(brief) : '',
      },
    });
  }, [id, session, brief]);

  const segments = session?.segments || [];
  const kindLabel = session?.kind === 'walk' ? 'Walk' : 'Run';

  return (
    <Screen contentStyle={{ flexGrow: 1 }} staggerChildren={false}>
      <SplitFrame panelSide="right" panelWidth="44%" panelHeight={240} style={{ minHeight: '100%' }}>
        <GhostWord size={140} style={{ position: 'absolute', top: 26, right: -24 }}>{kindLabel}</GhostWord>
        <View style={{ padding: 24, paddingTop: 14, paddingBottom: 28, gap: 20 }}>
          <PolarHeader icon="x" label="Cancel" onPress={() => router.back()} />

          <View>
            <Text variant="eyebrow" color={c.accent} style={{ marginBottom: 14 }}>Before you go</Text>
            <Text style={{ fontFamily: theme.typography.h1.fontFamily, fontWeight: '800', fontSize: 36, lineHeight: 38 }}>
              {session?.title || 'Session'}
            </Text>
          </View>

          {loading && <Text muted>Loading Olaf's brief…</Text>}
          {error && (
            <Card tone="outline">
              <Text color={c.danger}>{error}</Text>
              <Text variant="caption" muted style={{ marginTop: 8 }}>
                You can still start — Olaf's live cues will use fallback lines.
              </Text>
            </Card>
          )}

          {brief && (
            <Card tone="tint">
              <Text variant="body">{brief.opening_line}</Text>
              {brief.focus?.length ? (
                <View style={{ gap: 8, marginTop: 14 }}>
                  {brief.focus.map((f, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.accent, marginTop: 8 }} />
                      <Text variant="small" style={{ flex: 1 }}>{f}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
          )}

          {segments.length > 0 && (
            <View>
              <Text variant="eyebrow" muted style={{ marginBottom: 12 }}>Segments</Text>
              <DashPager count={segments.length} index={segIndex} onChange={setSegIndex} />
              <View style={{ marginTop: 16, gap: 1 }}>
                {segments.map((seg, i) => {
                  const target = brief?.targets?.[i];
                  return (
                    <View
                      key={i}
                      style={{
                        paddingVertical: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: c.borderHair,
                        opacity: i === segIndex ? 1 : 0.6,
                        gap: 4,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontFamily: theme.typography.h4.fontFamily, fontWeight: '600', fontSize: 14, textTransform: 'capitalize' }}>
                          {seg.kind}
                        </Text>
                        <Text variant="dataMedium" muted>{fmtMin(seg.seconds)}</Text>
                      </View>
                      {target?.pace_min_s_per_km ? (
                        <Text variant="caption" muted>
                          target {Math.floor(target.pace_min_s_per_km / 60)}:{String(target.pace_min_s_per_km % 60).padStart(2, '0')}–{Math.floor(target.pace_max_s_per_km / 60)}:{String(target.pace_max_s_per_km % 60).padStart(2, '0')} /km
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <PulseDot color={gpsReady ? c.success : c.textMuted} size={6} />
            <Text variant="caption" muted>{gpsReady ? 'GPS ready' : 'Preparing GPS…'}</Text>
          </View>

          <Button size="lg" block iconRight="arrow-right" onPress={handleStart} loading={starting}>
            Start
          </Button>
        </View>
      </SplitFrame>
    </Screen>
  );
}
