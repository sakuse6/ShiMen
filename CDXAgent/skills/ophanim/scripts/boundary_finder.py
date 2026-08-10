#!/usr/bin/env python3
"""Find the bounded transcript slice for Ophanim snapshots.

Input:
- A JSON array of messages, or an object containing a `messages` list.
- Messages may store text in `content`, `text`, `message`, or a list of
  content parts with nested text fields.

Output:
- JSON with the previous snapshot marker position and slice boundaries.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Iterable


DEFAULT_MARKER = "### OPHANIM SNAPSHOT"
MARKER_ALIASES = (
    DEFAULT_MARKER,
    "### OPHANIM Snapshot",
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def _read_input(path: str | None) -> Any:
    if path:
        with open(path, "r", encoding="utf-8-sig") as fh:
            return json.load(fh)
    return json.load(sys.stdin)


def _extract_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            text = _extract_text(item)
            if text:
                parts.append(text)
        return "\n".join(parts)
    if isinstance(value, dict):
        for key in ("content", "text", "message", "value"):
            if key in value:
                text = _extract_text(value[key])
                if text:
                    return text
        parts: list[str] = []
        for nested in value.values():
            text = _extract_text(nested)
            if text:
                parts.append(text)
        return "\n".join(parts)
    return str(value)


def _normalize_messages(payload: Any) -> list[Any]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("messages", "conversation", "chat", "items"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    raise ValueError("Expected a JSON array or an object with a messages list.")


def _iter_message_text(messages: Iterable[Any]) -> list[str]:
    return [_extract_text(message) for message in messages]


def find_boundary(messages: list[Any], marker: str = DEFAULT_MARKER) -> dict[str, Any]:
    texts = _iter_message_text(messages)
    marker_index = -1
    matched_marker = None
    candidates = (marker,) if marker not in MARKER_ALIASES else MARKER_ALIASES
    for idx in range(len(texts) - 1, -1, -1):
        for candidate in candidates:
            if candidate in texts[idx]:
                marker_index = idx
                matched_marker = candidate
                break
        if marker_index >= 0:
            break

    start_index = marker_index + 1 if marker_index >= 0 else 0
    end_index = len(messages) - 1 if messages else -1

    return {
        "found_marker": marker_index >= 0,
        "marker": marker,
        "matched_marker": matched_marker,
        "marker_index": marker_index,
        "start_index": start_index,
        "end_index": end_index,
        "message_count": len(messages),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", help="Path to a JSON transcript export.")
    parser.add_argument(
        "--marker",
        default=DEFAULT_MARKER,
        help="Snapshot marker to search for.",
    )
    args = parser.parse_args()

    payload = _read_input(args.input)
    messages = _normalize_messages(payload)
    result = find_boundary(messages, marker=args.marker)
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
