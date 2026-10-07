# CLAUDE.md

## VR Savant

Static scouting site for a VR baseball competition. See docs/handoff.md for the full plan and docs/charting-guide.md for the charting contract.

### Commands
- `make data`: validate raw CSVs and build JSON into site/public/data (Windows without make: `python pipeline/export_json.py`)
- `make test`: pipeline unit tests (Windows: `python -m unittest discover pipeline/tests`)
- `cd site && npm run dev`: local dev server
- `cd site && npm run build`: production build

### Rules
- data/raw/ is the source of truth. Never write derived stats there.
- This repo is public. data/raw/ is a clone of the private repo HaydenLee0927/vr-baseball-data and is gitignored here; never commit raw data, coach notes, or passwords to this repo.
- CI logs are public: pipeline output may print file names, counts and error locations, but never coach notes or decrypted data.
- Do not change column names in data/schema/ without asking; the charting tool and pipeline both depend on them.
- Every rate stat shown in the UI must display its sample size.
- Never hardcode MLB constants (wOBA weights, league averages). Compute from this league's data.
- No backend, no secrets in the repo. The site must work as plain static files.
- Use HashRouter; Vite base must match the repo name (set via BASE_PATH in CI).
- The scouting site UI is Korean. All strings live in site/src/i18n/ko.ts; never hardcode UI text in components. Use KBO/STATIZ terminology. The charting tool is English.
- The charting tool is local-only and must never appear in the production build.
- All data loading goes through `loadData()` in site/src/lib/loadData.ts.

---

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
