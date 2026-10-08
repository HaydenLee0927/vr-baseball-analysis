"""Derive per-pitch fields from the raw data and aggregate standard hitter and pitcher stats.

Every rate is returned next to its counts so the site can always show the sample size.
"""

import numpy as np
import pandas as pd

from rawdata import RawData, columns

SWINGS = {"swinging_strike", "foul", "foul_tip", "in_play"}
# In this game a "foul tip" is contact the game did not count as a strike (charting guide),
# so unlike Baseball Savant it is a swing with contact, not a whiff.
WHIFFS = {"swinging_strike"}
STRIKES = {"called_strike", "swinging_strike", "foul", "foul_tip", "in_play"}
TOTAL_BASES = {"1B": 1, "2B": 2, "3B": 3, "HR": 4}
NOT_AT_BATS = {"BB", "HBP", "SF", "SH"}
# Only used for the last row of a game, where there is no next row to read the outs from.
OUTS_MADE = {"K": 1, "out": 1, "FC": 1, "SF": 1, "SH": 1, "DP": 2, "CS": 1, "pickoff": 1}


def rate(num: float, den: float) -> float | None:
    return None if not den else num / den


def pitch_frame(data: RawData) -> pd.DataFrame:
    """All pitch/event rows in game order, with derived columns:
    season, bat_team, fld_team, runs (scored on this row), outs_made, swing, whiff,
    in_zone, out_zone, first_pitch."""
    rows = [r for game_id in sorted(data.pitches) for r in data.pitches[game_id]]
    df = pd.DataFrame(rows, columns=columns("pitches"))
    if df.empty:
        return df
    for col in ("velo", "zone", "field_x", "field_y", "fielder_pos", "rbi", "vod_ts"):
        df[col] = pd.to_numeric(df[col])  # all-blank columns would otherwise stay as object dtype
    games = pd.DataFrame(data.games).set_index("game_id")
    df["season"] = df.game_id.map(games.season)
    home = df.game_id.map(games.home_team_id)
    away = df.game_id.map(games.away_team_id)
    top = df.half == "top"
    df["bat_team"] = np.where(top, away, home)
    df["fld_team"] = np.where(top, home, away)

    g = df.groupby("game_id", sort=False)
    last_in_game = g.cumcount(ascending=False) == 0
    bat_score = np.where(top, df.away_score, df.home_score)
    # The batting team's score on the next row is its score after this play.
    next_bat_score = np.where(top, g.away_score.shift(-1), g.home_score.shift(-1))
    final = np.where(top, df.game_id.map(games.away_final), df.game_id.map(games.home_final))
    final = pd.to_numeric(pd.Series(final, index=df.index), errors="coerce")
    # Last row of a game: use the hand-entered final score, else the row's rbi, else no runs.
    end_score = np.where(last_in_game, final.fillna(bat_score + df.rbi.fillna(0)), next_bat_score)
    df["runs"] = (end_score - bat_score).clip(min=0).astype(int)

    same_half_next = (g.inning.shift(-1) == df.inning) & (g.half.shift(-1) == df.half)
    outs_last = df.pa_result.fillna(df.event).map(OUTS_MADE).fillna(0)
    outs_made = np.where(same_half_next, g.outs.shift(-1) - df.outs, np.where(last_in_game, outs_last, 3 - df.outs))
    df["outs_made"] = np.minimum(np.clip(outs_made, 0, None), 3 - df.outs).astype(int)

    # Hands with the player's default as fallback (switch hitters/pitchers have no default).
    players = {p["player_id"]: p for p in data.players}

    def default_hand(pid: str, col: str) -> str | None:
        v = players.get(pid, {}).get(col)
        return v if v in ("L", "R") else None

    df["p_hand"] = df.pitcher_hand.fillna(df.pitcher_id.map(lambda pid: default_hand(pid, "default_throws")))
    df["b_side"] = df.batter_side.fillna(df.batter_id.map(lambda pid: default_hand(pid, "default_bats")))

    is_pitch = df.result.notna()
    df["swing"] = df.result.isin(SWINGS)
    df["whiff"] = df.result.isin(WHIFFS)
    df["in_zone"] = df.zone.between(1, 9)
    df["out_zone"] = df.zone >= 11
    first_pitch_idx = df[is_pitch].groupby(["game_id", "pa_id"]).head(1).index
    df["first_pitch"] = df.index.isin(first_pitch_idx)
    return df


def batting_line(pas: pd.DataFrame, pitches: pd.DataFrame) -> dict:
    """pas: rows with a pa_result. pitches: pitch rows (result set) for the same player or group."""
    n = pas.pa_result.value_counts()
    c = {k: int(n.get(k, 0)) for k in ["1B", "2B", "3B", "HR", "BB", "K", "HBP", "SF", "SH", "E", "FC", "DP", "out"]}
    pa = len(pas)
    h = c["1B"] + c["2B"] + c["3B"] + c["HR"]
    ab = pa - sum(c[k] for k in NOT_AT_BATS)
    tb = sum(c[k] * v for k, v in TOTAL_BASES.items())
    avg, obp, slg = rate(h, ab), rate(h + c["BB"] + c["HBP"], ab + c["BB"] + c["HBP"] + c["SF"]), rate(tb, ab)

    p = pitches[pitches.result.notna()]
    swings, whiffs = int(p.swing.sum()), int(p.whiff.sum())
    zone_p, chase_p = p[p.in_zone], p[p.out_zone]
    first = p[p.first_pitch]
    bip = p[p.result == "in_play"]
    typed = bip.bb_type.value_counts()
    n_typed = int(typed.sum())
    n_quality = int(bip.contact_quality.notna().sum())

    return {
        "pa": pa, "ab": ab, "h": h, "1b": c["1B"], "2b": c["2B"], "3b": c["3B"], "hr": c["HR"],
        "bb": c["BB"], "k": c["K"], "hbp": c["HBP"], "sf": c["SF"], "sh": c["SH"], "tb": tb,
        "avg": avg, "obp": obp, "slg": slg,
        "ops": None if obp is None or slg is None else obp + slg,
        "iso": None if slg is None else slg - avg,
        "babip": rate(h - c["HR"], ab - c["K"] - c["HR"] + c["SF"]),
        "k_pct": rate(c["K"], pa), "bb_pct": rate(c["BB"], pa),
        "pitches": len(p), "swings": swings, "whiffs": whiffs,
        "swing_pct": rate(swings, len(p)), "whiff_pct": rate(whiffs, swings),
        "contact_pct": rate(swings - whiffs, swings),
        "zone_pitches": len(zone_p), "zone_swings": int(zone_p.swing.sum()),
        "zone_swing_pct": rate(zone_p.swing.sum(), len(zone_p)),
        "chase_pitches": len(chase_p), "chase_swings": int(chase_p.swing.sum()),
        "chase_pct": rate(chase_p.swing.sum(), len(chase_p)),
        "first_pitches": len(first), "first_pitch_swings": int(first.swing.sum()),
        "first_pitch_swing_pct": rate(first.swing.sum(), len(first)),
        "bip": len(bip), "bb_typed": n_typed,
        "gb_pct": rate(typed.get("ground", 0), n_typed), "ld_pct": rate(typed.get("line", 0), n_typed),
        "fb_pct": rate(typed.get("fly", 0), n_typed), "pu_pct": rate(typed.get("popup", 0), n_typed),
        "contact_rated": n_quality,
        "hard_pct": rate((bip.contact_quality == "hard").sum(), n_quality),
    }


def ip_display(outs: int) -> str:
    return f"{outs // 3}.{outs % 3}"


def pitching_line(rows: pd.DataFrame) -> dict:
    """rows: every row (pitches and events) where this pitcher or group was on the mound."""
    pas = rows[rows.pa_result.notna()]
    pitches = rows[rows.result.notna()]
    b = batting_line(pas, pitches)
    outs, runs = int(rows.outs_made.sum()), int(rows.runs.sum())
    velo = pitches.velo.dropna()
    called = int((pitches.result == "called_strike").sum())
    zoned = pitches[pitches.zone.notna()]
    first = pitches[pitches.first_pitch]
    k_pct, bb_pct = b["k_pct"], b["bb_pct"]
    return {
        "g": int(rows.game_id.nunique()), "bf": b["pa"], "outs": outs, "ip": ip_display(outs),
        "r": runs, "h": b["h"], "hr": b["hr"], "bb": b["bb"], "k": b["k"], "hbp": b["hbp"],
        "ra9": rate(runs * 27, outs), "whip": rate((b["bb"] + b["h"]) * 3, outs), "hr9": rate(b["hr"] * 27, outs),
        "k_pct": k_pct, "bb_pct": bb_pct, "k_bb_pct": None if k_pct is None else k_pct - bb_pct,
        "opp_ab": b["ab"], "opp_avg": b["avg"], "opp_obp": b["obp"], "opp_slg": b["slg"], "opp_ops": b["ops"],
        "pitches": b["pitches"], "velo_n": len(velo),
        "velo_avg": float(velo.mean()) if len(velo) else None, "velo_max": float(velo.max()) if len(velo) else None,
        "swings": b["swings"], "whiffs": b["whiffs"], "whiff_pct": b["whiff_pct"],
        "called_strikes": called, "called_strike_pct": rate(called, b["pitches"]),
        "csw_pct": rate(called + b["whiffs"], b["pitches"]),
        "zone_charted": len(zoned), "zone_pct": rate(zoned.in_zone.sum(), len(zoned)),
        "first_pitches": len(first), "first_pitch_strike_pct": rate(first.result.isin(STRIKES).sum(), len(first)),
        "bb_typed": b["bb_typed"], "gb_pct": b["gb_pct"], "contact_rated": b["contact_rated"], "hard_pct": b["hard_pct"],
    }


def batting_game_line(pas: pd.DataFrame) -> dict:
    b = batting_line(pas, pas.iloc[0:0])
    return {k: b[k] for k in ("pa", "ab", "h", "2b", "3b", "hr", "bb", "k", "hbp")} | {"results": pas.pa_result.tolist()}


def pitching_game_line(rows: pd.DataFrame) -> dict:
    p = pitching_line(rows)
    return {k: p[k] for k in ("outs", "ip", "bf", "h", "r", "hr", "bb", "k", "pitches", "velo_max")}


SPLIT_FIELDS = [
    "pa", "ab", "h", "hr", "bb", "k", "avg", "obp", "slg", "ops", "k_pct", "bb_pct",
    "pitches", "swings", "swing_pct", "whiffs", "whiff_pct", "chase_pitches", "chase_pct",
]
# Velocity bands in km/h. The league's range so far is roughly 75-130.
VELO_BANDS = [("velo_lt100", None, 100), ("velo_100", 100, 110), ("velo_110", 110, 120), ("velo_120", 120, None)]


def _split_masks(df: pd.DataFrame, role: str) -> list[tuple[str, pd.Series]]:
    """Row masks for each split, evaluated on the state before each pitch.
    Batting splits use the pitcher's hand; pitching splits use the batter's side."""
    hand_col, hands = ("p_hand", "hp") if role == "batting" else ("b_side", "hb")
    masks = [
        (f"vs_l{hands[1]}", df[hand_col] == "L"),
        (f"vs_r{hands[1]}", df[hand_col] == "R"),
        # Count names are always from the batter's side, for hitters and pitchers alike.
        ("count_ahead", df.balls > df.strikes),
        ("count_even", df.balls == df.strikes),
        ("count_behind", df.strikes > df.balls),
        ("two_strikes", df.strikes == 2),
        ("risp", df.runner_2.notna() | df.runner_3.notna()),
    ]
    if role == "batting":
        for key, lo, hi in VELO_BANDS:
            masks.append((key, (df.velo >= (lo if lo is not None else -np.inf)) & (df.velo < (hi if hi is not None else np.inf))))
    return masks


def splits(rows: pd.DataFrame, role: str) -> list[dict]:
    """Split lines for one player's rows (as batter or as pitcher).

    Plate discipline counts the pitches thrown in that situation; results count the plate
    appearances that ended in it (so a count split shows PAs that ended at that count)."""
    out = []
    for key, mask in _split_masks(rows, role):
        sub = rows[mask]
        pitches = sub[sub.result.notna()]
        if pitches.empty:
            continue
        line = batting_line(sub[sub.pa_result.notna()], pitches)
        out.append({"key": key} | {k: line[k] for k in SPLIT_FIELDS})
    return out


def hands_used(sides: pd.Series) -> str | None:
    """'L', 'R', 'S' (used both) or None, from the hands recorded on the player's pitches."""
    used = set(sides.dropna())
    return "S" if used >= {"L", "R"} else used.pop() if used else None


def final_score(rows: pd.DataFrame) -> tuple[int, int]:
    last = rows.iloc[-1]
    home, away = int(last.home_score), int(last.away_score)
    if last.half == "bot":
        home += int(last.runs)
    else:
        away += int(last.runs)
    return home, away
