#!/usr/bin/env python3
"""Generate a short fingerprint from the head and tail of a text block."""

from __future__ import annotations

import argparse
import json
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def _read_text(path: str | None, value: str | None) -> str:
    if value is not None:
        return value
    if path:
        with open(path, "r", encoding="utf-8-sig") as fh:
            return fh.read()
    return sys.stdin.read()


def build_fingerprint(text: str) -> dict[str, str | int]:
    normalized = text.rstrip("\n")
    length = len(normalized)
    if length <= 5:
        return {
            "text_length": length,
            "mode": "short",
            "fingerprint": "[short-text:full]",
            "text": normalized,
        }

    head = normalized[:5]
    tail = normalized[-5:]
    return {
        "text_length": length,
        "mode": "head-tail",
        "head": head,
        "tail": tail,
        "fingerprint": f"{head}...{tail}",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", help="Path to a UTF-8 text file.")
    parser.add_argument("--text", help="Text to fingerprint.")
    args = parser.parse_args()

    text = _read_text(args.input, args.text)
    result = build_fingerprint(text)
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
