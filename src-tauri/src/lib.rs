mod connector;
mod discovery;
mod models;
mod opgg;

use connector::LeagueConnector;
use models::{LeagueLifecycleState, LeagueSnapshot, LocalPlayerProfile};
use opgg::OpggClient;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

struct CompanionState {
    connector: LeagueConnector,
    opgg: OpggClient,
}

#[tauri::command]
async fn get_league_snapshot(
    app: AppHandle,
    state: State<'_, CompanionState>,
) -> Result<LeagueSnapshot, String> {
    let snapshot = state.connector.snapshot().await;
    sync_overlay_visibility(&app, snapshot.state);
    Ok(snapshot)
}

#[tauri::command]
async fn get_local_player_profile(
    state: State<'_, CompanionState>,
) -> Result<LocalPlayerProfile, String> {
    state.connector.local_player_profile().await
}

#[tauri::command]
fn set_overlay_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let Some(overlay) = app.get_webview_window("overlay") else {
        return Err("The overlay window is unavailable.".to_owned());
    };
    if visible {
        overlay
            .show()
            .map_err(|_| "The overlay could not be shown.".to_owned())?;
    } else {
        overlay
            .hide()
            .map_err(|_| "The overlay could not be hidden.".to_owned())?;
    }
    Ok(())
}

#[tauri::command]
async fn get_opgg_matchup_guide(
    state: State<'_, CompanionState>,
    position: String,
    my_champion: String,
    opponent_champion: String,
) -> Result<Value, String> {
    state
        .opgg
        .matchup_guide(&position, &my_champion, &opponent_champion)
        .await
}

#[tauri::command]
async fn get_opgg_ban_advice(
    state: State<'_, CompanionState>,
    position: String,
    champion: String,
) -> Result<Value, String> {
    state.opgg.ban_advice(&position, &champion).await
}

#[tauri::command]
async fn get_opgg_player_profile(
    state: State<'_, CompanionState>,
    game_name: String,
    tag_line: String,
    region: String,
) -> Result<Value, String> {
    state
        .opgg
        .player_profile(&game_name, &tag_line, &region)
        .await
}

#[tauri::command]
async fn get_opgg_match_detail(
    state: State<'_, CompanionState>,
    region: String,
    game_id: String,
    created_at: String,
) -> Result<Value, String> {
    state
        .opgg
        .match_detail(&region, &game_id, &created_at)
        .await
}

fn sync_overlay_visibility(app: &AppHandle, state: LeagueLifecycleState) {
    let Some(overlay) = app.get_webview_window("overlay") else {
        return;
    };
    match state {
        LeagueLifecycleState::Loading | LeagueLifecycleState::ActiveGame => {
            let _ = overlay.show();
        }
        LeagueLifecycleState::ClientClosed
        | LeagueLifecycleState::ClientIdle
        | LeagueLifecycleState::Lobby
        | LeagueLifecycleState::Queue
        | LeagueLifecycleState::ChampionSelect
        | LeagueLifecycleState::PostGame => {
            let _ = overlay.hide();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let connector = LeagueConnector::new().expect("failed to initialize local League connector");
    let opgg = OpggClient::new().expect("failed to initialize OP.GG MCP client");

    tauri::Builder::default()
        .manage(CompanionState { connector, opgg })
        .invoke_handler(tauri::generate_handler![
            get_league_snapshot,
            get_local_player_profile,
            get_opgg_matchup_guide,
            get_opgg_ban_advice,
            get_opgg_player_profile,
            get_opgg_match_detail,
            set_overlay_visible
        ])
        .run(tauri::generate_context!())
        .expect("error while running Challenger Lens Companion");
}
