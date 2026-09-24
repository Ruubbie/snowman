import { useEffect, useRef, useState, useCallback } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Screen, Ring, IconButton, Metric, Badge, Dialog, Button, Toast, DashPager, Text, useTheme } from '@snowman/ui';
import tracker from '../../src/tracker/index.js';
import { tokenStore } from '../../src/lib/tokenStore.js';
import { getClient } from '../../src/lib/client.js';
import { setPendingRun } from '../../src/lib/pendingRun.js';
import { formatDistance, formatPace } from '../../src/lib/format.js';

function fmt(s) {
  const v = Math.max(0, Math.round(s));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

function gpsLabel(accuracy) {
  if (accuracy == null || accuracy < 0) return 'Finding GPS…';
  return accuracy <= 20 ? `GPS ready · ±${Math.round(accuracy)} m` : `Weak GPS · ±${Math.round(accuracy)} m`;
}

export default function Run() {
  const theme = useTheme();
  const c = theme.colors;
  const params = useLocalSearchParams();
  const sessionId = params.sessionId || null;
  const runClientId = params.runClientId;
  const segments = JSON.parse(params.segments || '[]');
  const isInterval = segments.filter((s) => s.kind === 'run').length > 1;

  const [brief, setBrief] = useState(() => (params.brief ? JSON.parse(params.brief) : null));
  const [snapshot, setSnapshot] = useState({ elapsed_s: 0, distance_m: 0, pace_30s: null, cadence_spm: null, segment: { index: 0 } });
  // 'ready' until the user taps Start: GPS warms up and Olaf's brief loads, nothing is recorded yet.
  const [runState, setRunState] = useState('ready');
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [clips, setClips] = useState(null); // {ready, total}: Olaf's pre-made lines downloading
  const isReady = runState === 'ready';
  const [lastCue, setLastCue] = useState(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [locked, setLocked] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // Blocking problem that makes real tracking impossible (never fall back to fake data).
  const [trackerError, setTrackerError] = useState(tracker.unavailableReason);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let tickSub, cueSub, stateSub, gpsSub, clipsSub;
    (async () => {
      const baseUrl = (await tokenStore.getServerUrl()) || 'http://127.0.0.1:4000';
      const token = await tokenStore.getToken();
      const client = await getClient();
      tracker.configure({
        baseUrl,
        token,
        cueClient: { postCue: (body) => client.running.cue(body) },
      });
      if (brief) tracker.prefetch(brief); // the effect below ran before the tracker knew the server

      tickSub = tracker.addListener('tick', setSnapshot);
      cueSub = tracker.addListener('cue', (cue) => {
        setLastCue(cue);
        setToastVisible(true);
      });
      stateSub = tracker.addListener('state', (s) => {
        if (s.error === 'location_denied') {
          setTrackerError('Polar has no location access. Open Settings › Polar › Location and choose "Always", then try again.');
        }
        setRunState(s.state);
      });
      gpsSub = tracker.addListener('gps', (g) => setGpsAccuracy(g.accuracy_m));
      clipsSub = tracker.addListener('clips', setClips);

      if (sessionId && !brief) {
        client.running
          .brief(sessionId)
          .then((res) => {
            setBrief(res.brief && { ...res.brief, audio: res.audio });
            if (res.brief?.focus?.[0]) {
              setLastCue({ text: res.brief.focus[0], trigger: 'brief', source: 'brief' });
              setToastVisible(true);
            }
          })
          .catch(() => {});
      }

      await tracker.prepare();
    })();

    return () => {
      tickSub?.remove();
      cueSub?.remove();
      stateSub?.remove();
      gpsSub?.remove();
      clipsSub?.remove();
      if (!runStartedRef.current) tracker.cancel();
    };
  }, []);

  useEffect(() => {
    if (brief) tracker.prefetch(brief);
  }, [brief]);

  const runStartedRef = useRef(false);
  const startRun = useCallback(async () => {
    if (!isReady || trackerError) return;
    runStartedRef.current = true;
    setRunState('running');
    try {
      await tracker.start({ sessionId, runClientId, segments, brief });
    } catch (err) {
      runStartedRef.current = false;
      setRunState('ready');
      setTrackerError(err?.message || 'The run could not start.');
    }
  }, [isReady, trackerError, sessionId, runClientId, segments, brief]);

  const handlePauseResume = useCallback(() => {
    if (locked) return;
    if (runState === 'paused') tracker.resume();
    else tracker.pause();
  }, [runState, locked]);

  const requestEnd = useCallback(() => {
    if (locked) return;
    setConfirmEnd(true);
  }, [locked]);

  const confirmEndRun = useCallback(async () => {
    setConfirmEnd(false);
    const result = await tracker.finish();
    setPendingRun(result);
    router.replace({ pathname: '/run/summary', params: { runClientId } });
  }, [runClientId]);

  const segIndex = snapshot.segment?.index ?? 0;
  const seg = segments[segIndex] || segments[0] || { kind: 'run', seconds: 0 };
  const nextSeg = segments[segIndex + 1];
  const remainingS = snapshot.segment?.remaining_s ?? seg.seconds;
  const segElapsed = Math.max(0, seg.seconds - remainingS);
  const segProgress = seg.seconds > 0 ? Math.max(0, Math.min(1, segElapsed / seg.seconds)) : 0;
  const km = (snapshot.distance_m || 0) / 1000;

  return (
    <Screen scroll={false} staggerChildren={false} contentStyle={{ flex: 1 }}>
      <View style={{ flex: 1, position: 'relative' }}>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%', backgroundColor: c.surfacePanel }} />

        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 10, paddingBottom: 30 }}>
          <View style={{ alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <IconButton icon={isReady ? 'x' : 'chevron-down'} variant="plain" label={isReady ? 'Cancel' : 'Minimise'} onPress={() => router.back()} disabled={locked} />
            {tracker.isSimulator ? (
              <Badge tone="warning">Simulated</Badge>
            ) : isReady ? (
              <Badge tone="neutral">Ready</Badge>
            ) : runState === 'paused' ? (
              <Badge tone="warning" dot>Paused</Badge>
            ) : (
              <Badge tone="solid">Live</Badge>
            )}
            <IconButton icon="map" variant="plain" label="Map" disabled={locked} />
          </View>

          <View style={{ width: 280, height: 280, marginTop: 34 }}>
            <Ring size={280} weight={10} progress={isInterval ? segProgress : Math.min(1, km / 5)}>
              {isInterval ? (
                <>
                  <Text variant="eyebrow" muted>
                    {seg.kind === 'walk' ? 'Walk' : `Run ${segments.slice(0, segIndex + 1).filter((s) => s.kind === 'run').length} of ${segments.filter((s) => s.kind === 'run').length}`}
                  </Text>
                  <Text style={{ fontFamily: theme.typography.display.fontFamily, fontWeight: '800', fontSize: 80, lineHeight: 80, letterSpacing: -0.04 * 80, fontVariant: ['tabular-nums'] }}>
                    {fmt(remainingS)}
                  </Text>
                  {isReady ? (
                    <Text variant="dataMedium" muted>{gpsLabel(gpsAccuracy)}</Text>
                  ) : nextSeg ? (
                    <Text variant="dataMedium" muted>then {nextSeg.kind} {fmt(nextSeg.seconds)}</Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text variant="eyebrow" muted>Distance</Text>
                  <Text style={{ fontFamily: theme.typography.display.fontFamily, fontWeight: '800', fontSize: 80, lineHeight: 80, letterSpacing: -0.04 * 80, fontVariant: ['tabular-nums'] }}>
                    {km.toFixed(2)}
                  </Text>
                  <Text variant="dataMedium" muted>{isReady ? gpsLabel(gpsAccuracy) : `${fmt(snapshot.elapsed_s)} elapsed`}</Text>
                </>
              )}
            </Ring>
          </View>

          {isInterval && (
            <View style={{ marginTop: 20 }}>
              <DashPager count={segments.length} index={segIndex} />
            </View>
          )}

          <View style={{ flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-around', marginTop: 32 }}>
            <Metric label="Time" value={fmt(snapshot.elapsed_s)} align="center" size={32} />
            <Metric label="Pace" value={snapshot.pace_30s ? formatPace(snapshot.pace_30s).replace('/km', '') : '–:––'} unit="/km" align="center" size={32} />
            <Metric label="Cadence" value={snapshot.cadence_spm ? Math.round(snapshot.cadence_spm) : '–'} unit="spm" align="center" size={32} />
          </View>

          {isReady && trackerError ? (
            <View style={{ marginTop: 'auto', alignSelf: 'stretch', gap: 8, padding: 16, borderLeftWidth: 3, borderLeftColor: c.danger || c.accent, backgroundColor: c.surface }}>
              <Text variant="eyebrow" style={{ color: c.danger || c.accent }}>Can't track this run</Text>
              <Text variant="body">{trackerError}</Text>
            </View>
          ) : isReady ? (
            <View style={{ marginTop: 'auto', alignItems: 'center', gap: 14 }}>
              <IconButton icon="play" variant="solid" label="Start" size={80} iconSize={30} onPress={startRun} />
              <Text variant="eyebrow" muted>Tap to start</Text>
              {clips?.total > 0 && (
                <Text variant="dataMedium" muted>
                  {clips.ready < clips.total
                    ? `Olaf is recording your lines · ${clips.ready} of ${clips.total}`
                    : "Olaf's voice is ready"}
                </Text>
              )}
            </View>
          ) : (
          <View style={{ marginTop: 'auto', flexDirection: 'row', gap: 28, alignItems: 'center' }}>
            <IconButton icon="square" label="End run" size={56} onPress={requestEnd} disabled={locked} />
            <IconButton
              icon={runState === 'paused' ? 'play' : 'pause'}
              variant={runState === 'paused' ? 'solid' : 'dark'}
              label={runState === 'paused' ? 'Resume' : 'Pause'}
              size={80}
              onPress={handlePauseResume}
              disabled={locked}
            />
            <IconButton icon="lock" variant={locked ? 'solid' : 'plain'} label={locked ? 'Unlock' : 'Lock'} size={56} onPress={() => setLocked((l) => !l)} />
          </View>
          )}
        </View>

        {lastCue && (
          <View style={{ position: 'absolute', left: 24, right: 24, bottom: 200, alignItems: 'center' }}>
            <Toast visible={toastVisible} tone="accent" title="olaf" onHide={() => setToastVisible(false)}>
              {lastCue.text}
            </Toast>
          </View>
        )}
      </View>

      <Dialog
        open={confirmEnd}
        inline
        title="End run?"
        onClose={() => setConfirmEnd(false)}
        actions={
          <>
            <Button size="sm" variant="outline" onPress={() => setConfirmEnd(false)}>Keep going</Button>
            <Button size="sm" onPress={confirmEndRun}>End run</Button>
          </>
        }
      >
        <Text variant="body" muted>
          {formatDistance(snapshot.distance_m)} in {fmt(snapshot.elapsed_s)} will be saved.
        </Text>
      </Dialog>
    </Screen>
  );
}
