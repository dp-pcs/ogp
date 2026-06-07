// app/ui.jsx — shared brand primitives (buttons, badges, cards, controls, helpers).
const { useState, useRef, useEffect } = React;

// ── helpers ──────────────────────────────────────────────────────
function cx(...a) { return a.filter(Boolean).join(" "); }

function relTime(iso) {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return "just now";
  if (s < 90) return "1m ago";
  if (s < 3600) return Math.round(s / 60) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
}
function fmtUptime(ms) {
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) { const d = Math.floor(h / 24); return `${d}d ${h % 24}h`; }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Status dot (pulsing for live "ok") ───────────────────────────
function StatusDot({ tone = "ok", pulse = false, size = 9 }) {
  const color = `var(--${tone})`;
  return (
    <span style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "inline-block" }}>
      {pulse && (
        <span style={{
          position: "absolute", inset: 0, borderRadius: "50%", background: color,
          animation: "ogp-pulse-ring 1.8s ease-out infinite",
        }} />
      )}
      <span style={{
        position: "absolute", inset: 0, borderRadius: "50%", background: color,
        boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 16%, transparent)`,
      }} />
    </span>
  );
}

// ── Button / Pill ────────────────────────────────────────────────
function Button({ children, onClick, variant = "ghost", size = "md", icon, iconRight, tone, disabled, full, style = {}, title }) {
  const [hover, setHover] = useState(false);
  const pads = { sm: "7px 12px", md: "9px 16px", lg: "12px 22px" };
  const fonts = { sm: 13, md: 14, lg: 15 };
  const base = {
    display: full ? "flex" : "inline-flex", width: full ? "100%" : "auto",
    alignItems: "center", justifyContent: "center", gap: 8,
    padding: pads[size], fontSize: fonts[size], fontFamily: "var(--font-sans)", fontWeight: 600,
    borderRadius: 999, border: "1px solid transparent", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap", lineHeight: 1.1,
    transition: "background 160ms ease, color 160ms ease, border-color 160ms ease, transform 90ms ease, box-shadow 160ms ease",
    transform: hover && !disabled ? "translateY(-1px)" : "none",
  };
  const toneColor = tone ? `var(--${tone})` : "var(--accent)";
  const variants = {
    primary: {
      background: hover ? "color-mix(in srgb, var(--accent) 88%, #000)" : "var(--accent)",
      color: "#fff", boxShadow: "var(--shadow-card)",
    },
    pink: {
      background: hover ? "color-mix(in srgb, var(--pink) 86%, #000)" : "var(--pink)",
      color: "#fff",
    },
    solid: {
      background: hover ? `color-mix(in srgb, ${toneColor} 88%, #000)` : toneColor, color: "#fff",
    },
    soft: {
      background: hover ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "var(--accent-soft)",
      color: "var(--accent-ink)",
    },
    outline: {
      background: hover ? "var(--panel-2)" : "transparent", color: "var(--text)",
      borderColor: "var(--border)",
    },
    ghost: {
      background: hover ? "var(--panel-2)" : "transparent", color: "var(--text-muted)",
    },
    danger: {
      background: hover ? "color-mix(in srgb, var(--danger) 14%, transparent)" : "var(--danger-soft)",
      color: "var(--danger)",
    },
  };
  return (
    <button title={title} disabled={disabled} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ ...base, ...variants[variant], ...style }}>
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 17} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 15 : 17} />}
    </button>
  );
}

// ── Badge / tag ──────────────────────────────────────────────────
function Badge({ children, tone, soft = true, icon, style = {} }) {
  const color = tone ? `var(--${tone})` : "var(--accent)";
  const bg = tone ? `var(--${tone}-soft, color-mix(in srgb, ${color} 14%, transparent))` : "var(--accent-soft)";
  const fg = tone ? color : "var(--accent-ink)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 9px", borderRadius: 999, fontSize: 12, fontWeight: 600, lineHeight: 1.3,
      background: soft ? bg : color, color: soft ? fg : "#fff",
      border: soft ? `1px solid color-mix(in srgb, ${color} 22%, transparent)` : "none",
      ...style,
    }}>
      {icon && <Icon name={icon} size={12} stroke={2} />}
      {children}
    </span>
  );
}

// ── Card ─────────────────────────────────────────────────────────
function Card({ children, pad, style = {}, hover = false, onClick, className = "" }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => hover && setH(true)} onMouseLeave={() => hover && setH(false)}
      className={className}
      style={{
        background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-card)", padding: pad ?? "var(--pad)",
        transition: "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease",
        transform: h ? "translateY(-2px)" : "none",
        borderColor: h ? "color-mix(in srgb, var(--accent) 30%, var(--border))" : "var(--border)",
        cursor: onClick ? "pointer" : "default", ...style,
      }}>
      {children}
    </div>
  );
}

function Eyebrow({ children, style = {} }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)", ...style }}>{children}</div>;
}

// ── Segmented control ────────────────────────────────────────────
function Segmented({ value, options, onChange, size = "md" }) {
  const h = size === "sm" ? 30 : 36;
  const fs = size === "sm" ? 12.5 : 13.5;
  return (
    <div style={{
      display: "inline-flex", padding: 3, gap: 2, background: "var(--panel-3)",
      borderRadius: 999, border: "1px solid var(--border-soft)",
    }}>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const label = typeof o === "string" ? o : o.label;
        const ic = typeof o === "object" ? o.icon : null;
        const active = v === value;
        return (
          <button key={v} onClick={() => onChange(v)} style={{
            display: "inline-flex", alignItems: "center", gap: 6, height: h, padding: "0 14px",
            border: "none", borderRadius: 999, cursor: "pointer", fontSize: fs, fontWeight: 600,
            fontFamily: "var(--font-sans)",
            background: active ? "var(--panel)" : "transparent",
            color: active ? "var(--accent-ink)" : "var(--text-muted)",
            boxShadow: active ? "var(--shadow-card)" : "none",
            transition: "all 140ms ease",
          }}>
            {ic && <Icon name={ic} size={15} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Toggle switch ────────────────────────────────────────────────
function Switch({ checked, onChange, tone }) {
  const color = tone ? `var(--${tone})` : "var(--accent)";
  return (
    <button onClick={() => onChange(!checked)} style={{
      width: 42, height: 24, borderRadius: 999, border: "none", cursor: "pointer", padding: 2,
      background: checked ? color : "var(--panel-3)", position: "relative",
      transition: "background 180ms ease", flexShrink: 0,
    }}>
      <span style={{
        position: "absolute", top: 2, left: checked ? 20 : 2, width: 20, height: 20, borderRadius: "50%",
        background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "left 180ms cubic-bezier(0.22,1,0.36,1)",
      }} />
    </button>
  );
}

// ── Sparkline ────────────────────────────────────────────────────
function Sparkline({ data, w = 72, h = 24, color = "var(--accent)" }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4)]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = d + ` L${w} ${h} L0 ${h} Z`;
  const gid = "spk" + Math.random().toString(36).slice(2, 7);
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.22" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={color} />
    </svg>
  );
}

// ── Tiny key/identity pill (truncated pubkey, copyable) ──────────
function Mono({ children, style = {} }) {
  return <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text-muted)", ...style }}>{children}</span>;
}

// ── Avatar (monogram) ────────────────────────────────────────────
function Avatar({ name, size = 36, tone }) {
  const initials = (name || "?").replace(/[^a-zA-Z0-9 ]/g, "").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const palette = ["#802DC8", "#EF50FF", "#2E7DDB", "#149A63", "#D69100", "#7A41F7"];
  const idx = (name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  const bg = tone ? `var(--${tone})` : palette[idx];
  return (
    <span style={{
      width: size, height: size, borderRadius: "30%", background: `color-mix(in srgb, ${bg} 18%, transparent)`,
      color: bg, display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: size * 0.38, flexShrink: 0, border: `1px solid color-mix(in srgb, ${bg} 30%, transparent)`,
    }}>{initials}</span>
  );
}

// ── Empty state ──────────────────────────────────────────────────
function Empty({ icon, title, sub, action }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "48px 24px", gap: 6 }}>
      <div style={{ width: 52, height: 52, borderRadius: 16, background: "var(--panel-3)", display: "grid", placeItems: "center", color: "var(--text-faint)", marginBottom: 6 }}>
        <Icon name={icon} size={24} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{title}</div>
      {sub && <div style={{ fontSize: 13.5, color: "var(--text-muted)", maxWidth: 320 }}>{sub}</div>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

Object.assign(window, { cx, relTime, fmtUptime, StatusDot, Button, Badge, Card, Eyebrow, Segmented, Switch, Sparkline, Mono, Avatar, Empty });
