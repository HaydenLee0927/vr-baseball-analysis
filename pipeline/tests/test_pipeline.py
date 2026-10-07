import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from export_json import build_outputs  # noqa: E402
from fixture import GAME, SEASON, pitches, write_fixture  # noqa: E402
from import_legacy import convert_game  # noqa: E402
from rawdata import load_raw  # noqa: E402
from romanize import slugify  # noqa: E402
from validate import validate  # noqa: E402


def load_fixture(pitch_rows=None, **game_overrides):
    tmp = tempfile.TemporaryDirectory()
    raw = Path(tmp.name)
    write_fixture(raw, pitch_rows)
    data = load_raw(raw)
    data.games[0].update(game_overrides)
    tmp.cleanup()
    return data


class StatsTest(unittest.TestCase):
    """Expected values are worked out by hand in tests/fixture.py's docstring."""

    @classmethod
    def setUpClass(cls):
        cls.out = build_outputs(load_fixture())

    def season(self, slug):
        return self.out[f"player/{slug}.json"]["seasons"][0]

    def test_pitcher_with_complete_inning(self):
        p = self.season("h-p")["pitching"]
        self.assertEqual((p["bf"], p["outs"], p["ip"], p["r"], p["h"], p["hr"], p["bb"], p["k"]), (4, 3, "1.0", 1, 1, 1, 1, 1))
        self.assertEqual((p["ra9"], p["whip"], p["hr9"]), (9.0, 2.0, 9.0))
        self.assertEqual((p["k_pct"], p["bb_pct"], p["k_bb_pct"]), (0.25, 0.25, 0.0))
        self.assertEqual((p["pitches"], p["swings"], p["whiffs"], p["whiff_pct"]), (11, 5, 2, 0.4))
        self.assertAlmostEqual(p["called_strike_pct"], round(1 / 11, 4))
        self.assertAlmostEqual(p["csw_pct"], round(3 / 11, 4))
        self.assertAlmostEqual(p["zone_pct"], round(4 / 11, 4))
        self.assertEqual(p["first_pitch_strike_pct"], 0.5)
        self.assertAlmostEqual(p["opp_avg"], round(1 / 3, 4))
        self.assertEqual(p["opp_obp"], 0.5)
        self.assertEqual((p["gb_pct"], p["hard_pct"]), (0.5, 1.0))
        self.assertEqual((p["velo_avg"], p["velo_max"], p["velo_n"]), (106.0, 111.0, 11))

    def test_pitcher_with_no_outs_uses_final_score(self):
        p = self.season("v-p")["pitching"]
        self.assertEqual((p["bf"], p["outs"], p["ip"], p["r"], p["h"], p["hbp"]), (3, 0, "0.0", 2, 2, 1))
        self.assertIsNone(p["ra9"])
        self.assertEqual((p["opp_avg"], p["opp_obp"], p["opp_slg"]), (1.0, 1.0, 1.5))

    def test_hitter_home_run(self):
        b = self.season("v-a")["batting"]
        self.assertEqual((b["pa"], b["ab"], b["h"], b["hr"], b["tb"]), (1, 1, 1, 1, 4))
        self.assertEqual((b["avg"], b["obp"], b["slg"], b["ops"], b["iso"]), (1.0, 1.0, 4.0, 5.0, 3.0))
        self.assertIsNone(b["babip"])  # denominator is zero
        self.assertEqual((b["chase_pitches"], b["chase_pct"]), (1, 0.0))
        self.assertEqual((b["fb_pct"], b["hard_pct"]), (1.0, 1.0))

    def test_hitter_plate_discipline(self):
        b = self.season("v-c")["batting"]
        self.assertEqual((b["pa"], b["k"], b["avg"], b["k_pct"]), (1, 1, 0.0, 1.0))
        self.assertEqual((b["swings"], b["whiffs"]), (3, 2))
        self.assertAlmostEqual(b["whiff_pct"], round(2 / 3, 4))
        self.assertEqual((b["zone_swing_pct"], b["chase_pct"], b["first_pitch_swing_pct"]), (1.0, 1.0, 1.0))

    def test_walk_is_not_an_at_bat(self):
        b = self.season("v-b")["batting"]
        self.assertEqual((b["pa"], b["ab"], b["bb"], b["obp"]), (1, 0, 1, 1.0))
        self.assertIsNone(b["avg"])

    def test_league_and_game(self):
        league = self.out["league.json"]["seasons"][SEASON]
        b = league["batting"]
        self.assertEqual((b["pa"], b["ab"], b["h"], b["tb"]), (7, 5, 3, 7))
        self.assertEqual((b["avg"], b["slg"]), (0.6, 1.4))
        self.assertAlmostEqual(b["obp"], round(5 / 7, 4))
        self.assertEqual((league["pitching"]["outs"], league["pitching"]["r"], league["pitching"]["ra9"]), (3, 3, 27.0))

        game = self.out[f"game/{GAME}.json"]
        self.assertEqual((game["game"]["home_score"], game["game"]["away_score"]), (2, 1))
        self.assertEqual(game["linescore"], {"away": [1], "home": [2]})
        self.assertEqual([p["pa_result"] for p in game["plays"]], ["HR", "BB", "K", "DP", "1B", "HBP", "2B"])

    def test_final_play_runs_from_rbi_without_final_score(self):
        out = build_outputs(load_fixture(home_final=None, away_final=None))
        self.assertEqual(out[f"game/{GAME}.json"]["linescore"]["home"], [2])

    def test_index_files(self):
        self.assertEqual(len(self.out["players.json"]), 9)
        self.assertEqual(self.out["meta.json"]["coverage"]["plate_appearances"], 7)
        self.assertEqual(self.out["games.json"][0]["innings"], 1)


class ValidateTest(unittest.TestCase):
    def errors(self, rows=None, **game):
        return validate(load_fixture(rows, **game))

    def test_clean_fixture(self):
        report = self.errors()
        self.assertEqual((report.errors, report.warnings), ([], []))

    def test_impossible_count(self):
        rows = pitches()
        rows[0]["strikes"] = 3
        self.assertTrue(any("strikes: 3 is above 2" in e for e in self.errors(rows).errors))

    def test_unknown_player(self):
        rows = pitches()
        rows[0]["batter_id"] = "VR_v-a"  # a VRChat name instead of the player_id
        self.assertTrue(any("not in players.csv" in e for e in self.errors(rows).errors))

    def test_missing_pa_result(self):
        rows = pitches()
        rows[9]["pa_result"] = None  # the strikeout
        self.assertTrue(any("has no pa_result" in e for e in self.errors(rows).errors))

    def test_in_play_fields_on_a_ball(self):
        rows = pitches()
        rows[0]["fielder_pos"] = 6
        self.assertTrue(any("only for balls in play" in e for e in self.errors(rows).errors))

    def test_final_score_mismatch_warns(self):
        report = self.errors(home_final=5)
        self.assertEqual(report.errors, [])
        self.assertTrue(any("does not match the final score" in w for w in report.warnings))


class ImportLegacyTest(unittest.TestCase):
    @staticmethod
    def legacy_row(line, batter, ball, strike, result, inplay="", notes="", pitch_type="FF", runner_1="", visible=False):
        return {
            "inning": "1", "_half": "top", "_order": 0, "_line": line, "_file": "x.csv", "_visible": visible,
            "pitcher": "P", "batter": batter, "catcher": "C", "pitch_type": pitch_type, "pitch_speed": "110",
            "zone": "5", "result": result, "inplay_result": inplay, "batted_ball_location": "6" if result == "inplay" else "",
            "outs": "0", "ball": str(ball), "strike": str(strike), "home_score": "0", "away_score": "0",
            "runner_1": runner_1, "runner_2": "", "runner_3": "", "notes": notes,
        }

    def test_conversion_rules(self):
        ids = {n: n.lower() for n in ["P", "C", "A", "B"]}
        rows = [
            self.legacy_row(2, "A", 0, 0, "strike", notes="좌투, sinker?"),
            self.legacy_row(3, "A", 0, 1, "inplay", inplay="hit"),
            self.legacy_row(4, "B", 0, 0, "swing", runner_1="A", notes="우타"),
            self.legacy_row(5, "B", 0, 1, "ball", visible=True),  # runner cell left blank
            self.legacy_row(6, "B", 1, 1, "swing", inplay="strike_out", pitch_type="SL", visible=True),
        ]
        out = convert_game("g", rows, ids)
        self.assertEqual([r["pa_id"] for r in out], [1, 1, 2, 2, 2])
        self.assertEqual([r["result"] for r in out], ["called_strike", "in_play", "swinging_strike", "ball", "swinging_strike"])
        self.assertEqual([r["pa_result"] for r in out], [None, "1B", None, None, "K"])
        self.assertEqual({r["pitcher_hand"] for r in out}, {"L"})  # carried forward from the first note
        self.assertEqual([r["batter_side"] for r in out], [None, None, "R", "R", "R"])
        self.assertEqual(out[3]["runner_1"], "a")  # carried forward within the PA
        self.assertEqual([(r["pitch_type"], r["pitch_type_source"]) for r in out],
                         [("SI", "charter"), (None, None), (None, None), ("FF", "stream"), ("SL", "stream")])
        self.assertEqual(out[1]["fielder_pos"], 6)


class SlugTest(unittest.TestCase):
    def test_slugs(self):
        self.assertEqual(slugify("__Daki__"), "daki")
        self.assertEqual(slugify("망 야 _"), "mang-ya")
        self.assertEqual(slugify("담비는흥흥"), "dambineunheungheung")
        self.assertTrue(slugify("!!!").startswith("p-"))


if __name__ == "__main__":
    unittest.main()
