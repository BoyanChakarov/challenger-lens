use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LeagueLifecycleState {
    ClientClosed,
    ClientIdle,
    Lobby,
    Queue,
    ChampionSelect,
    Loading,
    ActiveGame,
    PostGame,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorDiagnostic {
    pub code: String,
    pub message: String,
    pub retry_after_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampionSlot {
    pub cell_id: i64,
    pub champion_id: Option<i64>,
    pub champion_pick_intent: Option<i64>,
    pub assigned_role: Option<String>,
    pub locked_in: bool,
    pub is_local_player: bool,
    pub spell_ids: Option<[i64; 2]>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunePageSnapshot {
    pub id: i64,
    pub primary_style_id: i64,
    pub sub_style_id: i64,
    pub selected_perk_ids: Vec<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampionSelectTimer {
    pub phase: String,
    pub total_time_ms: i64,
    pub adjusted_time_left_ms: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampionSelectSnapshot {
    pub local_player_cell_id: i64,
    pub local_champion_id: Option<i64>,
    pub assigned_role: Option<String>,
    pub allies: Vec<ChampionSlot>,
    pub enemies: Vec<ChampionSlot>,
    pub ally_ban_ids: Vec<i64>,
    pub enemy_ban_ids: Vec<i64>,
    pub current_rune_page: Option<RunePageSnapshot>,
    pub current_spell_ids: Option<[i64; 2]>,
    pub timer: ChampionSelectTimer,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveGameSnapshot {
    pub game_mode: String,
    pub game_time_seconds: f64,
    pub map_name: String,
    pub map_number: i64,
    pub owned_item_ids: Vec<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueSnapshot {
    pub id: i64,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapSnapshot {
    pub id: i64,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeagueSnapshot {
    pub state: LeagueLifecycleState,
    pub observed_at_ms: u64,
    pub client_connected: bool,
    pub raw_phase: Option<String>,
    pub patch: Option<String>,
    pub region: Option<String>,
    pub queue: Option<QueueSnapshot>,
    pub map: Option<MapSnapshot>,
    pub champion_select: Option<ChampionSelectSnapshot>,
    pub active_game: Option<ActiveGameSnapshot>,
    pub diagnostic: Option<ConnectorDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalChampionMastery {
    pub champion_id: i64,
    pub champion_level: i64,
    pub champion_points: i64,
    pub highest_grade: String,
    pub last_play_time: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalPlayerProfile {
    pub game_name: String,
    pub tag_line: String,
    pub region: String,
    pub summoner_level: i64,
    pub patch: Option<String>,
    pub masteries: Vec<LocalChampionMastery>,
}

impl LeagueSnapshot {
    pub fn simple(
        state: LeagueLifecycleState,
        observed_at_ms: u64,
        client_connected: bool,
        raw_phase: Option<String>,
    ) -> Self {
        Self {
            state,
            observed_at_ms,
            client_connected,
            raw_phase,
            patch: None,
            region: None,
            queue: None,
            map: None,
            champion_select: None,
            active_game: None,
            diagnostic: None,
        }
    }

    pub fn with_diagnostic(mut self, code: &str, message: &str, retry_after_ms: u64) -> Self {
        self.diagnostic = Some(ConnectorDiagnostic {
            code: code.to_owned(),
            message: message.to_owned(),
            retry_after_ms,
        });
        self
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LcuChampionSelectSession {
    #[serde(default)]
    pub local_player_cell_id: i64,
    #[serde(default)]
    pub my_team: Vec<LcuChampionSlot>,
    #[serde(default)]
    pub their_team: Vec<LcuChampionSlot>,
    #[serde(default)]
    pub actions: Vec<Vec<LcuChampionSelectAction>>,
    #[serde(default)]
    pub bans: LcuBans,
    #[serde(default)]
    pub timer: LcuTimer,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LcuChampionSlot {
    #[serde(default)]
    pub cell_id: i64,
    #[serde(default)]
    pub champion_id: i64,
    #[serde(default)]
    pub champion_pick_intent: i64,
    #[serde(default)]
    pub assigned_position: String,
    #[serde(default)]
    pub spell1_id: i64,
    #[serde(default)]
    pub spell2_id: i64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LcuChampionSelectAction {
    #[serde(default)]
    pub actor_cell_id: i64,
    #[serde(default)]
    pub champion_id: i64,
    #[serde(default)]
    pub completed: bool,
    #[serde(default, rename = "type")]
    pub action_type: String,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LcuBans {
    #[serde(default)]
    pub my_team_bans: Vec<i64>,
    #[serde(default)]
    pub their_team_bans: Vec<i64>,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LcuTimer {
    #[serde(default)]
    pub phase: String,
    #[serde(default)]
    pub total_time_in_phase: i64,
    #[serde(default)]
    pub adjusted_time_left_in_phase: i64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LcuRunePage {
    #[serde(default)]
    pub id: i64,
    #[serde(default)]
    pub primary_style_id: i64,
    #[serde(default)]
    pub sub_style_id: i64,
    #[serde(default)]
    pub selected_perk_ids: Vec<i64>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveGameStats {
    #[serde(default)]
    pub game_mode: String,
    #[serde(default)]
    pub game_time: f64,
    #[serde(default)]
    pub map_name: String,
    #[serde(default)]
    pub map_number: i64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiveItem {
    #[serde(default, rename = "itemID")]
    pub item_id: i64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LcuRegionLocale {
    #[serde(default)]
    pub region: String,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LcuCurrentSummoner {
    #[serde(default)]
    pub game_name: String,
    #[serde(default)]
    pub tag_line: String,
    #[serde(default)]
    pub summoner_level: i64,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LcuChampionMastery {
    #[serde(default)]
    pub champion_id: i64,
    #[serde(default)]
    pub champion_level: i64,
    #[serde(default)]
    pub champion_points: i64,
    #[serde(default)]
    pub highest_grade: String,
    #[serde(default)]
    pub last_play_time: i64,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LcuGameflowSession {
    #[serde(default)]
    pub game_data: LcuGameData,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LcuGameData {
    #[serde(default)]
    pub queue: LcuQueue,
}

#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LcuQueue {
    #[serde(default)]
    pub id: i64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub map_id: i64,
}
