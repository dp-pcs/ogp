// app/peers.jsx — peer display: list row, card, pending request, detail panel.
const { useState: useStateP } = React;

function IntentChips({ intents, max = 4 }) {
  if (!intents || !intents.length) return <span style={{ fontSize: 12, color: "var(--text-faint)" }}>no scopes</span>;
  const show = intents.slice(0, max), extra = intents.length - max;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {show.map((i) => (
        <span key={i} style={{
          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
          background: "var(--panel-3)", color: "var(--text-muted)", fontFamily: "var(--font-mono)",
        }}>{i}</span>
      ))}
      {extra > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "var(--panel-3)", color: "var(--text-faint)" }}>+{extra}</span>}
    </div>
  );
}

function grantedIntents(p) { return p.grantedScopes ? p.grantedScopes.scopes.map((s) => s.intent) : []; }
function peerTone(p) { return p.status === "pending" ? "warn" : p.healthy === false ? "danger" : "ok"; }

// ── List row ─────────────────────────────────────────────────────
function PeerRow({ p, onSelect, selected, onMessage }) {
  const tone = peerTone(p);
  const [h, setH] = useStateP(false);
  return (
    <div onClick={() => onSelect(p.id)} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: "flex", alignItems: "center", gap: 13, padding: "12px 14px", cursor: "pointer",
        background: selected ? "var(--accent-soft)" : h ? "var(--panel-2)" : "transparent",
        borderRadius: 10, transition: "background 130ms ease", borderLeft: selected ? "3px solid var(--accent)" : "3px solid transparent",
      }}>
      <Avatar name={p.org || p.displayName} size={38} tone={tone === "danger" ? "danger" : undefined} />
      <div style={{ minWidth: 0, flex: "1 1 200px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", whiteSpace: "nowrap" }}>{p.alias || p.displayName}</span>
          <StatusDot tone={tone} pulse={tone === "ok"} size={7} />
          {p.tags?.includes("trusted") && <Badge tone={undefined} icon="shieldCheck" style={{ padding: "1px 7px", fontSize: 10.5 }}>trusted</Badge>}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.gatewayUrl.replace("https://", "")}</div>
      </div>
      <div style={{ flex: "1 1 160px", minWidth: 0 }}><IntentChips intents={grantedIntents(p)} max={3} /></div>
      <div style={{ width: 80, textAlign: "right", flexShrink: 0 }}>
        {tone === "danger"
          ? <span style={{ fontSize: 12, fontWeight: 600, color: "var(--danger)" }}>offline</span>
          : <Sparkline data={p.msgTrend} w={68} h={22} color={`var(--${tone === "warn" ? "warn" : "accent"})`} />}
      </div>
      <div style={{ width: 70, textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>{relTime(p.lastSeenAt)}</div>
      </div>
      <Icon name="chevronRight" size={16} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────
function PeerCard({ p, onSelect, selected, onMessage }) {
  const tone = peerTone(p);
  return (
    <Card hover onClick={() => onSelect(p.id)} pad={16}
      style={{ borderColor: selected ? "color-mix(in srgb, var(--accent) 40%, var(--border))" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
        <Avatar name={p.org || p.displayName} size={42} tone={tone === "danger" ? "danger" : undefined} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{p.alias || p.displayName}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{p.org} · {p.human}</div>
        </div>
        <Badge tone={tone}>{tone === "danger" ? "unhealthy" : tone === "warn" ? "pending" : "healthy"}</Badge>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 4 }}>Messages</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-display)" }}>{p.messages ?? 0}</div>
        </div>
        <Sparkline data={p.msgTrend} w={92} h={34} color={tone === "danger" ? "var(--danger)" : "var(--accent)"} />
      </div>
      <IntentChips intents={grantedIntents(p)} max={4} />
      <div style={{ display: "flex", gap: 7, marginTop: 13 }}>
        <Button variant="soft" size="sm" icon="send" full onClick={(e) => { e.stopPropagation(); onMessage?.(p); }}>Message</Button>
        <Button variant="outline" size="sm" icon="chevronRight" onClick={() => onSelect(p.id)} />
      </div>
    </Card>
  );
}

// ── Pending request card ─────────────────────────────────────────
function PendingCard({ p, onApprove, onReject, allIntents }) {
  const [sel, setSel] = useStateP(new Set(p.offeredIntents?.includes("agent-comms") ? ["message", "agent-comms"] : ["message"]));
  const offered = p.offeredIntents || ["message"];
  const toggle = (i) => setSel((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  return (
    <Card pad={16} style={{ borderColor: "color-mix(in srgb, var(--warn) 40%, var(--border))", background: "color-mix(in srgb, var(--warn-soft) 50%, var(--panel))" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--warn-soft)", color: "var(--warn)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon name="inbox" size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{p.displayName}</span>
            <Badge tone="warn">wants to federate</Badge>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{p.gatewayUrl.replace("https://", "")} · {relTime(p.requestedAt)}</div>
        </div>
      </div>

      {p.personas?.length > 0 && (
        <div style={{ marginTop: 13, paddingTop: 13, borderTop: "1px solid var(--border-soft)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 7 }}>Advertised agents</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {p.personas.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {a.role === "primary" ? <Icon name="sparkle" size={14} style={{ color: "var(--accent)" }} /> : <Icon name="dot" size={10} style={{ color: "var(--text-faint)" }} />}
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{a.displayName}</span>
                {a.description && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>— {a.description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 13 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 7 }}>Grant scopes</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {offered.map((i) => {
            const on = sel.has(i);
            return (
              <button key={i} onClick={() => toggle(i)} style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, cursor: "pointer",
                fontSize: 12.5, fontWeight: 600, fontFamily: "var(--font-mono)",
                background: on ? "var(--accent-soft)" : "var(--panel-3)", color: on ? "var(--accent-ink)" : "var(--text-muted)",
                border: `1px solid ${on ? "color-mix(in srgb, var(--accent) 35%, transparent)" : "transparent"}`,
              }}>
                <Icon name={on ? "check" : "plus"} size={13} stroke={2.2} />{i}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 15 }}>
        <Button variant="solid" tone="ok" size="md" icon="check" full onClick={() => onApprove(p.id, [...sel])}>Approve</Button>
        <Button variant="danger" size="md" icon="x" onClick={() => onReject(p.id)}>Reject</Button>
      </div>
    </Card>
  );
}

// ── Detail panel (right slide-over) ──────────────────────────────
function PeerDetail({ p, onClose, onMessage, onRemove, onApprove, onReject, onPolicy }) {
  if (!p) return null;
  const tone = peerTone(p);
  const scopes = p.grantedScopes?.scopes || [];
  return (
    <div className="peer-detail" style={{
      width: 340, flexShrink: 0, background: "var(--panel)", borderLeft: "1px solid var(--border)",
      display: "flex", flexDirection: "column", animation: "ogp-fade-up 180ms ease", height: "100%",
    }}>
      <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 11 }}>
        <Avatar name={p.org || p.displayName} size={42} tone={tone === "danger" ? "danger" : undefined} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>{p.alias || p.displayName}</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{p.org} · {p.human}</div>
        </div>
        <IconBtn name="x" title="Close" onClick={onClose} />
      </div>

      <div className="scroll" style={{ flex: 1, overflow: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
        {p.status === "approved" && tone === "danger" && (
          <div style={{ display: "flex", gap: 10, padding: 12, borderRadius: 10, background: "var(--danger-soft)", border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)" }}>
            <Icon name="alertTriangle" size={18} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--danger)" }}>Connection unhealthy</div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>{p.issue}</div>
            </div>
          </div>
        )}

        <DetailBlock label="Status">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StatusDot tone={tone} pulse={tone === "ok"} />
            <span style={{ fontWeight: 600, fontSize: 13.5, color: `var(--${tone})` }}>
              {tone === "danger" ? "Unhealthy" : tone === "warn" ? "Pending approval" : "Healthy"}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--text-faint)" }}>seen {relTime(p.lastSeenAt)}</span>
          </div>
        </DetailBlock>

        {tone !== "warn" && (
          <div style={{ display: "flex", gap: 10 }}>
            <MiniStat label="Latency" value={p.latencyMs != null ? p.latencyMs + " ms" : "—"} tone={tone === "danger" ? "danger" : undefined} />
            <MiniStat label="Messages" value={p.messages ?? 0} />
          </div>
        )}

        <DetailBlock label="Gateway">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Mono style={{ flex: 1, wordBreak: "break-all" }}>{p.gatewayUrl}</Mono>
            <IconBtn name="external" title="Open" size={15} />
          </div>
        </DetailBlock>

        <DetailBlock label="Public key">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Mono style={{ flex: 1 }}>{p.publicKey}</Mono>
            <IconBtn name="copy" title="Copy" size={15} />
          </div>
        </DetailBlock>

        {p.status === "approved" ? (
          <DetailBlock label="Granted scopes">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {scopes.map((s) => (
                <div key={s.intent} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 9, background: "var(--panel-3)" }}>
                  <Icon name="check" size={14} style={{ color: "var(--ok)" }} stroke={2.4} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{s.intent}</span>
                  {s.rateLimit && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-faint)" }}>{s.rateLimit.requests}/{s.rateLimit.windowSeconds}s</span>}
                </div>
              ))}
              {scopes.some((s) => s.topics) && (
                <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>topics: {scopes.find((s) => s.topics)?.topics.join(", ")}</div>
              )}
            </div>
          </DetailBlock>
        ) : (
          <DetailBlock label="Offered intents"><IntentChips intents={p.offeredIntents} max={9} /></DetailBlock>
        )}

        {p.status === "approved" && grantedIntents(p).includes("agent-comms") && (
          <DetailBlock label="Agent-comms policy">
            <button onClick={() => onPolicy?.(p)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "var(--panel-3)", border: "1px solid var(--border-soft)", cursor: "pointer", textAlign: "left" }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="command" size={15} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{(p.commsPolicy?.topics?.length || 0)} topic rule{(p.commsPolicy?.topics?.length || 0) === 1 ? "" : "s"}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>default: {p.commsPolicy?.default || "summary"}</div>
              </div>
              <Icon name="chevronRight" size={15} style={{ color: "var(--text-faint)" }} />
            </button>
          </DetailBlock>
        )}
      </div>

      <div style={{ padding: 16, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
        {p.status === "pending" ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="solid" tone="ok" icon="check" full onClick={() => onApprove(p.id, ["message", "agent-comms"])}>Approve</Button>
            <Button variant="danger" icon="x" onClick={() => onReject(p.id)}>Reject</Button>
          </div>
        ) : (
          <>
            <Button variant="primary" icon="send" full onClick={() => onMessage?.(p)}>Send message</Button>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="outline" icon="command" full onClick={() => onPolicy?.(p)} disabled={!grantedIntents(p).includes("agent-comms")}>Comms policy</Button>
              <Button variant="danger" icon="trash" onClick={() => onRemove(p.id)} title="Remove peer" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DetailBlock({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}
function MiniStat({ label, value, tone }) {
  return (
    <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "var(--panel-3)" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-faint)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: tone ? `var(--${tone})` : "var(--text)", fontFamily: "var(--font-display)", marginTop: 2 }}>{value}</div>
    </div>
  );
}

Object.assign(window, { PeerRow, PeerCard, PendingCard, PeerDetail, IntentChips, grantedIntents, peerTone });
