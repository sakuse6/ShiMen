#!/usr/bin/env python3
"""Validate Ophanim JSON output before rendering Markdown.

This script enforces a strict node contract:
- top-level JSON must be an object with `meta` and `nodes`
- every node must include `codex.role`, `codex.structure`, `codex.relation`,
  and `codex.fingerprint`
- `nodes` must preserve ordering and use deterministic, explicit structure
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


REQUIRED_CODEX_KEYS = ("role", "structure", "relation", "fingerprint")
ALLOWED_META_KEYS = {
    "source",
    "boundary",
    "generated_at",
    "snapshot_marker",
    "segment_fingerprint",
}


def _read_json(path: str | None) -> Any:
    if path:
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))
    return json.load(sys.stdin)


def _fail(message: str) -> int:
    print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
    return 1


def _is_nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and value.strip() != ""


def _validate_node(node: Any, index: int) -> str | None:
    if not isinstance(node, dict):
        return f"nodes[{index}] must be an object"
    for key in ("id", "text", "codex"):
        if key not in node:
            return f"nodes[{index}] missing required key: {key}"
    if not _is_nonempty_string(node["id"]):
        return f"nodes[{index}].id must be a non-empty string"
    if not _is_nonempty_string(node["text"]):
        return f"nodes[{index}].text must be a non-empty string"
    codex = node["codex"]
    if not isinstance(codex, dict):
        return f"nodes[{index}].codex must be an object"
    for key in REQUIRED_CODEX_KEYS:
        if key not in codex:
            return f"nodes[{index}].codex missing required key: {key}"
        if not _is_nonempty_string(codex[key]):
            return f"nodes[{index}].codex.{key} must be a non-empty string"
    if "children" in node and not isinstance(node["children"], list):
        return f"nodes[{index}].children must be an array when present"
    return None


def validate(payload: Any) -> tuple[bool, str]:
    if not isinstance(payload, dict):
        return False, "top-level JSON must be an object"
    for key in ("meta", "nodes"):
        if key not in payload:
            return False, f"top-level JSON missing required key: {key}"
    if not isinstance(payload["meta"], dict):
        return False, "meta must be an object"
    if not isinstance(payload["nodes"], list):
        return False, "nodes must be an array"

    extra_meta = set(payload["meta"].keys()) - ALLOWED_META_KEYS
    if extra_meta:
        return False, f"meta contains unsupported keys: {sorted(extra_meta)}"

    for index, node in enumerate(payload["nodes"]):
        error = _validate_node(node, index)
        if error:
            return False, error

    return True, "ok"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", help="Path to a JSON file to validate.")
    args = parser.parse_args()

    payload = _read_json(args.input)
    ok, message = validate(payload)
    if not ok:
        return _fail(message)
    print(json.dumps({"ok": True, "message": message}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
