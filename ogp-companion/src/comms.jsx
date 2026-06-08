// app/comms.jsx — Message composer + per-peer agent-comms policy editor.
// Mirrors `ogp federation send/agent` and `ogp agent-comms configure`.
const { useState: useStateC } = React;

const cInput = {
  width: "100%", padding: "11px 13px", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--panel-2)", color: "var(--text)", fontSize: 14, fontFamily: "var(--font-sans)", outline: "none",
};

// response levels (ogp agent-comms)
const LEVELS = [
  { id: "full",     label: "Full",     tone: "ok",     desc: "Reply in full automatically" },
  { id: "summary",  label: "Summary",  tone: "accent", desc: "Reply with a short summary" },
  { id: "escalate", label: "Escalate", tone: "warn",   desc: "Surface to me before replying" },
  { id: "deny",     label: "Deny",     tone: "danger", desc: "Send a signed rejection" },
  { id: "off",      label: "Off",      tone: "faint",  desc: "Ignore — no response or log" },
];
const levelMeta = (id) => LEVELS.find((l) => l.id === id) || LEVELS[1];

// ── Modal shell ──────────────────────────────────────────────────
function Modal({ onClose, width = 540, children }) {
  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 200, background: "rgba(10,6,24,0.5)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", animation: "ogp-fade-up 160ms ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width, maxWidth: "92%", maxHeight: "90%", background: "var(--panel)", borderRadius: 18, boxShadow: "var(--shadow-pop)", border: "1px solid var(--border)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}
function ModalHeader({ peer, title, sub, onClose }) {
  return (
    <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
      {peer && <Avatar name={peer.org || peer.displayName} size={40} tone={peer.healthy === false ? "danger" : undefined} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: "var(--text)" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>{sub}</div>
      </div>
      <IconBtn name="x" title="Close" onClick={onClose} />
    </div>
  );
}

// ── Level dropdown ───────────────────────────────────────────────
function LevelDropdown({ value, onChange }) {
  const [open, setOpen] = useStateC(false);
  const m = levelMeta(value);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 11px", borderRadius: 999, cursor: "pointer",
        background: `var(--${m.tone}-soft, var(--panel-3))`, border: `1px solid color-mix(in srgb, var(--${m.tone}, var(--text-faint)) 28%, transparent)`,
        color: `var(--${m.tone}, var(--text-muted))`, fontSize: 12.5, fontWeight: 700, minWidth: 108, justifyContent: "space-between",
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><StatusDot tone={m.tone === "faint" ? "warn" : m.tone} size={6} />{m.label}</span>
        <Icon name="chevronDown" size={13} style={{ opacity: 0.7 }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div style={{ position: "absolute", top: "calc(100% + 5px)", right: 0, zIndex: 30, width: 230, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-pop)", padding: 6 }}>
            {LEVELS.map((l) => (
              <button key={l.id} onClick={() => { onChange(l.id); setOpen(false); }} style={{
                width: "100%", display: "flex", alignItems: "flex-start", gap: 9, padding: "8px 9px", border: "none", borderRadius: 8, cursor: "pointer", textAlign: "left",
                background: l.id === value ? "var(--accent-soft)" : "transparent",
              }}>
                <StatusDot tone={l.tone === "faint" ? "warn" : l.tone} size={8} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{l.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{l.desc}</div>
                </div>
                {l.id === value && <Icon name="check" size={14} style={{ color: "var(--accent)" }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Message composer ─────────────────────────────────────────────
function MessageComposer({ peer, onClose, onSend }) {
  const canAgent = (peer.grantedScopes?.scopes || []).some((s) => s.intent === "agent-comms");
  // The outbound topic (`ogp federation agent <topic>`) is FREE-FORM — your side
  // doesn't validate it and there's no accept handshake. The peer's doorman may
  // 403 a topic only if THEY restricted the agent-comms scope they granted you.
  // So this is a combobox: type any topic, with suggestions drawn from topics
  // you've already touched for this peer (response-policy rules you've set +
  // any topics on their granted scope). Suggestions are hints, not a closed set.
  const scopeTopics = (peer.grantedScopes?.scopes || []).find((s) => s.intent === "agent-comms")?.topics || [];
  const policyTopics = (peer.commsPolicy?.topics || []).map((t) => t.topic);
  const topics = Array.from(new Set(["general", ...policyTopics, ...scopeTopics])).filter(Boolean);
  const [mode, setMode] = useStateC(canAgent ? "agent-comms" : "message");
  const [topic, setTopic] = useStateC(topics[0] || "general");
  const [priority, setPriority] = useStateC("normal");
  const [wait, setWait] = useStateC(false);
  const [text, setText] = useStateC("");
  const offline = peer.healthy === false;

  const cmd = mode === "agent-comms"
    ? `ogp federation agent ${peer.alias || "peer"} ${topic} "${text || "…"}"${priority !== "normal" ? ` --priority ${priority}` : ""}${wait ? " --wait" : ""}`
    : `ogp federation send ${peer.alias || "peer"} message '{"text":"${text || "…"}"}'`;

  function send() {
    onSend(peer, { intent: mode, topic, priority, wait, text });
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <ModalHeader peer={peer} title={`Message ${peer.alias || peer.displayName}`} sub={peer.gatewayUrl.replace("https://", "")} onClose={onClose} />
      <div className="scroll" style={{ padding: 20, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 16 }}>
        {offline && (
          <div style={{ display: "flex", gap: 9, alignItems: "center", padding: "10px 12px", borderRadius: 10, background: "var(--danger-soft)", border: "1px solid color-mix(in srgb, var(--danger) 26%, transparent)" }}>
            <Icon name="alertTriangle" size={16} style={{ color: "var(--danger)", flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>This peer is unhealthy — the message will queue and deliver once it reconnects.</span>
          </div>
        )}

        {canAgent && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Channel</div>
            <Segmented value={mode} onChange={setMode} size="sm" options={[
              { value: "agent-comms", label: "Agent-comms", icon: "command" },
              { value: "message", label: "Plain message", icon: "send" },
            ]} />
          </div>
        )}

        {mode === "agent-comms" && (
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Topic</div>
              <input list="composer-topics" value={topic} onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. debugging" style={cInput} />
              <datalist id="composer-topics">
                {topics.map((t) => <option key={t} value={t} />)}
              </datalist>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                Any topic — the peer may reject it if they've restricted their agent-comms scope.
              </div>
            </div>
            <div style={{ width: 196 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Priority</div>
              <Segmented value={priority} onChange={setPriority} size="sm" options={["low", "normal", "high"]} />
            </div>
          </div>
        )}

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>{mode === "agent-comms" ? "Message to agent" : "Message"}</div>
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={4}
            placeholder={mode === "agent-comms" ? "e.g. What's the status of the migration cutover?" : "Type a message…"}
            style={{ ...cInput, resize: "vertical", lineHeight: 1.5 }} />
        </div>

        {mode === "agent-comms" && (
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <Switch checked={wait} onChange={setWait} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Wait for reply</div>
              <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>Block until the peer's agent responds (30s timeout).</div>
            </div>
          </label>
        )}

        <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--panel-3)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="terminal" size={14} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
          <Mono style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cmd}</Mono>
        </div>
      </div>
      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon="send" disabled={!text.trim()} onClick={send}>{wait ? "Send & wait" : "Send"}</Button>
      </div>
    </Modal>
  );
}

// ── Agent-comms policy editor ────────────────────────────────────
function AgentCommsModal({ peer, onClose, onSave }) {
  const init = peer.commsPolicy || { default: "summary", topics: [] };
  const [def, setDef] = useStateC(init.default);
  const [rows, setRows] = useStateC(init.topics.map((t) => ({ ...t })));
  const [newTopic, setNewTopic] = useStateC("");

  function addTopic() {
    const t = newTopic.trim();
    if (!t || rows.some((r) => r.topic === t)) return;
    setRows([...rows, { topic: t, level: "summary", notes: "" }]);
    setNewTopic("");
  }
  function save() { onSave(peer.id, { default: def, topics: rows }); onClose(); }

  return (
    <Modal onClose={onClose} width={560}>
      <ModalHeader peer={peer} title="Response policies" sub={`How ${peer.agent || peer.alias} replies to your agent`} onClose={onClose} />
      <div className="scroll" style={{ padding: 20, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* default */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 12, background: "var(--panel-2)", border: "1px solid var(--border)" }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="shield" size={17} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>Default for unknown topics</div>
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Applied when no rule below matches</div>
          </div>
          <LevelDropdown value={def} onChange={setDef} />
        </div>

        {/* topics */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 9 }}>Topic rules</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.length === 0 && <div style={{ fontSize: 13, color: "var(--text-faint)", padding: "4px 2px" }}>No per-topic rules — the default applies to everything.</div>}
            {rows.map((r, i) => (
              <div key={r.topic} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 11, background: "var(--panel-2)", border: "1px solid var(--border)" }}>
                <Icon name="command" size={15} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
                <span style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{r.topic}</span>
                <LevelDropdown value={r.level} onChange={(lvl) => setRows(rows.map((x, j) => j === i ? { ...x, level: lvl } : x))} />
                <IconBtn name="trash" size={15} title="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="add a topic, e.g. deployment"
              onKeyDown={(e) => { if (e.key === "Enter") addTopic(); }} style={{ ...cInput, flex: 1, fontFamily: "var(--font-mono)", fontSize: 13 }} />
            <Button variant="soft" icon="plus" disabled={!newTopic.trim()} onClick={addTopic}>Add</Button>
          </div>
        </div>

        {/* legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "12px 14px", borderRadius: 10, background: "var(--panel-3)" }}>
          {LEVELS.map((l) => (
            <span key={l.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-muted)" }}>
              <StatusDot tone={l.tone === "faint" ? "warn" : l.tone} size={7} /><b style={{ color: "var(--text)" }}>{l.label}</b> — {l.desc.toLowerCase()}
            </span>
          ))}
        </div>

        <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--panel-3)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="terminal" size={14} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
          <Mono style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            ogp agent-comms configure {peer.alias || "peer"} --level {def}{rows.length ? ` · ${rows.length} topic rule${rows.length > 1 ? "s" : ""}` : ""}
          </Mono>
        </div>
      </div>
      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon="check" onClick={save}>Save policies</Button>
      </div>
    </Modal>
  );
}

Object.assign(window, { MessageComposer, AgentCommsModal, LEVELS, levelMeta });
