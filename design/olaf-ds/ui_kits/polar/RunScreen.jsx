const { Ring: RnRing, IconButton: RnIconButton, Metric: RnMetric, Badge: RnBadge, Dialog: RnDialog, Button: RnButton } = window.OlafDesignSystem_43c4a5;
const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
function RunScreen({ onEnd, onCancel }) {
  const [secs, setSecs] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  React.useEffect(() => { if (paused || confirm) return; const id = setInterval(() => setSecs(s => s + 1), 1000 / 12); return () => clearInterval(id); }, [paused, confirm]);
  const km = secs / 330;
  const pace = km > 0.05 ? secs / km : 0;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 24px 30px', boxSizing: 'border-box', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '38%', background: 'var(--surface-panel)' }}></div>
      <div style={{ alignSelf: 'stretch', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
        <RnIconButton icon="chevron-down" variant="plain" label="Minimise" onClick={onCancel} />
        {paused ? <RnBadge tone="warning" dot>Paused</RnBadge> : <RnBadge tone="solid">Live</RnBadge>}
        <RnIconButton icon="map" variant="plain" label="Map" />
      </div>
      <div style={{ position: 'relative', width: 280, height: 280, marginTop: 34 }}>
        <RnRing size={280} weight={10} progress={Math.min(1, km / 5)} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ font: 'var(--type-eyebrow)', letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Distance</span>
          <span style={{ font: '800 80px/1 var(--font-sans)', letterSpacing: '-.04em', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{km.toFixed(2)}</span>
          <span style={{ font: 'var(--type-data)', color: 'var(--text-muted)' }}>of 5.00 km</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignSelf: 'stretch', justifyContent: 'space-around', marginTop: 40, position: 'relative' }}>
        <RnMetric label="Time" value={fmt(secs)} size={32} align="center" />
        <RnMetric label="Pace" value={pace ? fmt(Math.round(pace)) : '–:––'} unit="/km" size={32} align="center" />
        <RnMetric label="Heart" value={secs ? 128 + (secs % 17) : '–'} unit="bpm" size={32} align="center" />
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', gap: 28, alignItems: 'center', position: 'relative' }}>
        <RnIconButton icon="square" label="End run" size={56} onClick={() => setConfirm(true)} />
        <RnIconButton icon={paused ? 'play' : 'pause'} variant={paused ? 'solid' : 'dark'} label={paused ? 'Resume' : 'Pause'} size={80} onClick={() => setPaused(p => !p)} />
        <RnIconButton icon="lock" label="Lock" size={56} />
      </div>
      <RnDialog open={confirm} inline title="End run?" onClose={() => setConfirm(false)} actions={<><RnButton size="sm" variant="outline" onClick={() => setConfirm(false)}>Keep going</RnButton><RnButton size="sm" onClick={() => onEnd({ secs, km })}>End run</RnButton></>}>{km.toFixed(2) + ' km in ' + fmt(secs) + ' will be saved.'}</RnDialog>
    </div>
  );
}
window.RunScreen = RunScreen;
