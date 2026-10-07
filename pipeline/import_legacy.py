"""Convert the owner's original hand-charted CSVs (data/raw/legacy/) into the standard raw tables.

The original files are never modified. Inputs next to them:
  manifest.csv       which file belongs to which game, which halves it covers, when pitch type became visible
  fixes.csv          corrections applied by (file, line, column) before converting; line 1 is the header
  name_variants.csv  misspellings -> the spelling used as the player's VRChat name

Writes pitches/{game_id}.csv for each legacy game. Adds missing rows to players.csv,
player_aliases.csv, teams.csv and rosters.csv; existing rows (e.g. display names filled
in by hand) are kept. Games must already be listed in games.csv. Safe to re-run.
"""

import argparse
import csv
from collections import defaultdict
from pathlib import Path

from rawdata import RAW_DIR, name_index, read_table, write_table
from romanize import slugify

NAME_COLS = ["pitcher", "batter", "catcher", "runner_1", "runner_2", "runner_3"]
RESULTS = {
    "ball": "ball",
    "strike": "called_strike",
    "swing": "swinging_strike",
    "foul": "foul",
    "foul_tip": "foul_tip",
    "inplay": "in_play",
    "hit_by_pitch": "hbp",
}
INPLAY_RESULTS = {  # -> (pa_result, bb_type)
    "strike_out": ("K", None),
    "hit": ("1B", None),
    "double": ("2B", None),
    "triple": ("3B", None),
    "ground_out": ("out", "ground"),
    "fly_out": ("out", "fly"),
    "fly_double_play": ("DP", "fly"),
    "fielders_choice": ("FC", None),
    "error": ("E", None),
}
PITCH_TYPE_GUESSES = {"sinker?": "SI", "slider?": "SL", "splitter?": "SP"}
HAND_NOTES = {"좌투": ("pitcher", "L"), "우투": ("pitcher", "R"), "좌타": ("batter", "L"), "우타": ("batter", "R")}


def read_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        return [{k: (v or "").strip() for k, v in row.items()} for row in csv.DictReader(f)]


def read_existing(path: Path, table: str) -> list[dict]:
    return read_table(path, table)[1] if path.exists() else []


def load_legacy_rows(legacy_dir: Path) -> dict[str, list[dict]]:
    """Rows per game, with fixes and name variants applied and `_half` / `_visible` set."""
    fixes = read_csv(legacy_dir / "fixes.csv")
    variants = {r["variant"]: r["name"] for r in read_csv(legacy_dir / "name_variants.csv")}
    games: dict[str, list[dict]] = defaultdict(list)
    for order, entry in enumerate(read_csv(legacy_dir / "manifest.csv")):
        rows = read_csv(legacy_dir / entry["file"])
        for fix in (f for f in fixes if f["file"] == entry["file"]):
            row = rows[int(fix["line"]) - 2]
            if fix["column"] not in row:
                raise SystemExit(f"fixes.csv: {entry['file']} has no column {fix['column']}")
            row[fix["column"]] = fix["value"]

        home_pitchers = set(filter(None, entry["home_pitchers"].split(";")))
        visible_from = int(entry["pitch_type_visible_from_line"]) if entry["pitch_type_visible_from_line"] else None
        for i, row in enumerate(rows):
            for col in NAME_COLS:
                row[col] = variants.get(row[col], row[col])
            line = i + 2
            if entry["fielding"] == "both":
                home_fielding = row["pitcher"] in home_pitchers
            else:
                home_fielding = entry["fielding"] == "home"
            row.update(
                _file=entry["file"],
                _line=line,
                _order=order,
                _half="top" if home_fielding else "bot",
                _visible=visible_from is not None and line >= visible_from,
            )
        games[entry["game_id"]].extend(rows)
    return games


def ensure_players(names: list[str], players: list[dict], aliases: list[dict], variants: dict[str, str]) -> None:
    index = name_index(players, aliases)
    taken = {p["player_id"] for p in players} | {p["slug"] for p in players}
    for name in names:
        if name in index:
            continue
        base = slug = slugify(name)
        n = 2
        while slug in taken:
            slug, n = f"{base}-{n}", n + 1
        taken.add(slug)
        players.append({"player_id": slug, "display_name": None, "vrchat_name": name, "slug": slug})
        index[name] = slug
    for variant, name in variants.items():
        if variant not in index and name in index:
            aliases.append({"alias": variant, "player_id": index[name]})
            index[variant] = index[name]


def pitch_type(row: dict) -> tuple[str | None, str | None]:
    code = row["pitch_type"] or None
    if row["_visible"]:
        return code, "stream" if code else None
    if code and code != "FF":  # FF was the default when the stream showed nothing
        return code, "charter"
    guesses = {v for k, v in PITCH_TYPE_GUESSES.items() if k in row["notes"]}
    return (guesses.pop(), "charter") if len(guesses) == 1 else (None, None)


def convert_game(game_id: str, rows: list[dict], ids: dict[str, str]) -> list[dict]:
    rows = sorted(rows, key=lambda r: (int(r["inning"]), r["_half"] == "bot", r["_order"], r["_line"]))
    hands: dict[tuple[str, str], str] = {}
    out: list[dict] = []
    pa_id = 0
    prev = None
    for r in rows:
        where = f"{r['_file']}:{r['_line']}"
        if r["result"] not in RESULTS:
            raise SystemExit(f"{where}: unknown result {r['result']!r}")
        if r["inplay_result"] and r["inplay_result"] not in INPLAY_RESULTS:
            raise SystemExit(f"{where}: unknown inplay_result {r['inplay_result']!r}")

        inning, half = int(r["inning"]), r["_half"]
        balls, strikes, outs = int(r["ball"]), int(r["strike"]), int(r["outs"])
        batter = ids[r["batter"]]
        result = RESULTS[r["result"]]
        pa_result, bb_type = INPLAY_RESULTS.get(r["inplay_result"], (None, None))
        if result == "hbp":
            pa_result = "HBP"

        new_pa = (
            prev is None
            or prev["pa_result"] is not None
            or prev["batter_id"] != batter
            or (prev["inning"], prev["half"]) != (inning, half)
            or ((balls, strikes) == (0, 0) and (prev["balls"], prev["strikes"]) != (0, 0))
        )
        pa_id += new_pa

        # Hand notes apply to that player from this pitch on, until their next note.
        for key, (role, hand) in HAND_NOTES.items():
            if key in r["notes"]:
                hands[(role, r[role])] = hand

        runners = [ids[r[f"runner_{b}"]] if r[f"runner_{b}"] else None for b in (1, 2, 3)]
        if not any(runners) and not new_pa and prev["result"] != "in_play":
            runners = [prev["runner_1"], prev["runner_2"], prev["runner_3"]]

        ptype, ptype_source = pitch_type(r)
        in_play = result == "in_play"
        row = {
            "game_id": game_id,
            "pitch_id": len(out) + 1,
            "inning": inning,
            "half": half,
            "pa_id": pa_id,
            "pitcher_id": ids[r["pitcher"]],
            "batter_id": batter,
            "catcher_id": ids[r["catcher"]] if r["catcher"] else None,
            "pitcher_hand": hands.get(("pitcher", r["pitcher"])),
            "batter_side": hands.get(("batter", r["batter"])),
            "home_score": int(r["home_score"]),
            "away_score": int(r["away_score"]),
            "balls": balls,
            "strikes": strikes,
            "outs": outs,
            "runner_1": runners[0],
            "runner_2": runners[1],
            "runner_3": runners[2],
            "velo": float(r["pitch_speed"]) if r["pitch_speed"] else None,
            "pitch_type": ptype,
            "pitch_type_source": ptype_source,
            "zone": int(r["zone"]) if r["zone"] else None,
            "result": result,
            "bb_type": bb_type if in_play else None,
            "fielder_pos": int(r["batted_ball_location"]) if in_play and r["batted_ball_location"] else None,
            "pa_result": pa_result,
            "notes": r["notes"] or None,
        }
        out.append(row)
        prev = row
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--raw", type=Path, default=RAW_DIR)
    args = parser.parse_args()
    raw: Path = args.raw
    legacy_dir = raw / "legacy"

    games = {g["game_id"]: g for g in read_table(raw / "games.csv", "games")[1]}
    players = read_existing(raw / "players.csv", "players")
    aliases = read_existing(raw / "player_aliases.csv", "player_aliases")
    teams = read_existing(raw / "teams.csv", "teams")
    rosters = read_existing(raw / "rosters.csv", "rosters")
    variants = {r["variant"]: r["name"] for r in read_csv(legacy_dir / "name_variants.csv")}

    rows_by_game = load_legacy_rows(legacy_dir)
    missing = sorted(set(rows_by_game) - set(games))
    if missing:
        raise SystemExit(f"add these games to games.csv first: {', '.join(missing)}")

    names = list(dict.fromkeys(r[c] for rows in rows_by_game.values() for r in rows for c in NAME_COLS if r[c]))
    ensure_players(names, players, aliases, variants)
    ids = name_index(players, aliases)

    known_teams = {t["team_id"] for t in teams}
    roster_keys = {(r["season"], r["team_id"], r["player_id"]) for r in rosters}
    for game_id, rows in rows_by_game.items():
        game = games[game_id]
        pitches = convert_game(game_id, rows, ids)
        write_table(raw / "pitches" / f"{game_id}.csv", "pitches", pitches)
        print(f"wrote pitches/{game_id}.csv ({len(pitches)} rows)")

        for team in (game["home_team_id"], game["away_team_id"]):
            if team not in known_teams:
                teams.append({"team_id": team, "display_name": None})
                known_teams.add(team)
        for p in pitches:
            fielding, batting = (
                (game["home_team_id"], game["away_team_id"]) if p["half"] == "top" else (game["away_team_id"], game["home_team_id"])
            )
            members = [(fielding, p["pitcher_id"]), (fielding, p["catcher_id"]), (batting, p["batter_id"])]
            members += [(batting, p[f"runner_{b}"]) for b in (1, 2, 3)]
            for team, player in members:
                key = (game["season"], team, player)
                if player and key not in roster_keys:
                    rosters.append({"season": key[0], "team_id": team, "player_id": player})
                    roster_keys.add(key)

    write_table(raw / "players.csv", "players", players)
    write_table(raw / "player_aliases.csv", "player_aliases", aliases)
    write_table(raw / "teams.csv", "teams", teams)
    write_table(raw / "rosters.csv", "rosters", rosters)
    print(f"players: {len(players)}, aliases: {len(aliases)}, teams: {len(teams)}, roster rows: {len(rosters)}")


if __name__ == "__main__":
    main()
