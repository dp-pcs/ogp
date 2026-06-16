// app/apps.jsx — OGP Apps: Gallery / Installed / Usage, App Detail slide-over,
// Install Consent modal. Drop-in companion view; ctx-driven, follows existing
// conventions (PageHeader/PageBody, Card/Button/Empty/Segmented, PeerDetail
// slide-over pattern, showToast feedback).
const { useState: useStateApps, useMemo: useMemoApps } = React;

function appFingerprint(key) {
  if (!key) return "—";
  const head = (key.slice(0, 8).match(/../g) || []).join(" ");
  return `${head} … ${key.slice(-4)}`;
}
function appIsTrusted(ctx, manifest) {
  const k = manifest?.publisher?.key;
  return !!k && (ctx.apps.trustedKeys?.has?.(k) || false);
}
function appAdvertisers(ctx, id) {
  const out = [];
  for (const grp of ctx.apps.browse || []) {
    if (grp.apps.some((a) => a.manifest.id === id)) out.push(ctx.apps.peers?.[grp.peerId] || { id: grp.peerId, alias: grp.peerId });
  }
  return out;
}
function appRef(ctx, id) {
  const ads = appAdvertisers(ctx, id);
  return ads.length ? `peer:${ads[0].id}/${id}` : `file:./${id}/ogp-app.json`;
}
function appNum(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(n); }

function AppMark({ name, size = 42 }) { return <Avatar name={name} size={size} square />; }

function PublisherLine({ ctx, manifest, size = 11.5 }) {
  const trusted = appIsTrusted(ctx, manifest);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: size, color: "var(--text-faint)", minWidth: 0 }}>
      <Icon name={trusted ? "shieldCheck" : "alertCircle"} size={13} style={{ color: trusted ? "var(--ok)" : "var(--warn)", flexShrink: 0 }} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{manifest.publisher?.name || "Unknown publisher"}</span>
    </span>
  );
}

function AppDetailBlock({ label, count, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-faint)" }}>{label}</span>
        {count != null && <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-faint)" }}>· {count}</span>}
      </div>
      {children}
    </div>
  );
}

function UsageBars({ byIntent }) {
  const entries = Object.entries(byIntent || {});
  if (!entries.length) return <div style={{ fontSize: 12.5, color: "var(--text-faint)" }}>No attributed calls yet.</div>;
  const top = Math.max(...entries.map(([, n]) => n), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {entries.sort((a, b) => b[1] - a[1]).map(([intent, n]) => (
        <div key={intent}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{intent}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{appNum(n)}</span>
          </div>
          <div style={{ height: 7, borderRadius: 99, background: "var(--panel-3)", overflow: "hidden" }}>
            <div style={{ width: `${(n / top) * 100}%`, height: "100%", borderRadius: 99, background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── GALLERY ──────────────────────────────────────────────────────
function GalleryCard({ ctx, ad, installed, onOpen, onInstall }) {
  const m = ad.manifest;
  const advs = appAdvertisers(ctx, m.id);
  return (
    <Card hover onClick={() => onOpen(m.id)} pad={16} style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <AppMark name={m.name} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>v{m.version}</span>
          </div>
          <PublisherLine ctx={ctx} manifest={m} />
        </div>
        {installed && <Badge tone="ok" icon="check">Installed</Badge>}
      </div>
      <div style={{ fontSize: 12.8, color: "var(--text-muted)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 38 }}>{m.description}</div>
      <IntentChips intents={m.uses_intents} max={3} />
      <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--border-soft)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-faint)", flex: 1, minWidth: 0 }}>
          <Icon name="signal" size={13} style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{advs.length ? `via ${advs.map((p) => p.alias).join(", ")}` : "local"}</span>
        </span>
        {installed
          ? <Button variant="ghost" size="sm" iconRight="chevronRight" onClick={(e) => { e.stopPropagation(); onOpen(m.id); }}>Details</Button>
          : <Button variant="pink" size="sm" icon="download" onClick={(e) => { e.stopPropagation(); onInstall(m.id); }}>Install</Button>}
      </div>
    </Card>
  );
}

function GalleryRow({ ctx, ad, installed, onOpen, onInstall, last }) {
  const m = ad.manifest;
  const advs = appAdvertisers(ctx, m.id);
  const [h, setH] = useStateApps(false);
  return (
    <div onClick={() => onOpen(m.id)} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px", cursor: "pointer", borderRadius: 10, background: h ? "var(--panel-2)" : "transparent", borderBottom: last ? "none" : "1px solid var(--border-soft)" }}>
      <AppMark name={m.name} size={38} />
      <div style={{ minWidth: 0, flex: "1 1 230px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{m.name}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>v{m.version}</span>
          {installed && <Badge tone="ok" icon="check" style={{ padding: "1px 7px", fontSize: 10.5 }}>Installed</Badge>}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.description}</div>
      </div>
      <div style={{ flex: "1 1 150px", minWidth: 0 }}><IntentChips intents={m.uses_intents} max={2} /></div>
      <div style={{ width: 120, minWidth: 0, display: "flex", alignItems: "center", gap: 6, color: "var(--text-faint)", fontSize: 11.5 }}>
        <Icon name="signal" size={13} /><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{advs.map((p) => p.alias).join(", ") || "local"}</span>
      </div>
      {installed
        ? <Icon name="chevronRight" size={16} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
        : <Button variant="pink" size="sm" icon="download" onClick={(e) => { e.stopPropagation(); onInstall(m.id); }}>Install</Button>}
    </div>
  );
}

function AppsGallery({ ctx, installedIds, layout, setLayout, onOpen, onInstall, setRoute }) {
  const [query, setQuery] = useStateApps("");
  const [peerFilter, setPeerFilter] = useStateApps("all");
  const browse = ctx.apps.browse || [];
  const peersConnected = (ctx.peers || []).filter((p) => p.status === "approved").length > 0
    || Object.keys(ctx.apps.peers || {}).length > 0;

  const ads = useMemoApps(() => {
    const seen = new Set(); const out = [];
    for (const grp of browse) {
      if (peerFilter !== "all" && grp.peerId !== peerFilter) continue;
      for (const a of grp.apps) { if (!seen.has(a.manifest.id)) { seen.add(a.manifest.id); out.push(a); } }
    }
    return out;
  }, [browse, peerFilter]);

  const filtered = ads.filter((a) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return a.manifest.name.toLowerCase().includes(q) || (a.manifest.description || "").toLowerCase().includes(q);
  });

  const peerOpts = [{ value: "all", label: "All peers" }, ...browse.map((g) => ({ value: g.peerId, label: (ctx.apps.peers?.[g.peerId]?.alias) || g.peerId }))];
  const totalAds = browse.reduce((n, g) => n + g.apps.length, 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 220px", minWidth: 180, padding: "0 12px", height: 38, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 999, boxShadow: "var(--shadow-card)" }}>
          <Icon name="search" size={16} style={{ color: "var(--text-faint)" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search apps…" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: 13.5, color: "var(--text)" }} />
        </div>
        {totalAds > 0 && <Segmented size="sm" value={peerFilter} onChange={setPeerFilter} options={peerOpts} />}
        <Segmented size="sm" value={layout} onChange={setLayout} options={[{ value: "grid", icon: "overview" }, { value: "list", icon: "filter" }]} />
      </div>

      {!peersConnected && (
        <Empty icon="federation" title="Connect to peers to discover apps"
          sub="Apps are advertised by the peers you've federated with. Approve a peer, then anything they publish shows up here."
          action={<Button variant="primary" icon="federation" onClick={() => setRoute("federation")}>Go to Federation</Button>} />
      )}
      {peersConnected && totalAds === 0 && (
        <Empty icon="inbox" title="No apps advertised by your peers"
          sub="Your peers are connected but none are advertising apps right now." />
      )}
      {peersConnected && totalAds > 0 && filtered.length === 0 && (
        <Empty icon="search" title="No apps match" sub="Try a different search or peer filter." />
      )}

      {filtered.length > 0 && (
        layout === "grid"
          ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(252px, 1fr))", gap: 14 }}>
              {filtered.map((a) => <GalleryCard key={a.manifest.id} ctx={ctx} ad={a} installed={installedIds.has(a.manifest.id)} onOpen={onOpen} onInstall={onInstall} />)}
            </div>
          : <Card pad={6}>{filtered.map((a, i) => <GalleryRow key={a.manifest.id} ctx={ctx} ad={a} installed={installedIds.has(a.manifest.id)} onOpen={onOpen} onInstall={onInstall} last={i === filtered.length - 1} />)}</Card>
      )}
    </div>
  );
}

// ── INSTALLED ────────────────────────────────────────────────────
function InstalledRow({ ctx, app, usage, onOpen, onRemove, last }) {
  const m = app.manifest;
  const [h, setH] = useStateApps(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={() => onOpen(m.id)}
      style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 12px", borderRadius: 10, cursor: "pointer", background: h ? "var(--panel-2)" : "transparent", borderBottom: last ? "none" : "1px solid var(--border-soft)" }}>
      <AppMark name={m.name} size={40} />
      <div style={{ minWidth: 0, flex: "1 1 200px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontWeight: 700, fontSize: 14.5, color: "var(--text)" }}>{m.name}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>v{m.version}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-faint)" }}>
          <PublisherLine ctx={ctx} manifest={m} /><span>· installed {relTime(app.installedAt)}</span>
        </div>
      </div>
      <div style={{ flex: "1 1 150px", minWidth: 0 }}><IntentChips intents={m.uses_intents} max={2} /></div>
      <div style={{ width: 92, textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-display)", lineHeight: 1 }}>{appNum(usage?.totalCalls || 0)}</div>
        <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 2 }}>calls</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        {m.published_output && <IconBtn name="external" title="Open published output" size={15} onClick={() => window.open(m.published_output, "_blank")} />}
        <IconBtn name="trash" title="Remove" size={15} onClick={() => onRemove(m.id)} />
        <Icon name="chevronRight" size={16} style={{ color: "var(--text-faint)" }} onClick={() => onOpen(m.id)} />
      </div>
    </div>
  );
}

function AppsInstalled({ ctx, installed, usageFor, onOpen, onRemove, setSub }) {
  const [sort, setSort] = useStateApps("recent");
  const sorted = [...installed].sort((a, b) => {
    if (sort === "name") return a.manifest.name.localeCompare(b.manifest.name);
    if (sort === "usage") return (usageFor(b.id)?.totalCalls || 0) - (usageFor(a.id)?.totalCalls || 0);
    return new Date(b.installedAt) - new Date(a.installedAt);
  });
  if (!installed.length) {
    return <Empty icon="inbox" title="No apps installed yet"
      sub="Browse the gallery to install an app advertised by one of your peers."
      action={<Button variant="primary" icon="search" onClick={() => setSub("gallery")}>Browse the gallery</Button>} />;
  }
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>{installed.length} app{installed.length === 1 ? "" : "s"} on this machine</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>Sort</span>
        <Segmented size="sm" value={sort} onChange={setSort} options={[{ value: "recent", label: "Recent" }, { value: "name", label: "Name" }, { value: "usage", label: "Usage" }]} />
      </div>
      <Card pad={6}>{sorted.map((app, i) => <InstalledRow key={app.id} ctx={ctx} app={app} usage={usageFor(app.id)} onOpen={onOpen} onRemove={onRemove} last={i === sorted.length - 1} />)}</Card>
    </div>
  );
}

// ── USAGE ────────────────────────────────────────────────────────
function AppsUsage({ ctx, installed, usageFor, onOpen, setSub }) {
  if (!installed.length) {
    return <Empty icon="activity" title="No usage to show"
      sub="Install an app and OGP will start attributing the intent calls your daemon observes to it."
      action={<Button variant="primary" icon="search" onClick={() => setSub("gallery")}>Browse the gallery</Button>} />;
  }
  const rows = installed.map((a) => ({ app: a, u: usageFor(a.id) || { totalCalls: 0, byIntent: {}, latestAttributable: null, ambiguous: false, sharedIntents: [] } }));
  const totalCalls = rows.reduce((s, r) => s + (r.u.totalCalls || 0), 0);
  const shared = new Set(); rows.forEach((r) => (r.u.sharedIntents || []).forEach((i) => shared.add(i)));
  return (
    <div>
      <Card pad={14} style={{ marginBottom: 16, background: "var(--panel-2)" }}>
        <div style={{ display: "flex", gap: 11 }}>
          <Icon name="info" size={17} style={{ color: "var(--text-faint)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 }}>
            Attribution starts the moment an app is installed — there's <b style={{ color: "var(--text)" }}>no backfill</b>. Calls map from daemon-observed intents back to apps via <span style={{ fontFamily: "var(--font-mono)" }}>uses_intents</span> / <span style={{ fontFamily: "var(--font-mono)" }}>uses_projects</span>.
          </div>
        </div>
      </Card>
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <StatTile label="Attributed calls" value={appNum(totalCalls)} icon="activity" tone="accent" />
        <StatTile label="Apps tracked" value={installed.length} icon="overview" />
        <StatTile label="Shared intents" value={shared.size} unit={shared.size === 1 ? "intent" : "intents"} icon="command" tone={shared.size ? "warn" : undefined} />
      </div>
      <div className="grid-2" style={{ alignItems: "start" }}>
        {rows.sort((a, b) => (b.u.totalCalls || 0) - (a.u.totalCalls || 0)).map(({ app, u }) => (
          <Card key={app.id} pad={18} hover onClick={() => onOpen(app.id)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <AppMark name={app.manifest.name} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{app.manifest.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>last call {relTime(u.latestAttributable)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--text)", lineHeight: 1 }}>{appNum(u.totalCalls || 0)}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-faint)" }}>total calls</div>
              </div>
            </div>
            <UsageBars byIntent={u.byIntent} />
            {u.ambiguous && (
              <div style={{ display: "flex", gap: 8, padding: "9px 11px", borderRadius: 9, background: "var(--warn-soft)", border: "1px solid color-mix(in srgb, var(--warn) 26%, transparent)" }}>
                <Icon name="command" size={15} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.45 }}>Shares <b style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{u.sharedIntents.join(", ")}</b> with another app — counted for both where <span style={{ fontFamily: "var(--font-mono)" }}>projectId</span> can't disambiguate.</div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── DETAIL slide-over ────────────────────────────────────────────
function AppTrust({ ctx, manifest }) {
  const trusted = appIsTrusted(ctx, manifest);
  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10, background: trusted ? "var(--ok-soft)" : "var(--warn-soft)", border: `1px solid color-mix(in srgb, var(--${trusted ? "ok" : "warn"}) 28%, transparent)` }}>
      <Icon name={trusted ? "shieldCheck" : "alertTriangle"} size={18} style={{ color: `var(--${trusted ? "ok" : "warn"})`, flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: trusted ? "var(--ok)" : "var(--warn)" }}>{trusted ? `Verified by ${manifest.publisher?.name}` : "Unknown publisher"}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1, lineHeight: 1.45 }}>{trusted ? "The publisher key matches a peer you've federated with." : "This key isn't in your trusted peers. Only install if you recognize the source."}</div>
      </div>
    </div>
  );
}

function AppDetail({ ctx, view, onClose, onInstall, onRemove }) {
  if (!view) return null;
  const { manifest: m, installed, app, usage, advertisers } = view;
  const projects = m.uses_projects || [], skills = m.installs_skills || [];
  return (
    <div className="peer-detail" style={{ width: 360, flexShrink: 0, background: "var(--panel)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", height: "100%", animation: "ogp-fade-up 180ms ease" }}>
      <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
        <AppMark name={m.name} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>v{m.version}</span>
          </div>
          <PublisherLine ctx={ctx} manifest={m} size={12} />
        </div>
        <IconBtn name="x" title="Close" onClick={onClose} />
      </div>
      <div className="scroll" style={{ flex: 1, overflow: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 17 }}>
        <AppDetailBlock label="Status">
          {installed
            ? <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><Badge tone="ok" icon="check">Installed · v{m.version}</Badge><span style={{ fontSize: 12, color: "var(--text-faint)" }}>installed {relTime(app.installedAt)}</span></div>
            : <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><Badge tone="warn">Not installed</Badge>{advertisers.length > 0 && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>advertised by {advertisers.map((p) => p.alias).join(", ")}</span>}</div>}
          {installed && <div style={{ marginTop: 8 }}><Mono style={{ fontSize: 11.5, wordBreak: "break-all" }}>{app.source}</Mono></div>}
        </AppDetailBlock>
        <AppDetailBlock label="Publisher">
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <AppTrust ctx={ctx} manifest={m} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Mono style={{ flex: 1, fontSize: 12 }}>{appFingerprint(m.publisher?.key)}</Mono>
              <IconBtn name="copy" title="Copy key" size={14} onClick={() => navigator.clipboard?.writeText(m.publisher?.key || "")} />
            </div>
          </div>
        </AppDetailBlock>
        <AppDetailBlock label="About"><div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55 }}>{m.description}</div></AppDetailBlock>
        <AppDetailBlock label="Uses intents" count={m.uses_intents.length}><IntentChips intents={m.uses_intents} max={9} /></AppDetailBlock>
        <AppDetailBlock label="Uses projects" count={projects.length || undefined}>
          {projects.length ? <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{projects.map((p) => {
            const status = installed ? (app.projectJoinStatus?.[p] || "not-joined") : "—"; const joined = status === "joined";
            return <div key={p} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 9, background: "var(--panel-3)" }}>
              <Icon name="network" size={15} style={{ color: "var(--accent)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600, color: "var(--text)", flex: 1 }}>{p}</span>
              {installed && <Badge tone={joined ? "ok" : undefined} style={joined ? {} : { background: "var(--panel-2)", color: "var(--text-faint)", borderColor: "var(--border)" }}>{joined ? "joined" : "not joined"}</Badge>}
            </div>;
          })}</div> : <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>No projects.</span>}
        </AppDetailBlock>
        <AppDetailBlock label="Installs skills" count={skills.length}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{skills.map((s) => {
            const done = installed && (app.installedSkills || []).includes(s.name);
            return <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 9, background: "var(--panel-3)" }}>
              <Icon name="command" size={15} style={{ color: done ? "var(--ok)" : "var(--text-muted)" }} />
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{s.name}</div><Mono style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{s.install}</Mono></div>
              {installed && <Icon name={done ? "check" : "dot"} size={done ? 15 : 9} style={{ color: done ? "var(--ok)" : "var(--text-faint)" }} stroke={2.4} />}
            </div>;
          })}</div>
        </AppDetailBlock>
        <AppDetailBlock label="Published output">
          {m.published_output
            ? <a href={m.published_output} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 9, background: "var(--panel-3)", textDecoration: "none", color: "var(--accent-ink)" }}>
                <Icon name="globe" size={15} style={{ color: "var(--accent)" }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.published_output.replace("https://", "")}</span>
                <Icon name="external" size={14} style={{ color: "var(--text-faint)" }} />
              </a>
            : <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>This app owns no external surface.</span>}
        </AppDetailBlock>
        {installed && (
          <AppDetailBlock label="Usage">
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--text)", lineHeight: 1 }}>{appNum(usage?.totalCalls || 0)}</span>
              <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>calls · last {relTime(usage?.latestAttributable)}</span>
            </div>
            <UsageBars byIntent={usage?.byIntent} />
          </AppDetailBlock>
        )}
      </div>
      <div style={{ padding: 16, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
        {installed
          ? <>
              {m.published_output
                ? <Button variant="outline" icon="external" full onClick={() => window.open(m.published_output, "_blank")}>Open output</Button>
                : <Button variant="outline" icon="terminal" full onClick={() => ctx.actions.openTerminal?.()}>Open in Terminal</Button>}
              <Button variant="danger" icon="trash" onClick={() => onRemove(m.id)} title="Remove app" />
            </>
          : <Button variant="pink" icon="download" full onClick={() => onInstall(m.id)}>Install {m.name}</Button>}
      </div>
    </div>
  );
}

// ── CONSENT modal ────────────────────────────────────────────────
function ConsentSection({ icon, label, tone = "accent", children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: `var(--${tone}-soft)`, color: `var(--${tone})`, display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name={icon} size={14} /></div>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{label}</span>
      </div>
      <div style={{ paddingLeft: 34 }}>{children}</div>
    </div>
  );
}

function ConsentModal({ ctx, pending, onCancel, onConfirm }) {
  const [busy, setBusy] = useStateApps(false);
  if (!pending) return null;
  const m = pending.manifest;
  const trusted = appIsTrusted(ctx, m);
  const cautious = pending.tone === "cautious";
  const skills = m.installs_skills || [], projects = m.uses_projects || [];
  function confirm() { setBusy(true); onConfirm(pending, () => setBusy(false)); }
  return (
    <div onClick={busy ? undefined : onCancel} style={{ position: "absolute", inset: 0, zIndex: 200, background: "color-mix(in srgb, var(--text) 38%, transparent)", display: "grid", placeItems: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="scroll" style={{ width: 500, maxWidth: "100%", maxHeight: "100%", overflow: "auto", background: "var(--panel)", borderRadius: 16, boxShadow: "var(--shadow-pop)", animation: "ogp-fade-up 180ms ease" }}>
        <div style={{ padding: "20px 22px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 13 }}>
          <AppMark name={m.name} size={46} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700, color: "var(--text)" }}>Install {m.name}?</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-faint)" }}>
              <span style={{ fontFamily: "var(--font-mono)" }}>v{m.version}</span><span>·</span><PublisherLine ctx={ctx} manifest={m} size={12.5} />
            </div>
          </div>
        </div>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          <AppTrust ctx={ctx} manifest={m} />
          <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55 }}>
            {cautious
              ? <>Installing runs <b style={{ color: "var(--text)" }}>publisher-provided scripts</b> on this machine and drops skills into your agent's skills directory. Review what {m.name} will add before continuing.</>
              : <>Here's what {m.name} will add to <b style={{ color: "var(--text)" }}>{pending.framework}</b> once installed.</>}
          </div>
          <ConsentSection icon="command" label={`Installs ${skills.length} skill${skills.length === 1 ? "" : "s"}`} tone={cautious ? "warn" : "accent"}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{skills.map((s) => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{s.name}</span>
                <Mono style={{ fontSize: 10.5, color: "var(--text-faint)" }}>← {s.install}</Mono>
              </div>
            ))}</div>
          </ConsentSection>
          {projects.length > 0 && <ConsentSection icon="network" label="Wants to use projects"><IntentChips intents={projects} max={9} /></ConsentSection>}
          <ConsentSection icon="zap" label="Will call intents"><IntentChips intents={m.uses_intents} max={9} /></ConsentSection>
          {m.published_output && <ConsentSection icon="globe" label="Owns external surface"><a href={m.published_output} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--accent-ink)", fontFamily: "var(--font-mono)" }}>{m.published_output.replace("https://", "")}</a></ConsentSection>}
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 9, background: "var(--panel-3)" }}>
            <Icon name="terminal" size={15} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
            <Mono style={{ fontSize: 11.5, flex: 1, wordBreak: "break-all" }}>ogp app install {pending.ref} --yes --json</Mono>
          </div>
        </div>
        <div style={{ padding: "14px 22px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={cautious && !trusted ? "solid" : "pink"} tone={cautious && !trusted ? "warn" : undefined} icon={busy ? undefined : "download"} disabled={busy} onClick={confirm}>{busy ? "Installing…" : `Install ${m.name}`}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Top-level view (sub-tabs: gallery / installed / usage) ───────
function AppsView({ ctx }) {
  const [sub, setSub] = useStateApps("gallery");
  const [layout, setLayout] = useStateApps("grid");
  const [selectedId, setSelectedId] = useStateApps(null);
  const [pending, setPending] = useStateApps(null);

  const installed = ctx.apps.installed || [];
  const installedIds = useMemoApps(() => new Set(installed.map((a) => a.id)), [installed]);

  function manifestOf(id) {
    const reg = installed.find((a) => a.id === id);
    if (reg) return reg.manifest;
    for (const grp of ctx.apps.browse || []) { const a = grp.apps.find((x) => x.manifest.id === id); if (a) return a.manifest; }
    return null;
  }
  function usageFor(id) {
    const u = (ctx.apps.usage || []).find((x) => x.id === id);
    if (u) return u;
    return installedIds.has(id) ? { id, totalCalls: 0, byIntent: {}, latestAttributable: null, sharedIntents: [], ambiguous: false } : null;
  }
  function appView(id) {
    const m = manifestOf(id); if (!m) return null;
    const reg = installed.find((a) => a.id === id);
    return { manifest: m, installed: !!reg, app: reg, usage: usageFor(id), advertisers: appAdvertisers(ctx, id) };
  }
  function openInstall(id) {
    const m = manifestOf(id);
    setPending({ manifest: m, ref: appRef(ctx, id), framework: ctx.framework.displayName, tone: ctx.consentTone || "calm" });
  }
  function confirmInstall(p, done) {
    Promise.resolve(ctx.actions.installApp?.(p.ref))
      .then(() => { setPending(null); ctx.showToast?.(`${p.manifest.name} installed`, { icon: "check", tone: "ok" }); })
      .catch((e) => { ctx.showToast?.(String(e.message || e), { icon: "alertTriangle", tone: "danger" }); })
      .finally(() => done && done());
  }
  function removeApp(id) {
    const m = manifestOf(id);
    Promise.resolve(ctx.actions.removeApp?.(id))
      .then(() => ctx.showToast?.(`${m?.name || "App"} removed`, { icon: "trash", tone: "danger" }))
      .catch((e) => ctx.showToast?.(String(e.message || e), { icon: "alertTriangle", tone: "danger" }));
  }

  const detail = selectedId ? appView(selectedId) : null;

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>
      <div className="scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "22px 26px 28px", minWidth: 0 }}>
        <PageHeader title="Apps" sub="Discover, install, and manage apps advertised across your federation.">
          <Segmented size="sm" value={sub} onChange={setSub} options={[
            { value: "gallery", label: "Gallery" }, { value: "installed", label: "Installed" }, { value: "usage", label: "Usage" },
          ]} />
        </PageHeader>
        {sub === "gallery" && <AppsGallery ctx={ctx} installedIds={installedIds} layout={layout} setLayout={setLayout} onOpen={setSelectedId} onInstall={openInstall} setRoute={ctx.setRoute} />}
        {sub === "installed" && <AppsInstalled ctx={ctx} installed={installed} usageFor={usageFor} onOpen={setSelectedId} onRemove={removeApp} setSub={setSub} />}
        {sub === "usage" && <AppsUsage ctx={ctx} installed={installed} usageFor={usageFor} onOpen={setSelectedId} setSub={setSub} />}
      </div>
      {detail && <AppDetail ctx={ctx} view={detail} onClose={() => setSelectedId(null)} onInstall={openInstall} onRemove={removeApp} />}
      {pending && <ConsentModal ctx={ctx} pending={pending} onCancel={() => setPending(null)} onConfirm={confirmInstall} />}
    </div>
  );
}

Object.assign(window, { AppsView });