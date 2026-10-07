import json
import sys
import tempfile
import unittest
from base64 import b64decode
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import encrypt  # noqa: E402
from export_json import write_json  # noqa: E402


def fixture_files():
    return {"meta.json": {"built_at": "2026-01-01T00:00:00+00:00"}, "player/a.json": {"name": "담비"}}


class EncryptDirTest(unittest.TestCase):
    def test_round_trip_and_no_plaintext_left(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_json(out, fixture_files())
            original = (out / "meta.json").read_bytes()

            encrypt.encrypt_dir(out, "correct horse battery staple")

            self.assertEqual(list(out.rglob("*.json")), [out / "crypto.json"])
            params = json.loads((out / "crypto.json").read_text())
            key = encrypt.derive_key("correct horse battery staple", b64decode(params["salt"]), params["iterations"])
            blob = (out / "meta.json.enc").read_bytes()
            self.assertEqual(encrypt.decrypt_bytes(key, blob), original)

    def test_wrong_password_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            write_json(out, fixture_files())
            encrypt.encrypt_dir(out, "right")
            params = json.loads((out / "crypto.json").read_text())
            key = encrypt.derive_key("wrong", b64decode(params["salt"]), params["iterations"])
            with self.assertRaises(Exception):
                encrypt.decrypt_bytes(key, (out / "meta.json.enc").read_bytes())


if __name__ == "__main__":
    unittest.main()
