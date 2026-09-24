// Route drawn as SVG (no map lib): an equirectangular projection fitted to
// the box, coloured by speed (5 buckets, ice -> ink), revealed by an animated
// mask draw. The carrot dot is the scrub position.
import { useId, useMemo } from 'react';

const W = 800;

/**
 * @param {{points: {lat:number, lon:number, bucket:number, distM?:number}[], height?: number, scrubIndex?: number|null, onPick?: (i:number)=>void}} props
 */
export function RouteMap({ points, height = 420, scrubIndex = null, onPick }) {
  const maskId = useId().replace(/:/g, '');
  const model = useMemo(() => {
    if (!points || points.length < 2) return null;
    const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const xs = points.map((p) => p.lon * k);
    const ys = points.map((p) => -p.lat);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const H = height;
    const pad = 36;
    const scale = Math.min((W - pad * 2) / (maxX - minX || 1e-9), (H - pad * 2) / (maxY - minY || 1e-9));
    const offX = (W - (maxX - minX) * scale) / 2;
    const offY = (H - (maxY - minY) * scale) / 2;
    const xy = points.map((_, i) => [offX + (xs[i] - minX) * scale, offY + (ys[i] - minY) * scale]);

    // Consecutive points in the same speed bucket become one polyline.
    const runs = [];
    let cur = null;
    for (let i = 0; i < xy.length; i++) {
      const b = points[i].bucket ?? 2;
      if (!cur || cur.bucket !== b) {
        if (cur) cur.pts.push(xy[i]);
        cur = { bucket: b, pts: [xy[i]] };
        runs.push(cur);
      } else cur.pts.push(xy[i]);
    }
    const full = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');

    const kmMarks = [];
    let nextKm = 1000;
    points.forEach((p, i) => {
      if (p.distM != null && p.distM >= nextKm) {
        kmMarks.push({ km: nextKm / 1000, x: xy[i][0], y: xy[i][1] });
        nextKm += 1000;
      }
    });
    return { H, xy, runs, full, kmMarks };
  }, [points, height]);

  if (!model) return <div className="route empty" style={{ height, padding: 28 }}>No GPS route for this run.</div>;
  const dot = scrubIndex != null ? model.xy[Math.max(0, Math.min(model.xy.length - 1, scrubIndex))] : null;
  const start = model.xy[0];
  const end = model.xy[model.xy.length - 1];

  const pick = (e) => {
    if (!onPick) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    let best = 0;
    let bestD = Infinity;
    model.xy.forEach(([x, y], i) => {
      const d = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    onPick(best);
  };

  return (
    <div className="route" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${model.H}`} preserveAspectRatio="xMidYMid meet" onClick={pick} style={{ cursor: onPick ? 'crosshair' : 'default' }} role="img" aria-label="Route coloured by speed">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <path d={model.full} className="route__draw" pathLength="1" fill="none" stroke="#fff" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
          </mask>
        </defs>
        <path d={model.full} fill="none" stroke="var(--snow-300)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
        <g mask={`url(#${maskId})`}>
          {model.runs.map((r, i) => (
            <polyline
              key={i}
              points={r.pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke={`var(--speed-${r.bucket})`}
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>
        {model.kmMarks.map((m) => (
          <g key={m.km} className="fade-in" style={{ animationDelay: '1.2s' }}>
            <circle cx={m.x} cy={m.y} r="14" fill="var(--surface-card)" stroke="var(--ink-800)" strokeWidth="2" />
            <text x={m.x} y={m.y + 5} textAnchor="middle" style={{ font: '700 14px var(--font-sans)', fill: 'var(--text-strong)' }}>
              {m.km}
            </text>
          </g>
        ))}
        <circle cx={start[0]} cy={start[1]} r="10" fill="var(--surface-card)" stroke="var(--ink-800)" strokeWidth="3.5" />
        <rect x={end[0] - 9} y={end[1] - 9} width="18" height="18" fill="var(--ink-800)" />
        {dot && (
          <g style={{ transform: `translate(${dot[0]}px, ${dot[1]}px)`, transition: 'transform 80ms linear' }}>
            <circle r="9" fill="none" stroke="var(--accent)" strokeWidth="3" className="route__halo" />
            <circle r="11" fill="var(--accent)" stroke="var(--surface-card)" strokeWidth="3.5" />
          </g>
        )}
      </svg>
    </div>
  );
}

export function SpeedLegend({ lo, hi }) {
  return (
    <div className="legend">
      <span>{lo}</span>
      <span className="legend__ramp">
        {[0, 1, 2, 3, 4].map((b) => (
          <span key={b} style={{ background: `var(--speed-${b})` }} />
        ))}
      </span>
      <span>{hi}</span>
    </div>
  );
}
