const { Tabs: SmTabs, Metric: SmMetric, Button: SmButton, Card: SmCard, Toast: SmToast } = window.OlafDesignSystem_43c4a5;
const sfmt = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
function SummaryScreen({ run, onDone }) {
  const [tab, setTab] = React.useState('Splits');
  const km = Math.max(run.km, 0.01), pace = run.secs / km;
  const splits = Array.from({ length: Math.max(1, Math.ceil(km)) }, (_, i) => pace + [8, -4, 3, -9, 2, -6][i % 6]);
  const max = Math.max(...splits);
  return (
    <div style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '58%', height: 260, background: 'var(--surface-panel)' }}></div>
      <div style={{ position: 'relative', padding: '14px 24px 28px' }}>
        <div style={{ font: 'var(--type-eyebrow)', letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--accent)', margin: '26px 0 14px' }}>Morning run · 08:15</div>
        <div style={{ font: '800 88px/1 var(--font-sans)', letterSpacing: '-.04em', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{km.toFixed(2)}<span style={{ fontSize: 22, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 0 }}> km</span></div>
        <div style={{ display: 'flex', gap: 30, margin: '30px 0 30px' }}>
          <SmMetric label="Time" value={sfmt(run.secs)} size={26} />
          <SmMetric label="Avg pace" value={sfmt(pace)} unit="/km" size={26} />
          <SmMetric label="Avg HR" value="136" unit="bpm" size={26} />
        </div>
        <SmTabs items={['Splits', 'Heart rate', 'Map']} value={tab} onChange={setTab} />
        {tab === 'Splits' && <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
          {splits.map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 52px', alignItems: 'center', gap: 12 }}>
              <span style={{ font: 'var(--type-data)', color: 'var(--text-muted)' }}>{i + 1}</span>
              <div style={{ height: 6, background: 'var(--snow-200)' }}><div style={{ height: '100%', width: (p / max) * 100 + '%', background: p === Math.min(...splits) ? 'var(--accent)' : 'var(--ink-800)' }}></div></div>
              <span style={{ font: 'var(--type-data)', color: 'var(--text-strong)', textAlign: 'right' }}>{sfmt(p)}</span>
            </div>
          ))}
        </div>}
        {tab === 'Heart rate' && <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 120, marginTop: 20 }}>{Array.from({ length: 40 }, (_, i) => <div key={i} style={{ flex: 1, height: 40 + Math.sin(i / 4) * 22 + (i % 5) * 6 + '%', background: i > 28 ? 'var(--accent)' : 'var(--ice-300)' }}></div>)}</div>}
        {tab === 'Map' && <SmCard tone="tint" padding={20} style={{ marginTop: 20, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', font: 'var(--type-small)', color: 'var(--text-muted)' }}>Route map placeholder</SmCard>}
        <SmToast tone="success" title="Run saved" style={{ marginTop: 26, width: 'auto', boxShadow: 'var(--shadow-soft)' }}>Olaf is warming the bathroom to 22°.</SmToast>
        <div style={{ marginTop: 20 }}><SmButton block size="lg" variant="secondary" onClick={onDone}>Done</SmButton></div>
      </div>
    </div>
  );
}
window.SummaryScreen = SummaryScreen;
