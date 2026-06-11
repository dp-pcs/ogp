// app/shell.jsx — window chrome, sidebar nav, framework switcher.
const { useState: useStateShell, useRef: useRefShell, useEffect: useEffectShell } = React;

// ── Traffic lights ───────────────────────────────────────────────
// In the Tauri desktop shell the OS draws real macOS traffic lights (overlay
// title bar), so the design's faux dots would double up. Render a width-matched
// spacer there instead so the logo/title still clears the native buttons; show
// the faux dots only in the browser/mock preview.
const IN_TAURI = typeof window !== "undefined" && (!!window.__TAURI__ || !!window.__TAURI_INTERNALS__);

function TrafficLights() {
  if (IN_TAURI) {
    // reserve room for the native traffic-light cluster (~52px from the edge)
    return <div style={{ width: 52, flexShrink: 0 }} aria-hidden="true" />;
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
        <span key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c, border: "0.5px solid rgba(0,0,0,0.12)" }} />
      ))}
    </div>
  );
}

// ── Icon button ──────────────────────────────────────────────────
function IconBtn({ name, onClick, title, active, spin, size = 18 }) {
  const [h, setH] = useStateShell(false);
  return (
    <button title={title} onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        width: 34, height: 34, borderRadius: 9, border: "1px solid transparent", cursor: "pointer",
        display: "grid", placeItems: "center",
        background: active ? "var(--accent-soft)" : h ? "var(--panel-2)" : "transparent",
        color: active ? "var(--accent-ink)" : "var(--text-muted)",
        transition: "background 140ms ease, color 140ms ease",
      }}>
      <Icon name={name} size={size} style={spin ? { animation: "ogp-spin 0.8s linear infinite" } : null} />
    </button>
  );
}

// ── Title bar ────────────────────────────────────────────────────
function TitleBar({ theme, onToggleTheme, onRefresh, refreshing, onAdd, framework }) {
  // `data-tauri-drag-region` makes the bar a window-drag handle (the custom
  // titlebar otherwise isn't draggable with titleBarStyle:Overlay — only the
  // tiny native zone by the traffic lights was). Interactive children (buttons)
  // keep their own click behavior; dragging works from the inert areas.
  // No-op in the browser preview.
  return (
    <div data-tauri-drag-region style={{
      height: 54, flexShrink: 0, display: "flex", alignItems: "center", gap: 14,
      padding: "0 14px 0 18px", background: "var(--titlebar)", borderBottom: "1px solid var(--border)",
    }}>
      <TrafficLights />
      <div data-tauri-drag-region style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} />
      <img data-tauri-drag-region src="assets/ogp-symbol-ocean.svg"
        alt="OGP" style={{ height: 19, width: 19, objectFit: "contain" }} />
      <div data-tauri-drag-region style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
        <span data-tauri-drag-region style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", letterSpacing: "-0.01em" }}>OGP Companion</span>
        <span data-tauri-drag-region style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 500 }}>{framework.gatewayUrl.replace("https://", "")}</span>
      </div>
      <div data-tauri-drag-region style={{ flex: 1 }} />
      <IconBtn name="refresh" title="Refresh state" onClick={onRefresh} spin={refreshing} />
      <IconBtn name={theme === "dark" ? "sparkle" : "shield"} title="Toggle theme" onClick={onToggleTheme} />
      <div data-tauri-drag-region style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} />
      <Button variant="primary" size="sm" icon="plus" onClick={onAdd}>Add Gateway</Button>
    </div>
  );
}

// ── Framework switcher ───────────────────────────────────────────
function FrameworkSwitcher({ frameworks, value, onChange, daemons }) {
  const [open, setOpen] = useStateShell(false);
  const ref = useRefShell(null);
  useEffectShell(() => {
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const cur = frameworks.find((f) => f.id === value);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
        background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer",
        boxShadow: "var(--shadow-card)",
      }}>
        <StatusDot tone={daemons[cur.id]?.running ? "ok" : "danger"} pulse={daemons[cur.id]?.running} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15, flex: 1 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-faint)" }}>Framework</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{cur.displayName}</span>
        </div>
        <Icon name="chevronDown" size={16} style={{ color: "var(--text-faint)", transform: open ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
          background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12,
          boxShadow: "var(--shadow-pop)", padding: 6, animation: "ogp-fade-up 140ms ease",
        }}>
          {frameworks.map((f) => {
            const active = f.id === value;
            return (
              <button key={f.id} onClick={() => { onChange(f.id); setOpen(false); }} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px",
                background: active ? "var(--accent-soft)" : "transparent", border: "none", borderRadius: 8, cursor: "pointer",
                textAlign: "left",
              }}>
                <StatusDot tone={daemons[f.id]?.running ? "ok" : "danger"} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: active ? "var(--accent-ink)" : "var(--text)" }}>{f.displayName}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>:{f.daemonPort}</div>
                </div>
                {active && <Icon name="check" size={15} style={{ color: "var(--accent)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Nav item ─────────────────────────────────────────────────────
function NavItem({ icon, label, active, onClick, badge, badgeTone = "warn" }) {
  const [h, setH] = useStateShell(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "9px 11px",
      borderRadius: 9, border: "none", cursor: "pointer", position: "relative",
      background: active ? "var(--accent-soft)" : h ? "var(--panel-2)" : "transparent",
      color: active ? "var(--accent-ink)" : "var(--text-muted)",
      transition: "background 140ms ease, color 140ms ease",
    }}>
      {active && <span style={{ position: "absolute", left: -10, top: "50%", transform: "translateY(-50%)", width: 3.5, height: 20, borderRadius: 4, background: "var(--accent)" }} />}
      <Icon name={icon} size={18.5} stroke={active ? 2 : 1.75} />
      <span style={{ fontSize: 14, fontWeight: active ? 700 : 600, flex: 1, textAlign: "left" }}>{label}</span>
      {badge != null && badge > 0 && (
        <span style={{
          minWidth: 20, height: 20, padding: "0 6px", borderRadius: 999, fontSize: 11.5, fontWeight: 700,
          display: "grid", placeItems: "center", color: "#fff", background: `var(--${badgeTone})`,
        }}>{badge}</span>
      )}
    </button>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────
function Sidebar({ route, setRoute, frameworks, framework, setFramework, daemons, pendingCount, identity, gatewayUp }) {
  return (
    <aside style={{
      width: 244, flexShrink: 0, background: "var(--sidebar)", borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column", padding: 14, gap: 14,
    }}>
      <FrameworkSwitcher frameworks={frameworks} value={framework.id} onChange={setFramework} daemons={daemons} />

      <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)", padding: "4px 11px 4px" }}>Monitor</div>
        <NavItem icon="overview" label="Overview" active={route === "overview"} onClick={() => setRoute("overview")} />
        <NavItem icon="federation" label="Federation" active={route === "federation"} onClick={() => setRoute("federation")} badge={pendingCount} badgeTone="warn" />
        <NavItem icon="tunnel" label="Tunnels" active={route === "tunnels"} onClick={() => setRoute("tunnels")} badge={gatewayUp ? 0 : 1} badgeTone="danger" />
        <NavItem icon="activity" label="Activity" active={route === "activity"} onClick={() => setRoute("activity")} />
        <div style={{ height: 6 }} />
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-faint)", padding: "4px 11px 4px" }}>Configure</div>
        <NavItem icon="settings" label="Settings" active={route === "settings"} onClick={() => setRoute("settings")} />
      </nav>

      <div style={{ flex: 1 }} />

      {/* identity footer */}
      <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, boxShadow: "var(--shadow-card)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar name={identity.agent} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>{identity.agent}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{identity.human} · {identity.org}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
          <StatusDot tone={gatewayUp ? "ok" : "danger"} pulse={gatewayUp} size={8} />
          <span style={{ fontSize: 12, fontWeight: 600, color: gatewayUp ? "var(--ok)" : "var(--danger)" }}>
            {gatewayUp ? "Gateway reachable" : "Gateway offline"}
          </span>
        </div>
      </div>
    </aside>
  );
}

Object.assign(window, { TitleBar, Sidebar, IconBtn, TrafficLights });
