// app/views2.jsx — Tunnels, Activity, Settings.
const { useState: useStateV2 } = React;

// ── Activity line (shared) ───────────────────────────────────────
const ACT_META = {
  message: { icon: "send", tone: "accent" },
  agent:   { icon: "command", tone: "accent" },
  request: { icon: "inbox", tone: "warn" },
  error:   { icon: "alertTriangle", tone: "danger" },
  tunnel:  { icon: "tunnel", tone: "danger" },
};

function ActivityLine({ a, compact }) {
  const m = ACT_META[a.kind] || ACT_META.message;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: compact ? "7px 6px" : "11px 10px", borderRadius: 9 }}>
      <div style={{ width: compact ? 28 : 34, height: compact ? 28 : 34, borderRadius: 9, flexShrink: 0, background: `var(--${m.tone}-soft, var(--accent-soft))`, color: `var(--${m.tone}, var(--accent))`, display: "grid", placeItems: "center" }}>
        <Icon name={m.icon} size={compact ? 14 : 16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {a.dir && <Icon name={a.dir === "in" ? "arrowDown" : "arrowUp"} size={12} stroke={2.4} style={{ color: a.dir === "in" ? "var(--ok)" : "var(--accent)" }} />}
          <span style={{ fontSize: compact ? 12.5 : 13.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.text}</span>
        </div>
        {!compact && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2 }}>
            {a.peer && <span style={{ fontSize: 11.5, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>{a.peer}</span>}
            {a.topic && <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: "var(--panel-3)", color: "var(--text-muted)" }}>{a.topic}</span>}
            {a.level && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>· {a.level}</span>}
          </div>
        )}
      </div>
      <span style={{ fontSize: 11.5, color: "var(--text-faint)", flexShrink: 0 }}>{relTime(a.t)}</span>
    </div>
  );
}

// ── TUNNELS ──────────────────────────────────────────────────────
const TUNNEL_ICON = { cloudflareNamed: "shieldCheck", cloudflareFree: "zap", ngrok: "globe" };
const TUNNEL_KIND = { cloudflareNamed: "Cloudflare · named", cloudflareFree: "Cloudflare · quick", ngrok: "ngrok" };

function TunnelsView({ ctx }) {
  const { tunnel, daemon, actions, busy, framework, tunnelStyle } = ctx;
  const active = tunnel.active;

  return (
    <PageBody>
      <PageHeader title="Tunnels" sub="Expose your local daemon to the internet so peers can reach your gateway." />

      {/* status hero */}
      <Card pad={20} style={{ marginBottom: 16, borderColor: active ? "color-mix(in srgb, var(--ok) 32%, var(--border))" : "color-mix(in srgb, var(--danger) 32%, var(--border))", background: active ? "color-mix(in srgb, var(--ok-soft) 35%, var(--panel))" : "color-mix(in srgb, var(--danger-soft) 35%, var(--panel))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 54, height: 54, borderRadius: 15, flexShrink: 0, background: active ? "var(--ok-soft)" : "var(--danger-soft)", color: active ? "var(--ok)" : "var(--danger)", display: "grid", placeItems: "center" }}>
            <Icon name={active ? "globe" : "globeOff"} size={27} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{active ? "Gateway is online" : "Gateway is private"}</span>
              <StatusDot tone={active ? "ok" : "danger"} pulse={!!active} />
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>
              {active
                ? <>Reachable at <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)", fontWeight: 600 }}>{active.hostname}</span> via {TUNNEL_KIND[active.type]} · up {fmtUptime(Date.now() - new Date(active.since).getTime())}</>
                : "No tunnel is running. Peers can't reach you and inbound federation requests will fail. Start a tunnel below."}
            </div>
          </div>
          {active
            ? <div style={{ display: "flex", gap: 8 }}>
                <Button variant="outline" icon="copy">Copy URL</Button>
                <Button variant="danger" icon="stop" busy={busy.tunnel} disabled={busy.tunnel} onClick={actions.stopTunnel}>Stop</Button>
              </div>
            : !daemon.running && <Badge tone="danger" icon="alertCircle">start the daemon first</Badge>}
        </div>
      </Card>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
        <Icon name="server" size={16} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>Available tunnels</span>
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>detected on this machine</span>
      </div>

      <div style={{ display: tunnelStyle === "compact" ? "block" : "grid", gridTemplateColumns: tunnelStyle === "compact" ? undefined : "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {tunnel.options.map((opt) => {
          const isActive = active && active.id === opt.id;
          const starting = busy.tunnel && busy.startingId === opt.id;
          if (tunnelStyle === "compact") {
            return (
              <div key={opt.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderBottom: "1px solid var(--border-soft)" }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--panel-3)", color: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={TUNNEL_ICON[opt.type]} size={17} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>{opt.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{opt.hostname || TUNNEL_KIND[opt.type]}{!opt.configured && " · not configured for this port"}</div>
                </div>
                {isActive
                  ? <Badge tone="ok" icon="check">active</Badge>
                  : <Button variant="soft" size="sm" icon={starting ? "refresh" : "play"} disabled={busy.tunnel || !daemon.running} onClick={() => actions.startTunnel(opt.id)}>{starting ? "Starting…" : "Start"}</Button>}
              </div>
            );
          }
          return (
            <Card key={opt.id} pad={16} style={{ borderColor: isActive ? "color-mix(in srgb, var(--ok) 38%, var(--border))" : undefined }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 11, marginBottom: 13 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: isActive ? "var(--ok-soft)" : "var(--accent-soft)", color: isActive ? "var(--ok)" : "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={TUNNEL_ICON[opt.type]} size={20} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontWeight: 700, fontSize: 14.5, color: "var(--text)" }}>{opt.name}</span>
                    {isActive && <Badge tone="ok" icon="check">active</Badge>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 1 }}>{TUNNEL_KIND[opt.type]}</div>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 13, minHeight: 17 }}>
                {opt.hostname ? opt.hostname : opt.type === "cloudflareFree" ? "random *.trycloudflare.com" : "random *.ngrok-free.app"}
              </div>
              {!opt.configured && <div style={{ fontSize: 11.5, color: "var(--warn)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Icon name="alertCircle" size={13} />Not configured for port {framework.daemonPort}</div>}
              {isActive
                ? <Button variant="danger" size="sm" icon="stop" full disabled={busy.tunnel} onClick={actions.stopTunnel}>Stop tunnel</Button>
                : <Button variant="solid" tone="ok" size="sm" icon={starting ? "refresh" : "play"} full disabled={busy.tunnel || !daemon.running} onClick={() => actions.startTunnel(opt.id)}>{starting ? "Starting…" : "Start tunnel"}</Button>}
            </Card>
          );
        })}
      </div>

      <Card pad={16} style={{ marginTop: 16, background: "var(--panel-2)" }}>
        <div style={{ display: "flex", gap: 11 }}>
          <Icon name="info" size={18} style={{ color: "var(--text-faint)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 }}>
            <b style={{ color: "var(--text)" }}>Named tunnels</b> keep a stable hostname across restarts — best for production. <b style={{ color: "var(--text)" }}>Quick tunnels</b> spin up instantly with a random URL — good for testing. The companion runs the same <span style={{ fontFamily: "var(--font-mono)" }}>cloudflared</span> / <span style={{ fontFamily: "var(--font-mono)" }}>ngrok</span> commands the CLI would.
          </div>
        </div>
      </Card>
    </PageBody>
  );
}

// ── ACTIVITY ─────────────────────────────────────────────────────
function ActivityView({ ctx }) {
  const [filter, setFilter] = useStateV2("all");
  const items = ctx.activity.filter((a) => filter === "all" ? true : filter === "messages" ? (a.kind === "message" || a.kind === "agent") : filter === "requests" ? a.kind === "request" : a.kind === "error" || a.kind === "tunnel");
  return (
    <PageBody>
      <PageHeader title="Activity" sub="Federation events, agent-comms, and gateway changes.">
        <Segmented value={filter} onChange={setFilter} size="sm" options={[
          { value: "all", label: "All" }, { value: "messages", label: "Messages" },
          { value: "requests", label: "Requests" }, { value: "errors", label: "System" },
        ]} />
      </PageHeader>
      <Card pad={8}>
        {items.length === 0
          ? <Empty icon="activity" title="Nothing here yet" sub="Activity will appear as peers exchange messages." />
          : items.map((a) => <ActivityLine key={a.id} a={a} />)}
      </Card>
    </PageBody>
  );
}

// ── SETTINGS ─────────────────────────────────────────────────────
function SettingRow({ label, sub, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0", borderBottom: "1px solid var(--border-soft)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 1 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function SettingsView({ ctx }) {
  const { framework, identity, daemon } = ctx;
  return (
    <PageBody>
      <PageHeader title="Settings" sub={`Configuration for ${framework.displayName}`} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <Card pad={20}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 8 }}>
            <Avatar name={identity.agent} size={40} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Identity</div>
              <div style={{ fontSize: 12, color: "var(--text-faint)" }}>How peers see you</div>
            </div>
          </div>
          <SettingRow label="Agent name" sub="Attributed on agent-comms"><span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>{identity.agent}</span></SettingRow>
          <SettingRow label="Human operator"><span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>{identity.human}</span></SettingRow>
          <SettingRow label="Organization"><span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>{identity.org}</span></SettingRow>
          <SettingRow label="Gateway URL"><Mono>{framework.gatewayUrl.replace("https://", "")}</Mono></SettingRow>
          <div style={{ marginTop: 14 }}><Button variant="outline" icon="user" size="sm">Edit identity</Button></div>
        </Card>

        <Card pad={20}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center" }}><Icon name="cpu" size={20} /></div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Daemon</div>
              <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{framework.stateDir}</div>
            </div>
          </div>
          <SettingRow label="Status"><Badge tone={daemon.running ? "ok" : "danger"}>{daemon.running ? "running" : "stopped"}</Badge></SettingRow>
          <SettingRow label="Port"><Mono>{daemon.port}</Mono></SettingRow>
          <SettingRow label="Version"><Mono>v{daemon.version}</Mono></SettingRow>
          <SettingRow label="Launch at login" sub="Start daemon when you log in"><Switch checked={true} onChange={() => {}} /></SettingRow>
          <SettingRow label="Poll interval" sub="How often the companion refreshes"><span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>5s</span></SettingRow>
        </Card>

        <Card pad={20} style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="terminal" size={18} style={{ color: "var(--text-faint)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Prefer the CLI?</div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Every action here maps to an <span style={{ fontFamily: "var(--font-mono)" }}>ogp</span> command. Open a terminal pre-filled with this framework.</div>
            </div>
            <Button variant="outline" icon="terminal" size="sm">Open in Terminal</Button>
          </div>
        </Card>
      </div>
    </PageBody>
  );
}

Object.assign(window, { TunnelsView, ActivityView, SettingsView, ActivityLine });
