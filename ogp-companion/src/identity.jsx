// app/identity.jsx — native Edit Identity modal. Replaces the Terminal hand-off:
// edits how peers see you (agent / human / organization), persisted via
// `ogp config set-identity --agent-name … --human-name … --organization …`.
const { useState: useStateId } = React;

function EditIdentityModal({ framework, identity, onClose, onSave }) {
  const [agent, setAgent] = useStateId(identity.agent || "");
  const [human, setHuman] = useStateId(identity.human === "—" ? "" : (identity.human || ""));
  const [org, setOrg] = useStateId(identity.org || "");
  const [saving, setSaving] = useStateId(false);

  const idInput = {
    width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid var(--border)",
    background: "var(--panel-2)", color: "var(--text)", fontSize: 14, fontFamily: "var(--font-sans)", outline: "none",
  };

  const dirty =
    agent.trim() !== (identity.agent || "") ||
    human.trim() !== (identity.human === "—" ? "" : (identity.human || "")) ||
    org.trim() !== (identity.org || "");

  function save() {
    setSaving(true);
    Promise.resolve(onSave({ agent: agent.trim(), human: human.trim(), org: org.trim() }))
      .finally(() => { setSaving(false); onClose(); });
  }

  const cmd = `ogp --for ${framework.id} config set-identity` +
    (agent.trim() ? ` --agent-name "${agent.trim()}"` : "") +
    (human.trim() ? ` --human-name "${human.trim()}"` : "") +
    (org.trim() ? ` --organization "${org.trim()}"` : "");

  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 200, background: "rgba(10,6,24,0.5)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", animation: "ogp-fade-up 160ms ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: "92%", background: "var(--panel)", borderRadius: 18, boxShadow: "var(--shadow-pop)", border: "1px solid var(--border)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "90%" }}>
        {/* header */}
        <div style={{ padding: "18px 22px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <Avatar name={agent || "?"} size={40} />
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700, color: "var(--text)" }}>Edit identity</div>
              <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>How peers see you on {framework.displayName}</div>
            </div>
          </div>
          <IconBtn name="x" title="Close" onClick={onClose} />
        </div>

        {/* body */}
        <div className="scroll" style={{ padding: "18px 22px 6px", overflow: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginBottom: 7 }}>Agent name</div>
            <input autoFocus value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="e.g. Junior" style={idInput} />
            <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 7 }}>Attributed on agent-comms messages.</div>
          </label>
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginBottom: 7 }}>Human operator</div>
            <input value={human} onChange={(e) => setHuman(e.target.value)} placeholder="e.g. David" style={idInput} />
          </label>
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", marginBottom: 7 }}>Organization</div>
            <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="e.g. latentgenius" style={idInput} />
          </label>

          <div style={{ fontSize: 11.5, color: "var(--text-faint)", fontFamily: "var(--font-mono)", padding: "9px 12px", borderRadius: 10, background: "var(--panel-3)", wordBreak: "break-all" }}>{cmd}</div>
        </div>

        {/* footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={saving ? "refresh" : "check"} disabled={!dirty || saving} onClick={save}>
            {saving ? "Saving…" : "Save identity"}
          </Button>
        </div>
      </div>
    </div>
  );
}

window.EditIdentityModal = EditIdentityModal;
