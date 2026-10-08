"""Generate a synthetic season (fake teams and players) for developing and demoing the site.

Never deployed: it writes a separate raw directory (default data/synthetic/, gitignored).
Every field the charting tool records is filled, including landing spots, so the charts
have enough data to look at before real games are charted.

    python pipeline/synth.py
    python pipeline/export_json.py --raw data/synthetic
"""

import argparse
import math
from pathlib import Path

import numpy as np

from rawdata import ROOT, write_table

SEASON = "synthetic"
TEAMS = ["red_owls", "blue_foxes", "green_bears", "gold_hawks"]
# Field diagram geometry, mirroring site/src/lib/field.ts.
PLATE = (0.5, 0.92)
BASE_PATH = 0.16
POSITIONS = [2, 3, 4, 5, 6, 7, 8, 9]  # fielders besides the pitcher; the pitcher bats ninth


def field_point(r: float, angle: float) -> tuple[float, float]:
    """Diagram coordinates for a ball `r` base paths from home, `angle` degrees from the 3B line (0) to the 1B line (90)."""
    a, b = r * math.sin(math.radians(angle)), r * math.cos(math.radians(angle))
    d = math.sqrt(0.5) * BASE_PATH
    return (round(PLATE[0] + (a - b) * d, 3), round(PLATE[1] - (a + b) * d, 3))


def fielder_for(r: float, angle: float) -> int:
    if r < 0.55:
        return 2 if r < 0.3 else 1
    if r < 1.7:
        return [5, 6, 4, 3][min(3, int(angle // 22.5))]
    return [7, 8, 9][min(2, int(angle // 30))]


class Sim:
    def __init__(self, seed: int):
        self.rng = np.random.default_rng(seed)
        self.players, self.rosters, self.teams = [], [], {}
        for t in TEAMS:
            roster = []
            for i in range(11):
                pid = f"{t.split('_')[0]}-{i + 1}"
                bats = self.rng.choice(["R", "R", "L", "S"])
                throws = self.rng.choice(["R", "R", "R", "L"])
                self.players.append({"player_id": pid, "vrchat_name": f"{t.split('_')[0].title()}{i + 1}", "slug": pid,
                                     "default_bats": None if bats == "S" else bats, "default_throws": throws})
                self.rosters.append({"season": SEASON, "team_id": t, "player_id": pid})
                roster.append({
                    "id": pid, "bats": bats, "throws": throws,
                    # hitter traits
                    "chase": self.rng.uniform(0.18, 0.45), "contact": self.rng.uniform(0.62, 0.88),
                    "power": self.rng.uniform(0.0, 1.0), "pull": self.rng.uniform(0.35, 0.7),
                    # pitcher traits
                    "velo": self.rng.uniform(98, 122), "control": self.rng.uniform(0.42, 0.6),
                })
            self.teams[t] = roster

    def game(self, game_id: str, home: str, away: str, innings: int) -> list[dict]:
        rng = self.rng
        lineups = {}
        for side, team in (("home", home), ("away", away)):
            r = self.teams[team]
            lineups[side] = {"order": r[:9], "pitchers": [r[8], r[9], r[10]], "next": 0,
                             "fielders": {pos: r[i]["id"] for i, pos in enumerate(POSITIONS)}}
        rows: list[dict] = []
        score = {"home": 0, "away": 0}
        pa_id = 0
        for inning in range(1, innings + 1):
            for half in ("top", "bot"):
                if half == "bot" and inning == innings and score["home"] > score["away"]:
                    break
                bat, fld = ("away", "home") if half == "top" else ("home", "away")
                pitcher = lineups[fld]["pitchers"][min(2, (inning - 1) // 3)]
                outs, runners = 0, [None, None, None]
                while outs < 3:
                    batter = lineups[bat]["order"][lineups[bat]["next"] % 9]
                    pa_id += 1
                    side = batter["bats"] if batter["bats"] != "S" else ("L" if pitcher["throws"] == "R" else "R")
                    balls = strikes = 0
                    while True:
                        row = {
                            "game_id": game_id, "pitch_id": len(rows) + 1, "inning": inning, "half": half, "pa_id": pa_id,
                            "pitcher_id": pitcher["id"], "batter_id": batter["id"], "catcher_id": lineups[fld]["fielders"][2],
                            **{f"fielder_{p}": lineups[fld]["fielders"][p] for p in range(3, 10)},
                            "pitcher_hand": pitcher["throws"], "batter_side": side,
                            "home_score": score["home"], "away_score": score["away"],
                            "balls": balls, "strikes": strikes, "outs": outs,
                            "runner_1": runners[0], "runner_2": runners[1], "runner_3": runners[2],
                        }
                        breaking = rng.random() < 0.35
                        row["pitch_type"] = rng.choice(["SL", "CU", "SP"]) if breaking else "FF"
                        row["pitch_type_source"] = "stream"
                        row["velo"] = round(pitcher["velo"] - (12 if breaking else 0) + rng.normal(0, 2.5))
                        in_zone = rng.random() < pitcher["control"]
                        row["zone"] = int(rng.integers(1, 10)) if in_zone else int(rng.choice([11, 12, 13, 14]))
                        row["vod_ts"] = 60 + 20 * len(rows)
                        swing = rng.random() < (0.68 if in_zone else batter["chase"])
                        pa_result = None
                        if not swing:
                            if not in_zone and rng.random() < 0.01:
                                row["result"], pa_result = "hbp", "HBP"
                            elif in_zone:
                                row["result"] = "called_strike"
                            else:
                                row["result"] = "ball"
                        elif rng.random() > batter["contact"] - (0 if in_zone else 0.15) - (0.08 if breaking else 0):
                            row["result"] = "swinging_strike"
                        elif rng.random() < 0.45:
                            row["result"] = "foul" if rng.random() > 0.05 else "foul_tip"
                        else:
                            row["result"] = "in_play"
                        if row["result"] == "ball":
                            balls += 1
                            if balls == 4:
                                pa_result = "BB"
                        elif row["result"] in ("called_strike", "swinging_strike") or (row["result"] == "foul" and strikes < 2):
                            strikes += 1
                            if strikes == 3:
                                pa_result = "K"
                        runs = 0
                        if row["result"] == "in_play":
                            pa_result, runs, made = self.ball_in_play(row, batter, side, runners, outs)
                            outs += made
                        elif pa_result in ("BB", "HBP"):
                            runs = self.force(runners, batter["id"])
                        elif pa_result == "K":
                            outs += 1
                        row["pa_result"] = pa_result
                        if outs >= 3:
                            runs = 0
                        score[bat] += runs
                        rows.append(row)
                        if pa_result:
                            lineups[bat]["next"] += 1
                            break
                    if half == "bot" and inning == innings and score["home"] > score["away"]:
                        break  # walk-off
        return rows

    @staticmethod
    def force(runners: list, batter: str) -> int:
        scored = 0
        if runners[0]:
            if runners[1]:
                if runners[2]:
                    scored = 1
                runners[2] = runners[1]
            runners[1] = runners[0]
        runners[0] = batter
        return scored

    @staticmethod
    def advance(runners: list, n: int) -> int:
        scored = 0
        for i in (2, 1, 0):
            if runners[i]:
                if i + n > 2:
                    scored += 1
                else:
                    runners[i + n] = runners[i]
                runners[i] = None
        return scored

    def ball_in_play(self, row: dict, batter: dict, side: str, runners: list, outs: int) -> tuple[str, int, int]:
        rng = self.rng
        bb_type = rng.choice(["ground", "line", "fly", "popup"], p=[0.43, 0.22, 0.27, 0.08])
        hard = rng.random() < 0.2 + 0.4 * batter["power"]
        row["bb_type"], row["contact_quality"] = bb_type, "hard" if hard else rng.choice(["weak", "medium"])
        # Pull side: right-handed batters pull toward third (angle 0).
        pull = rng.random() < batter["pull"]
        angle = float(np.clip(rng.normal(25 if (pull == (side == "R")) else 65, 15), 2, 88))
        r = {"ground": rng.uniform(0.6, 1.6), "line": rng.uniform(1.3, 2.8), "fly": rng.uniform(1.8, 3.6), "popup": rng.uniform(0.4, 1.4)}[bb_type]
        hit_p = {"ground": 0.22, "line": 0.62, "fly": 0.18, "popup": 0.02}[bb_type] + (0.12 if hard else 0)
        result, runs, made = "out", 0, 1
        if bb_type == "fly" and hard and rng.random() < 0.15 + 0.3 * batter["power"]:
            result, r = "HR", 4.3
            runs = self.advance(runners, 3) + 1
        elif rng.random() < hit_p:
            result = "2B" if bb_type in ("line", "fly") and rng.random() < 0.3 else "1B"
            runs = self.advance(runners, 2 if result == "2B" else 1)
            runners[1 if result == "2B" else 0] = batter["id"]
            made = 0
        elif rng.random() < 0.04:
            result, made = "E", 0
            runs = self.advance(runners, 1)
            runners[0] = batter["id"]
        elif bb_type == "ground" and runners[0] and outs < 2 and rng.random() < 0.4:
            result, made = "DP", 2
            runners[0] = None
        elif bb_type == "fly" and runners[2] and outs < 2 and rng.random() < 0.7:
            result, runs = "SF", 1
            runners[2] = None
        x, y = field_point(min(r, 4.4), angle)
        row["field_x"], row["field_y"] = x, y
        row["fielder_pos"] = 8 if result == "HR" else fielder_for(r, angle)
        return result, runs, made


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=ROOT / "data" / "synthetic")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    sim = Sim(args.seed)
    games, pairings = [], [(0, 1), (2, 3), (0, 2), (1, 3), (0, 3), (1, 2)]
    for n, (h, a) in enumerate(pairings, start=1):
        game_id = f"syn-{n}"
        rows = sim.game(game_id, TEAMS[h], TEAMS[a], innings=7)
        write_table(args.out / "pitches" / f"{game_id}.csv", "pitches", rows)
        games.append({"game_id": game_id, "season": SEASON, "date": f"2026-01-{n:02d}", "label": f"synthetic {n}",
                      "home_team_id": TEAMS[h], "away_team_id": TEAMS[a], "charted_by": "synthetic",
                      "chart_status": "complete", "velo_unit": "km/h"})
    write_table(args.out / "games.csv", "games", games)
    write_table(args.out / "players.csv", "players", sim.players)
    write_table(args.out / "player_aliases.csv", "player_aliases", [])
    write_table(args.out / "teams.csv", "teams", [{"team_id": t, "display_name": t.replace("_", " ").title()} for t in TEAMS])
    write_table(args.out / "rosters.csv", "rosters", sim.rosters)
    print(f"wrote {len(games)} synthetic games to {args.out}")


if __name__ == "__main__":
    main()
