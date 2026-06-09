// app/graph.jsx — live federation topology. Your gateway at center, peers radial.
// Edges animate by health: healthy = flowing accent + packets, unhealthy = red dashed,
// pending = amber dashed. Click a node to select.
const { useState: useStateG } = React;

function FederationGraph({ peers, identity, onSelect, selectedId, theme }) {
  const W = 620, H = 460, cx = W / 2, cy = H / 2 + 6;
  const shown = peers.filter((p) => p.status === "approved" || p.status === "pending");
  const n = shown.length;
  const R = n <= 1 ? 150 : n <= 3 ? 158 : 172;

  const nodes = shown.map((p, i) => {
    const ang = (-90 + (360 / Math.max(n, 1)) * i) * (Math.PI / 180);
    return { p, x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R };
  });

  const toneFor = (p) => p.status === "pending" ? "warn" : p.healthy === false ? "danger" : "ok";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", display: "block" }} preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="g-core" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="var(--accent-2)" />
          <stop offset="100%" stopColor="var(--accent)" />
        </radialGradient>
        <radialGradient id="g-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* faint concentric rings */}
      {[R + 26, R - 40].map((r, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke="var(--hairline)" strokeWidth="1" strokeDasharray="2 7" opacity="0.5" />
      ))}
      <circle cx={cx} cy={cy} r={120} fill="url(#g-glow)" />

      {/* edges */}
      {nodes.map(({ p, x, y }, i) => {
        const tone = toneFor(p);
        const healthy = tone === "ok";
        const color = `var(--${tone})`;
        const pid = `edge-${i}`;
        const active = selectedId === p.id;
        return (
          <g key={"e" + p.id}>
            <path id={pid} d={`M${cx} ${cy} L${x} ${y}`} fill="none"
              stroke={color} strokeWidth={active ? 2.4 : 1.6}
              strokeOpacity={healthy ? 0.55 : 0.8}
              strokeDasharray={healthy ? "none" : "5 6"}
              style={healthy ? null : { filter: tone === "danger" ? "none" : "none" }} />
            {healthy && (
              <path d={`M${cx} ${cy} L${x} ${y}`} fill="none" stroke={color} strokeWidth={active ? 2.6 : 1.8}
                strokeDasharray="2 26" strokeLinecap="round" opacity="0.9"
                style={{ animation: "ogp-flow 1.1s linear infinite" }} />
            )}
            {healthy && (
              <circle r="3" fill={color}>
                <animateMotion dur={`${2.4 + i * 0.3}s`} repeatCount="indefinite" rotate="auto">
                  <mpath href={`#${pid}`} />
                </animateMotion>
              </circle>
            )}
            {tone === "danger" && (
              <g transform={`translate(${(cx + x) / 2} ${(cy + y) / 2})`}>
                <circle r="9" fill="var(--panel)" stroke="var(--danger)" strokeWidth="1.4" />
                <path d="M0 -4 V1 M0 3.5 v.4" stroke="var(--danger)" strokeWidth="1.6" strokeLinecap="round" />
              </g>
            )}
          </g>
        );
      })}

      {/* center node */}
      <g>
        <circle cx={cx} cy={cy} r="40" fill="url(#g-core)" />
        <circle cx={cx} cy={cy} r="40" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.4">
          <animate attributeName="r" values="40;52;40" dur="3.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="3.2s" repeatCount="indefinite" />
        </circle>
        {/* white mark sits on the ocean-accent core (g-core) — reads on both themes */}
        <image href="assets/ogp-symbol-white.png"
          x={cx - 19} y={cy - 22} width="38" height="38" opacity="0.96" />
        <text x={cx} y={cy + 60} textAnchor="middle" style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, fill: "var(--text)" }}>Your Gateway</text>
        <text x={cx} y={cy + 77} textAnchor="middle" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fill: "var(--text-faint)" }}>{identity.agent}</text>
      </g>

      {/* peer nodes */}
      {nodes.map(({ p, x, y }) => {
        const tone = toneFor(p);
        const color = `var(--${tone})`;
        const active = selectedId === p.id;
        const label = p.alias || p.displayName.split(" ")[0] || p.org;
        return (
          <g key={"n" + p.id} style={{ cursor: "pointer" }} onClick={() => onSelect(p.id)}>
            {active && <circle cx={x} cy={y} r="32" fill="var(--accent-soft)" />}
            {tone === "ok" && (
              <circle cx={x} cy={y} r="24" fill="none" stroke={color} strokeWidth="1.5" opacity="0.5">
                <animate attributeName="r" values="24;33;24" dur="2.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0;0.5" dur="2.6s" repeatCount="indefinite" />
              </circle>
            )}
            <circle cx={x} cy={y} r="24" fill="var(--panel)" stroke={color} strokeWidth={active ? 3 : 2.2}
              strokeDasharray={tone === "warn" ? "4 4" : "none"} style={{ boxShadow: "var(--shadow-card)" }} />
            {tone === "warn"
              ? <text x={x} y={y + 6} textAnchor="middle" style={{ fontFamily: "var(--font-sans)", fontSize: 18, fontWeight: 700, fill: color }}>?</text>
              : <text x={x} y={y + 5.5} textAnchor="middle" style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, fill: "var(--text)" }}>
                  {(label[0] || "?").toUpperCase()}{(p.org || "")[0] ? (p.org[0]).toUpperCase() : ""}
                </text>}
            {/* status pip */}
            <circle cx={x + 17} cy={y - 17} r="6.5" fill="var(--panel)" />
            <circle cx={x + 17} cy={y - 17} r="4" fill={color} />
            <text x={x} y={y + 41} textAnchor="middle" style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 700, fill: "var(--text)" }}>{label}</text>
            <text x={x} y={y + 56} textAnchor="middle" style={{ fontFamily: "var(--font-sans)", fontSize: 10.5, fontWeight: 500, fill: "var(--text-faint)" }}>
              {tone === "warn" ? "pending" : tone === "danger" ? "unreachable" : (p.latencyMs != null ? p.latencyMs + "ms" : "online")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

window.FederationGraph = FederationGraph;
