# VR Savant: Implementation Handoff

A Baseball Savant-style scouting site for a VR baseball competition (played in the WBD VRC Baseball world in VRChat, streamed on Korean Waktaverse channels). Hosted on GitHub Pages. Primary user: a coach scouting hitters and pitchers, some with history from previous competitions and some brand new.

> **For Claude Code:** build in the milestone order in section 9. Each milestone is independently shippable. Ask the owner before changing the data schema (section 4); everything else is your call.

## Progress

**M0: done (2026-10-07).** Live at https://wbd-savant.github.io/vr-baseball-analysis/ behind the password gate.

Changes from the plan below, decided during M0:
- **Two repos instead of one private repo** (section 3a). GitHub Pro was not available, so the code repo is public and the data is private:
  - `wbd-savant/vr-baseball-analysis` (public): code, pipeline, schemas, docs. Pages is served from here.
  - `wbd-savant/vr-baseball-data` (private): everything under `data/raw/`. CI checks it out with a read-only deploy key (`DATA_DEPLOY_KEY` secret); locally it is cloned into `data/raw/`, which the public repo ignores.
  - CI logs are public, so the pipeline never prints raw data or coach notes.
- **Repos are owned by the `wbd-savant` organization**, so the site address does not show the owner's personal account. The org setting that allows deploy keys must stay on, or CI cannot fetch the data repo.
- `npm run dev` reads plain JSON; the password gate is tried locally with `npm run build && npm run preview` (see README).
- No `make` on the owner's Windows machine; CLAUDE.md lists the plain `python` command for each `make` target.

**M1: done (2026-10-07).** `make data` validates `data/raw/` and writes every JSON file in section 6 from the imported legacy games (4 games, 368 pitches, 154 PAs, 43 players). `make test` runs 18 tests, including every stat formula against a hand-computed one-inning fixture game (`pipeline/tests/fixture.py`). What was built and how it differs from the plan:
- Schemas: `data/schema/*.schema.json` + `pitch_types.csv` (public repo). Checked by a small built-in validator (`pipeline/rawdata.py`) instead of the `jsonschema` package, to keep dependencies to pandas/numpy/scipy/cryptography.
- Player identity, rosters and the extra `games.csv` columns: section 4.
- `import_legacy.py` built, since the legacy games are the site demo: section 4a, "As built".
- Stats choices: **ERA is reported as RA9** (all runs allowed per 9 innings), because earned and unearned runs are not charted; runs are credited to the pitcher on the mound when they score. Foul tips count as whiffs (Baseball Savant's convention). Outs and runs on each row come from the state on the next row.
- Not built in M1: the **synthetic seed generator** (section 8). The hand-written fixture covers walks and home runs for the formula tests; the generator is deferred to M4, where point-mode spray charts first need `field_x/field_y` data. Percentiles and priors in `league.json` come with M4/M5.

**Next: M2** (charting tool).

---

## 1. Constraints that shape the design

| Constraint | Consequence |
|---|---|
| GitHub Pages = static hosting only | No backend or database. Data lives in the repo as CSV; a build step turns it into JSON the site reads. |
| No tracking data (no pitch location, no batted-ball coordinates) | All location data is **hand-charted** by a human watching video. Design for coarse, honest precision. |
| Pitch velocity is visible on stream | Velocity is the one "real" measurement. Enter per pitch. |
| Small samples; many new players | Raw rates are misleading. Every rate stat needs a sample size, and shrunk estimates (section 6). |
| One person charts games | Data entry speed is the real bottleneck. The charting tool is the most important thing to build well. |

**Core idea:** two apps in one repo. A **charting tool** (fast pitch-by-pitch entry while watching video) and a **scouting site** (read-only player pages, leaderboards, charts).

## 2. Decisions and open questions

**Decided**
- **Pitch location:** available. Use Savant zone integers: 1-9 in the strike zone, 11-14 for the four out-of-zone regions.
- **Pitch type:** shown on stream for some pitches, hand-labeled or blank for others. Record it when known, with a `pitch_type_source` column (`stream` / `charter`). All pitch-type views must tolerate blanks and fall back to velocity bands.
- **Access:** password-gated site (one shared password the coach can pass on), with a config switch to go fully public later. See section 3a.
- **Historical data:** the owner will **re-chart the earlier games in the new tool**, following `docs/charting-guide.md`. Until then the six existing CSVs (section 4a) are imported with `import_legacy.py` as the site's demo data.
- **Charting guide:** `docs/charting-guide.md` is the contract for the charting tool: every field, value list, event type and export check in it must exist in the tool.

- **Language:** scouting site is **Korean**; charting tool is English. See section 7a.

**Answered by the owner (2026-10-07)**
1. **Game rules:** innings per game vary from game to game. Nine players on the field as in real baseball; past games appear to have had no DH. Official rules for the new competition are not out yet, so **assume nothing**: innings come from the data, and nothing may assume a fixed game length. Per-9-inning rates (RA9, HR/9) are still fine as rates, since they do not depend on how long a game is.
2. **Field dimensions:** not known. Top-down screenshot: [`docs/field-topdown.png`](field-topdown.png). The outfield wall is irregular: a short, angled left-field corner, a deep right-center, and a notch in the right-field corner. Distances can only be estimated relative to the 90-foot-equivalent base paths, and the screenshot has some perspective, so treat any distance as approximate. The spray chart (M4) traces this outline.
3. **Pitch type in legacy games:** unknown. The legacy data is a **demo only** (it will be re-charted), so the default rules in section 4a stand.
4. **`좌투` / `우투`:** `__Daki__` pitched with both hands, switching between batters. The per-pitch `pitcher_hand` column handles this; the importer carries each note forward as described in section 4a.
5. **Flagged rows and name variants:** fix as needed; the only requirement is that the demo data does not break anything. Fixes are applied by the importer, not by editing the original files.

**Consequence:** because the legacy data is the site demo, `import_legacy.py` **is needed** (M1), turning the six files into normal `games.csv` + `pitches/*.csv`.

**New requirement: VRChat username vs. display name.** Raw data records each player's VRChat username, but the site should show a different display name. See the player identity section in section 4.

## 3. Architecture

```
vr-savant/
├── data/
│   ├── raw/                  # source of truth, hand-edited or exported from charting tool
│   │   ├── players.csv
│   │   ├── teams.csv
│   │   ├── games.csv
│   │   ├── pitches/          # one CSV per game: {game_id}.csv
│   │   ├── player_aliases.csv
│   │   └── legacy/           # owner's original hand-charted CSVs + manifest.csv (section 4a)
│   └── schema/               # JSON Schema files used for validation
├── pipeline/                 # Python: validate -> aggregate -> model -> export
│   ├── import_legacy.py
│   ├── validate.py
│   ├── build_stats.py
│   ├── shrinkage.py
│   └── export_json.py
├── site/                     # frontend (Vite + React + TypeScript)
│   ├── src/
│   │   ├── pages/            # Leaderboard, Player, Team, Game, Compare, Chart (entry tool)
│   │   ├── components/       # SprayChart, ZoneGrid, PercentileBars, VeloHistogram
│   │   └── lib/
│   └── public/data/          # generated JSON (gitignored, built in CI)
├── .github/workflows/deploy.yml
└── CLAUDE.md
```

**Stack**
- **Frontend:** Vite + React + TypeScript. Charts in D3 or Observable Plot as SVG (the field and zone are custom drawings, so a low-level library fits better than a chart kit). Use `HashRouter` so deep links work on Pages without a 404 hack.
- **Pipeline:** Python 3.11+, pandas, numpy, scipy. No heavier dependencies.
- **Deploy:** GitHub Actions: run pipeline, build site, publish with `actions/deploy-pages`. Set Vite `base` to `/<repo-name>/`.

**Data flow**

```
watch VOD -> charting tool -> export {game_id}.csv -> commit to data/raw/pitches/
        -> CI: validate -> build stats -> export JSON -> build site -> Pages
```

## 3a. Password gate

GitHub Pages cannot do real logins, and a Pages site is publicly reachable even when the repo is private (true access control is Enterprise-only). So the protection is **encrypting the data, not hiding the page**.

**How it works**
1. The repo is **private**, so raw CSVs are not readable. Pages on a private repo needs GitHub Pro, which is free for students through the GitHub Student Developer Pack. (Alternative on a free plan: private data repo whose CI pushes only encrypted output to a separate public site repo.)
2. The site password is stored as a GitHub Actions secret, `SITE_PASSWORD`. Never commit it.
3. In CI, after the pipeline writes JSON, `pipeline/encrypt.py` encrypts every data file: key derived with PBKDF2-SHA256 (600k+ iterations, random salt), encryption with AES-256-GCM. Output is `*.json.enc`; plaintext JSON is not deployed.
4. The site shell (HTML/JS/CSS) is public and contains no data. On load it shows a password prompt, derives the key with the Web Crypto API, and tries to decrypt a small `meta.json.enc`. Success unlocks the app; failure shows "wrong password".
5. The derived key is kept in `sessionStorage` (or `localStorage` behind a "remember this device" checkbox) so the coach does not retype it on every page.
6. All data loading goes through one `loadData(path)` helper that fetches and decrypts, so no page code cares whether encryption is on.

**Going public later:** set `PUBLIC_MODE=true` in the workflow. CI skips encryption, and `loadData` fetches plain JSON with no prompt. No other code changes.

**Limits to state plainly in the README**
- It is one shared password. Anyone who has it can read everything and share it onward. Revoking access means changing the secret and redeploying.
- Strength depends on the password. Use a long passphrase (4+ random words); a short one can be brute-forced offline since the encrypted files are downloadable.

**Two access tiers**

| Who | Gets | How |
|---|---|---|
| Owner only | Charting tool | **Not deployed.** It is a separate Vite entry point (`site/chart.html`, `npm run chart`) that runs on the owner's machine from the private repo. It is excluded from the production build, so its code never reaches Pages. |
| Password holders | Scouting site (read-only) | Encrypted data + password prompt, as above. |

Because the charting tool is never published, there is nothing for a password holder to find or unlock, and no second password to manage. CI must assert the production bundle contains no charting route (fail the build if `chart` assets appear in `dist/`).

*Optional later, only if the owner wants to chart from a device without the repo:* deploy the charting tool as an encrypted bundle under a separate `ADMIN_PASSWORD` secret. Do not build this unless asked.

## 4. Data model

The grain is **one row per pitch**. Everything else is derived. Do not store derived stats in `raw/`.

The exact columns, types and allowed values of every table are defined in `data/schema/*.schema.json` (JSON Schema; column order = order of `properties`). Those files are authoritative; the lists below summarize them. Changing them needs the owner's approval.

### Player identity (decided 2026-10-07)
Raw data and the charting tool know players by **VRChat username**; the site shows a separate **display name**. A permanent `player_id` connects them, so a username change never touches old data.

### players.csv
`player_id, display_name, vrchat_name, slug, default_bats (L/R/S), default_throws (L/R/S)`

- `player_id` is permanent. It is generated once from the VRChat name (romanized, e.g. `daki`, `dambineunheungheung`) and never changes afterwards, even if the name does.
- `vrchat_name` is the current VRChat username exactly as shown in game (mixed Hangul, Latin, underscores, spaces: `__Daki__`, `카나시 Kanashi`, `망 야 _`). Never trim or normalize it.
- `display_name` is what the site shows. Filled in by the owner; when blank the site falls back to `vrchat_name`.
- `slug` is ASCII, used in URLs and file names. Starts equal to `player_id`; may be changed later (e.g. to match a display name).
- Handedness is recorded **per pitch**, because players in this game switch sides (`__Daki__` pitches with both hands). `default_*` is only a fallback.

### player_aliases.csv
`alias, player_id`: old VRChat usernames and misspellings. The charting tool and importer resolve a name through `vrchat_name` first, then aliases. Pitch CSVs store `player_id` only.

### teams.csv
`team_id, display_name`

### rosters.csv
`season, team_id, player_id`: who played for which team in each competition. A player can be on different teams in different seasons. A player on two teams in one season is a validator warning.

### games.csv
`game_id, season, date, label, home_team_id, away_team_id, home_final, away_final, vod_url, charted_by, chart_status (partial/complete), velo_unit (km/h/mph), game_version`

- `date` may be blank when unknown (legacy games have no year); `label` is a short human name (`03-14`, `8강`).
- `home_final`/`away_final` are entered by hand and used only to check the charting (section 8). On the last row of a game there is no next row to read the score from, so runs on the final play come from `home_final`/`away_final`, else from that row's `rbi`.

### pitches/{game_id}.csv

| Column | Type | Notes |
|---|---|---|
| `game_id`, `pitch_id` | str, int | `pitch_id` sequential within game |
| `inning`, `half` | int, `top`/`bot` | |
| `pa_id` | int | plate appearance index within game |
| `pitcher_id`, `batter_id`, `catcher_id` | str | catcher is recorded in the existing data; keep it (catcher-level framing/steal views later) |
| `pitcher_hand`, `batter_side` | `L`/`R`/blank | per pitch; blank falls back to the player's default |
| `home_score`, `away_score` | int | state **before** the pitch |
| `balls`, `strikes`, `outs` | int | state **before** the pitch |
| `runner_1`, `runner_2`, `runner_3` | player_id or blank | who is on each base before the pitch |
| `velo` | float | as shown on stream; blank if not shown |
| `pitch_type` | enum or blank | seen so far: `FF` four-seam, `SI` sinker, `FC` cutter, `SL` slider, `CU` curve, `SP` splitter, `RF` rising fastball, `RL` rising slider. `RF`/`RL` are game-specific. Keep the list in `data/schema/pitch_types.csv` (code, Korean label) so new types need no code change. |
| `pitch_type_source` | `stream` / `charter` / blank | whether the label came from the broadcast or the charter's eye |
| `zone` | int 1-9, 11-14, or blank | Savant zone numbers, from the catcher's view |
| `result` | enum | `ball`, `called_strike`, `swinging_strike`, `foul`, `foul_tip`, `in_play`, `hbp` |
| `event` | enum or blank | non-pitch rows: `SB`, `CS`, `WP`, `PB`, `pickoff`, `sub`; pitch fields blank on these rows |
| `bb_type` | enum | `ground`, `line`, `fly`, `popup`, `bunt`; only when `in_play` |
| `field_x`, `field_y` | float 0-1 | normalized click on field diagram; only when `in_play` |
| `fielder_pos` | int 1-9 | position that first fielded the ball. **This is the only location in the existing data**, so every spray view must work from it alone. |
| `contact_quality` | enum | `weak`, `medium`, `hard`; charter's judgment |
| `pa_result` | enum | set on the last pitch of a PA: `1B 2B 3B HR BB K HBP out FC E SF SH DP` |
| `rbi` | int or blank | optional; when blank the pipeline derives runs on the play from the score change to the next row |
| `vod_ts` | int (seconds) | timestamp into VOD, enables "watch this pitch" links |
| `notes` | str | free text |

**On coordinates:** store `field_x, field_y` normalized to the diagram (home plate at a fixed origin), and derive spray angle and approximate distance in the pipeline. Also derive a coarse zone (pull/center/oppo x infield/shallow/deep) and display at that resolution by default, since hand-charted points are approximate. `fielder_pos` is the fallback when the landing spot was not visible.

### legacy/*.csv
The owner's original files, committed unchanged (section 4a). Never edit them; corrections go in `legacy/fixes.csv` so the originals stay the record of what was charted.

## 4a. Existing data: format and import rules

Six CSVs, all with the same 21 columns, one row per pitch:

`home_team, away_team, pitcher, batter, catcher, pitch_type, pitch_speed, zone, result, inplay_result, batted_ball_location, outs, ball, strike, inning, home_score, away_score, runner_1, runner_2, runner_3, notes`

**Files and games** (pairings inferred from opponent, inning count, and matching final score; owner to confirm):

| File | Rows | Content | Game |
|---|---|---|---|
| `wbd_savant_50_texas_0314_batting.csv` | 50 | 50_texas batting, 5 inn | vs royal_buffalos, 03-14 |
| `wbd_savant_daki2.csv` | 42 | 50_texas pitching (`__Daki__`), 5 inn | same game |
| `wbd_savant_50_texas_roundof8_batting.csv` | 58 | 50_texas batting, 7 inn | vs gomem, round of 8 (date unknown) |
| `wbd_savant_daki.csv` | 73 | 50_texas pitching (`__Daki__`), 7 inn | same game |
| `wbd_savant_0318_50_texas.csv` | 50 | both halves, 3 inn | vs chun_yankees, 03-18 |
| `wbd_savant_0319_50_texas.csv` | 95 | both halves, 5 inn | vs chun_yankees, 03-19 |

Year, competition name, and `season` ID are not in the files; put them in `games.csv` by hand. The `.xlsx` copies duplicate the CSVs and are not imported.

**As built (M1):** `pipeline/import_legacy.py` reads three hand-written files next to the originals in `data/raw/legacy/`:
- `manifest.csv` (`file, game_id, fielding, home_pitchers, pitch_type_visible_from_line`). `fielding` says whose pitchers are in the file: `home` (file holds the top halves), `away` (bottom halves) or `both`; for `both`, `home_pitchers` lists the home team's pitchers (`;`-separated) and decides each row's half. Line numbers count the header as line 1.
- `fixes.csv` (`file, line, column, value, reason`): corrections applied before converting.
- `name_variants.csv` (`variant, name`): misspellings, written to `player_aliases.csv`. Chosen spellings: `유샥크_` (most frequent; `유샤크_` and `유샼크_` are aliases) and `로에__` (`로에_` is an alias).

Legacy games are `legacy-0314`, `legacy-0318`, `legacy-0319`, `legacy-ro8` in season `wbd-legacy`. The importer writes their `pitches/*.csv` and adds missing players, aliases, teams and roster rows (team membership comes from which half a player batted or fielded in), keeping anything already there. Re-running it is safe.

**Column mapping**

| Existing column | Target | Rule |
|---|---|---|
| `home_team`, `away_team` | `games.csv` | per game, not per pitch. 50_texas is `home_team` in every file. |
| `pitcher`, `batter`, `catcher` | `*_id` | resolve through `player_aliases.csv` |
| `pitch_speed` | `velo` | km/h (range 75 to 130) |
| `zone` | `zone` | already 1-9 and 11-14; no change |
| `ball`, `strike`, `outs`, `inning`, scores | same | all are state before the pitch; no change |
| `runner_1/2/3` | same | resolve names to IDs |
| `result` | `result` | `strike`→`called_strike`, `swing`→`swinging_strike` (a miss; contact is `foul` or `inplay`), `inplay`→`in_play`, `hit_by_pitch`→`hbp`, `ball`/`foul`/`foul_tip` unchanged |
| `inplay_result` | `pa_result` + `bb_type` | `strike_out`→`K`; `hit`→`1B`; `double`→`2B`; `triple`→`3B`; `ground_out`→`out` + `ground`; `fly_out`→`out` + `fly`; `fly_double_play`→`DP` + `fly`; `fielders_choice`→`FC`; `error`→`E`. Row with `result = hit_by_pitch`→`HBP`. `bb_type` stays blank for hits, errors and FC (not charted). |
| `batted_ball_location` | `fielder_pos` | 1-9. `field_x/field_y` stay blank. |
| `notes` | `notes` + parsed fields | `좌투`/`우투` → `pitcher_hand` L/R, `좌타`/`우타` → `batter_side` L/R, each carried forward until the next note for that same player (pending open question 4). `steal`, `라이너` (liner), error descriptions stay as text. |
| (missing) `half` | derived | from `manifest.csv` (`fielding`, `home_pitchers`): home team pitching = `top`. Rows of a two-file game are interleaved by inning and half. |
| (missing) `pa_id`, `pitch_id` | derived | new PA when the batter changes, the half-inning changes, the previous pitch ended a PA, or the count resets to 0-0 |

No walks and no home runs occur in these 368 pitches, so the old format has no value for them. New charting uses `BB` and `HR` from section 4.

**Pitch type: `FF` is often a placeholder, not an observation.** 328 of 368 pitches are `FF`. In at least some games the stream did not show pitch type and `FF` was entered by default; the notes carry guesses (`sinker?` 19 times, `slider?`, `splitter?`) and `daki2` has the note "pitch type visible from here" at its 13th pitch. Rules:
- `manifest.csv` gets a `pitch_type_visible_from_line` per file (blank = never visible; `daki2` = line 14, the 13th pitch).
- Rows before that: `pitch_type` blank, and a `?` guess from the notes goes to `pitch_type` with `pitch_type_source = charter`.
- Rows after: keep the value, `pitch_type_source = stream`.
- Default until the owner answers: `daki`, `roundof8_batting` = never visible; `daki2` = from row 13; `0314_batting`, `0318`, `0319` = visible (they contain non-FF types).

**Rows for the owner to check** (line numbers count the header as line 1):

| File | Line | Issue | Likely fix |
|---|---|---|---|
| `daki` | 10 | 바이터_ swings at 0-2, inning ends, no `strike_out` | add `strike_out` |
| `0318` | 34 | HOBAL swings at 0-2, next batter up, no `strike_out` | add `strike_out` |
| `roundof8_batting` | 59 | `__Daki__` called strike at 2-2 on the last row, no `strike_out` | add `strike_out` |
| `roundof8_batting` | 40-41 | 빈스_9 swings at 0-0, then 담비는흥흥 triples on a 0-1 count and bats again next row | line 41 batter should be 빈스_9 |
| `daki` | 21, 67 | in play, no `batted_ball_location` | fill if recoverable |
| `roundof8_batting` | 39 | fielder's choice, no location | fill if recoverable |
| `daki2` | 30 | `foul_tip` at 0-1 with the count unchanged | none: the note says the game did not count it. Keep as `foul_tip`, no count change. |
| several | | runner cells blank in the middle of a PA, then filled again (e.g. `0318` 22-24, `daki` 12-13) | converter carries runners forward within a PA when nothing was put in play |

**Name variants to put in `player_aliases.csv`:** `유샤크_` / `유샼크_` / `유샥크_` (one player, three spellings), `로에__` / `로에_`. Owner picks the correct spelling for each.

**What this data can and cannot support on day one**
- Works now: velocity, zone grid (all 368 pitches have a zone), swing/whiff/called-strike rates, K rate, results by count, spray by fielder position, pitcher vs hitter matchup tables.
- Limited: batted-ball type (outs only), pitch-type views (unknown for most pitches), contact quality (not charted), exact landing spots (not charted).
- Coverage is one team's games: 50_texas players have up to 4 games, opponents have 1 or 2. League averages from this are really "50_texas and its opponents"; label them that way in `meta.json` and the about page until more teams are charted.

## 5. The charting tool (owner only, local)

Runs entirely in the browser on the owner's machine via `npm run chart`; never deployed (see section 3a). This is where usability matters most.

**Layout (single screen):**
- Left: embedded video (YouTube/CHZZK/SOOP iframe if embeddable, otherwise the charter uses a second window) plus a "stamp timestamp" button.
- Center: game state (inning, count, outs, runners, current batter/pitcher), auto-advanced from each entry.
- Right: entry pad: velocity field, zone grid to click, result buttons, and when `in_play`, a clickable field diagram + fielder + ball type + contact quality.

**Requirements:**
- **Keyboard-first.** One key per result (`b` ball, `c` called, `s` swinging, `f` foul, `x` in play), number keys for velocity, Enter to commit. Target: under 5 seconds per non-contact pitch.
- **State machine** tracks count, outs, runners, lineup position, and inning changes automatically. Charter overrides anything manually (substitutions, weird VR glitches).
- **Autosave** every pitch to `localStorage`/IndexedDB. Resume a half-charted game.
- **Undo** last pitch; edit any previous row in a table below.
- **Export** to `{game_id}.csv` matching the schema exactly. **Import** an existing CSV to continue or correct.
- Validation on export: counts never exceed 3-2, outs reset each half inning, every PA has a `pa_result`.

Committing the CSV is manual in v1 (download, drop into `data/raw/pitches/`, push). Optional later: commit through the GitHub API with a personal access token pasted at runtime and held only in memory, never stored in the repo or build.

## 6. Stats and modeling

### Hitters
- Standard: PA, AVG, OBP, SLG, OPS, K%, BB%, ISO, BABIP
- Plate discipline: swing%, whiff% (swinging strikes / swings), contact%, chase% and zone-swing% (if zone is charted), first-pitch swing%
- Batted ball: GB/LD/FB/PU%, pull/center/oppo%, hard-contact%
- Splits: vs L/R pitcher, by count (ahead/even/behind, two-strike), by velocity band, with runners in scoring position

### Pitchers
- Standard: IP, ERA, WHIP, K%, BB%, K-BB%, HR/9, opponent AVG/OPS
- Velocity: mean, max, distribution, velocity by inning (fatigue), by pitch type if available
- Stuff proxies: whiff%, called-strike%, CSW% (called + swinging strikes / pitches), zone%, first-pitch strike%
- Batted ball allowed: GB%, hard-contact%
- Usage: pitch-type or velocity-band mix by count

### League context
- Compute league averages per season. VR run environment will differ wildly from MLB, so never use MLB constants.
- **wOBA with league-fit weights:** derive linear weights from this league's own run expectancy table (24 base-out states) once there is enough data; until then, fall back to OPS and label wOBA "provisional".
- Percentile ranks among qualified players for the Savant-style slider bars.

### Small samples (critical for scouting new players)
- Every rate shown with its denominator (e.g. `whiff% 31.2 (48 swings)`).
- **Empirical Bayes shrinkage:** for each rate stat, fit a Beta prior to the league distribution (method of moments or MLE on players above a minimum sample), then report the posterior mean and a 90% credible interval per player. A new player with 6 PA shows close to league average with a wide interval; a veteran shows close to their observed rate with a tight one.
- **Returning players:** pool prior seasons with a recency weight (e.g. current season x1, previous x0.6, older x0.3; make it a config value) before shrinking.
- UI shows raw and shrunk values side by side, with the interval drawn on the percentile bar. A "low sample" badge appears below a configurable threshold.
- Leaderboards default to a minimum-PA/minimum-pitches filter, with a toggle to show everyone.

### Pipeline outputs (`site/public/data/`)
- `players.json`: index for search and leaderboards (one row per player-season with all summary stats)
- `player/{slug}.json`: full detail: season lines, splits, pitch-level rows for charts, game log
- `teams.json`, `games.json`, `game/{game_id}.json`
- `league.json`: averages, percentile breakpoints, priors, weights
- `meta.json`: build time, data coverage (which games are charted, partial vs complete)

## 7. Site pages

| Route | Contents |
|---|---|
| `/` | Search box, recent games, data coverage, links to leaderboards |
| `/leaderboard` | Sortable, filterable table (hitters/pitchers tabs, season, min sample, team). Click through to player. |
| `/player/:slug` | Header (name, team, handedness, sample size), percentile bars, season stat table, charts below, splits, game log |
| `/team/:id` | Roster with key stats; team tendencies |
| `/game/:id` | Box score, play-by-play, link to VOD timestamps |
| `/compare` | Two to four players side by side (the matchup-prep view) |
| `/about` | Glossary and methodology: how data is charted, what "approximate" means, how shrinkage works |

**Player page charts**
- **Spray chart:** two modes, chosen by what the data has. **Position mode** (default, and the only mode for existing data): the field diagram with the nine fielder areas shaded by how often the ball went there, counts and hit/out split in each. **Point mode** (only for games charted with `field_x/field_y`): points colored by result, shape by ball type. Filters: pitcher handedness, count, velocity band.
- **Zone grid:** 3x3 + out-of-zone, switchable metric (pitch%, swing%, whiff%, AVG). Hidden if zone was not charted.
- **Velocity:** histogram, and line by inning or pitch count for pitchers; for hitters, results by velocity band (who struggles with heat).
- **Percentile bars:** red-to-blue Savant style, with the credible interval overlaid.
- **Scouting summary box:** auto-generated plain statements from thresholds, e.g. "Pull-heavy on ground balls (71%)", "Whiffs 40% on pitches above X km/h (n=25)", "Swings at first pitch 62%". Each statement carries its n, and is suppressed below a minimum sample. This is likely the most-used feature for a coach.
- **Coach notes:** free-text markdown per player from `data/raw/notes/{player_id}.md`, rendered on the page.

**Design notes:** mobile-friendly (coach will check on a phone), dark and light themes, colorblind-safe palette, all Hangul text rendered with a Korean web font (e.g. Pretendard).

## 7a. Korean UI

The scouting site's users are native Korean speakers. Korean is the only shipped language for the scouting site; the charting tool stays English.

- `<html lang="ko">`, font Pretendard (self-hosted or CDN) with a system fallback, `word-break: keep-all` so Hangul does not break mid-word.
- **All UI strings in one file** (`site/src/i18n/ko.ts`), never hardcoded in components. This keeps wording reviewable by the coach and leaves room for an English file later.
- **Use the terms Korean baseball fans already use**, not literal translations. Follow KBO/STATIZ conventions:
  - Keep standard abbreviations in Latin letters: AVG, OBP, SLG, OPS, ERA, WHIP, wOBA, K%, BB%.
  - Korean labels and glossary: 타율, 출루율, 장타율, 타석, 타수, 안타, 홈런, 볼넷, 삼진, 평균자책점, 이닝, 구속, 구종, 헛스윙률, 땅볼/뜬공/라인드라이브, 당겨치기/밀어치기, 득점권.
  - Pitch types: 직구(포심), 슬라이더, 커브, 체인지업, etc.
  - Positions: 투수, 포수, 1루수 ... 우익수.
- **Units:** velocity in km/h. Store whatever the stream shows and record the unit in `games.csv` (`velo_unit`); convert at display time if needed.
- **Names:** display `name_ko` everywhere. Search matches Hangul (including partial input) and the romanized name. URLs use the romanized `slug`.
- **Numbers and dates:** `Intl` with `ko-KR`; dates as `2026.10.07`. Batting average style `.312` (no leading zero), as in Korean baseball media.
- **Auto-generated scouting statements** are written from Korean templates in `ko.ts`, not translated from English at runtime. Example: `땅볼 타구의 71%가 당겨친 타구 (표본 24개)`.
- **Glossary/methodology page** in Korean, explaining each stat, how the data was hand-charted, and what the confidence range means in plain language.
- Password prompt and error messages in Korean as well.
- **Review step:** before M7 closes, the owner or coach reads every screen once for natural wording. Claude Code should flag any term it was unsure about in `docs/ko-review.md`.

## 7b. In-page help (users are not baseball experts)

Assume the reader knows the basics of the game but not the statistics. Help is always optional and one click away; it never clutters the default view.

**Stat tooltips ("?" buttons)**
- A small `?` icon next to every stat label, column header, and chart title. Click or tap opens a popover (tap, not hover, so it works on phones); click outside or Esc closes it.
- Each popover has the same four parts, in Korean, in plain language:
  1. **What it is** in one sentence, no jargon.
  2. **How to read it**: is higher or lower better, and for whom (hitter vs. pitcher).
  3. **Reference points**: this league's average and what counts as good or poor here (pulled from `league.json`, so it stays current).
  4. **Scouting use**: what it tells a coach to do. E.g. for chase rate: "높으면 스트라이크존 밖 유인구에 잘 속는 타자."
- Optional "자세히" link to the full glossary entry.
- Content lives in one file, `site/src/i18n/glossary.ko.ts`, keyed by stat ID. One reusable `<StatHelp id="whiff_pct" />` component renders it. The glossary page is generated from the same file, so there is one source of truth.
- CI check: every stat ID shown in the UI must have a glossary entry; build fails otherwise.

**Feature guides ("사용법" buttons)**
- Each major view (leaderboard, player page, spray chart, zone grid, percentile bars, compare page) has a guide button in its header that opens a side panel or modal with:
  - what the view is for, in two sentences;
  - a labeled example ("빨간색 = 리그 상위권, 파란색 = 하위권"; "점 하나 = 타구 하나");
  - how to use the filters;
  - one or two example questions it answers ("이 타자는 어느 방향으로 많이 치나?").
- A short first-visit walkthrough (3 to 4 steps) on the player page, skippable, with a "다시 보기" link in the footer. Remember dismissal in `localStorage`.
- Guide text lives in `site/src/i18n/guides.ko.ts`.

**Plain-language defaults**
- The **small-sample warning** gets its own tooltip explaining why a few at-bats can mislead and what the range bar means, without the word "Bayesian".
- The auto-generated scouting summary (section 7) sits at the top of the player page, so a reader who skips every number still gets the takeaways.
- A "간단히 / 자세히" toggle on the player page: simple view shows the summary, percentile bars, and spray chart; detailed view adds the full tables and splits. Default to simple.

**Accessibility:** popovers are keyboard-focusable, use `aria-describedby`, and tap targets are at least 44px.

## 8. Quality and testing

- `pipeline/validate.py` runs in CI and **fails the build** on schema errors: unknown player IDs, impossible counts, missing `pa_result`, out-of-range coordinates.
- Unit tests for stat formulas against a small hand-computed fixture game.
- Reconciliation check: runs and hits from pitch data must match a manually entered final score in `games.csv`; mismatch produces a warning listing the game.
- Frontend: one smoke test per page loading fixture JSON.
- Ship a **synthetic seed dataset** (generated by script, around 6 games) so the site is fully developed and demoable before real charting is done.

## 9. Milestones

**M0: Scaffold (half a day)**
Private repo, Vite app, HashRouter, Pages deploy workflow, `CLAUDE.md`, empty pipeline that emits fixture JSON, and the password gate from section 3a (encrypt step + `loadData` helper + prompt). Building the gate first means no page ever ships unprotected. *Done when:* a placeholder page is live on Pages and fixture data only loads after the password is entered.

**M1: Schema + seed data + pipeline core**
JSON Schemas, synthetic data generator, `players.csv` seeded from the names in the six real files, `validate.py`, `build_stats.py` for standard hitter/pitcher stats, JSON export. The synthetic generator is still needed for testing walks, home runs and point-mode spray charts, which the real data lacks. *Done when:* `make data` produces all JSON files from seed data and tests pass.

**M2: Charting tool**
Full local charting tool per section 5, plus the CI check that it is absent from the production build. *Done when:* the owner charts one real game end to end and the exported CSV passes validation unchanged.

**M3: Leaderboard + player page (tables only)**
Search, leaderboards, player page with stat tables, splits, game log. Includes the `<StatHelp>` component and glossary entries for every stat shown (section 7b); feature guides are added alongside each view as it is built in M4 to M6. *Done when:* a coach can look up any player and read their line.

**M4: Visualizations**
Spray chart, zone grid, velocity charts, percentile bars. *Done when:* player page matches section 7.

**M5: Small-sample modeling**
`shrinkage.py`, multi-season pooling, intervals in UI, low-sample badges. *Done when:* new and returning players display sensibly side by side.

**M6: Scouting features**
Auto-generated scouting summary, compare page, coach notes, team page, VOD timestamp links.

**M7: Polish**
Korean wording review (section 7a; Korean strings are used from M3 onward, not added here), mobile pass, about/glossary page, league-fit wOBA once data volume allows.

Charting real games can start as soon as M2 lands and run in parallel with M3 onward.

## 10. CLAUDE.md starter (drop into repo root)

```markdown
# VR Savant

Static scouting site for a VR baseball competition. See docs/handoff.md for the full plan.

## Commands
- `make data`: validate raw CSVs and build JSON into site/public/data
- `make test`: pipeline unit tests
- `cd site && npm run dev`: local dev server
- `cd site && npm run build`: production build

## Rules
- data/raw/ is the source of truth. Never write derived stats there.
- Do not change column names in data/schema/ without asking; the charting tool and pipeline both depend on them.
- Every rate stat shown in the UI must display its sample size.
- Never hardcode MLB constants (wOBA weights, league averages). Compute from this league's data.
- No backend, no secrets in the repo. The site must work as plain static files.
- Use HashRouter; Vite base must match the repo name.
- The scouting site UI is Korean. All strings live in site/src/i18n/ko.ts; never hardcode UI text in components. Use KBO/STATIZ terminology. The charting tool is English.
- The charting tool is local-only and must never appear in the production build.
```

## 11. Risks

- **Charting fatigue.** If entry is slow, the data never arrives. Protect M2 quality; consider a "lite mode" that records only velocity, result, and PA outcome when time is short.
- **Charter consistency.** `contact_quality` and landing spots are subjective. Write a one-page charting guide with examples, and keep `charted_by` on every game.
- **Tiny samples.** A short tournament may give a hitter 15 PA. The shrinkage and sample-size display are not optional extras; without them the site will mislead.
- **VOD availability.** Streams may be taken down or have no embeddable player. Store `vod_ts` anyway; it is cheap and makes later re-checks possible.
- **Game version changes.** If the VR world updates its physics between competitions, old seasons are not directly comparable. Keep a `game_version` field on `games.csv` and let the recency weights be overridden per season.
