import argparse
import csv
import json
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile


def load_rows_from_csv(csv_path: str):
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader)


def load_rows_from_json(json_path: str):
    data = json.loads(Path(json_path).read_text(encoding="utf-8"))
    if isinstance(data, list):
        return data
    raise ValueError("JSON 输入必须是对象数组。")


def xml_cell_ref(col_index: int, row_index: int) -> str:
    col = ""
    value = col_index
    while value >= 0:
        col = chr((value % 26) + 65) + col
        value = value // 26 - 1
    return f"{col}{row_index}"


def build_shared_strings(strings):
    items = "".join(f"<si><t>{escape(text)}</t></si>" for text in strings)
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(strings)}" uniqueCount="{len(strings)}">{items}</sst>
"""


def build_sheet_xml(rows, headers, shared_index):
    lines = []
    all_rows = [headers] + [[str(row.get(header, "")) for header in headers] for row in rows]
    for row_number, values in enumerate(all_rows, start=1):
        cells = []
        for col_index, value in enumerate(values):
            idx = shared_index.setdefault(value, len(shared_index))
            cell_ref = xml_cell_ref(col_index, row_number)
            cells.append(f'<c r="{cell_ref}" t="s"><v>{idx}</v></c>')
        lines.append(f"<row r=\"{row_number}\">{''.join(cells)}</row>")
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    {''.join(lines)}
  </sheetData>
</worksheet>
"""


def build_workbook_xml(sheet_name: str):
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="{escape(sheet_name)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", default="")
    parser.add_argument("--csv", default="")
    parser.add_argument("--output", required=True)
    parser.add_argument("--sheet", default="Sheet1")
    args = parser.parse_args()

    if args.json:
        rows = load_rows_from_json(args.json)
    elif args.csv:
        rows = load_rows_from_csv(args.csv)
    else:
        raise ValueError("必须提供 --json 或 --csv。")

    headers = []
    for row in rows:
        if isinstance(row, dict):
            for key in row.keys():
                if key not in headers:
                    headers.append(str(key))
    if not headers:
        headers = ["value"]
        rows = [{"value": str(item)} for item in rows]

    shared_index = {}
    sheet_xml = build_sheet_xml(rows, headers, shared_index)
    shared_strings = [None] * len(shared_index)
    for key, idx in shared_index.items():
        shared_strings[idx] = key

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>""")
        archive.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""")
        archive.writestr("xl/workbook.xml", build_workbook_xml(args.sheet))
        archive.writestr("xl/_rels/workbook.xml.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>""")
        archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)
        archive.writestr("xl/sharedStrings.xml", build_shared_strings(shared_strings))

    print(str(output.resolve()))


if __name__ == "__main__":
    main()

