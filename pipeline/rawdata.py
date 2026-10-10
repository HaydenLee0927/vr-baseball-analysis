"""Read and write the raw CSVs, using the column definitions in data/schema/.

The schemas are standard JSON Schema files so the charting tool can share them.
Only the keywords they use are checked here: type, enum, minimum, maximum,
minLength, pattern, required.
"""

import csv
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = ROOT / "data" / "schema"
RAW_DIR = ROOT / "data" / "raw"

# table name -> file name inside the raw dir
TABLES = {
    "players": "players.csv",
    "player_aliases": "player_aliases.csv",
    "teams": "teams.csv",
    "rosters": "rosters.csv",
    "games": "games.csv",
}


def load_schema(table: str) -> dict:
    return json.loads((SCHEMA_DIR / f"{table}.schema.json").read_text(encoding="utf-8"))


def columns(table: str) -> list[str]:
    return list(load_schema(table)["properties"])


def pitch_types() -> list[dict]:
    """Rows of data/schema/pitch_types.csv: code, label_ko, label_en."""
    with open(SCHEMA_DIR / "pitch_types.csv", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def pitch_type_codes() -> set[str]:
    return {row["code"] for row in pitch_types()}


def _types(spec: dict) -> list[str]:
    if "type" in spec:
        t = spec["type"]
        return t if isinstance(t, list) else [t]
    found = set()
    for v in spec["enum"]:
        found.add("null" if v is None else "integer" if isinstance(v, int) else "string")
    return sorted(found)


def _coerce(value: str, spec: dict):
    if value == "":
        return None
    types = _types(spec)
    if "integer" in types:
        try:
            return int(value)
        except ValueError:
            pass
    if "number" in types:
        try:
            return float(value)
        except ValueError:
            pass
    return value


def check_row(row: dict, schema: dict) -> list[str]:
    """Return one message per invalid column."""
    errors = []
    required = set(schema.get("required", []))
    for col, spec in schema["properties"].items():
        v = row.get(col)
        if v is None:
            if col in required:
                errors.append(f"{col}: required")
            continue
        if "enum" in spec:
            if v not in spec["enum"]:
                allowed = ", ".join(str(x) for x in spec["enum"] if x is not None)
                errors.append(f"{col}: {v!r} is not one of {allowed}")
            continue
        types = _types(spec)
        ok = (
            ("integer" in types and isinstance(v, int))
            or ("number" in types and isinstance(v, (int, float)))
            or ("string" in types and isinstance(v, str))
        )
        if not ok:
            errors.append(f"{col}: {v!r} is not {'/'.join(t for t in types if t != 'null')}")
            continue
        if "minimum" in spec and v < spec["minimum"]:
            errors.append(f"{col}: {v} is below {spec['minimum']}")
        if "maximum" in spec and v > spec["maximum"]:
            errors.append(f"{col}: {v} is above {spec['maximum']}")
        if "minLength" in spec and len(v) < spec["minLength"]:
            errors.append(f"{col}: empty")
        if "pattern" in spec and not re.search(spec["pattern"], v):
            errors.append(f"{col}: {v!r} does not match {spec['pattern']}")
    return errors


def read_table(path: Path, table: str) -> tuple[list[str], list[dict]]:
    """Return (header, rows) with values coerced to the schema's types. Blank cells become None."""
    props = load_schema(table)["properties"]
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        header = list(reader.fieldnames or [])
        rows = [{c: _coerce((r.get(c) or "").strip(), spec) for c, spec in props.items()} for r in reader]
    return header, rows


def write_table(path: Path, table: str, rows: list[dict]) -> None:
    """Write with a BOM so Excel shows Hangul correctly."""
    cols = columns(table)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({c: _fmt(row.get(c)) for c in cols})


def _fmt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


@dataclass
class RawData:
    players: list[dict] = field(default_factory=list)
    player_aliases: list[dict] = field(default_factory=list)
    teams: list[dict] = field(default_factory=list)
    rosters: list[dict] = field(default_factory=list)
    games: list[dict] = field(default_factory=list)
    pitches: dict[str, list[dict]] = field(default_factory=dict)  # game_id -> rows
    headers: dict[str, list[str]] = field(default_factory=dict)  # file name -> header as read
    swot: dict[str, dict[str, list[str]]] = field(default_factory=dict)  # player_id -> section -> points
    swot_problems: list[str] = field(default_factory=list)  # file and line only: never the note text (CI logs are public)


def load_raw(raw_dir: Path = RAW_DIR) -> RawData:
    if not raw_dir.is_dir():
        raise SystemExit(
            f"{raw_dir} not found. Clone the private data repo there:\n"
            "  git clone https://github.com/wbd-savant/vr-baseball-data.git data/raw"
        )
    data = RawData()
    for table, name in TABLES.items():
        path = raw_dir / name
        if not path.exists():
            raise SystemExit(f"missing {path}")
        header, rows = read_table(path, table)
        data.headers[name] = header
        setattr(data, table, rows)
    for path in sorted((raw_dir / "pitches").glob("*.csv")):
        header, rows = read_table(path, "pitches")
        data.headers[f"pitches/{path.name}"] = header
        data.pitches[path.stem] = rows
    for path in sorted((raw_dir / "swot").glob("*.md")):
        data.swot[path.stem], problems = read_swot(path)
        data.swot_problems += [f"swot/{path.name}:{p}" for p in problems]
    return data


SWOT_SECTIONS = {"장점": "strengths", "단점": "weaknesses", "기회": "opportunities", "위험": "threats"}


def read_swot(path: Path) -> tuple[dict[str, list[str]], list[str]]:
    """swot/{player_id}.md: headings `## 장점`, `## 단점`, `## 기회`, `## 위험`, then one point per line
    (a leading `- ` is optional). Sections may be left out. Problems name the line number only."""
    swot = {key: [] for key in SWOT_SECTIONS.values()}
    problems, section = [], None
    for n, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        text = line.strip()
        if not text:
            continue
        if text.startswith("#"):
            section = SWOT_SECTIONS.get(text.lstrip("#").strip())
            if section is None:
                problems.append(f"{n}: heading must be one of {', '.join(SWOT_SECTIONS)}")
        elif section is None:
            problems.append(f"{n}: text before the first heading")
        else:
            swot[section].append(text.removeprefix("- ").strip())
    return swot, problems


def name_index(players: list[dict], aliases: list[dict]) -> dict[str, str]:
    """Map every known VRChat name and alias to its player_id."""
    index = {p["vrchat_name"]: p["player_id"] for p in players}
    index.update({a["alias"]: a["player_id"] for a in aliases})
    return index


def display_name(player: dict) -> str:
    return player.get("display_name") or player["vrchat_name"]
