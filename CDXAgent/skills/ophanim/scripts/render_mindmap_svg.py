#!/usr/bin/env python3
"""Render validated Ophanim JSON as a standalone SVG mind-map image."""

from __future__ import annotations

import argparse
import html
import json
import sys
from pathlib import Path


PALETTE = {
    "decision": ("#f59e0b", "#fff7df"),
    "branch": ("#8b5cf6", "#f4efff"),
    "loop": ("#ef4444", "#fff0f1"),
    "constraint": ("#0284c7", "#eff9ff"),
    "question": ("#0f766e", "#ecfdf5"),
    "reaction": ("#db2777", "#fff1f8"),
    "process": ("#2563eb", "#eff6ff"),
}


def wrap_text(value: str, width: int = 25) -> list[str]:
    text = " ".join(str(value or "").split())
    if not text:
        return ["Unknown node"]
    if len(text) > width * 3:
        text = text[: width * 3 - 1] + "..."
    return [text[index : index + width] for index in range(0, len(text), width)]


def node_color(structure: str) -> tuple[str, str]:
    return PALETTE.get(structure, ("#475569", "#f8fafc"))


def layout_branch(nodes: list[dict], side: str, height: int, width: int) -> list[dict]:
    card_width = 520
    gap = 30
    planned = []
    for node in nodes:
        lines = wrap_text(node.get("text", ""))
        planned.append({**node, "lines": lines, "height": max(96, 48 + len(lines) * 23)})
    total = sum(node["height"] for node in planned) + max(0, len(planned) - 1) * gap
    cursor = max(72, (height - total) / 2)
    for node in planned:
        node["x"] = 110 if side == "left" else width - 110 - card_width
        node["y"] = cursor
        node["width"] = card_width
        node["side"] = side
        cursor += node["height"] + gap
    return planned


def render(payload: dict) -> str:
    nodes = list(payload.get("nodes") or [])
    width = 1920
    root_width, root_height = 310, 116
    left = [node for index, node in enumerate(nodes) if index % 2 == 0]
    right = [node for index, node in enumerate(nodes) if index % 2 == 1]
    height = max(760, 190 + max(len(left), len(right), 1) * 145)
    root_x = (width - root_width) / 2
    root_y = (height - root_height) / 2
    positioned = layout_branch(left, "left", height, width) + layout_branch(right, "right", height, width)

    edges = []
    cards = []
    for node in positioned:
        accent, fill = node_color(str(node.get("codex", {}).get("structure", "process")))
        start_x = node["x"] + node["width"] if node["side"] == "left" else node["x"]
        start_y = node["y"] + node["height"] / 2
        end_x = root_x if node["side"] == "left" else root_x + root_width
        end_y = root_y + root_height / 2
        bend = 130 if node["side"] == "left" else -130
        edges.append(
            f'<path d="M {start_x} {start_y} C {start_x + bend} {start_y}, {end_x - bend} {end_y}, {end_x} {end_y}" '
            f'fill="none" stroke="{accent}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>'
        )
        structure = str(node.get("codex", {}).get("structure", "process")).replace("_", " ")
        tspans = "".join(
            f'<tspan x="{node["x"] + 34}" dy="{0 if index == 0 else 23}">{html.escape(line)}</tspan>'
            for index, line in enumerate(node["lines"])
        )
        cards.append(
            f'<g><rect x="{node["x"]}" y="{node["y"]}" width="{node["width"]}" height="{node["height"]}" '
            f'rx="18" fill="{fill}" stroke="{accent}" stroke-width="2"/>'
            f'<rect x="{node["x"] + 20}" y="{node["y"] + 18}" width="76" height="25" rx="12.5" fill="{accent}"/>'
            f'<text x="{node["x"] + 58}" y="{node["y"] + 35}" fill="#ffffff" font-size="13" font-weight="800" text-anchor="middle">{html.escape(str(node.get("id", "node")))}</text>'
            f'<text x="{node["x"] + 114}" y="{node["y"] + 36}" fill="{accent}" font-size="13" font-weight="700">{html.escape(structure)}</text>'
            f'<text x="{node["x"] + 34}" y="{node["y"] + 69}" fill="#172033" font-size="17" font-weight="600">{tspans}</text></g>'
        )

    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="100%" height="100%" fill="#f7fafc"/>
  <rect x="34" y="30" width="{width - 68}" height="{height - 60}" rx="28" fill="#f8fffc" stroke="#d6e5e1"/>
  <text x="72" y="82" fill="#10201d" font-size="30" font-weight="800">OPHANIM Mind Map</text>
  <text x="72" y="110" fill="#64748b" font-size="15">Validated conversation structure rendered as a visual mind map</text>
  {''.join(edges)}
  <g><rect x="{root_x}" y="{root_y}" width="{root_width}" height="{root_height}" rx="28" fill="#10201d" stroke="#0f766e" stroke-width="3"/>
  <text x="{root_x + root_width / 2}" y="{root_y + 50}" fill="#ffffff" font-size="24" font-weight="800" text-anchor="middle">\u5bf9\u8bdd\u601d\u7ef4\u5bfc\u56fe</text>
  <text x="{root_x + root_width / 2}" y="{root_y + 80}" fill="#b7d9d2" font-size="15" font-weight="600" text-anchor="middle">{len(nodes)} validated nodes</text></g>
  {''.join(cards)}
</svg>'''


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="Validated Ophanim JSON path, or - for stdin.")
    parser.add_argument("--output", required=True, help="Output SVG path, or - for stdout.")
    args = parser.parse_args()
    payload = json.load(sys.stdin) if args.input == "-" else json.loads(Path(args.input).read_text(encoding="utf-8-sig"))
    svg = render(payload)
    if args.output == "-":
        print(svg)
        return 0
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(svg, encoding="utf-8")
    print(output.resolve().as_posix())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
