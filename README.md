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

- **It is one shared password.** Anyone who has it can read everything and pass it on. To revoke access, change the `SITE_PASSWORD` secret and redeploy; saved logins stop working automatically.
- **Strength depends on the password.** The encrypted files are downloadable, so a short password can be guessed offline. Use a passphrase of 4 or more random words.
