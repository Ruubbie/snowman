// Time-series chart drawn as SVG (no chart libs). The plot stretches to its
// box (non-scaling strokes); labels, the scrub line and dots are HTML so they
// never distort. Entrance: the plot is revealed left-to-right (900ms drift).
import { useMemo, useRef } from 'react';

const W = 1000;

function extent(values) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo === Infinity ? null : [lo, hi];
}

function pathFor(points, sx, sy) {
  let d = '';
  let pen = false;
  for (const p of points) {
    if (p.y == null || !Number.isFinite(p.y)) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** Linear interpolation of y at x in sorted points (null inside gaps). */
export function valueAt(points, x) {
  if (!points.length) return null;
  let lo = 0;
  let hi = points.length - 1;
  if (x <= points[0].x) return points[0].y;
  if (x >= points[hi].x) return points[hi].y;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x <= x) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  if (a.y == null || b.y == null) return a.y ?? b.y ?? null;
  const t = (x - a.x) / (b.x - a.x || 1);
  return a.y + (b.y - a.y) * t;
}

/**
 * @param {{
 *   series: {points: {x:number,y:number|null}[], color?: string, width?: number, area?: boolean, label?: string}[],
 *   xMax?: number, height?: number, invert?: boolean, yPad?: number, yDomain?: [number, number],
 *   formatY?: (v:number)=>string, formatX?: (v:number)=>string,
 *   bands?: {from:number,to:number,tone:string}[], scrubX?: number|null, onScrub?: (x:number)=>void,
 *   refLines?: {y:number,label:string}[]
 * }} props
 */
export function LineChart({ series, xMax, height = 180, invert = false, yPad = 0.08, yDomain, formatY = (v) => v.toFixed(0), formatX, bands = [], scrubX = null, onScrub, refLines = [] }) {
  const box = useRef(null);
  const H = height;

  const model = useMemo(() => {
    const allY = series.flatMap((s) => s.points.map((p) => p.y));
    const ext = yDomain || extent(allY);
    if (!ext) return null;
    let [lo, hi] = ext;
    if (hi - lo < 1e-6) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * yPad;
    lo -= pad;
    hi += pad;
    const maxX = xMax ?? Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.x)));
    const sx = (x) => (x / maxX) * W;
    const sy = (y) => (invert ? ((y - lo) / (hi - lo)) * H : H - ((y - lo) / (hi - lo)) * H);
    const ticks = [0.15, 0.5, 0.85].map((t) => {
      const y = invert ? lo + (hi - lo) * t : hi - (hi - lo) * t;
      return { y, top: t * 100 };
    });
    return {
      maxX,
      sy,
      ticks,
      paths: series.map((s) => {
        const line = pathFor(s.points, sx, sy);
        let area = null;
        if (s.area && line) {
          const valid = s.points.filter((p) => p.y != null);
          if (valid.length) area = `${line}L${sx(valid[valid.length - 1].x).toFixed(1)},${H}L${sx(valid[0].x).toFixed(1)},${H}Z`;
        }
        return { line, area, color: s.color || 'var(--ink-800)', width: s.width || 1.75 };
      }),
      lo,
      hi,
    };
  }, [series, xMax, H, invert, yPad, yDomain]);

  if (!model) return <div className="empty">No data for this chart.</div>;

  const toX = (clientX) => {
    const r = box.current.getBoundingClientRect();
    return Math.min(model.maxX, Math.max(0, ((clientX - r.left) / r.width) * model.maxX));
  };
  const onPointer = (e) => {
    if (!onScrub) return;
    if (e.type === 'pointermove' && e.buttons !== 1 && e.pointerType !== 'mouse') return;
    onScrub(toX(e.clientX));
  };
  const scrubPct = scrubX != null ? (scrubX / model.maxX) * 100 : null;

  return (
    <div className="chart" style={{ height: H + 22 }}>
      <div className="chart__plot" ref={box} style={{ height: H }} onPointerMove={onPointer} onPointerDown={onPointer}>
        {bands.map((b, i) => (
          <div
            key={i}
            className={`chart__band chart__band--${b.tone}`}
            style={{ left: `${(b.from / model.maxX) * 100}%`, width: `${((b.to - b.from) / model.maxX) * 100}%` }}
          />
        ))}
        {model.ticks.map((t, i) => (
          <div key={i} className="chart__grid" style={{ top: `${t.top}%` }}>
            <span>{formatY(t.y)}</span>
          </div>
        ))}
        {refLines.map((r, i) => {
          const top = (model.sy(r.y) / H) * 100;
          if (top < 0 || top > 100) return null;
          return (
            <div key={`r${i}`} className="chart__ref" style={{ top: `${top}%` }}>
              <span>{r.label}</span>
            </div>
          );
        })}
        <svg className="chart__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {model.paths.map((p, i) => (
            <g key={i}>
              {p.area && <path d={p.area} fill={p.color} opacity="0.12" />}
              <path d={p.line} fill="none" stroke={p.color} strokeWidth={p.width} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}
        </svg>
        {scrubPct != null && (
          <div className="chart__scrub" style={{ left: `${scrubPct}%` }}>
            {series.map((s, i) => {
              const y = valueAt(s.points, scrubX);
              if (y == null) return null;
              return <span key={i} className="chart__dot" style={{ top: `${(model.sy(y) / H) * 100}%`, borderColor: s.color || 'var(--ink-800)' }} />;
            })}
          </div>
        )}
      </div>
      {formatX && (
        <div className="chart__xaxis">
          <span>{formatX(0)}</span>
          <span>{formatX(model.maxX / 2)}</span>
          <span>{formatX(model.maxX)}</span>
        </div>
      )}
    </div>
  );
}
