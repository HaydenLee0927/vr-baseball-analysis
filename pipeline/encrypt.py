"""Encrypt every JSON data file for the password-gated site.

Key: PBKDF2-SHA256 over SITE_PASSWORD with one random salt per build.
Each file: AES-256-GCM, written as `<name>.json.enc` = 12-byte IV || ciphertext+tag.
The plaintext JSON is deleted. `crypto.json` (salt, iterations) stays public;
it holds nothing secret and the site needs it to derive the key.
"""

import argparse
import base64
import hashlib
import json
import os
import sys
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DIR = ROOT / "site" / "public" / "data"
ITERATIONS = 600_000
PARAMS_FILE = "crypto.json"


def derive_key(password: str, salt: bytes, iterations: int = ITERATIONS) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, dklen=32)


def encrypt_bytes(key: bytes, plaintext: bytes) -> bytes:
    iv = os.urandom(12)
    return iv + AESGCM(key).encrypt(iv, plaintext, None)


def decrypt_bytes(key: bytes, blob: bytes) -> bytes:
    return AESGCM(key).decrypt(blob[:12], blob[12:], None)


def encrypt_dir(data_dir: Path, password: str) -> int:
    salt = os.urandom(16)
    key = derive_key(password, salt)
    files = sorted(p for p in data_dir.rglob("*.json") if p.name != PARAMS_FILE)
    if not any(p.name == "meta.json" for p in files):
        raise SystemExit(f"meta.json not found in {data_dir}; run export_json.py first")
    for path in files:
        path.with_name(path.name + ".enc").write_bytes(encrypt_bytes(key, path.read_bytes()))
        path.unlink()
    params = {"salt": base64.b64encode(salt).decode("ascii"), "iterations": ITERATIONS}
    (data_dir / PARAMS_FILE).write_text(json.dumps(params), encoding="utf-8")
    return len(files)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    args = parser.parse_args()
    password = os.environ.get("SITE_PASSWORD", "")
    if not password:
        sys.exit("SITE_PASSWORD is not set; refusing to deploy unencrypted data")
    count = encrypt_dir(args.dir, password)
    print(f"encrypted {count} files in {args.dir}")


if __name__ == "__main__":
    main()
