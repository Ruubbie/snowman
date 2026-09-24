// Olaf Design System component contracts (design/olaf-ds/README.md), as thin
// React wrappers over the DS classes in components.css.
import { useEffect, useRef, useState } from 'react';
import { MoveRight, Minus, Check } from 'lucide-react';
import { useCountUp } from '../lib/hooks.js';

/** Lucide at 1.5px (1.25 above 32px, 2 below 16px). */
export function Icon({ icon: Glyph, size = 20, stroke, color, label, style }) {
  if (!Glyph) return null;
  const sw = stroke ?? (size > 32 ? 1.25 : size < 16 ? 2 : 1.5);
  return (
    <span className="ol-icon" style={{ color, ...style }} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined}>
      <Glyph size={size} strokeWidth={sw} />
    </span>
  );
}

export function Button({ variant = 'primary', size = 'md', iconLeft, iconRight, block, disabled, onClick, children, type = 'button', style, title }) {
  const right = iconRight === undefined ? (variant === 'ghost' ? MoveRight : null) : iconRight;
  const iconSize = size === 'lg' ? 20 : size === 'sm' ? 16 : 18;
  return (
    <button
      type={type}
      className={`ol-btn ol-btn--${variant} ol-btn--${size}${block ? ' ol-btn--block' : ''}`}
      disabled={disabled}
      onClick={onClick}
      style={style}
      title={title}
    >
      {iconLeft && <Icon icon={iconLeft} size={iconSize} />}
      {children}
      {right && <Icon icon={right} size={iconSize} />}
    </button>
  );
}

export function IconButton({ icon, variant = 'plain', size = 44, iconSize, label, onClick, disabled, style }) {
  return (
    <button
      type="button"
      className={`ol-ibtn ol-ibtn--${variant}`}
      style={{ width: size, height: size, ...style }}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon icon={icon} size={iconSize ?? Math.round(size * 0.45)} />
    </button>
  );
}

export function Badge({ tone = 'neutral', dot, children, title }) {
  return (
    <span className={`ol-badge ol-badge--${tone}`} title={title}>
      {dot && <span className="ol-badge__dot" />}
      {children}
    </span>
  );
}

export function Tag({ selected, icon, onClick, children, count }) {
  return (
    <button type="button" className={`ol-tag${selected ? ' ol-tag--selected' : ''}`} onClick={onClick}>
      {icon && <Icon icon={icon} size={14} />}
      {children}
      {count != null && <span style={{ opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>{count}</span>}
    </button>
  );
}

export function Card({ tone = 'white', eyebrow, title, padding = 28, interactive, onClick, children, className = '', style, i }) {
  return (
    <div
      className={`ol-card ol-card--${tone}${interactive ? ' ol-card--interactive' : ''} rise ${className}`}
      style={{ padding, '--i': i ?? 0, ...style }}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick?.(e) : undefined}
    >
      {eyebrow && <div className="ol-card__eyebrow">{eyebrow}</div>}
      {title && <h3 className="ol-card__title">{title}</h3>}
      {children}
    </div>
  );
}

/**
 * Metric {label, value, unit, delta, deltaTone, size, align}. Pass `count`
 * (a number) + `format` to have the value count up (900ms drift).
 */
export function Metric({ label, value, count, format, unit, delta, deltaTone = 'muted', size = 44, align = 'left', i }) {
  const animated = useCountUp(count);
  const shown = count != null ? (format ? format(animated) : Math.round(animated)) : value;
  const unitSize = Math.max(12, Math.round(size * 0.36));
  const deltaColor = { up: 'var(--success)', down: 'var(--danger)', accent: 'var(--accent)' }[deltaTone] || 'var(--text-muted)';
  return (
    <div className="ol-metric rise" style={{ alignItems: align === 'center' ? 'center' : 'flex-start', '--i': i ?? 0 }}>
      {label && <span className="ol-metric__label">{label}</span>}
      <span className="ol-metric__value" style={{ fontSize: size }}>
        {shown}
        {unit && (
          <span className="ol-metric__unit" style={{ fontSize: unitSize }}>
            {unit}
          </span>
        )}
      </span>
      {delta && (
        <span className="ol-metric__delta" style={{ color: deltaColor }}>
          {delta}
        </span>
      )}
    </div>
  );
}

export function Tabs({ items, value, onChange, variant = 'line' }) {
  return (
    <div className={`ol-tabs${variant === 'pill' ? ' ol-tabs--pill' : ''}`} role="tablist">
      {items.map((it) => {
        const v = typeof it === 'string' ? it : it.value;
        const label = typeof it === 'string' ? it : it.label;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={v === value}
            className={`ol-tab${v === value ? ' ol-tab--active' : ''}`}
            onClick={() => onChange?.(v)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, indeterminate }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);
  return (
    <label className="ol-check" onClick={(e) => e.stopPropagation()}>
      <input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange?.(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span className="ol-check__box" style={indeterminate && !checked ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' } : undefined}>{(checked || indeterminate) && <Icon icon={indeterminate && !checked ? Minus : Check} size={12} stroke={2.5} />}</span>
      {label && <span>{label}</span>}
    </label>
  );
}

export function Input({ label, hint, error, icon, suffix, value, onChange, placeholder, autoFocus, type = 'text', spellCheck = false, inputProps }) {
  return (
    <label className="ol-field">
      {label && <span className="ol-label">{label}</span>}
      <span className={`ol-inputwrap${error ? ' ol-inputwrap--error' : ''}`}>
        {icon && <Icon icon={icon} size={18} />}
        <input
          className="ol-input"
          type={type}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          spellCheck={spellCheck}
          onChange={(e) => onChange?.(e.target.value)}
          {...inputProps}
        />
        {suffix}
      </span>
      {(error || hint) && <span className={`ol-hint${error ? ' ol-hint--error' : ''}`}>{error || hint}</span>}
    </label>
  );
}

export function GhostWord({ children, size }) {
  return (
    <p className="ol-ghost page__ghost" style={size ? { fontSize: size } : undefined} aria-hidden="true">
      {children}
    </p>
  );
}

/** Ring: plain carrot outline (brand motif), or a progress arc drawing over 900ms. */
export function Ring({ size = 100, weight = 12, progress, color = 'var(--accent)', children }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(progress ?? 0));
    return () => cancelAnimationFrame(id);
  }, [progress]);
  if (progress == null) return <div className="ol-ring" style={{ width: size, height: size, borderWidth: weight, borderColor: color }} />;
  const r = (size - weight) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--snow-200)" strokeWidth={weight} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={weight}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, shown)))}
          style={{ transition: 'stroke-dashoffset var(--dur-drift) var(--ease-out)' }}
        />
      </svg>
      {children && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>}
    </div>
  );
}

export function Page({ eyebrow, title, sub, ghost, actions, back, children, panel = true }) {
  return (
    <div className="page">
      {panel && <div className="page__panel" />}
      {ghost && <GhostWord>{ghost}</GhostWord>}
      <div className="page__content">
        {back && <div className="back rise">{back}</div>}
        <header className="page__head">
          <div style={{ flex: '1 1 320px', minWidth: 0 }} className="rise">
            {eyebrow && <div className="eyebrow eyebrow--accent">{eyebrow}</div>}
            <h1 className="h1">{title}</h1>
            {sub && <p className="page__sub">{sub}</p>}
          </div>
          {actions && (
            <div className="row row--wrap rise" style={{ '--i': 2 }}>
              {actions}
            </div>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

export function Section({ title, eyebrow, actions, children, i }) {
  return (
    <section className="section rise" style={{ '--i': i ?? 0 }}>
      {(title || actions) && (
        <div className="section__head">
          <div style={{ flex: 1 }}>
            {eyebrow && (
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                {eyebrow}
              </div>
            )}
            {title && <h2 className="h3">{title}</h2>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty fade-in">
      {title && <p className="empty__title">{title}</p>}
      {children}
    </div>
  );
}

export function Loading({ rows = 4 }) {
  return (
    <div className="stack fade-in" style={{ gap: 18, padding: '12px 0' }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="notice notice--danger rise" role="alert">
      <div style={{ flex: 1 }}>{typeof error === 'string' ? error : error.message}</div>
      {onRetry && (
        <button type="button" className="link-btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Horizontal bar: value/max, animated grow. */
export function Bar({ value, max, tone, thick, mark, i }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`bar${thick ? ' bar--thick' : ''}`}>
      <div className={`bar__fill${tone ? ` bar__fill--${tone}` : ''}`} style={{ width: `${pct}%`, '--i': i ?? 0 }} />
      {mark != null && max > 0 && <div className="bar__mark" style={{ left: `${Math.min(100, (mark / max) * 100)}%` }} />}
    </div>
  );
}

/** Wraps a list row so it can play the animated exit. */
export function Exit({ leaving, children }) {
  return (
    <div className={`exit${leaving ? ' exit--leaving' : ''}`}>
      <div className="exit__inner">{children}</div>
    </div>
  );
}
