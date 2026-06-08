// app/views1.jsx — Overview + Federation views.
const { useState: useStateV1 } = React;

function PageHeader({ title, sub, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" }}>{title}</h1>
        {sub && <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--text-muted)" }}>{sub}</p>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{children}</div>
    </div>
  );
}

function PageBody({ children, style = {} }) {
  return <div className="scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "22px 26px 28px", ...style }}>{children}</div>;
}

// ── Health status card ───────────────────────────────────────────
function HealthCard({ icon, label, tone, state, detail, actionLabel, actionTone, onAction, busy }) {
  return (
    <Card pad={16} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `var(--${tone}-soft)`, color: `var(--${tone})`, display: "grid", placeItems: "center" }}>
          <Icon name={icon} size={19} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-faint)" }}>{label}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2 }}>
            <StatusDot tone={tone} pulse={tone === "ok"} size={8} />
            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{state}</span>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", minHeight: 17 }}>{detail}</div>
      {actionLabel && (
        <Button variant={actionTone === "danger" ? "outline" : "solid"} tone={actionTone} size="sm" full
          icon={busy ? "refresh" : actionTone === "danger" ? "stop" : "play"} disabled={busy} onClick={onAction}>
          {busy ? "Working…" : actionLabel}
        </Button>
      )}
    </Card>
  );
}

function StatTile({ label, value, unit, trend, icon, tone, onClick }) {
  return (
    <Card pad={16} hover={!!onClick} onClick={onClick} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name={icon} size={16} style={{ color: tone ? `var(--${tone})` : "var(--text-faint)" }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-faint)" }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 30, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--text)", lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-faint)" }}>{unit}</span>}
      </div>
      {trend && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{trend}</div>}
    </Card>
  );
}

// ── OVERVIEW ─────────────────────────────────────────────────────
function OverviewView({ ctx }) {
  const { daemon, tunnel, peers, identity, gatewayUp, framework, actions, busy, setRoute, setSelected } = ctx;
  const approved = peers.filter((p) => p.status === "approved");
  const pending = peers.filter((p) => p.status === "pending");
  const unhealthy = approved.filter((p) => p.healthy === false);
  const msgsToday = approved.reduce((a, p) => a + (p.msgTrend?.slice(-3).reduce((x, y) => x + y, 0) || 0), 0);

  return (
    <PageBody>
      <PageHeader title="Overview" sub={`${framework.displayName} · ${framework.gatewayUrl.replace("https://", "")}`} />

      {/* troubleshooting banner */}
      {!gatewayUp && (
        <Card pad={16} style={{ marginBottom: 18, borderColor: "color-mix(in srgb, var(--danger) 38%, var(--border))", background: "color-mix(in srgb, var(--danger-soft) 55%, var(--panel))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--danger-soft)", color: "var(--danger)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Icon name="globeOff" size={21} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Your gateway isn't reachable from the internet</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
                {daemon.running ? "The daemon is up, but no tunnel is running — peers can't reach you. Start a tunnel to come online." : "The daemon is stopped. Start it, then bring up a tunnel."}
              </div>
            </div>
            <Button variant="solid" tone="danger" icon="tunnel" onClick={() => setRoute("tunnels")}>Fix tunnel</Button>
          </div>
        </Card>
      )}

      {/* health strip */}
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <HealthCard icon="cpu" label="Daemon" tone={daemon.running ? "ok" : "danger"}
          state={daemon.running ? "Running" : "Stopped"}
          detail={daemon.running ? `PID ${daemon.pid} · port ${daemon.port} · up ${fmtUptime(daemon.uptimeMs)}` : "Not running"}
          actionLabel={daemon.running ? "Stop daemon" : "Start daemon"} actionTone={daemon.running ? "danger" : "ok"}
          busy={busy.daemon} onAction={actions.toggleDaemon} />
        <HealthCard icon="tunnel" label="Tunnel" tone={tunnel.active ? "ok" : "danger"}
          state={tunnel.active ? "Up" : "Down"}
          detail={tunnel.active ? `${tunnel.active.name} · ${tunnel.active.hostname}` : "No tunnel — gateway is private"}
          actionLabel={tunnel.active ? "Stop tunnel" : "Start tunnel"} actionTone={tunnel.active ? "danger" : "ok"}
          busy={busy.tunnel} onAction={() => tunnel.active ? actions.stopTunnel() : setRoute("tunnels")} />
        <HealthCard icon="globe" label="Public reach" tone={gatewayUp ? "ok" : "danger"}
          state={gatewayUp ? "Online" : "Offline"}
          detail={gatewayUp ? `Resolving at ${tunnel.active?.hostname}` : "Not resolvable — bring up a tunnel"} />
      </div>

      {/* stats */}
      <div className="grid-4" style={{ marginBottom: 18 }}>
        <StatTile label="Federated" value={approved.length} unit="peers" icon="users" onClick={() => setRoute("federation")} trend={`${unhealthy.length} need attention`} tone={unhealthy.length ? "danger" : "ok"} />
        <StatTile label="Pending" value={pending.length} unit="requests" icon="inbox" onClick={() => setRoute("federation")} trend={pending.length ? "awaiting review" : "all clear"} tone={pending.length ? "warn" : undefined} />
        <StatTile label="Messages" value={msgsToday} unit="today" icon="activity" onClick={() => setRoute("activity")} trend="across all peers" />
        <StatTile label="Uptime" value={fmtUptime(daemon.uptimeMs)} icon="clock" trend={daemon.version ? `v${daemon.version}` : undefined} />
      </div>

      {/* two-column */}
      <div className="grid-split">
        <Card pad={0} style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 4px" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--text)" }}>Federation map</div>
              <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{approved.length} connected · {unhealthy.length} unhealthy</div>
            </div>
            <Button variant="ghost" size="sm" iconRight="chevronRight" onClick={() => setRoute("federation")}>Open</Button>
          </div>
          <div style={{ height: 320 }}>
            <FederationGraph peers={peers} identity={identity} theme={ctx.theme} selectedId={null}
              onSelect={(id) => { setSelected(id); setRoute("federation"); }} />
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card pad={16}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Icon name="inbox" size={17} style={{ color: "var(--warn)" }} />
              <span style={{ fontWeight: 700, fontSize: 14.5, color: "var(--text)" }}>Pending requests</span>
              {pending.length > 0 && <Badge tone="warn" style={{ marginLeft: "auto" }}>{pending.length}</Badge>}
            </div>
            {pending.length === 0
              ? <div style={{ fontSize: 13, color: "var(--text-faint)" }}>No incoming requests.</div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {pending.map((p) => (
                    <div key={p.id} onClick={() => { setSelected(p.id); setRoute("federation"); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, background: "var(--panel-3)", cursor: "pointer" }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--warn-soft)", color: "var(--warn)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="user" size={15} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.displayName}</div>
                        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{relTime(p.requestedAt)}</div>
                      </div>
                      <Button variant="solid" tone="ok" size="sm" icon="check" onClick={(e) => { e.stopPropagation(); ctx.actions.approve(p.id, ["message", "agent-comms"]); }} />
                    </div>
                  ))}
                </div>
              )}
          </Card>

          <Card pad={16} style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Icon name="activity" size={17} style={{ color: "var(--accent)" }} />
              <span style={{ fontWeight: 700, fontSize: 14.5, color: "var(--text)" }}>Recent activity</span>
              <Button variant="ghost" size="sm" style={{ marginLeft: "auto" }} onClick={() => setRoute("activity")}>All</Button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {ctx.activity.slice(0, 5).map((a) => <ActivityLine key={a.id} a={a} compact />)}
            </div>
          </Card>
        </div>
      </div>
    </PageBody>
  );
}

// ── FEDERATION ───────────────────────────────────────────────────
function FederationView({ ctx }) {
  const { peers, identity, gatewayUp, selectedPeerId, setSelected, actions, peerStyle, setPeerStyle } = ctx;
  const approved = peers.filter((p) => p.status === "approved");
  const pending = peers.filter((p) => p.status === "pending");
  const selected = peers.find((p) => p.id === selectedPeerId) || null;

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>
      <div className="scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "22px 26px 28px", minWidth: 0 }}>
        <PageHeader title="Federation" sub={`${approved.length} peers · ${pending.length} pending`}>
          <Segmented value={peerStyle} onChange={setPeerStyle} size="sm" options={[
            { value: "graph", label: "Graph", icon: "federation" },
            { value: "list", label: "List", icon: "filter" },
            { value: "cards", label: "Cards", icon: "overview" },
          ]} />
        </PageHeader>

        {pending.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
              <Icon name="inbox" size={16} style={{ color: "var(--warn)" }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>Pending requests</span>
              <Badge tone="warn">{pending.length}</Badge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: pending.length > 1 ? "repeat(2, 1fr)" : "1fr", gap: 14 }}>
              {pending.map((p) => <PendingCard key={p.id} p={p} onApprove={actions.approve} onReject={actions.reject} allIntents={window.OGP_DATA.ALL_INTENTS} />)}
            </div>
          </div>
        )}

        {peerStyle !== "graph" && approved.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
            <Icon name="users" size={16} style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>Federated peers</span>
          </div>
        )}

        {approved.length === 0 && pending.length === 0 && (
          <Empty icon="federation" title="No federated peers yet" sub="Connect to another OGP gateway to start exchanging messages and delegating tasks."
            action={<Button variant="primary" icon="plus" onClick={ctx.openWizard}>Add a gateway</Button>} />
        )}

        {peerStyle === "graph" && (approved.length > 0 || pending.length > 0) && (
          <Card pad={0} style={{ overflow: "hidden", height: 460, position: "relative" }}>
            <div style={{ position: "absolute", top: 12, left: 14, zIndex: 2, display: "flex", gap: 14, fontSize: 11.5, fontWeight: 600 }}>
              {[["ok", "healthy"], ["danger", "unhealthy"], ["warn", "pending"]].map(([t, l]) => (
                <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-muted)" }}>
                  <StatusDot tone={t} size={7} />{l}
                </span>
              ))}
            </div>
            <FederationGraph peers={peers} identity={identity} theme={ctx.theme} selectedId={selectedPeerId} onSelect={setSelected} />
          </Card>
        )}

        {peerStyle === "list" && approved.length > 0 && (
          <Card pad={6}>
            {approved.map((p) => <PeerRow key={p.id} p={p} onSelect={setSelected} selected={p.id === selectedPeerId} onMessage={actions.message} />)}
          </Card>
        )}

        {peerStyle === "cards" && approved.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
            {approved.map((p) => <PeerCard key={p.id} p={p} onSelect={setSelected} selected={p.id === selectedPeerId} onMessage={actions.message} />)}
          </div>
        )}
      </div>

      {selected && <PeerDetail p={selected} onClose={() => setSelected(null)} onMessage={actions.message} onRemove={actions.remove} onApprove={actions.approve} onReject={actions.reject} onPolicy={actions.editPolicy} />}
    </div>
  );
}

Object.assign(window, { OverviewView, FederationView, PageHeader, PageBody, StatTile, HealthCard });
