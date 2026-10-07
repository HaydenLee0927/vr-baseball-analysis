"""Hangul -> Latin (Revised Romanization, syllable by syllable) and URL slugs.

Sound-change rules between syllables are not applied; the result only needs
to be readable and stable for URLs and search, not linguistically exact.
"""

import hashlib
import re

_INITIALS = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"]
_MEDIALS = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"]
_FINALS = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"]


def romanize(text: str) -> str:
    out = []
    for ch in text:
        code = ord(ch) - 0xAC00
        if 0 <= code < 11172:
            out.append(_INITIALS[code // 588] + _MEDIALS[(code % 588) // 28] + _FINALS[code % 28])
        else:
            out.append(ch)
    return "".join(out)


def slugify(name: str) -> str:
    """ASCII slug, e.g. '__Daki__' -> 'daki', '망 야 _' -> 'mang-ya'. Falls back to a short hash."""
    slug = re.sub(r"[^a-z0-9]+", "-", romanize(name).lower()).strip("-")
    return slug or "p-" + hashlib.sha1(name.encode("utf-8")).hexdigest()[:6]
