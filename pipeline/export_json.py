"""Validate the raw data, build stats, and write the site's JSON files.

Outputs (in site/public/data/ by default): meta.json, players.json, player/{slug}.json,
teams.json, games.json, game/{game_id}.json, league.json.
"""

import argparse
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from build_stats import (
    batting_game_line,
    batting_line,
    final_score,
    hands_used,
    pitch_frame,
    pitching_game_line,
    pitching_line,
    splits,
)
from rawdata import RAW_DIR, ROOT, RawData, display_name, load_raw
from romanize import romanize
from validate import print_report, validate

DEFAULT_OUT = ROOT / "site" / "public" / "data"
# Fields copied into players.json for search and leaderboards (rates travel with their denominators).
BATTING_SUMMARY = [
    "pa", "ab", "h", "hr", "bb", "k", "avg", "obp", "slg", "ops", "k_pct", "bb_pct",
    "swings", "whiff_pct", "chase_pitches", "chase_pct",
]
PITCHING_SUMMARY = [
    "g", "bf", "outs", "ip", "r", "h", "bb", "k", "ra9", "whip", "k_pct", "bb_pct", "k_bb_pct",
    "pitches", "swings", "whiff_pct", "csw_pct", "velo_avg", "velo_max", "velo_n",
]
PITCH_FIELDS = [
    "game_id", "inning", "half", "pa_id", "balls", "strikes", "outs", "pitcher_hand", "batter_side",
    "velo", "pitch_type", "pitch_type_source", "zone", "result", "bb_type", "fielder_pos",
    "field_x", "field_y", "contact_quality", "pa_result", "vod_ts",
]


def clean(value):
    """Make a value JSON-safe: numpy -> python, NaN -> None, floats rounded."""
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float):
        return None if math.isnan(value) else round(value, 4)
    return value


def records(df: pd.DataFrame, cols: list[str]) -> list[dict]:
    return [dict(zip(cols, row)) for row in df[cols].itertuples(index=False, name=None)]


def build_outputs(data: RawData) -> dict[str, object]:
    df = pitch_frame(data)
    players = {p["player_id"]: p for p in data.players}
    games = {g["game_id"]: g for g in data.games}
    teams_of = defaultdict(list)
    for r in data.rosters:
        teams_of[(r["season"], r["player_id"])].append(r["team_id"])
    pas = df[df.pa_result.notna()] if not df.empty else df
    pitch_rows = df[df.result.notna()] if not df.empty else df
    # Hands actually used in the charted games, falling back to the player's default.
    bats_used = df.groupby("batter_id").b_side.agg(hands_used).to_dict() if not df.empty else {}
    throws_used = df.groupby("pitcher_id").p_hand.agg(hands_used).to_dict() if not df.empty else {}

    def person(pid: str) -> dict:
        p = players[pid]
        name = display_name(p)
        return {
            "id": pid, "slug": p["slug"], "name": name, "vrchat_name": p["vrchat_name"],
            "romanized": romanize(name),
            "bats": bats_used.get(pid) or p.get("default_bats"),
            "throws": throws_used.get(pid) or p.get("default_throws"),
        }

    def game_ref(game_id: str) -> dict:
        g = games[game_id]
        return {"game_id": game_id, "season": g["season"], "date": g["date"], "label": g["label"]}

    files: dict[str, object] = {}

    # Players
    keys = {(r["season"], r["player_id"]) for r in data.rosters}
    if not df.empty:
        keys |= set(zip(pas.season, pas.batter_id)) | set(zip(df.season, df.pitcher_id))
    index_rows = []
    per_player: dict[str, list] = defaultdict(list)
    for season, pid in sorted(keys):
        at_bat = df[(df.season == season) & (df.batter_id == pid)] if not df.empty else df
        on_mound = df[(df.season == season) & (df.pitcher_id == pid)] if not df.empty else df
        bat_pas = at_bat[at_bat.pa_result.notna()] if len(at_bat) else at_bat
        batting = batting_line(bat_pas, at_bat[at_bat.result.notna()]) if len(bat_pas) else None
        pitching = pitching_line(on_mound) if len(on_mound) else None
        line = {
            "season": season, "team_ids": sorted(teams_of[(season, pid)]), "batting": batting, "pitching": pitching,
            "splits": {
                "batting": splits(at_bat, "batting") if batting else [],
                "pitching": splits(on_mound, "pitching") if pitching else [],
            },
        }
        per_player[pid].append(line)
        index_rows.append(
            person(pid)
            | {"season": season, "team_ids": line["team_ids"]}
            | {"batting": {k: batting[k] for k in BATTING_SUMMARY} if batting else None}
            | {"pitching": {k: pitching[k] for k in PITCHING_SUMMARY} if pitching else None}
        )
    files["players.json"] = index_rows

    for pid, seasons in per_player.items():
        bat_log, pit_log = [], []
        if not df.empty:
            for game_id, rows in pas[pas.batter_id == pid].groupby("game_id", sort=False):
                bat_log.append(game_ref(game_id) | {"opponent": rows.fld_team.iloc[0]} | batting_game_line(rows))
            for game_id, rows in df[df.pitcher_id == pid].groupby("game_id", sort=False):
                pit_log.append(game_ref(game_id) | {"opponent": rows.bat_team.iloc[0]} | pitching_game_line(rows))
            as_batter = pitch_rows[pitch_rows.batter_id == pid]
            as_pitcher = pitch_rows[pitch_rows.pitcher_id == pid]
        files[f"player/{players[pid]['slug']}.json"] = {
            "player": person(pid),
            "seasons": seasons,
            "game_log": {"batting": bat_log, "pitching": pit_log},
            "pitches": {
                "as_batter": records(as_batter, PITCH_FIELDS + ["pitcher_id"]) if not df.empty else [],
                "as_pitcher": records(as_pitcher, PITCH_FIELDS + ["batter_id"]) if not df.empty else [],
            },
        }

    # Teams
    roster_by_team = defaultdict(lambda: defaultdict(list))
    for r in data.rosters:
        roster_by_team[r["team_id"]][r["season"]].append(r["player_id"])
    files["teams.json"] = [
        {"team_id": t["team_id"], "name": t["display_name"] or t["team_id"], "rosters": dict(roster_by_team[t["team_id"]])}
        for t in data.teams
    ]

    # Games
    game_index = []
    for g in data.games:
        rows = df[df.game_id == g["game_id"]] if not df.empty else df
        summary = game_ref(g["game_id"]) | {
            "home_team_id": g["home_team_id"], "away_team_id": g["away_team_id"],
            "chart_status": g["chart_status"], "charted_by": g["charted_by"], "vod_url": g["vod_url"],
            "pitches": int(rows.result.notna().sum()) if len(rows) else 0,
        }
        if len(rows):
            home, away = final_score(rows)
            summary |= {"home_score": home, "away_score": away, "innings": int(rows.inning.max())}
        game_index.append(summary)
        if not len(rows):
            continue
        linescore = {
            side: [int(rows[(rows.inning == i) & (rows.half == half)].runs.sum()) for i in range(1, summary["innings"] + 1)]
            for side, half in (("away", "top"), ("home", "bot"))
        }
        plays = []
        for pa_id, pa in rows.groupby("pa_id", sort=True):
            first, last = pa.iloc[0], pa.iloc[-1]
            vod = pa.vod_ts.dropna()
            plays.append({
                "pa_id": pa_id, "inning": first.inning, "half": first.half, "outs": first.outs,
                "batter_id": first.batter_id, "pitcher_id": last.pitcher_id,
                "pa_result": last.pa_result, "bb_type": last.bb_type, "fielder_pos": last.fielder_pos,
                "pitches": int(pa.result.notna().sum()), "runs": int(pa.runs.sum()),
                "events": pa.event.dropna().tolist(), "vod_ts": vod.iloc[0] if len(vod) else None,
            })
        ids = set(rows.pitcher_id) | set(rows.batter_id) | set(rows.catcher_id.dropna())
        files[f"game/{g['game_id']}.json"] = {
            "game": summary,
            "linescore": linescore,
            "plays": plays,
            "players": {pid: display_name(players[pid]) for pid in sorted(ids)},
        }
    files["games.json"] = game_index

    # League context, per season. Coverage is only the games charted so far.
    league = {}
    if not df.empty:
        for season, rows in df.groupby("season"):
            league[season] = {
                "games": int(rows.game_id.nunique()),
                "batting": batting_line(rows[rows.pa_result.notna()], rows[rows.result.notna()]),
                "pitching": pitching_line(rows),
            }
    files["league.json"] = {"seasons": league}

    games_per_team = defaultdict(int)
    for g in game_index:
        if g["pitches"]:
            games_per_team[g["home_team_id"]] += 1
            games_per_team[g["away_team_id"]] += 1
    files["meta.json"] = {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seasons": sorted(league),
        "coverage": {
            "games": sum(1 for g in game_index if g["pitches"]),
            "pitches": len(pitch_rows),
            "plate_appearances": len(pas),
            "games_per_team": dict(games_per_team),
            "partial_games": [g["game_id"] for g in game_index if g["chart_status"] == "partial"],
        },
    }
    return {name: clean(payload) for name, payload in files.items()}


def write_json(out_dir: Path, files: dict[str, object]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in [*out_dir.rglob("*.json"), *out_dir.rglob("*.json.enc")]:  # drop files for renamed players/games
        old.unlink()
    for name, payload in files.items():
        path = out_dir / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(files)} files to {out_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=RAW_DIR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    data = load_raw(args.raw)
    report = validate(data)
    print_report(report)
    if report.errors:
        raise SystemExit("validation failed; no JSON written")
    write_json(args.out, build_outputs(data))


if __name__ == "__main__":
    main()
