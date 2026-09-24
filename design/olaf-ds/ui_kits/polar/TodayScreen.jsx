const { Button: TdButton, Metric: TdMetric, Card: TdCard, IconButton: TdIconButton, Badge: TdBadge, Ring: TdRing } = window.OlafDesignSystem_43c4a5;
const WEEK = [['M', 6.2], ['T', 0], ['W', 4.1], ['T', 0], ['F', 8.1], ['S', 0], ['S', 0]];
function TodayScreen({ go }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: '46%', height: 330, background: 'var(--surface-panel)' }}></div>
      <p className="ol-ghost" style={{ position: 'absolute', top: 40, right: -30, fontSize: 150 }}>Run</p>
      <div style={{ position: 'relative', padding: '14px 24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ font: '800 22px/1 var(--font-sans)', letterSpacing: '-.03em', color: 'var(--text-strong)' }}>polar</span>
          <TdIconButton icon="bell" variant="plain" label="Notifications" iconSize={22} />
        </div>
        <div style={{ font: 'var(--type-eyebrow)', letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--accent)', margin: '44px 0 14px' }}>Thursday · Week 38</div>
        <h1 style={{ font: '800 44px/1.04 var(--font-sans)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-strong)', margin: 0 }}>Easy 5 km<br />at 08:15</h1>
        <TdRing size={64} weight={9} style={{ position: 'absolute', right: 80, top: 150 }} />
        <p style={{ font: 'var(--type-small)', color: 'var(--text-muted)', margin: '16px 0 26px', maxWidth: 260 }}>Relaxed pace, around 5:40 /km. Snow starts after four, so the river loop is clear this morning.</p>
        <TdButton size="lg" block iconRight="arrow-right" onClick={() => go('run')}>Start run</TdButton>
        <div style={{ marginTop: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <TdMetric label="This week" value="18.4" unit="km" delta="+3.2 km vs last" deltaTone="up" size={40} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 64 }}>
            {WEEK.map(([d, v], i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: Math.max(2, v * 6), background: i === 3 ? 'var(--accent)' : v ? 'var(--ink-800)' : 'var(--snow-300)' }}></div>
                <span style={{ font: '700 10px/1 var(--font-sans)', color: i === 3 ? 'var(--accent)' : 'var(--text-faint)' }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
        <TdCard tone="tint" padding={20} style={{ marginTop: 26, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ font: '800 12px/1.4 var(--font-sans)', color: 'var(--text-strong)' }}>olaf</span>
          <p style={{ font: 'var(--type-small)', color: 'var(--text-body)', margin: 0 }}>I'll warm the bathroom to 22° for when you get back, around 08:50.</p>
        </TdCard>
        <div style={{ marginTop: 26, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ font: 'var(--type-h3)', color: 'var(--text-strong)' }}>Last run</span>
          <TdBadge tone="info">Easy</TdBadge>
        </div>
        <div style={{ display: 'flex', gap: 28, marginTop: 14 }}>
          <TdMetric label="Distance" value="8.1" unit="km" size={24} />
          <TdMetric label="Time" value="44:02" size={24} />
          <TdMetric label="Pace" value="5:26" unit="/km" size={24} />
        </div>
      </div>
    </div>
  );
}
window.TodayScreen = TodayScreen;
