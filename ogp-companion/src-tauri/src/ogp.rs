// ogp.rs — bridge to the `ogp` CLI. Locates the binary, runs it with an
// augmented PATH (GUI apps inherit a minimal PATH with no node/homebrew), and
// shapes the `--json` output into the snapshot the React UI consumes.

use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::process::Command;

/// Locate the `ogp` binary in the usual install locations (GUI apps lack the
/// shell PATH). Mirrors the SwiftUI OGPClient.locateOGP() logic.
fn locate_ogp() -> Option<String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut candidates = vec![
        "/opt/homebrew/bin/ogp".to_string(),
        "/usr/local/bin/ogp".to_string(),
        format!("{home}/.npm-global/bin/ogp"),
    ];
    // nvm: newest installed node bin
    let nvm_root = format!("{home}/.nvm/versions/node");
    if let Ok(entries) = std::fs::read_dir(&nvm_root) {
        let mut versions: Vec<String> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        versions.sort();
        if let Some(newest) = versions.into_iter().rev().next() {
            candidates.push(format!("{nvm_root}/{newest}/bin/ogp"));
        }
    }
    candidates.into_iter().find(|p| PathBuf::from(p).exists())
}

/// PATH that includes node/homebrew so the `ogp` `#!/usr/bin/env node` shebang
/// resolves even when launched from Finder.
fn augmented_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut parts = vec![
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
        format!("{home}/.npm-global/bin"),
    ];
    let nvm_root = format!("{home}/.nvm/versions/node");
    if let Ok(entries) = std::fs::read_dir(&nvm_root) {
        let mut versions: Vec<String> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        versions.sort();
        if let Some(newest) = versions.into_iter().rev().next() {
            parts.push(format!("{nvm_root}/{newest}/bin"));
        }
    }
    let existing = std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin:/usr/sbin:/sbin".into());
    parts.push(existing);
    parts.join(":")
}

#[derive(Debug)]
pub struct OgpError(pub String);

impl std::fmt::Display for OgpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}
impl std::error::Error for OgpError {}
impl serde::Serialize for OgpError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.0)
    }
}

/// Run `ogp [--for <fw>] <args...>` and return stdout. `framework` of None runs
/// against the default framework (no --for flag).
fn run(framework: Option<&str>, args: &[&str]) -> Result<String, OgpError> {
    let bin = locate_ogp().ok_or_else(|| OgpError("ogp binary not found".into()))?;
    let mut cmd = Command::new(&bin);
    cmd.env("PATH", augmented_path());
    if let Some(fw) = framework {
        cmd.arg("--for").arg(fw);
    }
    cmd.args(args);
    let out = cmd
        .output()
        .map_err(|e| OgpError(format!("failed to run ogp: {e}")))?;
    if !out.status.success() {
        return Err(OgpError(format!(
            "ogp {} exited {}: {}",
            args.join(" "),
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stderr).trim()
        )));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

fn run_json(framework: Option<&str>, args: &[&str]) -> Result<Value, OgpError> {
    let s = run(framework, args)?;
    serde_json::from_str(&s).map_err(|e| OgpError(format!("bad JSON from ogp {}: {e}", args.join(" "))))
}

// ── framework discovery (cached) ─────────────────────────────────
// Discovery runs up to two `whoami` subprocesses; frameworks rarely change, so
// cache the result and reuse it on every poll. The first non-empty result is
// memoized for the process lifetime.
use std::sync::Mutex;
static FRAMEWORK_CACHE: Mutex<Option<Vec<Value>>> = Mutex::new(None);

/// Clear the discovery cache so the next snapshot re-reads identity/framework
/// state (e.g. after an identity edit).
pub fn clear_framework_cache() {
    if let Ok(mut guard) = FRAMEWORK_CACHE.lock() {
        *guard = None;
    }
}

fn discover_frameworks() -> Vec<Value> {
    if let Ok(guard) = FRAMEWORK_CACHE.lock() {
        if let Some(cached) = guard.as_ref() {
            return cached.clone();
        }
    }
    let discovered = discover_frameworks_uncached();
    if !discovered.is_empty() {
        if let Ok(mut guard) = FRAMEWORK_CACHE.lock() {
            *guard = Some(discovered.clone());
        }
    }
    discovered
}

fn discover_frameworks_uncached() -> Vec<Value> {
    // Try `ogp --for all whoami --json` (array), else single object.
    if let Ok(Value::Array(rows)) = run_json(Some("all"), &["whoami", "--json"]) {
        let mapped: Vec<Value> = rows.iter().filter_map(framework_from_whoami).collect();
        if !mapped.is_empty() {
            return mapped;
        }
    }
    if let Ok(row) = run_json(None, &["whoami", "--json"]) {
        if let Some(fw) = framework_from_whoami(&row) {
            return vec![fw];
        }
    }
    vec![]
}

fn framework_from_whoami(r: &Value) -> Option<Value> {
    let id = r.get("framework")?.as_str()?.to_string();
    let display = r
        .get("displayName")
        .and_then(|v| v.as_str())
        .unwrap_or(&id)
        .to_string();
    Some(json!({
        "id": id,
        "displayName": display,
        "stateDir": r.get("stateDir").cloned().unwrap_or(Value::Null),
        "gatewayUrl": r.get("gatewayUrl").cloned().unwrap_or(Value::Null),
        "daemonPort": r.get("daemonPort").cloned().unwrap_or(json!(18790)),
        "identity": {
            "human": r.get("humanName").and_then(|v| v.as_str()).unwrap_or("—"),
            "agent": r.get("agentName").and_then(|v| v.as_str()).unwrap_or(""),
            "org":   r.get("organization").and_then(|v| v.as_str()).unwrap_or(""),
        }
    }))
}

// ── snapshot: the full state the UI renders ──────────────────────
pub fn snapshot() -> Result<Value, OgpError> {
    let frameworks = discover_frameworks();

    let mut peers = Map::new();
    let mut tunnels = Map::new();
    let mut daemon = Map::new();
    let activity = Map::new();

    for fw in &frameworks {
        let id = fw.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let fwref = Some(id.as_str());

        // peers: federation list --json (array of PeerJson)
        let plist = run_json(fwref, &["federation", "list", "--json"]).unwrap_or(json!([]));
        peers.insert(id.clone(), plist);

        // daemon: cheap liveness via the state dir's daemon.pid (no subprocess).
        let port = fw.get("daemonPort").cloned().unwrap_or(json!(18790));
        let state_dir = fw.get("stateDir").and_then(|v| v.as_str());
        let (running, pid) = daemon_state(state_dir);
        daemon.insert(
            id.clone(),
            json!({ "running": running, "port": port, "version": ogp_version(), "uptimeMs": 0, "pid": pid }),
        );

        // tunnels: tunnel list --json → { active, options }
        let traw = run_json(fwref, &["tunnel", "list", "--json"]).unwrap_or(json!({}));
        tunnels.insert(id.clone(), map_tunnels(&traw));
    }

    Ok(json!({
        "frameworks": frameworks,
        "peers": peers,
        "tunnels": tunnels,
        "daemon": daemon,
        "activity": activity,
    }))
}

/// Cheap daemon state: read <stateDir>/daemon.pid and probe with kill(pid,0).
/// Avoids spawning `ogp status` (a node process) on every 5s poll. Returns
/// (running, pid).
fn daemon_state(state_dir: Option<&str>) -> (bool, Value) {
    let Some(dir) = state_dir else { return (false, Value::Null) };
    // expand a leading ~ to $HOME
    let dir = if let Some(rest) = dir.strip_prefix("~") {
        format!("{}{}", std::env::var("HOME").unwrap_or_default(), rest)
    } else {
        dir.to_string()
    };
    let pid_path = std::path::Path::new(&dir).join("daemon.pid");
    let Ok(s) = std::fs::read_to_string(&pid_path) else { return (false, Value::Null) };
    let Ok(pid) = s.trim().parse::<i32>() else { return (false, Value::Null) };
    // signal 0 = liveness probe (no signal sent)
    let alive = unsafe { libc_kill(pid, 0) == 0 };
    if alive { (true, json!(pid)) } else { (false, Value::Null) }
}

extern "C" {
    #[link_name = "kill"]
    fn libc_kill(pid: i32, sig: i32) -> i32;
}

/// `ogp --version`, cached for the process lifetime (it's constant).
fn ogp_version() -> Value {
    static VERSION_CACHE: Mutex<Option<String>> = Mutex::new(None);
    if let Ok(guard) = VERSION_CACHE.lock() {
        if let Some(v) = guard.as_ref() {
            return json!(v);
        }
    }
    let v = run(None, &["--version"])
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let (Some(v), Ok(mut guard)) = (v.clone(), VERSION_CACHE.lock()) {
        *guard = Some(v);
    }
    v.map(Value::String).unwrap_or(Value::Null)
}

/// Map `tunnel list --json` ({ tools:[{tool,infos:[{live,publicUrl,name,...}]}], reconcile })
/// into the UI's { active, options } shape.
fn map_tunnels(raw: &Value) -> Value {
    let mut options = vec![];
    let mut active = Value::Null;
    if let Some(tools) = raw.get("tools").and_then(|v| v.as_array()) {
        for pane in tools {
            let tool = pane.get("tool").and_then(|v| v.as_str()).unwrap_or("");
            let installed = pane.get("error").is_none();
            if let Some(infos) = pane.get("infos").and_then(|v| v.as_array()) {
                for info in infos {
                    let live = info.get("live").and_then(|v| v.as_bool()).unwrap_or(false);
                    let name = info.get("name").and_then(|v| v.as_str()).unwrap_or(tool);
                    let hostname = info
                        .get("publicUrl")
                        .and_then(|v| v.as_str())
                        .map(|u| u.replace("https://", "").replace("http://", ""));
                    let ttype = match tool {
                        "cloudflared" => "cloudflareNamed",
                        "ngrok" => "ngrok",
                        _ => tool,
                    };
                    let opt = json!({
                        "id": format!("{tool}-{name}"),
                        "name": name,
                        "type": ttype,
                        "hostname": hostname,
                        "configured": true,
                        "installed": installed,
                    });
                    if live && active.is_null() {
                        active = json!({
                            "id": format!("{tool}-{name}"),
                            "name": name,
                            "type": ttype,
                            "hostname": opt.get("hostname").cloned().unwrap_or(Value::Null),
                        });
                    }
                    options.push(opt);
                }
            }
        }
    }
    json!({ "active": active, "options": options })
}

// ── actions ──────────────────────────────────────────────────────
pub fn start_tunnel(framework: &str, option_id: &str) -> Result<Value, OgpError> {
    // option_id is "<tool>-<name>"; the CLI starts by tool.
    let tool = option_id.split('-').next().unwrap_or("cloudflared");
    let arg = if tool == "ngrok" { "ngrok" } else { "cloudflared" };
    run(Some(framework), &["tunnel", "start", arg])?;
    Ok(json!({ "ok": true }))
}

pub fn stop_tunnel(framework: &str) -> Result<Value, OgpError> {
    run(Some(framework), &["tunnel", "stop"])?;
    Ok(json!({ "ok": true }))
}

pub fn toggle_daemon(framework: &str, run_it: bool) -> Result<Value, OgpError> {
    if run_it {
        run(Some(framework), &["start", "--background"])?;
    } else {
        run(Some(framework), &["stop"])?;
    }
    Ok(json!({ "ok": true }))
}

pub fn approve(framework: &str, peer_id: &str, intents: Vec<String>) -> Result<Value, OgpError> {
    let mut args: Vec<String> = vec!["federation".into(), "approve".into(), peer_id.into()];
    if !intents.is_empty() {
        args.push("--intents".into());
        args.push(intents.join(","));
    }
    let argrefs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run(Some(framework), &argrefs)?;
    Ok(json!({ "ok": true }))
}

pub fn reject(framework: &str, peer_id: &str) -> Result<Value, OgpError> {
    run(Some(framework), &["federation", "reject", peer_id])?;
    Ok(json!({ "ok": true }))
}

/// Send a message: agent-comms (topic/priority/wait) or a plain message intent.
pub fn send_message(
    framework: &str,
    peer_id: &str,
    agent: bool,
    topic: &str,
    text: &str,
    priority: &str,
    wait: bool,
) -> Result<Value, OgpError> {
    if agent {
        let mut args: Vec<String> = vec![
            "federation".into(),
            "agent".into(),
            peer_id.into(),
            topic.into(),
            text.into(),
        ];
        if priority != "normal" {
            args.push("--priority".into());
            args.push(priority.into());
        }
        if wait {
            args.push("--wait".into());
        }
        let argrefs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run(Some(framework), &argrefs)?;
    } else {
        // plain message: payload is JSON; wrap the text.
        let payload = json!({ "text": text }).to_string();
        run(
            Some(framework),
            &["federation", "send", peer_id, "message", &payload],
        )?;
    }
    Ok(json!({ "ok": true }))
}

/// Persist a per-peer agent-comms policy: default level + per-topic rules.
pub fn set_policy(
    framework: &str,
    peer_id: &str,
    default_level: &str,
    topics: Vec<Value>,
) -> Result<Value, OgpError> {
    run(
        Some(framework),
        &["agent-comms", "set-default", peer_id, default_level],
    )?;
    for t in &topics {
        let topic = t.get("topic").and_then(|v| v.as_str()).unwrap_or("");
        let level = t.get("level").and_then(|v| v.as_str()).unwrap_or("summary");
        let notes = t.get("notes").and_then(|v| v.as_str()).unwrap_or("");
        if topic.is_empty() {
            continue;
        }
        let mut args: Vec<String> = vec![
            "agent-comms".into(),
            "set-topic".into(),
            peer_id.into(),
            topic.into(),
            level.into(),
        ];
        if !notes.is_empty() {
            args.push("--notes".into());
            args.push(notes.into());
        }
        let argrefs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run(Some(framework), &argrefs)?;
    }
    Ok(json!({ "ok": true }))
}

pub fn request(framework: &str, peer_url: &str, alias: Option<String>) -> Result<Value, OgpError> {
    let mut args: Vec<String> = vec!["federation".into(), "request".into(), peer_url.into()];
    if let Some(a) = alias.filter(|a| !a.is_empty()) {
        args.push("--alias".into());
        args.push(a);
    }
    args.push("--json".into());
    let argrefs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let out = run(Some(framework), &argrefs)?;
    Ok(serde_json::from_str(&out).unwrap_or(json!({ "ok": true })))
}

/// Update identity via `ogp config set-identity`. Clears the discovery cache so
/// the next snapshot reflects the change.
pub fn set_identity(
    framework: &str,
    agent_name: Option<String>,
    human_name: Option<String>,
    organization: Option<String>,
) -> Result<Value, OgpError> {
    let mut args: Vec<String> = vec!["config".into(), "set-identity".into()];
    if let Some(a) = agent_name.filter(|s| !s.is_empty()) {
        args.push("--agent-name".into());
        args.push(a);
    }
    if let Some(h) = human_name.filter(|s| !s.is_empty()) {
        args.push("--human-name".into());
        args.push(h);
    }
    if let Some(o) = organization.filter(|s| !s.is_empty()) {
        args.push("--organization".into());
        args.push(o);
    }
    let argrefs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run(Some(framework), &argrefs)?;
    clear_framework_cache();
    Ok(json!({ "ok": true }))
}

/// Open Terminal.app with a prompt pre-filled (not executed) for this framework.
/// `command` is the trailing ogp subcommand, e.g. "status" or "config set-identity";
/// we prefix `ogp --for <framework>`. The text is typed but left for the user to run.
pub fn open_terminal(framework: &str, command: &str) -> Result<Value, OgpError> {
    // Build the shell line the user will see, e.g. `ogp --for openclaw config set-identity`
    let line = format!("ogp --for {framework} {command}");
    // AppleScript: open Terminal, new window, type the command (no return — user runs it).
    // Escape embedded double-quotes and backslashes for the AppleScript string literal.
    let escaped = line.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        r#"tell application "Terminal"
    activate
    do script "{escaped}"
end tell"#
    );
    let status = Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(&script)
        .status()
        .map_err(|e| OgpError(format!("failed to open Terminal: {e}")))?;
    if !status.success() {
        return Err(OgpError("osascript exited non-zero".into()));
    }
    Ok(json!({ "ok": true, "command": line }))
}
