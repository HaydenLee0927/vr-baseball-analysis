"""Check the raw CSVs. Errors fail the build; warnings are printed only.

Messages name files, line numbers (header = line 1), columns and IDs, never note text,
because CI logs are public.
"""

import argparse
import sys
from collections import defaultdict
from pathlib import Path

from rawdata import RAW_DIR, RawData, check_row, columns, load_raw, load_schema, pitch_type_codes

PITCH_ONLY = ["velo", "pitch_type", "pitch_type_source", "zone", "bb_type", "field_x", "field_y", "fielder_pos", "contact_quality"]
IN_PLAY_ONLY = ["bb_type", "field_x", "field_y", "fielder_pos", "contact_quality"]
PA_CUT_EVENTS = {"CS", "pickoff"}  # a baserunning out can end an inning before the PA finishes


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)


def _duplicates(values) -> set:
    seen, dupes = set(), set()
    for v in values:
        (dupes if v in seen else seen).add(v)
    return dupes


def check_tables(data: RawData, report: Report) -> None:
    for name, header in data.headers.items():
        table = "pitches" if name.startswith("pitches/") else name.removesuffix(".csv")
        expected = columns(table)
        if header != expected:
            missing = [c for c in expected if c not in header]
            extra = [c for c in header if c not in expected]
            detail = f"missing {missing}" if missing else ""
            detail += f" unknown {extra}" if extra else ""
            report.error(f"{name}: header does not match data/schema ({detail.strip() or 'column order differs'})")

    for table in ("players", "player_aliases", "teams", "rosters", "games"):
        schema = load_schema(table)
        for i, row in enumerate(getattr(data, table)):
            for msg in check_row(row, schema):
                report.error(f"{table}.csv:{i + 2}: {msg}")

    player_ids = {p["player_id"] for p in data.players}
    for col in ("player_id", "slug", "vrchat_name"):
        for v in _duplicates(p[col] for p in data.players):
            report.error(f"players.csv: duplicate {col} {v!r}")
    names = {p["vrchat_name"] for p in data.players}
    for i, a in enumerate(data.player_aliases):
        where = f"player_aliases.csv:{i + 2}"
        if a["player_id"] not in player_ids:
            report.error(f"{where}: unknown player_id {a['player_id']!r}")
        if a["alias"] in names:
            report.error(f"{where}: alias {a['alias']!r} is already a player's vrchat_name")
    for v in _duplicates(a["alias"] for a in data.player_aliases):
        report.error(f"player_aliases.csv: duplicate alias {v!r}")

    team_ids = {t["team_id"] for t in data.teams}
    for v in _duplicates(t["team_id"] for t in data.teams):
        report.error(f"teams.csv: duplicate team_id {v!r}")

    teams_per_player = defaultdict(set)
    for i, r in enumerate(data.rosters):
        if r["team_id"] not in team_ids:
            report.error(f"rosters.csv:{i + 2}: unknown team_id {r['team_id']!r}")
        if r["player_id"] not in player_ids:
            report.error(f"rosters.csv:{i + 2}: unknown player_id {r['player_id']!r}")
        teams_per_player[(r["season"], r["player_id"])].add(r["team_id"])
    for (season, player), teams in teams_per_player.items():
        if len(teams) > 1:
            report.warn(f"rosters.csv: {player} is on {len(teams)} teams in {season}")

    game_ids = [g["game_id"] for g in data.games]
    for v in _duplicates(game_ids):
        report.error(f"games.csv: duplicate game_id {v!r}")
    for i, g in enumerate(data.games):
        for col in ("home_team_id", "away_team_id"):
            if g[col] not in team_ids:
                report.error(f"games.csv:{i + 2}: unknown {col} {g[col]!r}")
        if g["game_id"] not in data.pitches:
            report.warn(f"games.csv:{i + 2}: no pitches/{g['game_id']}.csv yet")


def check_game(game: dict | None, game_id: str, rows: list[dict], data: RawData, codes: set[str], report: Report) -> None:
    f = f"pitches/{game_id}.csv"
    if game is None:
        report.error(f"{f}: game {game_id!r} is not in games.csv")
        return
    partial = game["chart_status"] == "partial"
    player_ids = {p["player_id"] for p in data.players}
    rostered = {(r["season"], r["player_id"]) for r in data.rosters}
    schema = load_schema("pitches")

    for i, row in enumerate(rows):
        at = f"{f}:{i + 2}"
        for msg in check_row(row, schema):
            report.error(f"{at}: {msg}")
        if row["game_id"] != game_id:
            report.error(f"{at}: game_id {row['game_id']!r} does not match the file name")
        if row["pitch_id"] != i + 1:
            report.error(f"{at}: pitch_id should be {i + 1}")
        for col in ("pitcher_id", "batter_id", "catcher_id", "runner_1", "runner_2", "runner_3"):
            pid = row[col]
            if pid is None:
                continue
            if pid not in player_ids:
                report.error(f"{at}: {col} {pid!r} is not in players.csv (use player_id, not the VRChat name)")
            elif (game["season"], pid) not in rostered:
                report.warn(f"{at}: {pid} is not on any {game['season']} roster")

        if (row["result"] is None) == (row["event"] is None):
            report.error(f"{at}: set exactly one of result (a pitch) or event (no pitch)")
        if row["event"] is not None:
            for col in PITCH_ONLY:
                if row[col] is not None:
                    report.error(f"{at}: {col} must be blank on an event row")
        elif row["result"] != "in_play":
            for col in IN_PLAY_ONLY:
                if row[col] is not None:
                    report.error(f"{at}: {col} is only for balls in play")
        if (row["field_x"] is None) != (row["field_y"] is None):
            report.error(f"{at}: set both field_x and field_y, or neither")
        if row["pitch_type"] is not None and row["pitch_type"] not in codes:
            report.error(f"{at}: pitch_type {row['pitch_type']!r} is not in data/schema/pitch_types.csv")
        if row["pitch_type_source"] is not None and row["pitch_type"] is None:
            report.error(f"{at}: pitch_type_source without pitch_type")

    # Order, plate appearances, outs and score.
    by_pa: dict[int, list[int]] = defaultdict(list)
    for i, row in enumerate(rows):
        by_pa[row["pa_id"]].append(i)
        if i == 0:
            continue
        prev = rows[i - 1]
        at = f"{f}:{i + 2}"
        if (row["inning"], row["half"] == "bot") < (prev["inning"], prev["half"] == "bot"):
            report.error(f"{at}: inning/half goes backwards")
        if row["pa_id"] not in (prev["pa_id"], prev["pa_id"] + 1):
            report.error(f"{at}: pa_id should be {prev['pa_id']} or {prev['pa_id'] + 1}")
        new_half = (row["inning"], row["half"]) != (prev["inning"], prev["half"])
        if new_half and row["outs"] != 0:
            (report.warn if partial else report.error)(f"{at}: first row of a half-inning should have 0 outs")
        if not new_half and row["outs"] < prev["outs"]:
            report.error(f"{at}: outs go down within a half-inning")
        for col in ("home_score", "away_score"):
            if row[col] < prev[col]:
                report.error(f"{at}: {col} goes down")

    last_pa = max(by_pa) if by_pa else None
    for pa, idx in by_pa.items():
        first, last = rows[idx[0]], rows[idx[-1]]
        if any(rows[j]["batter_id"] != first["batter_id"] for j in idx):
            report.error(f"{f}:{idx[0] + 2}: pa_id {pa} has more than one batter")
        for j in idx[:-1]:
            if rows[j]["pa_result"] is not None:
                report.error(f"{f}:{j + 2}: pa_result before the last pitch of the plate appearance")
        if last["pa_result"] is None and last["event"] not in PA_CUT_EVENTS:
            msg = f"{f}:{idx[-1] + 2}: plate appearance {pa} has no pa_result"
            (report.warn if partial and pa == last_pa else report.error)(msg)

    if rows and game["home_final"] is not None and game["away_final"] is not None:
        last = rows[-1]
        runs_last = last["rbi"] or 0
        home = last["home_score"] + (runs_last if last["half"] == "bot" else 0)
        away = last["away_score"] + (runs_last if last["half"] == "top" else 0)
        if (home, away) != (game["home_final"], game["away_final"]):
            report.warn(
                f"{f}: charted score {home}-{away} does not match the final score "
                f"{game['home_final']}-{game['away_final']} in games.csv"
            )


def validate(data: RawData) -> Report:
    report = Report()
    check_tables(data, report)
    games = {g["game_id"]: g for g in data.games}
    codes = pitch_type_codes()
    for game_id, rows in data.pitches.items():
        check_game(games.get(game_id), game_id, rows, data, codes, report)
    return report


def print_report(report: Report) -> None:
    for w in report.warnings:
        print(f"warning: {w}")
    for e in report.errors:
        print(f"error: {e}")
    print(f"{len(report.errors)} errors, {len(report.warnings)} warnings")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=RAW_DIR)
    args = parser.parse_args()
    report = validate(load_raw(args.raw))
    print_report(report)
    sys.exit(1 if report.errors else 0)


if __name__ == "__main__":
    main()
