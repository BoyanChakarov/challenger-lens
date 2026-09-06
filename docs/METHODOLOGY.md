# Analytics methodology

The app describes what happened in sampled EUW and EUNE Challenger games. It does not claim that a champion pick caused the result.

## Cohort and sampling unit

- Cohorts are separated by the authoritative `major.minor` portion of `info.gameVersion`.
- Only Ranked Solo/Duo (`queueId=420`) Summoner's Rift (`mapId=11`) games are eligible.
- Games under ten minutes and Riot-marked remakes are excluded.
- A match can be discovered through several Challenger players, but is stored once.
- A role pair is stored once per unique match and role. Directional matchup observations are derived from that canonical pair.
- A player is described as Challenger at collection time unless a prior ladder snapshot supports a stronger historical claim.

## Role and matchup quality

The MVP accepts a matchup when each team has one participant with the same valid Riot `teamPosition`. Missing, duplicate, or ambiguous roles are excluded from lane-specific aggregates. Jungle is described as a role opponent. Bottom and support results should be read with their 2v2 context in mind.

A future version can compare Riot's assignment with early-position timeline evidence and use a one-to-one role assignment model for lane swaps.

## Metrics

All paired differences are oriented as the selected champion minus the opponent.

- Win rate: wins / unique eligible games.
- GPM: `goldEarned / duration_minutes`.
- CSPM: `(totalMinionsKilled + neutralMinionsKilled) / duration_minutes`.
- KDA: `(kills + assists) / max(1, deaths)`.
- GD/XP/CS at 15: difference between the two role opponents at the nearest timeline frame within one minute of 15:00.
- Build frequency: games ending with the displayed canonical item set / all eligible matchup games, including rarer sets below the display threshold.
- Build win rate: descriptive only; completed-item win rate has affordability and “win-more” bias.

## Small samples and evidence

Raw win rate is shown for transparency, but rankings use a conservative estimate. The matchup rate is shrunk toward the champion's same-patch, same-role baseline with a 20-game Beta prior. Wilson intervals communicate uncertainty.

The public evidence score summarizes sample size, player breadth, player concentration, raw-rate interval precision, and whether gold/CS/KDA differences point in the same direction as the baseline-adjusted result. It is an evidence-quality ranking, not a probability or a causal estimate. Early gold, CS, and XP remain visible so readers can inspect conflicting signals; KDA is descriptive and is not treated as an independent pre-game predictor.

Labels are deliberately cautious:

- Rows below the chosen dashboard sample floor are hidden; the default floor is 25 games.
- Low evidence: score below 60.
- Medium evidence: score from 60 through 79.
- High evidence: score of at least 80.
- The separate “favorable / neutral / unfavorable” database label requires at least 10 games, three players, no single-player majority, and a sufficiently large composite counter score.

The exact thresholds live beside the SQL aggregation and UI labels so they can be reviewed together.

## Prediction roadmap

The portfolio-ready next model is a partially pooled logistic model with side, region, champion main effects, ordered matchup interaction, and player-strength effects. It must be validated forward in time, not with a random row split. Report Brier score, log loss, and calibration against a champion-only baseline. Post-game gold, CS, XP, KDA, and completed items must not be used as pre-game features.

## Important limitations

- Observational matchups are not causal. Player mastery, one-tricks, autofill, side, draft, team composition, and patch-day meta shifts confound results.
- Challenger results do not automatically generalize to other ranks.
- EUW and EUNE have different populations and sample sizes; pooled results retain region filters.
- Item results are especially affected by game state and whether a player could afford to finish the item.
- Missing timelines and rate limits can create coverage bias.
- Most exact current-patch matchups will correctly remain “insufficient” or “unclear.”
