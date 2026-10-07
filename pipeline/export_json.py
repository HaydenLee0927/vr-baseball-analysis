"""Write the site's JSON data files.

M0: emits fixture JSON only. Real stats come from build_stats.py in M1.
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "site" / "public" / "data"


def fixture_files() -> dict[str, object]:
    return {
        "meta.json": {
            "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "fixture": True,
            "coverage": {"games": [], "note": "fixture data, no games charted yet"},
        },
        "players.json": [],
    }


def write_json(out_dir: Path, files: dict[str, object]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, payload in files.items():
        path = out_dir / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"wrote {path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    write_json(args.out, fixture_files())


if __name__ == "__main__":
    main()
