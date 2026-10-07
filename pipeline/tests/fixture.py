"""A one-inning game small enough to compute every stat by hand.

Top 1 (visitors bat, h-p pitches, h-c catches):
  PA1 v-a: ball z12, called strike z5, HR (fly, hard) z5             -> 1 run
  PA2 v-b: ball z11, z12, z13, z14                                     -> BB
  PA3 v-c: swinging strike z5, foul z12, swinging strike z13           -> K
  PA4 v-d: in play z4, ground into DP                                  -> inning over
Bottom 1 (home bats, v-p pitches):
  PA5 h-a: in play z5, 1B line
  PA6 h-b: HBP z14
  PA7 h-c: in play z6, 2B fly hard, both runners score             -> 2-1 home win (from games.csv final)
"""

from pathlib import Path

from rawdata import write_table

GAME = "fx-1"
SEASON = "fx-season"

PLAYERS = ["h-p", "h-c", "h-a", "h-b", "v-p", "v-a", "v-b", "v-c", "v-d"]


def _pitch(n, pa, half, pitcher, batter, catcher, b, s, outs, zone, result, score=(0, 0), runners=(None, None, None), **extra):
    return {
        "game_id": GAME, "pitch_id": n, "inning": 1, "half": half, "pa_id": pa,
        "pitcher_id": pitcher, "batter_id": batter, "catcher_id": catcher,
        "home_score": score[0], "away_score": score[1], "balls": b, "strikes": s, "outs": outs,
        "runner_1": runners[0], "runner_2": runners[1], "runner_3": runners[2],
        "velo": 100 + n, "zone": zone, "result": result, **extra,
    }


def pitches() -> list[dict]:
    rows = []

    def add(pa, half, pitcher, batter, catcher, b, s, outs, zone, result, **extra):
        rows.append(_pitch(len(rows) + 1, pa, half, pitcher, batter, catcher, b, s, outs, zone, result, **extra))

    add(1, "top", "h-p", "v-a", "h-c", 0, 0, 0, 12, "ball")
    add(1, "top", "h-p", "v-a", "h-c", 1, 0, 0, 5, "called_strike")
    add(1, "top", "h-p", "v-a", "h-c", 1, 1, 0, 5, "in_play", bb_type="fly", contact_quality="hard", pa_result="HR")
    for i, z in enumerate([11, 12, 13, 14]):
        add(2, "top", "h-p", "v-b", "h-c", i, 0, 0, z, "ball", score=(0, 1), pa_result="BB" if i == 3 else None)
    add(3, "top", "h-p", "v-c", "h-c", 0, 0, 0, 5, "swinging_strike", score=(0, 1), runners=("v-b", None, None))
    add(3, "top", "h-p", "v-c", "h-c", 0, 1, 0, 12, "foul", score=(0, 1), runners=("v-b", None, None))
    add(3, "top", "h-p", "v-c", "h-c", 0, 2, 0, 13, "swinging_strike", score=(0, 1), runners=("v-b", None, None), pa_result="K")
    add(4, "top", "h-p", "v-d", "h-c", 0, 0, 1, 4, "in_play", score=(0, 1), runners=("v-b", None, None),
        bb_type="ground", fielder_pos=6, pa_result="DP")
    add(5, "bot", "v-p", "h-a", None, 0, 0, 0, 5, "in_play", score=(0, 1), bb_type="line", pa_result="1B")
    add(6, "bot", "v-p", "h-b", None, 0, 0, 0, 14, "hbp", score=(0, 1), runners=("h-a", None, None), pa_result="HBP")
    add(7, "bot", "v-p", "h-c", None, 0, 0, 0, 6, "in_play", score=(0, 1), runners=("h-b", "h-a", None),
        bb_type="fly", contact_quality="hard", pa_result="2B", rbi=2)  # last play: no next row to read the score from
    return rows


def write_fixture(raw: Path, pitch_rows: list[dict] | None = None) -> None:
    write_table(raw / "players.csv", "players", [{"player_id": p, "vrchat_name": f"VR_{p}", "slug": p} for p in PLAYERS])
    write_table(raw / "player_aliases.csv", "player_aliases", [{"alias": "VR_hp_old", "player_id": "h-p"}])
    write_table(raw / "teams.csv", "teams", [{"team_id": "home"}, {"team_id": "away"}])
    write_table(
        raw / "rosters.csv", "rosters",
        [{"season": SEASON, "team_id": "home" if p.startswith("h") else "away", "player_id": p} for p in PLAYERS],
    )
    write_table(raw / "games.csv", "games", [{
        "game_id": GAME, "season": SEASON, "home_team_id": "home", "away_team_id": "away",
        "home_final": 2, "away_final": 1, "chart_status": "complete", "velo_unit": "km/h",
    }])
    write_table(raw / "pitches" / f"{GAME}.csv", "pitches", pitches() if pitch_rows is None else pitch_rows)
