use std::{
    collections::BTreeSet,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use reqwest::{redirect::Policy, tls::Certificate, Client, StatusCode};
use serde::de::DeserializeOwned;
use thiserror::Error;
use tokio::sync::Mutex;

use crate::{
    discovery::{discover_credentials, LcuCredentials},
    models::{
        ActiveGameSnapshot, ChampionSelectSnapshot, ChampionSelectTimer, ChampionSlot,
        LcuChampionMastery, LcuChampionSelectSession, LcuCurrentSummoner, LcuGameflowSession,
        LcuRegionLocale, LcuRunePage, LeagueLifecycleState, LeagueSnapshot, LiveGameStats,
        LiveItem, LocalChampionMastery, LocalPlayerProfile, MapSnapshot, QueueSnapshot,
        RunePageSnapshot,
    },
};

const LCU_PHASE_ENDPOINT: &str = "/lol-gameflow/v1/gameflow-phase";
const LCU_CHAMP_SELECT_ENDPOINT: &str = "/lol-champ-select/v1/session";
const LCU_CURRENT_RUNES_ENDPOINT: &str = "/lol-perks/v1/currentpage";
const LCU_GAMEFLOW_SESSION_ENDPOINT: &str = "/lol-gameflow/v1/session";
const LCU_GAME_VERSION_ENDPOINT: &str = "/lol-patch/v1/game-version";
const LCU_REGION_LOCALE_ENDPOINT: &str = "/riotclient/region-locale";
const LCU_CURRENT_SUMMONER_ENDPOINT: &str = "/lol-summoner/v1/current-summoner";
const LCU_CHAMPION_MASTERY_ENDPOINT: &str =
    "/lol-champion-mastery/v1/local-player/champion-mastery";
const LIVE_BASE_URL: &str = "https://127.0.0.1:2999/liveclientdata";
const RIOT_ROOT_CERTIFICATE: &[u8] = include_bytes!("../certs/riotgames.pem");

#[derive(Debug, Error)]
enum ConnectorError {
    #[error("the local League endpoint did not respond")]
    Request,
    #[error("the local League endpoint returned an unexpected response")]
    Response,
    #[error("the local League credentials changed")]
    Unauthorized,
}

pub(crate) struct LeagueConnector {
    client: Client,
    credentials: Arc<Mutex<Option<LcuCredentials>>>,
}

#[derive(Default)]
struct LeagueContext {
    patch: Option<String>,
    region: Option<String>,
    queue: Option<QueueSnapshot>,
    map: Option<MapSnapshot>,
}

impl LeagueConnector {
    pub(crate) fn new() -> Result<Self, String> {
        let certificate = Certificate::from_pem(RIOT_ROOT_CERTIFICATE)
            .map_err(|_| "Riot's local certificate could not be loaded".to_owned())?;
        let client = Client::builder()
            .add_root_certificate(certificate)
            .https_only(true)
            .no_proxy()
            .redirect(Policy::none())
            .connect_timeout(Duration::from_millis(250))
            .timeout(Duration::from_millis(600))
            .build()
            .map_err(|_| "The local League HTTP client could not be created".to_owned())?;

        Ok(Self {
            client,
            credentials: Arc::new(Mutex::new(None)),
        })
    }

    pub(crate) async fn snapshot(&self) -> LeagueSnapshot {
        let observed_at_ms = unix_time_ms();
        let Some(discovered) = discover_credentials() else {
            *self.credentials.lock().await = None;
            return match self.live_game_snapshot().await {
                Ok(active_game) => LeagueSnapshot {
                    state: LeagueLifecycleState::ActiveGame,
                    observed_at_ms,
                    client_connected: false,
                    raw_phase: None,
                    patch: None,
                    region: None,
                    queue: None,
                    map: Some(MapSnapshot {
                        id: active_game.map_number,
                        name: active_game.map_name.clone(),
                    }),
                    champion_select: None,
                    active_game: Some(active_game),
                    diagnostic: None,
                },
                Err(_) => LeagueSnapshot::simple(
                    LeagueLifecycleState::ClientClosed,
                    observed_at_ms,
                    false,
                    None,
                ),
            };
        };

        let credentials_changed = {
            let mut cached = self.credentials.lock().await;
            let changed = cached.as_ref() != Some(&discovered);
            *cached = Some(discovered.clone());
            changed
        };

        match self.lcu_snapshot(&discovered, observed_at_ms).await {
            Ok(snapshot) => snapshot,
            Err(ConnectorError::Unauthorized) => {
                *self.credentials.lock().await = None;
                LeagueSnapshot::simple(LeagueLifecycleState::ClientIdle, observed_at_ms, true, None)
                    .with_diagnostic(
                        "lcu_credentials_rotated",
                        "League restarted; reconnecting with its new local credentials.",
                        500,
                    )
            }
            Err(_) => {
                LeagueSnapshot::simple(LeagueLifecycleState::ClientIdle, observed_at_ms, true, None)
                    .with_diagnostic(
                        if credentials_changed {
                            "lcu_starting"
                        } else {
                            "lcu_unavailable"
                        },
                        "League is open, but its local interface is not ready yet.",
                        1_000,
                    )
            }
        }
    }

    pub(crate) async fn local_player_profile(&self) -> Result<LocalPlayerProfile, String> {
        let credentials = discover_credentials()
            .ok_or_else(|| "Open the League client to detect your local profile.".to_owned())?;
        let (summoner_result, mastery_result, region_result, version_result) = tokio::join!(
            self.lcu_get_json::<LcuCurrentSummoner>(&credentials, LCU_CURRENT_SUMMONER_ENDPOINT),
            self.lcu_get_json::<Vec<LcuChampionMastery>>(
                &credentials,
                LCU_CHAMPION_MASTERY_ENDPOINT
            ),
            self.lcu_get_json::<LcuRegionLocale>(&credentials, LCU_REGION_LOCALE_ENDPOINT),
            self.lcu_get_json::<String>(&credentials, LCU_GAME_VERSION_ENDPOINT),
        );
        let summoner = summoner_result
            .map_err(|_| "The League client did not return your local profile.".to_owned())?;
        if summoner.game_name.trim().is_empty() || summoner.tag_line.trim().is_empty() {
            return Err("Your Riot ID is not available from the League client yet.".to_owned());
        }
        let region = region_result
            .ok()
            .and_then(|value| normalize_region(&value.region))
            .ok_or_else(|| "The League client returned an unsupported region.".to_owned())?;
        let mut masteries = mastery_result
            .unwrap_or_default()
            .into_iter()
            .filter(|row| row.champion_id > 0 && row.champion_points >= 0)
            .map(|row| LocalChampionMastery {
                champion_id: row.champion_id,
                champion_level: row.champion_level.max(0),
                champion_points: row.champion_points.max(0),
                highest_grade: row.highest_grade,
                last_play_time: row.last_play_time.max(0),
            })
            .collect::<Vec<_>>();
        masteries.sort_by_key(|mastery| std::cmp::Reverse(mastery.champion_points));

        Ok(LocalPlayerProfile {
            game_name: summoner.game_name,
            tag_line: summoner.tag_line,
            region,
            summoner_level: summoner.summoner_level.max(0),
            patch: version_result
                .ok()
                .and_then(|value| normalize_patch(&value)),
            masteries,
        })
    }

    async fn lcu_snapshot(
        &self,
        credentials: &LcuCredentials,
        observed_at_ms: u64,
    ) -> Result<LeagueSnapshot, ConnectorError> {
        let phase = self
            .lcu_get_json::<String>(credentials, LCU_PHASE_ENDPOINT)
            .await?;
        let state = phase_to_state(&phase);
        let mut snapshot = LeagueSnapshot::simple(state, observed_at_ms, true, Some(phase.clone()));

        match state {
            LeagueLifecycleState::ChampionSelect => {
                let (champion_select, context) = tokio::join!(
                    self.champion_select_snapshot(credentials),
                    self.league_context(credentials)
                );
                apply_context(&mut snapshot, context);
                match champion_select {
                    Ok(champion_select) => snapshot.champion_select = Some(champion_select),
                    Err(_) => {
                        snapshot = snapshot.with_diagnostic(
                            "champ_select_unavailable",
                            "Champion select was detected, but its visible draft state is temporarily unavailable.",
                            500,
                        );
                    }
                }
            }
            LeagueLifecycleState::ActiveGame => match self.live_game_snapshot().await {
                Ok(active_game) => {
                    snapshot.map = Some(MapSnapshot {
                        id: active_game.map_number,
                        name: active_game.map_name.clone(),
                    });
                    snapshot.active_game = Some(active_game);
                }
                Err(_) => {
                    snapshot = snapshot.with_diagnostic(
                        "live_client_starting",
                        "The game is starting; waiting for the local live-data interface.",
                        500,
                    );
                }
            },
            _ => {}
        }

        if matches!(state, LeagueLifecycleState::ClientIdle) && !is_known_idle_phase(&phase) {
            snapshot = snapshot.with_diagnostic(
                "unsupported_gameflow_phase",
                "League reported a phase this version of the companion does not recognize yet.",
                1_000,
            );
        }

        Ok(snapshot)
    }

    async fn league_context(&self, credentials: &LcuCredentials) -> LeagueContext {
        let (region_result, version_result, gameflow_result) = tokio::join!(
            self.lcu_get_json::<LcuRegionLocale>(credentials, LCU_REGION_LOCALE_ENDPOINT),
            self.lcu_get_json::<String>(credentials, LCU_GAME_VERSION_ENDPOINT),
            self.lcu_get_json::<LcuGameflowSession>(credentials, LCU_GAMEFLOW_SESSION_ENDPOINT),
        );

        let region = region_result
            .ok()
            .and_then(|value| normalize_region(&value.region));
        let patch = version_result
            .ok()
            .and_then(|value| normalize_patch(&value));
        let queue = gameflow_result.ok().map(|session| session.game_data.queue);
        let queue_snapshot = queue.as_ref().and_then(|queue| {
            (queue.id > 0).then(|| QueueSnapshot {
                id: queue.id,
                name: if queue.name.trim().is_empty() {
                    queue_name(queue.id).to_owned()
                } else {
                    queue.name.clone()
                },
            })
        });
        let map_snapshot = queue.as_ref().and_then(|queue| {
            (queue.map_id > 0).then(|| MapSnapshot {
                id: queue.map_id,
                name: map_name(queue.map_id).to_owned(),
            })
        });

        LeagueContext {
            patch,
            region,
            queue: queue_snapshot,
            map: map_snapshot,
        }
    }

    async fn champion_select_snapshot(
        &self,
        credentials: &LcuCredentials,
    ) -> Result<ChampionSelectSnapshot, ConnectorError> {
        let (session_result, rune_page_result) = tokio::join!(
            self.lcu_get_json::<LcuChampionSelectSession>(credentials, LCU_CHAMP_SELECT_ENDPOINT),
            self.lcu_get_json::<LcuRunePage>(credentials, LCU_CURRENT_RUNES_ENDPOINT),
        );
        let session = session_result?;
        let rune_page = rune_page_result.ok().map(|page| RunePageSnapshot {
            id: page.id,
            primary_style_id: page.primary_style_id,
            sub_style_id: page.sub_style_id,
            selected_perk_ids: page.selected_perk_ids,
        });

        let allies = sanitized_slots(&session, &session.my_team);
        let enemies = sanitized_slots(&session, &session.their_team);
        let local = allies
            .iter()
            .find(|slot| slot.cell_id == session.local_player_cell_id);

        Ok(ChampionSelectSnapshot {
            local_player_cell_id: session.local_player_cell_id,
            local_champion_id: local
                .and_then(|slot| slot.champion_id.or(slot.champion_pick_intent)),
            assigned_role: local.and_then(|slot| slot.assigned_role.clone()),
            current_spell_ids: local.and_then(|slot| slot.spell_ids),
            allies,
            enemies,
            ally_ban_ids: positive_ids(session.bans.my_team_bans),
            enemy_ban_ids: positive_ids(session.bans.their_team_bans),
            current_rune_page: rune_page,
            timer: ChampionSelectTimer {
                phase: session.timer.phase,
                total_time_ms: session.timer.total_time_in_phase.max(0),
                adjusted_time_left_ms: session.timer.adjusted_time_left_in_phase.max(0),
            },
        })
    }

    async fn live_game_snapshot(&self) -> Result<ActiveGameSnapshot, ConnectorError> {
        let (game_stats_result, local_riot_id_result) = tokio::join!(
            self.live_get_json::<LiveGameStats>("/gamestats"),
            self.live_get_json::<String>("/activeplayername"),
        );
        let game_stats = game_stats_result?;

        // Riot's item endpoint currently accepts the local Riot ID. Keep it only
        // for this local request and discard it before returning across IPC.
        let owned_item_ids = match local_riot_id_result {
            Ok(local_riot_id) => self
                .live_player_items(&local_riot_id)
                .await
                .unwrap_or_default(),
            Err(_) => Vec::new(),
        };

        Ok(ActiveGameSnapshot {
            game_mode: game_stats.game_mode,
            game_time_seconds: game_stats.game_time.max(0.0),
            map_name: game_stats.map_name,
            map_number: game_stats.map_number,
            owned_item_ids,
        })
    }

    async fn live_player_items(&self, riot_id: &str) -> Result<Vec<i64>, ConnectorError> {
        let url = format!("{LIVE_BASE_URL}/playeritems");
        let response = self
            .client
            .get(url)
            .query(&[("riotId", riot_id)])
            .send()
            .await
            .map_err(|_| ConnectorError::Request)?;
        let items = parse_response::<Vec<LiveItem>>(response).await?;
        Ok(positive_ids(items.into_iter().map(|item| item.item_id)))
    }

    async fn lcu_get_json<T: DeserializeOwned>(
        &self,
        credentials: &LcuCredentials,
        endpoint: &'static str,
    ) -> Result<T, ConnectorError> {
        let url = format!("https://127.0.0.1:{}{endpoint}", credentials.port);
        let response = self
            .client
            .get(url)
            .basic_auth("riot", Some(&credentials.password))
            .send()
            .await
            .map_err(|_| ConnectorError::Request)?;

        if matches!(
            response.status(),
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN
        ) {
            return Err(ConnectorError::Unauthorized);
        }
        parse_response(response).await
    }

    async fn live_get_json<T: DeserializeOwned>(
        &self,
        endpoint: &'static str,
    ) -> Result<T, ConnectorError> {
        let response = self
            .client
            .get(format!("{LIVE_BASE_URL}{endpoint}"))
            .send()
            .await
            .map_err(|_| ConnectorError::Request)?;
        parse_response(response).await
    }
}

async fn parse_response<T: DeserializeOwned>(
    response: reqwest::Response,
) -> Result<T, ConnectorError> {
    if !response.status().is_success() {
        return Err(ConnectorError::Response);
    }
    response
        .json::<T>()
        .await
        .map_err(|_| ConnectorError::Response)
}

fn sanitized_slots(
    session: &LcuChampionSelectSession,
    slots: &[crate::models::LcuChampionSlot],
) -> Vec<ChampionSlot> {
    slots
        .iter()
        .map(|slot| {
            let locked_in = session.actions.iter().flatten().any(|action| {
                action.actor_cell_id == slot.cell_id
                    && action.action_type.eq_ignore_ascii_case("pick")
                    && action.champion_id > 0
                    && action.completed
            });
            ChampionSlot {
                cell_id: slot.cell_id,
                champion_id: (slot.champion_id > 0).then_some(slot.champion_id),
                champion_pick_intent: (slot.champion_pick_intent > 0)
                    .then_some(slot.champion_pick_intent),
                assigned_role: normalize_role(&slot.assigned_position),
                locked_in,
                is_local_player: slot.cell_id == session.local_player_cell_id,
                spell_ids: (slot.spell1_id > 0 && slot.spell2_id > 0)
                    .then_some([slot.spell1_id, slot.spell2_id]),
            }
        })
        .collect()
}

fn normalize_role(value: &str) -> Option<String> {
    match value.trim().to_ascii_uppercase().as_str() {
        "TOP" => Some("TOP".to_owned()),
        "JUNGLE" => Some("JUNGLE".to_owned()),
        "MIDDLE" | "MID" => Some("MID".to_owned()),
        "BOTTOM" | "BOT" | "ADC" => Some("ADC".to_owned()),
        "UTILITY" | "SUPPORT" => Some("SUPPORT".to_owned()),
        _ => None,
    }
}

fn normalize_region(value: &str) -> Option<String> {
    match value.trim().to_ascii_uppercase().as_str() {
        "EUW" | "EUW1" => Some("EUW".to_owned()),
        "EUNE" | "EUN" | "EUN1" => Some("EUNE".to_owned()),
        "NA" | "NA1" => Some("NA".to_owned()),
        "KR" => Some("KR".to_owned()),
        "JP" | "JP1" => Some("JP".to_owned()),
        "BR" | "BR1" => Some("BR".to_owned()),
        "LAN" | "LA1" => Some("LAN".to_owned()),
        "LAS" | "LA2" => Some("LAS".to_owned()),
        "OCE" | "OC1" => Some("OCE".to_owned()),
        "TR" | "TR1" => Some("TR".to_owned()),
        "RU" => Some("RU".to_owned()),
        "SG" | "SG2" => Some("SG".to_owned()),
        "PH" | "PH2" => Some("PH".to_owned()),
        "TW" | "TW2" => Some("TW".to_owned()),
        "VN" | "VN2" => Some("VN".to_owned()),
        "TH" | "TH2" => Some("TH".to_owned()),
        "ME" | "ME1" => Some("ME".to_owned()),
        _ => None,
    }
}

fn normalize_patch(value: &str) -> Option<String> {
    let mut parts = value.trim().split('.');
    let major = parts.next()?.parse::<u16>().ok()?;
    let minor = parts.next()?.parse::<u16>().ok()?;
    (major > 0).then(|| format!("{major}.{minor}"))
}

fn queue_name(queue_id: i64) -> &'static str {
    match queue_id {
        420 => "Ranked Solo/Duo",
        _ => "Unsupported queue",
    }
}

fn map_name(map_id: i64) -> &'static str {
    match map_id {
        11 => "Summoner's Rift",
        _ => "Unsupported map",
    }
}

fn apply_context(snapshot: &mut LeagueSnapshot, context: LeagueContext) {
    snapshot.patch = context.patch;
    snapshot.region = context.region;
    snapshot.queue = context.queue;
    snapshot.map = context.map;
}

fn positive_ids(values: impl IntoIterator<Item = i64>) -> Vec<i64> {
    values
        .into_iter()
        .filter(|value| *value > 0)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

pub(crate) fn phase_to_state(phase: &str) -> LeagueLifecycleState {
    match phase {
        "Lobby" => LeagueLifecycleState::Lobby,
        "Matchmaking" | "ReadyCheck" => LeagueLifecycleState::Queue,
        "ChampSelect" => LeagueLifecycleState::ChampionSelect,
        "GameStart" => LeagueLifecycleState::Loading,
        "InProgress" | "Reconnect" => LeagueLifecycleState::ActiveGame,
        "WaitingForStats" | "PreEndOfGame" | "EndOfGame" => LeagueLifecycleState::PostGame,
        _ => LeagueLifecycleState::ClientIdle,
    }
}

fn is_known_idle_phase(phase: &str) -> bool {
    matches!(phase, "None" | "TerminatedInError")
}

fn unix_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::{normalize_patch, normalize_region, normalize_role, phase_to_state, positive_ids};
    use crate::models::LeagueLifecycleState;

    #[test]
    fn maps_every_supported_gameflow_phase() {
        assert_eq!(phase_to_state("None"), LeagueLifecycleState::ClientIdle);
        assert_eq!(phase_to_state("Lobby"), LeagueLifecycleState::Lobby);
        assert_eq!(phase_to_state("Matchmaking"), LeagueLifecycleState::Queue);
        assert_eq!(phase_to_state("ReadyCheck"), LeagueLifecycleState::Queue);
        assert_eq!(
            phase_to_state("ChampSelect"),
            LeagueLifecycleState::ChampionSelect
        );
        assert_eq!(phase_to_state("GameStart"), LeagueLifecycleState::Loading);
        assert_eq!(
            phase_to_state("InProgress"),
            LeagueLifecycleState::ActiveGame
        );
        assert_eq!(
            phase_to_state("WaitingForStats"),
            LeagueLifecycleState::PostGame
        );
        assert_eq!(phase_to_state("EndOfGame"), LeagueLifecycleState::PostGame);
    }

    #[test]
    fn normalizes_only_known_roles() {
        assert_eq!(normalize_role("MIDDLE").as_deref(), Some("MID"));
        assert_eq!(normalize_role("utility").as_deref(), Some("SUPPORT"));
        assert_eq!(normalize_role("unknown"), None);
    }

    #[test]
    fn local_item_ids_are_positive_and_deduplicated() {
        assert_eq!(positive_ids([0, 3157, 6657, 3157]), vec![3157, 6657]);
    }

    #[test]
    fn normalizes_region_and_game_version_without_calendar_relabeling() {
        assert_eq!(normalize_region("euw1").as_deref(), Some("EUW"));
        assert_eq!(normalize_region("EUN1").as_deref(), Some("EUNE"));
        assert_eq!(normalize_patch("16.17.700.1234").as_deref(), Some("16.17"));
        assert_eq!(normalize_patch("invalid"), None);
    }
}
