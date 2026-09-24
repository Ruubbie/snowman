const { Tabs: HsTabs, Metric: HsMetric, Badge: HsBadge, Icon: HsIcon, Tag: HsTag } = window.OlafDesignSystem_43c4a5;
const RUNS = [
  ['Mon 22 Sep', 'Tempo', 'accent', 6.2, '31:40', '5:06'],
  ['Wed 17 Sep', 'Easy', 'info', 4.1, '23:18', '5:41'],
  ['Fri 12 Sep', 'Long', 'neutral', 8.1, '44:02', '5:26'],
  ['Sun 7 Sep', 'Easy', 'info', 5.0, '28:12', '5:38'],
  ['Wed 3 Sep', 'Intervals', 'accent', 6.8, '34:55', '5:08'],
];
const TOT = { Week: ['18.4', '4', '1:39'], Month: ['61.7', '11', '5:36'], Year: ['642', '118', '59:12'] };
function HistoryScreen() {
  const [range, setRange] = React.useState('Week');
  const [filter, setFilter] = React.useState('All');
  const list = RUNS.filter(r => filter === 'All' || r[1] === filter);
  const [d, n, t] = TOT[range];
  return (
    <div style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
      <p className="ol-ghost" style={{ position: 'absolute', top: 10, right: -40, fontSize: 150 }}>Runs</p>
      <div style={{ position: 'relative', padding: '14px 24px 28px' }}>
        <h1 style={{ font: '800 36px/1.05 var(--font-sans)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-strong)', margin: '40px 0 22px' }}>Your runs</h1>
        <HsTabs variant="pill" items={['Week', 'Month', 'Year']} value={range} onChange={setRange} />
        <div style={{ display: 'flex', gap: 30, margin: '24px 0 26px' }}>
          <HsMetric label="Distance" value={d} unit="km" size={30} />
          <HsMetric label="Runs" value={n} size={30} />
          <HsMetric label="Time" value={t} unit="h" size={30} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {['All', 'Easy', 'Tempo', 'Long'].map(f => <HsTag key={f} selected={filter === f} onClick={() => setFilter(f)}>{f}</HsTag>)}
        </div>
        {list.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--border-hair)', cursor: 'pointer' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}><span style={{ font: '700 15px/1 var(--font-sans)', color: 'var(--text-strong)' }}>{r[0]}</span><HsBadge tone={r[2]}>{r[1]}</HsBadge></div>
              <span style={{ font: 'var(--type-data)', color: 'var(--text-muted)' }}>{r[4]} · {r[5]} /km</span>
            </div>
            <span style={{ font: '800 24px/1 var(--font-sans)', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{r[3].toFixed(1)}<span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}> km</span></span>
            <HsIcon name="chevron-right" size={18} color="var(--frost-400)" />
          </div>
        ))}
      </div>
    </div>
  );
}
window.HistoryScreen = HistoryScreen;
