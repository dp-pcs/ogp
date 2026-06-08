mod ogp;

use serde_json::Value;

// All commands are async and run their (blocking) `ogp` subprocess work on a
// blocking thread pool via spawn_blocking — so the UI thread never stalls while
// the CLI runs. Each `ogp` call spawns node (~0.5–1s); doing this on the main
// thread froze the whole window.

async fn blocking<F>(f: F) -> Result<Value, ogp::OgpError>
where
    F: FnOnce() -> Result<Value, ogp::OgpError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| ogp::OgpError(format!("join error: {e}")))?
}

#[tauri::command]
async fn ogp_snapshot() -> Result<Value, ogp::OgpError> {
    blocking(ogp::snapshot).await
}

#[tauri::command]
async fn ogp_start_tunnel(framework: String, option_id: String) -> Result<Value, ogp::OgpError> {
    blocking(move || ogp::start_tunnel(&framework, &option_id)).await
}

#[tauri::command]
async fn ogp_stop_tunnel(framework: String) -> Result<Value, ogp::OgpError> {
    blocking(move || ogp::stop_tunnel(&framework)).await
}

#[tauri::command]
async fn ogp_toggle_daemon(framework: String, run: bool) -> Result<Value, ogp::OgpError> {
    blocking(move || ogp::toggle_daemon(&framework, run)).await
}

#[tauri::command]
async fn ogp_approve(framework: String, peer_id: String, intents: Vec<String>) -> Result<Value, ogp::OgpError> {
    blocking(move || ogp::approve(&framework, &peer_id, intents)).await
}

#[tauri::command]
async fn ogp_reject(framework: String, peer_id: String) -> Result<Value, ogp::OgpError> {
    blocking(move || ogp::reject(&framework, &peer_id)).await
}

#[tauri::command]
async fn ogp_request(framework: String, peer_url: String, alias: Option<String>) -> Result<Value, ogp::OgpError> {
    blocking(move || ogp::request(&framework, &peer_url, alias)).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn ogp_send_message(
    framework: String,
    peer_id: String,
    agent: bool,
    topic: String,
    text: String,
    priority: String,
    wait: bool,
) -> Result<Value, ogp::OgpError> {
    blocking(move || ogp::send_message(&framework, &peer_id, agent, &topic, &text, &priority, wait)).await
}

#[tauri::command]
async fn ogp_set_policy(
    framework: String,
    peer_id: String,
    default_level: String,
    topics: Vec<Value>,
) -> Result<Value, ogp::OgpError> {
    blocking(move || ogp::set_policy(&framework, &peer_id, &default_level, topics)).await
}

#[tauri::command]
async fn ogp_open_terminal(framework: String, command: String) -> Result<Value, ogp::OgpError> {
    blocking(move || ogp::open_terminal(&framework, &command)).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ogp_snapshot,
            ogp_start_tunnel,
            ogp_stop_tunnel,
            ogp_toggle_daemon,
            ogp_approve,
            ogp_reject,
            ogp_request,
            ogp_send_message,
            ogp_set_policy,
            ogp_open_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
