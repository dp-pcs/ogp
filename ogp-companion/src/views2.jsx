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

function ActivityLine({ a, compact, onReply }) {
  const m = ACT_META[a.kind] || ACT_META.message;
  // Inbound agent/message lines are repliable when a reply handler is wired.
  const canReply = !!onReply && a.dir === "in" && (a.kind === "agent" || a.kind === "message");
  return (
    <div
      onClick={canReply ? () => onReply(a) : undefined}
      title={canReply ? "Reply to this message" : undefined}
      style={{ display: "flex", alignItems: "center", gap: 11, padding: compact ? "7px 6px" : "11px 10px", borderRadius: 9, cursor: canReply ? "pointer" : "default" }}
      onMouseEnter={canReply ? (e) => (e.currentTarget.style.background = "var(--panel-2)") : undefined}
      onMouseLeave={canReply ? (e) => (e.currentTarget.style.background = "transparent") : undefined}
    >
      <div style={{ width: compact ? 28 : 34, height: compact ? 28 : 34, borderRadius: 9, flexShrink: 0, background: `var(--${m.tone}-soft, var(--accent-soft))`, color: `var(--${m.tone}, var(--accent))`, display: "grid", placeItems: "center" }}>
        <Icon name={m.icon} size={compact ? 14 : 16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          {a.dir && <Icon name={a.dir === "in" ? "arrowDown" : "arrowUp"} size={12} stroke={2.4} style={{ color: a.dir === "in" ? "var(--ok)" : "var(--accent)", flexShrink: 0 }} />}
          <span style={{ flex: 1, minWidth: 0, fontSize: compact ? 12.5 : 13.5, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.text}</span>
        </div>
        {!compact && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2 }}>
            {a.peer && <span style={{ fontSize: 11.5, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>{a.peer}</span>}
            {a.topic && <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 999, background: "var(--panel-3)", color: "var(--text-muted)" }}>{a.topic}</span>}
            {a.level && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>· {a.level}</span>}
          </div>
        )}
      </div>
      {canReply && !compact && (
        <Icon name="reply" size={15} style={{ color: "var(--accent)", flexShrink: 0, opacity: 0.7 }} />
      )}
      <span style={{ fontSize: 11.5, color: "var(--text-faint)", flexShrink: 0 }}>{relTime(a.t)}</span>
    </div>
  );
}

// ── Chat-style activity bubble (used in grouped Messages view) ─────
function ActivityBubble({ a, onReply }) {
  const isOut = a.dir === "out";
  const isIn = a.dir === "in";
  const canReply = !!onReply && isIn && (a.kind === "agent" || a.kind === "message");
  const m = ACT_META[a.kind] || ACT_META.message;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isOut ? "flex-end" : "flex-start",
        gap: 8,
        marginBottom: 8,
      }}
    >
      {!isOut && (
        <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: `var(--${m.tone}-soft, var(--accent-soft))`, color: `var(--${m.tone}, var(--accent))`, display: "grid", placeItems: "center" }}>
          <Icon name={m.icon} size={14} />
        </div>
      )}
      <div
        onClick={canReply ? () => onReply(a) : undefined}
        title={canReply ? "Reply to this message" : undefined}
        style={{
          maxWidth: "min(80%, 420px)",
          padding: "10px 12px",
          borderRadius: 12,
          borderBottomRightRadius: isOut ? 3 : 12,
          borderBottomLeftRadius: isIn ? 3 : 12,
          background: isOut ? "var(--accent-soft)" : "var(--panel-2)",
          color: "var(--text)",
          cursor: canReply ? "pointer" : "default",
        }}
      >
        <div style={{ fontSize: 13.5, lineHeight: 1.45, fontWeight: 500, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{a.text}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {a.topic && <span style={{ fontSize: 10.5, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: isOut ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "var(--panel-3)", color: "var(--text-muted)" }}>{a.topic}</span>}
            {a.level && <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{a.level}</span>}
          </div>
          <span style={{ fontSize: 10.5, color: "var(--text-faint)", flexShrink: 0 }}>{relTime(a.t)}</span>
        </div>
      </div>
      {isOut && (
        <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center" }}>
          <Icon name="arrowUp" size={14} />
        </div>
      )}
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

  // Reply to an inbound message: resolve its peer (activity stores the display
  // name / alias) to a peer object, then open the composer pre-targeted.
  function onReply(a) {
    const peer = (ctx.peers || []).find(
      (p) => p.displayName === a.peer || p.alias === a.peer || p.agentName === a.peer
    );
    if (peer) ctx.actions.message?.({ ...peer, replyTopic: a.topic || undefined });
  }

  // Group message/agent entries by peer + local target persona (toAgent). System
  // entries (errors, tunnels, requests) stay in a flat chronological list.
  const isGroupable = (a) => a.kind === "message" || a.kind === "agent";
  const groups = React.useMemo(() => {
    const map = new Map();
    for (const a of items) {
      if (!isGroupable(a)) continue;
      const key = `${a.peer || "unknown"}|${a.agent || ""}`;
      if (!map.has(key)) {
        map.set(key, { key, peer: a.peer || "unknown", agent: a.agent || null, items: [], latest: a.t });
      }
      const g = map.get(key);
      g.items.push(a);
      if (a.t > g.latest) g.latest = a.t;
    }
    const arr = Array.from(map.values());
    // Groups with the most recent activity first; items inside each group keep
    // the newest-first order the backend already provides.
    arr.sort((a, b) => (b.latest > a.latest ? 1 : b.latest < a.latest ? -1 : 0));
    return arr;
  }, [items]);

  const systemItems = items.filter((a) => !isGroupable(a));

  return (
    <PageBody>
      <PageHeader title="Activity" sub="Federation events, agent-comms, and gateway changes.">
        <Segmented value={filter} onChange={setFilter} size="sm" options={[
          { value: "all", label: "All" }, { value: "messages", label: "Messages" },
          { value: "requests", label: "Requests" }, { value: "errors", label: "System" },
        ]} />
      </PageHeader>
      {items.length === 0 ? (
        <Card pad={8}>
          <Empty icon="activity" title="Nothing here yet" sub="Activity will appear as peers exchange messages." />
        </Card>
      ) : filter === "messages" || filter === "all" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {groups.map((g) => (
            <Card key={g.key} pad={12}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--border-soft)" }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center" }}>
                  <Icon name="command" size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.peer}</div>
                  {g.agent && <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>→ {g.agent}</div>}
                </div>
              </div>
              <div>
                {g.items.map((a) => <ActivityBubble key={a.id} a={a} onReply={onReply} />)}
              </div>
            </Card>
          ))}
          {filter === "all" && systemItems.length > 0 && (
            <Card pad={8}>
              {systemItems.map((a) => <ActivityLine key={a.id} a={a} />)}
            </Card>
          )}
        </div>
      ) : (
        <Card pad={8}>
          {items.map((a) => <ActivityLine key={a.id} a={a} />)}
        </Card>
      )}
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

// bd-mmx7: the App-updates panel body. Renders by update status: idle/uptodate ⇒
// a Check button; available ⇒ version + notes + Install; downloading/installing ⇒
// progress; ready ⇒ restarting; error ⇒ message + retry.
function UpdatePanel({ up, actions }) {
  const status = up.status || "idle";
  const busyStates = ["checking", "downloading", "installing", "ready"];
  const isBusy = busyStates.includes(status);

  if (status === "available") {
    return (
      <div>
        <SettingRow label="Update available" sub={`Version ${up.version} is ready to install`}>
          <Badge tone="ok">v{up.version}</Badge>
        </SettingRow>
        {up.notes ? (
          <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 9, background: "var(--surface-2)", fontSize: 12.5, color: "var(--text-muted)", maxHeight: 120, overflow: "auto", whiteSpace: "pre-wrap" }}>{up.notes}</div>
        ) : null}
        <div style={{ display: "flex", gap: 9, marginTop: 12 }}>
          <Button variant="solid" icon="download" size="sm" onClick={() => actions.installUpdate?.()}>Install &amp; restart</Button>
          <Button variant="outline" icon="refresh" size="sm" onClick={() => actions.checkForUpdates?.()}>Re-check</Button>
        </div>
      </div>
    );
  }

  if (isBusy) {
    const label = status === "downloading" ? (up.progress != null ? `Downloading… ${up.progress}%` : "Downloading…")
      : status === "installing" ? "Installing…"
      : status === "ready" ? "Restarting…"
      : "Checking…";
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "var(--text)", fontWeight: 600 }}>
          <Icon name="download" size={16} style={{ color: "var(--accent)" }} />
          {label}
        </div>
        {status === "downloading" && up.progress != null ? (
          <div style={{ marginTop: 10, height: 6, borderRadius: 99, background: "var(--surface-2)", overflow: "hidden" }}>
            <div style={{ width: `${up.progress}%`, height: "100%", background: "var(--accent)", transition: "width 160ms ease" }} />
          </div>
        ) : null}
      </div>
    );
  }

  // idle | uptodate | error
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <div style={{ flex: 1, fontSize: 12.5, color: status === "error" ? "var(--danger)" : "var(--text-muted)" }}>
        {status === "uptodate" ? "You're on the latest version."
          : status === "error" ? (up.error || "Update check failed.")
          : "Check for a newer signed build. Updates download and verify in-app — no reinstall."}
      </div>
      <Button variant="outline" icon="refresh" size="sm" onClick={() => actions.checkForUpdates?.()}>Check for updates</Button>
    </div>
  );
}

function SettingsView({ ctx }) {
  const { framework, identity, daemon, actions, transport, busy, update, appVersion } = ctx;
  const t = transport || { mode: "direct", relayUrl: null };
  const mode = t.mode || "direct";
  const up = update || { status: "idle" };
  return (
    <PageBody>
      <PageHeader title="Settings" sub={`Configuration for ${framework.displayName}`} />
      <div className="grid-2" style={{ alignItems: "start" }}>
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
          <div style={{ marginTop: 14 }}><Button variant="outline" icon="user" size="sm" onClick={() => actions.editIdentity?.()}>Edit identity</Button></div>
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
          <SettingRow label="Version"><Mono>{daemon.version ? `v${daemon.version}` : "—"}</Mono></SettingRow>
          <SettingRow label="Launch at login" sub="Start daemon when you log in"><Switch checked={true} onChange={() => {}} /></SettingRow>
          <SettingRow label="Poll interval" sub="How often the companion refreshes"><span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>5s</span></SettingRow>
        </Card>

        <Card pad={20} style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center" }}><Icon name="download" size={20} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>App updates</div>
              <div style={{ fontSize: 12, color: "var(--text-faint)" }}>OGP Companion {appVersion ? `v${appVersion}` : ""}</div>
            </div>
          </div>
          <UpdatePanel up={up} actions={actions} />
        </Card>

        <Card pad={20} style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center" }}><Icon name="globe" size={20} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Transport</div>
              <div style={{ fontSize: 12, color: "var(--text-faint)" }}>How peers reach this daemon</div>
            </div>
          </div>
          <SettingRow label="Mode" sub={mode === "direct" ? "Direct connection (needs a public URL or tunnel)" : "Relay — reachable with no inbound port or tunnel"}>
            <Segmented
              value={mode === "iroh" ? "relay" : mode}
              size="sm"
              onChange={(v) => { if (v !== mode) actions.setTransport?.(v); }}
              options={[
                { value: "direct", label: "Direct", icon: "globe" },
                { value: "relay", label: "Relay", icon: "tunnel" },
              ]}
            />
          </SettingRow>
          {mode === "relay" && (
            <SettingRow label="Relay URL" sub="Auto-derived from rendezvous if unset">
              <Mono>{t.relayUrl ? t.relayUrl.replace(/^wss?:\/\//, "") : "wss://<rendezvous>/relay (default)"}</Mono>
            </SettingRow>
          )}
          {mode === "relay" && (
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 12, padding: "11px 13px", borderRadius: 10, background: "var(--warn-soft)", border: "1px solid color-mix(in srgb, var(--warn) 30%, var(--border))" }}>
              <Icon name="alertTriangle" size={17} style={{ color: "var(--warn)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--text-muted)" }}>
                Relay takes effect when the daemon (re)starts. Restart now to apply.
              </div>
              <Button variant="solid" tone="warn" size="sm" icon="cpu"
                onClick={() => actions.restartDaemon?.()} disabled={!daemon.running || busy?.daemon}>
                {busy?.daemon ? "Restarting…" : daemon.running ? "Restart daemon" : "Daemon stopped"}
              </Button>
            </div>
          )}
        </Card>

        <Card pad={20} style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="terminal" size={18} style={{ color: "var(--text-faint)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Prefer the CLI?</div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Every action here maps to an <span style={{ fontFamily: "var(--font-mono)" }}>ogp</span> command. Open a terminal pre-filled with this framework.</div>
            </div>
            <Button variant="outline" icon="terminal" size="sm" onClick={() => actions.openTerminal?.()}>Open in Terminal</Button>
          </div>
        </Card>
      </div>
    </PageBody>
  );
}

Object.assign(window, { TunnelsView, ActivityView, SettingsView, ActivityLine });
