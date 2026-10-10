# VR Savant

Baseball Savant-style scouting site for a VR baseball competition. Static site on GitHub Pages; data is hand-charted CSV turned into JSON by a Python pipeline. Full plan: [docs/handoff.md](docs/handoff.md).

## Local development

```sh
git clone https://github.com/wbd-savant/vr-baseball-data.git data/raw   # private data, see Repos below
python -m pip install -r pipeline/requirements.txt
python pipeline/export_json.py      # or: make data (validates data/raw first)
cd site && npm install && npm run dev
```

`npm run dev` reads plain JSON (no password). To try the password gate locally:

```sh
python pipeline/export_json.py
SITE_PASSWORD="some long passphrase" python pipeline/encrypt.py
cd site && npm run build && npm run preview
```

Run `python pipeline/export_json.py` again afterwards to get plain data back for `npm run dev`.

To work on the charts with plenty of data, generate a fake season (it stays local and is never deployed):

```sh
python pipeline/synth.py
python pipeline/export_json.py --raw data/synthetic   # run without --raw afterwards to go back to real data
```

## Charting a game

```sh
cd site && npm run chart     # opens http://localhost:5174/chart.html
```

Runs only on your computer; it is never deployed. It reads players and teams from `data/raw` and **Save to data/raw** writes the game there and runs the validator. Then commit and push the data repo. Follow [docs/charting-guide.md](docs/charting-guide.md).

- Every change is autosaved in the browser; close the tab and pick the game up again from **Drafts on this computer**.
- Games already in `data/raw` can be opened from the start screen to continue or correct them.
- Keys: type the velocity, click the zone, then **B** ball, **C** called strike, **S** swinging strike, **F** foul, **T** foul tip, **X** in play, **H** hit by pitch; **Enter** records it, **Ctrl+Z** undoes, **V** re-stamps the video time, **Esc** clears the entry.
- YouTube videos are embedded and their time is stamped automatically. SOOP videos are embedded too, but their time cannot be read: set the clock under the video to the video time and start it together with the video. CHZZK cannot be embedded: open it in another window and use the same clock.
- Click any row in the table to edit it. Edits change that row only; later rows keep their recorded state.

## Repos

| Repo | Visibility | Contents |
|---|---|---|
| `vr-baseball-analysis` (this one) | public | code, pipeline, schemas, docs |
| `vr-baseball-data` | private | everything under `data/raw/` (pitch CSVs, players, coach notes) |

Locally, clone the data repo into `data/raw/` (gitignored here):

```sh
git clone https://github.com/wbd-savant/vr-baseball-data.git data/raw
```

## Deploying

1. Settings → Pages → Source: **GitHub Actions**.
2. Give CI read access to the data repo with a deploy key:
   - `ssh-keygen -t ed25519 -f data_deploy_key -N "" -C "vr-savant ci"`
   - In **vr-baseball-data**: Settings → Deploy keys → add `data_deploy_key.pub` (read-only).
   - In **vr-baseball-analysis**: Settings → Secrets and variables → Actions → add `DATA_DEPLOY_KEY` with the contents of `data_deploy_key` (the private half). Then delete both key files.
3. In **vr-baseball-analysis**, also add the `SITE_PASSWORD` secret.
4. Push to `main`. The workflow tests, builds, encrypts and deploys.

Secrets are not shown in logs and are not given to pull requests from forks. Workflow logs themselves are public, so the pipeline never prints raw data.

To make the site public later, set `PUBLIC_MODE: 'true'` in `.github/workflows/deploy.yml`.

## Password gate: what it does and does not do

The data files are encrypted (PBKDF2-SHA256, 600k iterations → AES-256-GCM); the page itself is public but contains no data.

- **Example pages are public.** Without the password the site shows the pages of the players listed in `SAMPLE_PLAYERS` (`pipeline/export_json.py`), from plain JSON in `sample/`: those players' full files, the game list, league averages and team names. Add or remove players there; the 풀버전 button opens the password form.

- **It is one shared password.** Anyone who has it can read everything and pass it on. To revoke access, change the `SITE_PASSWORD` secret and redeploy; saved logins stop working automatically.
- **Strength depends on the password.** The encrypted files are downloadable, so a short password can be guessed offline. Use a passphrase of 4 or more random words.
