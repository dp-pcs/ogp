// app/wizard.jsx — Add Gateway wizard (destination → name → authorization → connect).
const { useState: useStateW } = React;

const WIZ_STEPS = [
  { id: "destination", label: "Destination", icon: "globe" },
  { id: "name", label: "Name", icon: "user" },
  { id: "authorization", label: "Authorization", icon: "shield" },
  { id: "connect", label: "Connect", icon: "link" },
];

const MOCK_WELLKNOWN = {
  displayName: "Vega · Northwind Labs",
  org: "Northwind Labs",
  capabilities: { intents: ["message", "agent-comms", "task-request", "project.join"] },
  agents: [
    { id: "vega-1", displayName: "Vega", role: "primary", description: "Lead orchestration agent" },
    { id: "vega-2", displayName: "Probe", role: "specialist", description: "Diagnostics & health checks" },
  ],
};

function StepDots({ step }) {
  const idx = WIZ_STEPS.findIndex((s) => s.id === step);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {WIZ_STEPS.map((s, i) => {
        const done = i < idx, active = i === idx;
        return (
          <React.Fragment key={s.id}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 78 }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0,
                background: done ? "var(--accent)" : active ? "var(--accent-soft)" : "var(--panel-3)",
                color: done ? "#fff" : active ? "var(--accent-ink)" : "var(--text-faint)",
                border: active ? "2px solid var(--accent)" : "2px solid transparent",
                transition: "all 200ms ease",
              }}>
                {done ? <Icon name="check" size={15} stroke={2.4} /> : <Icon name={s.icon} size={15} />}
              </div>
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 600, color: active ? "var(--accent-ink)" : "var(--text-faint)" }}>{s.label}</span>
            </div>
            {i < WIZ_STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: done ? "var(--accent)" : "var(--border)", marginBottom: 22, borderRadius: 2, transition: "background 200ms ease" }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 4 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginBottom: 7 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 7 }}>{hint}</div>}
    </label>
  );
}

const inputStyle = {
  width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--panel-2)", color: "var(--text)", fontSize: 14, fontFamily: "var(--font-sans)", outline: "none",
};

function AddGatewayModal({ onClose, onConnect, framework }) {
  const [step, setStep] = useStateW("destination");
  const [url, setUrl] = useStateW("");
  const [alias, setAlias] = useStateW("");
  const [ping, setPing] = useStateW(null); // null | "testing" | "ok" | "fail"
  const [wk, setWk] = useStateW(null);
  const [sel, setSel] = useStateW(new Set(["message", "agent-comms"]));
  const [connecting, setConnecting] = useStateW(false);
  const [done, setDone] = useStateW(false);
  const idx = WIZ_STEPS.findIndex((s) => s.id === step);

  function test() {
    setPing("testing"); setWk(null);
    setTimeout(() => { setPing("ok"); setWk(MOCK_WELLKNOWN); if (!alias) setAlias((MOCK_WELLKNOWN.agents[0].displayName).toLowerCase()); }, 1100);
  }
  function next() {
    if (step === "connect") { doConnect(); return; }
    setStep(WIZ_STEPS[idx + 1].id);
  }
  function back() { if (idx > 0) setStep(WIZ_STEPS[idx - 1].id); }
  function doConnect() {
    setConnecting(true);
    setTimeout(() => {
      setConnecting(false); setDone(true);
      setTimeout(() => {
        onConnect({
          id: "302a3005" + Math.random().toString(16).slice(2, 10), alias: alias || null,
          displayName: wk?.displayName || url.replace("https://", ""), status: "approved",
          gatewayUrl: url.startsWith("http") ? url : "https://" + url, publicKey: "302a3005…" + Math.random().toString(16).slice(2, 8),
          healthState: "healthy", healthy: true,
          grantedScopes: window.OGP_DATA.scopeBundle([...sel]),
          offeredIntents: wk?.capabilities.intents || [...sel],
          lastSeenAt: new Date().toISOString(), tags: ["new"],
          org: wk?.org || "—", agent: wk?.agents?.[0]?.displayName || alias, human: "—",
          latencyMs: 41, messages: 0, msgTrend: [0, 0, 0, 0, 0, 0, 0, 0, 1],
        });
      }, 850);
    }, 1400);
  }

  const canNext = step === "destination" ? ping === "ok" : step === "name" ? true : step === "authorization" ? sel.size > 0 : true;
  const offered = wk?.capabilities.intents || ["message", "agent-comms", "task-request", "project.join"];
  const toggle = (i) => setSel((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 200, background: "rgba(10,6,24,0.5)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", animation: "ogp-fade-up 160ms ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "92%", background: "var(--panel)", borderRadius: 18, boxShadow: "var(--shadow-pop)", border: "1px solid var(--border)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "90%" }}>
        {/* header */}
        <div style={{ padding: "18px 22px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700, color: "var(--text)" }}>Add a gateway</div>
            <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>Federate {framework.displayName} with another OGP peer</div>
          </div>
          <IconBtn name="x" title="Close" onClick={onClose} />
        </div>

        <div style={{ padding: "20px 22px 6px" }}><StepDots step={done ? "connect" : step} /></div>

        {/* body */}
        <div className="scroll" style={{ padding: "10px 22px 4px", overflow: "auto", flex: 1, minHeight: 150 }}>
          {step === "destination" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Field label="Peer gateway URL" hint="The companion runs ogp federation ping to confirm the peer is reachable and reads its /.well-known/ogp.">
                <div style={{ display: "flex", gap: 8 }}>
                  <input autoFocus value={url} onChange={(e) => { setUrl(e.target.value); setPing(null); }} placeholder="https://peer.example.com" style={{ ...inputStyle, flex: 1 }}
                    onKeyDown={(e) => { if (e.key === "Enter" && url) test(); }} />
                  <Button variant="soft" icon={ping === "testing" ? "refresh" : "signal"} disabled={!url || ping === "testing"} onClick={test}>{ping === "testing" ? "Testing…" : "Test"}</Button>
                </div>
              </Field>
              {ping === "ok" && wk && (
                <div style={{ marginTop: 8, padding: 14, borderRadius: 12, background: "var(--ok-soft)", border: "1px solid color-mix(in srgb, var(--ok) 28%, transparent)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="check" size={16} style={{ color: "var(--ok)" }} stroke={2.4} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>Reachable — {wk.displayName}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5 }}>Advertises {wk.capabilities.intents.length} intents and {wk.agents.length} agents.</div>
                </div>
              )}
              {ping === "fail" && <div style={{ marginTop: 8, color: "var(--danger)", fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><Icon name="alertCircle" size={15} />Unreachable. Check the URL and that the peer's tunnel is up.</div>}
            </div>
          )}

          {step === "name" && (
            <Field label="Local alias" hint="A friendly name you'll use to reference this peer in commands and messages. Auto-filled from the peer's well-known identity.">
              <input autoFocus value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="e.g. vega" style={inputStyle} />
            </Field>
          )}

          {step === "authorization" && (
            <div>
              <Field label="Grant scopes" hint="Per-peer permissions. You can change these later with ogp federation grant.">
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
                  {offered.map((i) => {
                    const on = sel.has(i);
                    return (
                      <button key={i} onClick={() => toggle(i)} style={{
                        display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", borderRadius: 11, cursor: "pointer", textAlign: "left",
                        background: on ? "var(--accent-soft)" : "var(--panel-2)", border: `1px solid ${on ? "color-mix(in srgb, var(--accent) 35%, transparent)" : "var(--border)"}`,
                      }}>
                        <div style={{ width: 22, height: 22, borderRadius: 7, display: "grid", placeItems: "center", flexShrink: 0, background: on ? "var(--accent)" : "var(--panel-3)", color: on ? "#fff" : "var(--text-faint)" }}>
                          {on && <Icon name="check" size={14} stroke={2.6} />}
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{i}</span>
                      </button>
                    );
                  })}
                </div>
              </Field>
              {wk?.agents && (
                <div style={{ marginTop: 14, padding: 13, borderRadius: 12, background: "var(--panel-2)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 8 }}>Peer advertises · read-only</div>
                  {wk.agents.map((a) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                      {a.role === "primary" ? <Icon name="sparkle" size={14} style={{ color: "var(--accent)" }} /> : <Icon name="dot" size={10} style={{ color: "var(--text-faint)" }} />}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{a.displayName}</span>
                      <span style={{ fontSize: 12, color: "var(--text-faint)" }}>— {a.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "connect" && (
            <div style={{ display: "grid", placeItems: "center", textAlign: "center", padding: "10px 0 18px" }}>
              {done ? (
                <div style={{ animation: "ogp-fade-up 240ms ease" }}>
                  <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--ok-soft)", color: "var(--ok)", display: "grid", placeItems: "center", margin: "0 auto 14px" }}><Icon name="check" size={30} stroke={2.4} /></div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--text)" }}>Federated with {alias || wk?.displayName}</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Request sent and accepted. The peer is now on your map.</div>
                </div>
              ) : connecting ? (
                <div>
                  <div style={{ width: 52, height: 52, margin: "8px auto 14px", color: "var(--accent)" }}><Icon name="refresh" size={52} style={{ animation: "ogp-spin 0.8s linear infinite" }} /></div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Sending federation request…</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-faint)", marginTop: 4, fontFamily: "var(--font-mono)" }}>ogp federation request {url}</div>
                </div>
              ) : (
                <div style={{ width: "100%", textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, background: "var(--panel-2)", border: "1px solid var(--border)", marginBottom: 10 }}>
                    <Avatar name={wk?.org || url} size={42} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{alias || wk?.displayName}</div>
                      <Mono>{url.replace("https://", "")}</Mono>
                    </div>
                  </div>
                  <Field label="Scopes to grant"><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{[...sel].map((i) => <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent-ink)", fontFamily: "var(--font-mono)" }}>{i}</span>)}</div></Field>
                </div>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        {!done && (
          <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
            {idx > 0 && !connecting && <Button variant="ghost" icon="chevronLeft" onClick={back}>Back</Button>}
            <div style={{ flex: 1 }} />
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!canNext || connecting} icon={step === "connect" ? "link" : undefined} iconRight={step === "connect" ? undefined : "chevronRight"} onClick={next}>
              {step === "connect" ? "Send request" : "Continue"}
            </Button>
          </div>
        )}
        {done && <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}><Button variant="primary" onClick={onClose}>Done</Button></div>}
      </div>
    </div>
  );
}

window.AddGatewayModal = AddGatewayModal;
