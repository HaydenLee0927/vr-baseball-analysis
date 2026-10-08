# Charting Guide

How to record a game so the site can use it. One file per game, one row per pitch, both teams' at-bats in the same file.

The charting tool fills in the count, outs, inning, score and runners for you and only asks you to correct them. If you ever chart in a spreadsheet instead, record all of them yourself, as they stand **before** the pitch.

## Once per game

| Field | Example |
|---|---|
| Competition and round | WBD 2026, round of 8 |
| Date | 2026-03-14 |
| Home team, away team | 50_texas, royal_buffalos |
| Video link | stream or VOD URL |
| Lineups | each player's nickname exactly as shown in game, in batting order, with their position (P, C, 1B, 2B, 3B, SS, LF, CF, RF, or DH) |
| DH used? | yes / no. With a DH the pitcher does not bat and is set separately. |
| Pitch type shown on stream? | yes / no / from inning N |
| Final score | used to check the charting adds up |

## Every pitch

| Field | Values | Rule |
|---|---|---|
| Pitcher, batter, catcher | nickname | Pick from the lineup; never retype a name, so spellings cannot drift. |
| Pitcher hand, batter side | L / R | Set at the start of each at-bat. Change it whenever the player switches. |
| Velocity | km/h | As shown. Leave blank if not shown; never estimate. |
| Pitch type | FF, SI, FC, SL, CU, SP, RF, RL, or blank | **Blank when the stream does not show it.** Do not default to FF. If you are guessing from movement, enter the guess and tick "my guess". |
| Zone | 1-9, 11-14 | Catcher's view. 1-9 inside the zone, 11-14 outside. |
| Result | ball, called strike, swinging strike, foul, foul tip, in play, hit by pitch | "Swinging strike" means a miss. Use "foul tip" when the game does not count it as a strike. |
| Video time | seconds | One key press stamps it. |

## When the ball is put in play

| Field | Values | Rule |
|---|---|---|
| Ball type | ground, line, fly, popup, bunt | Record for **every** ball in play, hits included, not only outs. |
| Fielder | 1-9 | The position that first fielded it. Required. For a home run, the field it left over (7, 8 or 9). |
| Landing spot | click on the field | Optional. Skip it if you did not see it clearly. |
| Contact | weak, medium, hard | Optional, your judgment. Be consistent: hard = would be a hit most of the time. |

## Last pitch of every at-bat

Always record how the at-bat ended. This was the most common gap in the earlier files.

`1B, 2B, 3B, HR, BB, K, HBP, out, double play, fielder's choice, error, sacrifice fly, sacrifice bunt`

- A strikeout needs both the pitch result (called or swinging strike) and `K`.
- A walk is the fourth ball plus `BB`.
- On an error, record the fielder who made it and say what happened in the notes.

## Between pitches

Record these as events, not in the notes, so they can be counted: stolen base, caught stealing, wild pitch or passed ball, pickoff, substitution (pitcher, any fielder, pinch hitter). After any of them, check the runners and outs the tool shows.

Keep the defense current: when a new player comes in, use the substitution; when players already in the game swap positions, change them in the Defense panel. Record the listed position, not where a player happens to stand on one pitch.

## Notes

Free text for anything else: a VR glitch, a misplay that was not scored an error, a bunt attempt. Do not put handedness, pitch-type guesses or steals here; they have their own fields.

## Before you export

The tool checks these and lists any row that fails:

1. Every at-bat has an outcome.
2. Every ball in play has a ball type and a fielder.
3. Counts never pass 3 balls or 2 strikes.
4. Each half-inning ends at 3 outs.
5. Runs in the file match the final score you entered.

## Short on time?

Lite mode records only velocity, zone, result and the at-bat outcome (with fielder on balls in play). Everything on the site except pitch-type and ball-type views still works.
