import argparse
import json
from pathlib import Path
from xml.sax.saxutils import escape


def render_bar(title: str, items) -> str:
    width = 960
    height = 520
    chart_left = 90
    chart_bottom = 430
    chart_top = 110
    chart_width = 760
    max_value = max([float(item.get("value", 0)) for item in items] or [1.0])
    bar_width = max(36, chart_width // max(len(items), 1) - 24)
    bars = []
    labels = []
    for index, item in enumerate(items):
        value = float(item.get("value", 0))
        bar_height = 0 if max_value == 0 else (value / max_value) * (chart_bottom - chart_top)
        x = chart_left + index * (bar_width + 24)
        y = chart_bottom - bar_height
        bars.append(f'<rect x="{x}" y="{y}" width="{bar_width}" height="{bar_height}" rx="14" fill="#1d4ed8" />')
        labels.append(f'<text x="{x + bar_width / 2}" y="{chart_bottom + 28}" text-anchor="middle" font-size="14" fill="#334155">{escape(str(item.get("label", "")))}</text>')
        labels.append(f'<text x="{x + bar_width / 2}" y="{y - 10}" text-anchor="middle" font-size="13" fill="#0f172a">{escape(str(item.get("value", "")))}</text>')
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <text x="90" y="60" font-size="28" font-weight="700" fill="#0f172a">{escape(title)}</text>
  <line x1="{chart_left}" y1="{chart_bottom}" x2="{chart_left + chart_width}" y2="{chart_bottom}" stroke="#94a3b8" />
  <line x1="{chart_left}" y1="{chart_top}" x2="{chart_left}" y2="{chart_bottom}" stroke="#94a3b8" />
  {''.join(bars)}
  {''.join(labels)}
</svg>"""


def render_cards(title: str, items) -> str:
    width = 1080
    card_width = 300
    card_height = 150
    gap = 24
    cols = 3
    rows = (len(items) + cols - 1) // cols or 1
    height = 120 + rows * (card_height + gap) + 40
    cards = []
    for index, item in enumerate(items):
        row = index // cols
        col = index % cols
        x = 60 + col * (card_width + gap)
        y = 90 + row * (card_height + gap)
        title_text = escape(str(item.get("title", item.get("label", ""))))
        body_text = escape(str(item.get("text", item.get("value", ""))))
        cards.append(f"""
        <g>
          <rect x="{x}" y="{y}" width="{card_width}" height="{card_height}" rx="22" fill="#ffffff" stroke="#cbd5e1"/>
          <text x="{x + 20}" y="{y + 34}" font-size="20" font-weight="700" fill="#0f172a">{title_text}</text>
          <text x="{x + 20}" y="{y + 72}" font-size="15" fill="#334155">{body_text}</text>
        </g>""")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <text x="60" y="52" font-size="28" font-weight="700" fill="#0f172a">{escape(title)}</text>
  {''.join(cards)}
</svg>"""


def render_timeline(title: str, items) -> str:
    width = 1000
    height = max(260, 140 + len(items) * 96)
    nodes = []
    for index, item in enumerate(items):
        y = 110 + index * 96
        label = escape(str(item.get("label", f"步骤 {index + 1}")))
        text = escape(str(item.get("text", item.get("value", ""))))
        nodes.append(f"""
        <circle cx="120" cy="{y}" r="20" fill="#2563eb"/>
        <text x="120" y="{y + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="#ffffff">{index + 1}</text>
        <text x="170" y="{y - 8}" font-size="19" font-weight="700" fill="#0f172a">{label}</text>
        <text x="170" y="{y + 22}" font-size="15" fill="#334155">{text}</text>""")
    lines = "".join(
        f'<line x1="120" y1="{110 + index * 96 + 20}" x2="120" y2="{110 + (index + 1) * 96 - 20}" stroke="#93c5fd" stroke-width="4" />'
        for index in range(max(0, len(items) - 1))
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <text x="70" y="55" font-size="28" font-weight="700" fill="#0f172a">{escape(title)}</text>
  {lines}
  {''.join(nodes)}
</svg>"""


def render_table(title: str, items) -> str:
    headers = []
    for item in items:
        for key in item.keys():
            if key not in headers:
                headers.append(key)
    if not headers:
        headers = ["value"]
        items = [{"value": ""}]
    col_width = 220
    row_height = 42
    width = 80 + len(headers) * col_width
    height = 120 + (len(items) + 1) * row_height + 30
    cells = []
    for col_index, header in enumerate(headers):
      x = 40 + col_index * col_width
      cells.append(f'<rect x="{x}" y="70" width="{col_width}" height="{row_height}" fill="#dbeafe" stroke="#93c5fd"/>')
      cells.append(f'<text x="{x + 12}" y="97" font-size="14" font-weight="700" fill="#1e3a8a">{escape(str(header))}</text>')
    for row_index, row in enumerate(items, start=1):
      y = 70 + row_index * row_height
      for col_index, header in enumerate(headers):
        x = 40 + col_index * col_width
        value = escape(str(row.get(header, "")))
        cells.append(f'<rect x="{x}" y="{y}" width="{col_width}" height="{row_height}" fill="#ffffff" stroke="#cbd5e1"/>')
        cells.append(f'<text x="{x + 12}" y="{y + 27}" font-size="13" fill="#334155">{value}</text>')
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <text x="40" y="44" font-size="28" font-weight="700" fill="#0f172a">{escape(title)}</text>
  {''.join(cells)}
</svg>"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--title", default="Lmentor Diagram")
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    kind = str(payload.get("kind", "bar")).strip().lower()
    items = payload.get("items", [])

    if kind == "bar":
        svg = render_bar(args.title, items)
    elif kind == "cards":
        svg = render_cards(args.title, items)
    elif kind == "timeline":
        svg = render_timeline(args.title, items)
    elif kind == "table":
        svg = render_table(args.title, items)
    else:
        raise ValueError(f"不支持的 kind：{kind}")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(svg, encoding="utf-8")
    print(str(output.resolve()))


if __name__ == "__main__":
    main()

