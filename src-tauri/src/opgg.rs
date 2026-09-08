use reqwest::{header::HeaderValue, Client};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

const MCP_ENDPOINT: &str = "https://mcp-api.op.gg/mcp";
const MCP_PROTOCOL_VERSION: &str = "2025-06-18";
const CACHE_TTL: Duration = Duration::from_secs(6 * 60 * 60);

#[derive(Clone)]
struct CacheEntry {
    fetched_at: Instant,
    payload: Value,
}

pub struct OpggClient {
    http: Client,
    session_id: Mutex<Option<String>>,
    cache: Mutex<HashMap<String, CacheEntry>>,
    request_id: AtomicU64,
}

impl OpggClient {
    pub fn new() -> Result<Self, reqwest::Error> {
        Ok(Self {
            http: Client::builder()
                .user_agent("Challenger-Lens-Companion/0.2 OP.GG-MCP")
                .timeout(Duration::from_secs(8))
                .build()?,
            session_id: Mutex::new(None),
            cache: Mutex::new(HashMap::new()),
            request_id: AtomicU64::new(2),
        })
    }

    pub async fn matchup_guide(
        &self,
        position: &str,
        my_champion: &str,
        opponent_champion: &str,
    ) -> Result<Value, String> {
        validate_position(position)?;
        validate_champion_token(my_champion)?;
        validate_champion_token(opponent_champion)?;
        self.call_tool(
            format!("matchup:{position}:{my_champion}:{opponent_champion}"),
            "lol_get_lane_matchup_guide",
            json!({
                "position": position,
                "my_champion": my_champion,
                "opponent_champion": opponent_champion,
                "lang": "en_US"
            }),
        )
        .await
    }

    pub async fn ban_advice(&self, position: &str, champion: &str) -> Result<Value, String> {
        validate_position(position)?;
        validate_champion_token(champion)?;

        let meta_request = self.call_tool(
            format!("lane-meta:{position}"),
            "lol_list_lane_meta_champions",
            json!({
                "position": position,
                "lang": "en_US",
                "desired_output_fields": [
                    format!("data.positions.{position}[].{{ban_rate,champion,pick_rate,play,rank,tier,win,win_rate}}"),
                    "position_filter"
                ]
            }),
        );
        let analysis_request = self.call_tool(
            format!("counter-analysis:{position}:{champion}"),
            "lol_get_champion_analysis",
            json!({
                "game_mode": "ranked",
                "champion": champion,
                "position": position,
                "lang": "en_US",
                "desired_output_fields": [
                    "champion",
                    "position",
                    "data.weak_counters[].{champion_id,champion_name,counter_win_rate,my_win_rate,play,win,win_rate}"
                ]
            }),
        );
        let (meta, analysis) = tokio::try_join!(meta_request, analysis_request)?;

        Ok(json!({ "meta": meta, "analysis": analysis }))
    }

    pub async fn player_profile(
        &self,
        game_name: &str,
        tag_line: &str,
        region: &str,
    ) -> Result<Value, String> {
        validate_riot_identity(game_name, tag_line)?;
        validate_region(region)?;
        let profile_request = self.call_tool(
            format!("player-profile:{region}:{game_name}:{tag_line}"),
            "lol_get_summoner_profile",
            json!({
                "game_name": game_name,
                "tag_line": tag_line,
                "region": region,
                "lang": "en_US",
                "desired_output_fields": [
                    "data.summoner.{game_name,tagline,region,level,profile_image_url,updated_at}",
                    "data.summoner.league_stats[].tier_info.{division,level,lp,tier}",
                    "data.summoner.league_stats[].{game_type,lose,win}",
                    "data.summoner.ranked_most_champions.my_champion_stats[].{champion_name,id,lose,play,win}"
                ]
            }),
        );
        let matches_request = self.call_tool(
            format!("player-matches:{region}:{game_name}:{tag_line}"),
            "lol_list_summoner_matches",
            json!({
                "game_name": game_name,
                "tag_line": tag_line,
                "region": region,
                "lang": "en_US",
                "limit": 10,
                "desired_output_fields": [
                    "data.game_history[].{created_at,game_type,id}",
                    "data.game_history[].participants[].{champion_id,champion_name,position}",
                    "data.game_history[].participants[].stats.{assist,death,kill,result}"
                ]
            }),
        );
        let (profile, matches) = tokio::try_join!(profile_request, matches_request)?;
        Ok(json!({ "profile": profile, "matches": matches }))
    }

    pub async fn match_detail(
        &self,
        region: &str,
        game_id: &str,
        created_at: &str,
    ) -> Result<Value, String> {
        validate_region(region)?;
        validate_game_id(game_id)?;
        validate_timestamp(created_at)?;
        self.call_tool(
            format!("match-detail:{region}:{game_id}"),
            "lol_get_summoner_game_detail",
            json!({
                "region": region,
                "game_id": game_id,
                "created_at": created_at,
                "lang": "en_US",
                "desired_output_fields": [
                    "data.game_detail.{created_at,game_type,id}",
                    "data.game_detail.teams[].participants[].{champion_id,champion_name,is_target,position,team_key}",
                    "data.game_detail.teams[].participants[].stats.{result}"
                ]
            }),
        )
        .await
    }

    async fn call_tool(
        &self,
        key: String,
        tool_name: &str,
        arguments: Value,
    ) -> Result<Value, String> {
        if let Some(payload) = self.cached(&key).await {
            return Ok(payload);
        }

        let session_id = self.ensure_session().await?;
        let request_id = self.request_id.fetch_add(1, Ordering::Relaxed);
        let response = self
            .http
            .post(MCP_ENDPOINT)
            .header("accept", "application/json, text/event-stream")
            .header("mcp-session-id", &session_id)
            .json(&json!({
                "jsonrpc": "2.0",
                "id": request_id,
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": arguments
                }
            }))
            .send()
            .await
            .map_err(|_| "OP.GG MCP did not respond in time.".to_owned())?;

        if !response.status().is_success() {
            return Err(format!(
                "OP.GG MCP returned HTTP {}.",
                response.status().as_u16()
            ));
        }
        let envelope: Value = response
            .json()
            .await
            .map_err(|_| "OP.GG MCP returned an unreadable response.".to_owned())?;
        if let Some(message) = envelope.pointer("/error/message").and_then(Value::as_str) {
            return Err(format!("OP.GG MCP error: {message}"));
        }
        let text = envelope
            .pointer("/result/content/0/text")
            .and_then(Value::as_str)
            .ok_or_else(|| "OP.GG MCP returned no matchup data.".to_owned())?;
        // Some OP.GG tools return JSON while compact list/analysis tools return
        // their documented class-like text representation. Preserve either
        // form; the frontend adapter validates the exact fields it consumes.
        let payload = serde_json::from_str(text).unwrap_or_else(|_| Value::String(text.to_owned()));

        self.cache.lock().await.insert(
            key,
            CacheEntry {
                fetched_at: Instant::now(),
                payload: payload.clone(),
            },
        );
        Ok(payload)
    }

    async fn cached(&self, key: &str) -> Option<Value> {
        let mut cache = self.cache.lock().await;
        cache.retain(|_, entry| entry.fetched_at.elapsed() < CACHE_TTL);
        cache.get(key).map(|entry| entry.payload.clone())
    }

    async fn ensure_session(&self) -> Result<String, String> {
        let mut session = self.session_id.lock().await;
        if let Some(existing) = session.as_ref() {
            return Ok(existing.clone());
        }

        let response = self
            .http
            .post(MCP_ENDPOINT)
            .header("accept", "application/json, text/event-stream")
            .json(&json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": MCP_PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": { "name": "challenger-lens", "version": "0.2.0" }
                }
            }))
            .send()
            .await
            .map_err(|_| "Could not initialize the OP.GG MCP connection.".to_owned())?;
        if !response.status().is_success() {
            return Err(format!(
                "OP.GG MCP initialization returned HTTP {}.",
                response.status().as_u16()
            ));
        }
        let session_header = response
            .headers()
            .get("mcp-session-id")
            .and_then(|value| HeaderValue::to_str(value).ok())
            .map(str::to_owned)
            .ok_or_else(|| "OP.GG MCP did not issue a session.".to_owned())?;

        let initialized = self
            .http
            .post(MCP_ENDPOINT)
            .header("accept", "application/json, text/event-stream")
            .header("mcp-session-id", &session_header)
            .json(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }))
            .send()
            .await
            .map_err(|_| "Could not finish the OP.GG MCP handshake.".to_owned())?;
        if !initialized.status().is_success() {
            return Err("OP.GG MCP rejected the initialized session.".to_owned());
        }

        *session = Some(session_header.clone());
        Ok(session_header)
    }
}

fn validate_position(value: &str) -> Result<(), String> {
    if ["top", "mid", "jungle", "adc", "support"].contains(&value) {
        Ok(())
    } else {
        Err("Unsupported OP.GG position.".to_owned())
    }
}

fn validate_champion_token(value: &str) -> Result<(), String> {
    if !value.is_empty()
        && value.len() <= 40
        && value
            .chars()
            .all(|character| character.is_ascii_uppercase() || character == '_')
    {
        Ok(())
    } else {
        Err("Invalid OP.GG champion token.".to_owned())
    }
}

fn validate_riot_identity(game_name: &str, tag_line: &str) -> Result<(), String> {
    let safe = |value: &str, maximum: usize| {
        !value.trim().is_empty()
            && value.chars().count() <= maximum
            && value.chars().all(|character| !character.is_control())
    };
    if safe(game_name, 32) && safe(tag_line, 16) {
        Ok(())
    } else {
        Err("Invalid Riot ID.".to_owned())
    }
}

fn validate_region(value: &str) -> Result<(), String> {
    if [
        "NA", "EUW", "EUNE", "KR", "JP", "BR", "LAN", "LAS", "OCE", "TR", "RU", "SG", "PH", "TW",
        "VN", "TH", "ME",
    ]
    .contains(&value)
    {
        Ok(())
    } else {
        Err("Unsupported OP.GG region.".to_owned())
    }
}

fn validate_game_id(value: &str) -> Result<(), String> {
    if !value.is_empty()
        && value.len() <= 128
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '_' | '=' | '%' | '-')
        })
    {
        Ok(())
    } else {
        Err("Invalid OP.GG game identifier.".to_owned())
    }
}

fn validate_timestamp(value: &str) -> Result<(), String> {
    if value.len() <= 40
        && value.contains('T')
        && value.chars().all(|character| !character.is_control())
    {
        Ok(())
    } else {
        Err("Invalid match timestamp.".to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        validate_champion_token, validate_game_id, validate_position, validate_region,
        validate_riot_identity,
    };

    #[test]
    fn accepts_only_known_positions_and_safe_champion_tokens() {
        assert!(validate_position("mid").is_ok());
        assert!(validate_position("middle").is_err());
        assert!(validate_champion_token("AURELION_SOL").is_ok());
        assert!(validate_champion_token("Ahri").is_err());
        assert!(validate_champion_token("../AHRI").is_err());
        assert!(validate_region("EUNE").is_ok());
        assert!(validate_region("unknown").is_err());
        assert!(validate_riot_identity("Player Name", "EUW").is_ok());
        assert!(validate_riot_identity("", "EUW").is_err());
        assert!(validate_game_id("abc_123-=%").is_ok());
        assert!(validate_game_id("../secret").is_err());
    }
}
