mod ogp;

use serde_json::Value;

#[tauri::command]
fn ogp_snapshot() -> Result<Value, ogp::OgpError> {
    ogp::snapshot()
}

#[tauri::command]
fn ogp_start_tunnel(framework: String, option_id: String) -> Result<Value, ogp::OgpError> {
    ogp::start_tunnel(&framework, &option_id)
}

#[tauri::command]
fn ogp_stop_tunnel(framework: String) -> Result<Value, ogp::OgpError> {
    ogp::stop_tunnel(&framework)
}

#[tauri::command]
fn ogp_toggle_daemon(framework: String, run: bool) -> Result<Value, ogp::OgpError> {
    ogp::toggle_daemon(&framework, run)
}

#[tauri::command]
fn ogp_approve(framework: String, peer_id: String, intents: Vec<String>) -> Result<Value, ogp::OgpError> {
    ogp::approve(&framework, &peer_id, intents)
}

#[tauri::command]
fn ogp_reject(framework: String, peer_id: String) -> Result<Value, ogp::OgpError> {
    ogp::reject(&framework, &peer_id)
}

#[tauri::command]
fn ogp_request(framework: String, peer_url: String, alias: Option<String>) -> Result<Value, ogp::OgpError> {
    ogp::request(&framework, &peer_url, alias)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn ogp_send_message(
    framework: String,
    peer_id: String,
    agent: bool,
    topic: String,
    text: String,
    priority: String,
    wait: bool,
) -> Result<Value, ogp::OgpError> {
    ogp::send_message(&framework, &peer_id, agent, &topic, &text, &priority, wait)
}

#[tauri::command]
fn ogp_set_policy(
    framework: String,
    peer_id: String,
    default_level: String,
    topics: Vec<Value>,
) -> Result<Value, ogp::OgpError> {
    ogp::set_policy(&framework, &peer_id, &default_level, topics)
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
