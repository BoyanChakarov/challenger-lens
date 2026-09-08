use std::{
    collections::BTreeSet,
    env, fmt, fs,
    path::{Path, PathBuf},
};

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct LcuCredentials {
    pub process_id: u32,
    pub port: u16,
    pub password: String,
}

impl fmt::Debug for LcuCredentials {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LcuCredentials")
            .field("process_id", &self.process_id)
            .field("port", &self.port)
            .field("password", &"[REDACTED]")
            .finish()
    }
}

pub(crate) fn parse_lockfile(contents: &str) -> Option<LcuCredentials> {
    let mut fields = contents.trim().splitn(5, ':');
    let process_name = fields.next()?.trim();
    let process_id = fields.next()?.trim().parse::<u32>().ok()?;
    let port = fields.next()?.trim().parse::<u16>().ok()?;
    let password = fields.next()?.trim();
    let protocol = fields.next()?.trim();

    if process_name.is_empty()
        || process_id == 0
        || port == 0
        || password.is_empty()
        || !protocol.eq_ignore_ascii_case("https")
    {
        return None;
    }

    Some(LcuCredentials {
        process_id,
        port,
        password: password.to_owned(),
    })
}

pub(crate) fn discover_credentials() -> Option<LcuCredentials> {
    candidate_lockfiles()
        .into_iter()
        .filter_map(|path| fs::read_to_string(path).ok())
        .find_map(|contents| parse_lockfile(&contents))
}

fn candidate_lockfiles() -> BTreeSet<PathBuf> {
    let mut candidates = BTreeSet::new();

    if let Some(path) = env::var_os("LEAGUE_LOCKFILE").map(PathBuf::from) {
        if path.file_name().is_some_and(|name| name == "lockfile") {
            candidates.insert(path);
        }
    }

    for drive in b'C'..=b'Z' {
        candidates.insert(PathBuf::from(format!(
            "{}:\\Riot Games\\League of Legends\\lockfile",
            drive as char
        )));
    }

    if let Some(program_data) = env::var_os("PROGRAMDATA").map(PathBuf::from) {
        add_product_settings_candidate(&program_data, &mut candidates);
        add_install_manifest_candidates(&program_data, &mut candidates);
    }

    candidates
}

fn add_product_settings_candidate(program_data: &Path, candidates: &mut BTreeSet<PathBuf>) {
    let settings_path = program_data
        .join("Riot Games")
        .join("Metadata")
        .join("league_of_legends.live")
        .join("league_of_legends.live.product_settings.yaml");
    let Ok(contents) = fs::read_to_string(settings_path) else {
        return;
    };

    for line in contents.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if key.trim() != "product_install_full_path" {
            continue;
        }
        let install_path = value
            .trim()
            .trim_matches(|character| character == '\'' || character == '"');
        if !install_path.is_empty() {
            candidates.insert(PathBuf::from(install_path).join("lockfile"));
        }
    }
}

fn add_install_manifest_candidates(program_data: &Path, candidates: &mut BTreeSet<PathBuf>) {
    let manifest_path = program_data
        .join("Riot Games")
        .join("RiotClientInstalls.json");
    let Ok(contents) = fs::read_to_string(manifest_path) else {
        return;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&contents) else {
        return;
    };

    let mut paths = Vec::new();
    collect_manifest_paths(&value, &mut paths);
    for path in paths {
        let normalized = path.replace('/', "\\");
        if !normalized
            .to_ascii_lowercase()
            .contains("league of legends")
        {
            continue;
        }
        let candidate = PathBuf::from(normalized);
        let install_dir = if candidate.extension().is_some() {
            candidate.parent().map(Path::to_path_buf)
        } else {
            Some(candidate)
        };
        if let Some(install_dir) = install_dir {
            candidates.insert(install_dir.join("lockfile"));
        }
    }
}

fn collect_manifest_paths(value: &serde_json::Value, paths: &mut Vec<String>) {
    match value {
        serde_json::Value::String(value) => paths.push(value.clone()),
        serde_json::Value::Array(values) => {
            for value in values {
                collect_manifest_paths(value, paths);
            }
        }
        serde_json::Value::Object(values) => {
            for (key, value) in values {
                paths.push(key.clone());
                collect_manifest_paths(value, paths);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::parse_lockfile;

    #[test]
    fn parses_a_valid_https_lockfile() {
        let credentials = parse_lockfile("LeagueClient:1234:54321:local-token:https").unwrap();

        assert_eq!(credentials.process_id, 1234);
        assert_eq!(credentials.port, 54321);
        assert_eq!(credentials.password, "local-token");
        assert!(!format!("{credentials:?}").contains("local-token"));
    }

    #[test]
    fn rejects_insecure_or_malformed_lockfiles() {
        assert!(parse_lockfile("LeagueClient:1234:54321:token:http").is_none());
        assert!(parse_lockfile("LeagueClient:not-a-pid:54321:token:https").is_none());
        assert!(parse_lockfile("LeagueClient:1234:0:token:https").is_none());
        assert!(parse_lockfile("LeagueClient:1234:54321::https").is_none());
    }
}
