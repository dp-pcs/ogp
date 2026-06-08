// app/app.jsx — root: state, actions, routing, tweaks, scale-to-fit window.
const { useState, useEffect, useRef, useCallback } = React;
const D = window.OGP_DATA;

const WIN_W = 1180, WIN_H = 768;

const ACCENTS = {
  "#802DC8": { light: ["#802DC8", "#B75EFF"], dark: ["#B75EFF", "#D152FF"] },
  "#C81E8E": { light: ["#C81E8E", "#EF50FF"], dark: ["#EF50FF", "#FF7BD5"] },
  "#2563C9": { light: ["#2563C9", "#5B8DEF"], dark: ["#5B8DEF", "#8FB4FF"] },
  "#0E8C73": { light: ["#0E8C73", "#1FB89A"], dark: ["#27C9A7", "#5BE0C4"] },
};
const DENSITY = { compact: 14, regular: 20, comfy: 26 };

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "#802DC8",
  "density": "regular",
  "peerStyle": "graph",
  "tunnelStyle": "control"
}/*EDITMODE-END*/;

function clone(x) { return JSON.parse(JSON.stringify(x)); }

function initStore() {
  const s = {};
  for (const fw of D.FRAMEWORKS) {
    s[fw.id] = {
      daemon: clone(D.DAEMON[fw.id]),
      tunnel: clone(D.TUNNELS[fw.id]),
      peers: clone(D.PEERS[fw.id]),
      activity: clone(D.ACTIVITY[fw.id]),
    };
  }
  return s;
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 300,
      display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderRadius: 12,
      background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "var(--shadow-pop)",
      animation: "ogp-fade-up 200ms ease", maxWidth: 420,
    }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", flexShrink: 0, background: `var(--${toast.tone || "ok"}-soft)`, color: `var(--${toast.tone || "ok"})` }}>
        <Icon name={toast.icon || "check"} size={15} stroke={2.2} />
      </div>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{toast.msg}</span>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [store, setStore] = useState(initStore);
  const [frameworks, setFrameworks] = useState(D.FRAMEWORKS);
  const [fwId, setFwId] = useState(D.FRAMEWORKS[0]?.id || "openclaw");
  const LIVE = !!(window.OGP_BACKEND && window.OGP_BACKEND.isLive());
  const [route, setRoute] = useState("overview");
  const [selectedPeerId, setSelected] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [composerPeer, setComposerPeer] = useState(null);
  const [policyPeer, setPolicyPeer] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState({ daemon: false, tunnel: false, startingId: null });
  const [toast, setToast] = useState(null);
  const [scale, setScale] = useState(1);
  const toastTimer = useRef(null);

  // theme + accent + density → CSS vars
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", t.theme === "dark" ? "dark" : "light");
    const pair = (ACCENTS[t.accent] || ACCENTS["#802DC8"])[t.theme === "dark" ? "dark" : "light"];
    root.style.setProperty("--accent", pair[0]);
    root.style.setProperty("--accent-2", pair[1]);
    root.style.setProperty("--pad", (DENSITY[t.density] || 20) + "px");
  }, [t.theme, t.accent, t.density]);

  // scale to fit viewport
  useEffect(() => {
    function fit() {
      const sw = (window.innerWidth - 48) / WIN_W;
      const sh = (window.innerHeight - 48) / WIN_H;
      setScale(Math.min(1, sw, sh));
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // hydrate from the real OGP backend (Tauri). Falls back to mock data in a
  // plain browser where window.OGP_BACKEND.isLive() is false.
  const hydrate = useCallback(async () => {
    if (!LIVE) return;
    try {
      const snap = await window.OGP_BACKEND.fetchSnapshot();
      if (snap.frameworks?.length) setFrameworks(snap.frameworks);
      setStore(() => {
        const s = {};
        for (const fwk of snap.frameworks) {
          s[fwk.id] = {
            daemon: snap.daemon[fwk.id] || { running: false, port: fwk.daemonPort, version: null, uptimeMs: 0 },
            tunnel: snap.tunnels[fwk.id] || { active: null, options: [] },
            peers: snap.peers[fwk.id] || [],
            activity: snap.activity[fwk.id] || [],
          };
        }
        return s;
      });
      setFwId((cur) => (snap.frameworks.some((f) => f.id === cur) ? cur : snap.frameworks[0]?.id || cur));
    } catch (e) {
      console.error("OGP backend snapshot failed:", e);
    }
  }, [LIVE]);

  useEffect(() => {
    hydrate();
    if (!LIVE) return;
    const iv = setInterval(hydrate, 5000);
    return () => clearInterval(iv);
  }, [hydrate, LIVE]);

  const fw = frameworks.find((f) => f.id === fwId) || frameworks[0];
  const st = store[fwId];
  const daemons = Object.fromEntries(Object.entries(store).map(([k, v]) => [k, v.daemon]));
  const gatewayUp = st.daemon.running && !!st.tunnel.active;
  const pendingCount = st.peers.filter((p) => p.status === "pending").length;

  const showToast = useCallback((msg, opts = {}) => {
    setToast({ msg, ...opts });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  function patch(fn) {
    setStore((prev) => { const n = clone(prev); fn(n[fwId]); return n; });
  }
  function pushActivity(fwState, entry) {
    fwState.activity.unshift({ id: Date.now() + Math.random(), t: new Date().toISOString(), ...entry });
  }
  // Fire a backend call (Tauri) and re-hydrate; no-op when running on mock data.
  const BK = window.OGP_BACKEND;
  function bk(promiseFn) {
    if (!LIVE) return;
    Promise.resolve(promiseFn())
      .then(() => hydrate())
      .catch((e) => showToast(String(e.message || e), { icon: "alertTriangle", tone: "danger" }));
  }

  const actions = {
    toggleDaemon() {
      setBusy((b) => ({ ...b, daemon: true }));
      const wasRunning = store[fwId].daemon.running;
      if (LIVE) {
        Promise.resolve(BK.toggleDaemon(fwId, !wasRunning))
          .then(() => hydrate())
          .catch((e) => showToast(String(e.message || e), { icon: "alertTriangle", tone: "danger" }))
          .finally(() => setBusy((b) => ({ ...b, daemon: false })));
        showToast(wasRunning ? "Stopping daemon…" : "Starting daemon…", { icon: "cpu", tone: wasRunning ? "danger" : "ok" });
        return;
      }
      setTimeout(() => {
        patch((s) => { s.daemon.running = !s.daemon.running; if (!s.daemon.running) s.tunnel.active = null; });
        setBusy((b) => ({ ...b, daemon: false }));
        showToast(store[fwId].daemon.running ? "Daemon stopped" : "Daemon started", { icon: "cpu", tone: store[fwId].daemon.running ? "danger" : "ok" });
      }, 700);
    },
    startTunnel(optId) {
      setBusy({ daemon: false, tunnel: true, startingId: optId });
      if (LIVE) {
        Promise.resolve(BK.startTunnel(fwId, optId))
          .then(() => hydrate())
          .catch((e) => showToast(String(e.message || e), { icon: "alertTriangle", tone: "danger" }))
          .finally(() => setBusy({ daemon: false, tunnel: false, startingId: null }));
        showToast("Starting tunnel…", { icon: "globe", tone: "ok" });
        return;
      }
      setTimeout(() => {
        patch((s) => {
          const opt = s.tunnel.options.find((o) => o.id === optId);
          s.tunnel.active = { id: opt.id, name: opt.name, type: opt.type, hostname: opt.hostname || (opt.type === "ngrok" ? "a1b2c3.ngrok-free.app" : "tunnel-7f3a.trycloudflare.com"), since: new Date().toISOString() };
          pushActivity(s, { kind: "tunnel", dir: null, peer: null, text: `Tunnel '${opt.name}' started` });
        });
        setBusy({ daemon: false, tunnel: false, startingId: null });
        showToast("Tunnel up — gateway is online", { icon: "globe", tone: "ok" });
      }, 1300);
    },
    stopTunnel() {
      setBusy((b) => ({ ...b, tunnel: true }));
      if (LIVE) {
        Promise.resolve(BK.stopTunnel(fwId))
          .then(() => hydrate())
          .catch((e) => showToast(String(e.message || e), { icon: "alertTriangle", tone: "danger" }))
          .finally(() => setBusy((b) => ({ ...b, tunnel: false, startingId: null })));
        showToast("Stopping tunnel…", { icon: "globeOff", tone: "danger" });
        return;
      }
      setTimeout(() => {
        patch((s) => { const name = s.tunnel.active?.name; s.tunnel.active = null; pushActivity(s, { kind: "tunnel", dir: null, peer: null, text: `Tunnel '${name}' stopped` }); });
        setBusy((b) => ({ ...b, tunnel: false, startingId: null }));
        showToast("Tunnel stopped", { icon: "globeOff", tone: "danger" });
      }, 700);
    },
    approve(peerId, intents) {
      patch((s) => {
        const p = s.peers.find((x) => x.id === peerId);
        if (!p) return;
        p.status = "approved"; p.healthy = true; p.healthState = "healthy";
        p.grantedScopes = D.scopeBundle(intents); p.lastSeenAt = new Date().toISOString();
        p.latencyMs = 44; p.messages = 0; p.msgTrend = [0, 0, 0, 0, 0, 0, 0, 0, 1];
        pushActivity(s, { kind: "message", dir: "out", peer: p.alias || p.displayName, topic: "federation", level: null, text: `Approved · scopes: ${intents.join(", ")}` });
      });
      bk(() => BK.approve(fwId, peerId, intents));
      showToast("Peer approved", { icon: "shieldCheck", tone: "ok" });
    },
    reject(peerId) {
      patch((s) => { s.peers = s.peers.filter((x) => x.id !== peerId); });
      if (selectedPeerId === peerId) setSelected(null);
      bk(() => BK.reject(fwId, peerId));
      showToast("Request rejected", { icon: "x", tone: "danger" });
    },
    remove(peerId) {
      patch((s) => { s.peers = s.peers.filter((x) => x.id !== peerId); });
      setSelected(null);
      bk(() => BK.reject(fwId, peerId));
      showToast("Peer removed from federation", { icon: "trash", tone: "danger" });
    },
    message(peer) { setComposerPeer(peer); },
    editPolicy(peer) { setPolicyPeer(peer); },
    sendMessage(peer, opts) {
      const name = peer.alias || peer.displayName;
      const isAgent = opts.intent === "agent-comms";
      if (LIVE) {
        Promise.resolve(BK.sendMessage(fwId, peer.id, opts))
          .then(() => hydrate())
          .catch((e) => showToast(String(e.message || e), { icon: "alertTriangle", tone: "danger" }));
        showToast(peer.healthy === false ? `Queued for ${name} (offline)` : `Message sent to ${name}`, { icon: "send", tone: peer.healthy === false ? "warn" : "ok" });
        return;
      }
      patch((s) => pushActivity(s, { kind: isAgent ? "agent" : "message", dir: "out", peer: name, topic: isAgent ? opts.topic : "message", level: opts.priority !== "normal" ? opts.priority : null, text: `Sent: ${opts.text.slice(0, 64)}` }));
      showToast(peer.healthy === false ? `Queued for ${name} (offline)` : `Message sent to ${name}`, { icon: "send", tone: peer.healthy === false ? "warn" : "ok" });
      if (opts.wait && peer.healthy !== false) {
        setTimeout(() => {
          patch((s) => pushActivity(s, { kind: isAgent ? "agent" : "message", dir: "in", peer: name, topic: isAgent ? opts.topic : "message", level: "full", text: `Reply from ${name}: acknowledged` }));
          showToast(`Reply from ${name}`, { icon: "arrowDown", tone: "ok" });
        }, 1800);
      }
    },
    setPolicy(peerId, policy) {
      patch((s) => { const p = s.peers.find((x) => x.id === peerId); if (p) p.commsPolicy = policy; });
      bk(() => BK.setPolicy(fwId, peerId, policy));
      showToast("Response policies updated", { icon: "shieldCheck", tone: "ok" });
    },
    addPeer(peer) {
      if (LIVE) {
        bk(() => BK.addGateway(fwId, peer.gatewayUrl, peer.alias));
        showToast(`Federation request sent to ${peer.alias || peer.displayName}`, { icon: "link", tone: "ok" });
        return;
      }
      patch((s) => { s.peers.unshift(peer); });
      showToast(`Federated with ${peer.alias || peer.displayName}`, { icon: "link", tone: "ok" });
    },
    openTerminal() {
      if (LIVE) {
        Promise.resolve(BK.openTerminal(fwId, "status"))
          .catch((e) => showToast(String(e.message || e), { icon: "alertTriangle", tone: "danger" }));
        showToast("Opening Terminal…", { icon: "terminal", tone: "ok" });
      } else {
        showToast("Opens a terminal in the desktop app", { icon: "terminal", tone: "ok" });
      }
    },
    editIdentity() {
      if (LIVE) {
        Promise.resolve(BK.openTerminal(fwId, "config set-identity"))
          .catch((e) => showToast(String(e.message || e), { icon: "alertTriangle", tone: "danger" }));
        showToast("Opening identity editor in Terminal…", { icon: "user", tone: "ok" });
      } else {
        showToast("Edits identity via the ogp CLI in the desktop app", { icon: "user", tone: "ok" });
      }
    },
  };

  function refresh() {
    setRefreshing(true);
    if (LIVE) { hydrate().finally(() => setTimeout(() => setRefreshing(false), 400)); }
    else { setTimeout(() => setRefreshing(false), 800); }
  }
  function switchFw(id) { setFwId(id); setSelected(null); setRoute("overview"); }

  const ctx = {
    framework: fw, identity: fw.identity, theme: t.theme,
    daemon: st.daemon, tunnel: st.tunnel, peers: st.peers, activity: st.activity,
    gatewayUp, busy, actions, setRoute, setSelected, selectedPeerId,
    peerStyle: t.peerStyle, setPeerStyle: (v) => setTweak("peerStyle", v),
    tunnelStyle: t.tunnelStyle, openWizard: () => setWizardOpen(true),
  };

  const View = { overview: OverviewView, federation: FederationView, tunnels: TunnelsView, activity: ActivityView, settings: SettingsView }[route];

  // In the Tauri desktop shell the OS window IS the chrome — fill it. In a
  // plain browser (design preview) keep the scaled 1180×768 desktop card.
  const outerStyle = LIVE
    ? { width: "100vw", height: "100vh" }
    : { transform: `scale(${scale})`, transformOrigin: "center center", transition: "transform 120ms ease" };
  const frameStyle = LIVE
    ? {
        width: "100vw", height: "100vh", overflow: "hidden", position: "relative",
        background: "var(--bg)", display: "flex", flexDirection: "column",
        fontFamily: "var(--font-sans)", color: "var(--text)",
      }
    : {
        width: WIN_W, height: WIN_H, borderRadius: 16, overflow: "hidden", position: "relative",
        background: "var(--bg)", border: "1px solid var(--window-border)", boxShadow: "var(--window-shadow)",
        display: "flex", flexDirection: "column", fontFamily: "var(--font-sans)", color: "var(--text)",
      };

  return (
    <div style={outerStyle}>
      <div style={frameStyle}>
        <TitleBar theme={t.theme} framework={fw} refreshing={refreshing}
          onToggleTheme={() => setTweak("theme", t.theme === "dark" ? "light" : "dark")}
          onRefresh={refresh} onAdd={() => setWizardOpen(true)} />

        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <Sidebar route={route} setRoute={(r) => { setRoute(r); }} frameworks={frameworks} framework={fw}
            setFramework={switchFw} daemons={daemons} pendingCount={pendingCount} identity={fw.identity} gatewayUp={gatewayUp} />

          <main className="ogp-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--bg)" }}>
            <View ctx={ctx} />
          </main>
        </div>

        {wizardOpen && <AddGatewayModal framework={fw} onClose={() => setWizardOpen(false)} onConnect={actions.addPeer} />}
        {composerPeer && <MessageComposer peer={st.peers.find((p) => p.id === composerPeer.id) || composerPeer} onClose={() => setComposerPeer(null)} onSend={actions.sendMessage} />}
        {policyPeer && <AgentCommsModal peer={st.peers.find((p) => p.id === policyPeer.id) || policyPeer} onClose={() => setPolicyPeer(null)} onSave={actions.setPolicy} />}
        <Toast toast={toast} />
      </div>

      {!LIVE && <TweaksPanel>
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme} options={["light", "dark"]} onChange={(v) => setTweak("theme", v)} />
        <TweakColor label="Accent" value={t.accent} options={Object.keys(ACCENTS)} onChange={(v) => setTweak("accent", v)} />
        <TweakRadio label="Density" value={t.density} options={["compact", "regular", "comfy"]} onChange={(v) => setTweak("density", v)} />
        <TweakSection label="Federation view" />
        <TweakRadio label="Peer layout" value={t.peerStyle} options={["graph", "list", "cards"]} onChange={(v) => setTweak("peerStyle", v)} />
        <TweakSection label="Tunnels view" />
        <TweakRadio label="Tunnel layout" value={t.tunnelStyle} options={["control", "compact"]} onChange={(v) => setTweak("tunnelStyle", v)} />
      </TweaksPanel>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
