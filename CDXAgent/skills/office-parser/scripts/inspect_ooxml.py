import argparse
import json
from pathlib import Path
import re
import zipfile
from xml.etree import ElementTree as ET


WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
XL_NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
A_NS = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}


def extract_docx_text(archive: zipfile.ZipFile) -> str:
    xml_data = archive.read("word/document.xml")
    root = ET.fromstring(xml_data)
    paragraphs = []
    for para in root.findall(".//w:p", WORD_NS):
        text = "".join(node.text or "" for node in para.findall(".//w:t", WORD_NS)).strip()
        if text:
            paragraphs.append(text)
    return "\n\n".join(paragraphs)


def extract_xlsx_text(archive: zipfile.ZipFile) -> str:
    shared = []
    if "xl/sharedStrings.xml" in archive.namelist():
        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = ["".join(node.itertext()) for node in shared_root.findall(".//x:si", XL_NS)]

    sheet_names = [name for name in archive.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml", name)]
    lines = []
    for sheet_name in sorted(sheet_names):
        lines.append(f"[{sheet_name}]")
        sheet_root = ET.fromstring(archive.read(sheet_name))
        for row in sheet_root.findall(".//x:row", XL_NS):
            values = []
            for cell in row.findall("x:c", XL_NS):
                cell_type = cell.attrib.get("t")
                value_node = cell.find("x:v", XL_NS)
                value = value_node.text if value_node is not None and value_node.text is not None else ""
                if cell_type == "s" and value.isdigit():
                    idx = int(value)
                    value = shared[idx] if idx < len(shared) else value
                values.append(value)
            if values:
                lines.append("\t".join(values))
        lines.append("")
    return "\n".join(lines).strip()


def extract_pptx_text(archive: zipfile.ZipFile) -> str:
    slide_names = [name for name in archive.namelist() if re.match(r"ppt/slides/slide\d+\.xml", name)]
    lines = []
    for slide_name in sorted(slide_names):
        lines.append(f"[{slide_name}]")
        slide_root = ET.fromstring(archive.read(slide_name))
        texts = [node.text or "" for node in slide_root.findall(".//a:t", A_NS)]
        if texts:
            lines.append("\n".join(texts))
        lines.append("")
    return "\n".join(lines).strip()


def copy_media(archive: zipfile.ZipFile, output_dir: Path) -> int:
    media_dir = output_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for member in archive.namelist():
        if "/media/" not in member:
            continue
        target = media_dir / Path(member).name
        target.write_bytes(archive.read(member))
        count += 1
    return count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(input_path, "r") as archive:
        suffix = input_path.suffix.lower()
        if suffix == ".docx":
            text = extract_docx_text(archive)
        elif suffix == ".xlsx":
            text = extract_xlsx_text(archive)
        elif suffix == ".pptx":
            text = extract_pptx_text(archive)
        else:
            raise ValueError(f"不支持的文件类型：{suffix}")

        media_count = copy_media(archive, output_dir)

    (output_dir / "text.txt").write_text(text, encoding="utf-8")
    summary = {
        "input": str(input_path.resolve()),
        "type": input_path.suffix.lower(),
        "media_count": media_count,
        "text_path": str((output_dir / "text.txt").resolve()),
        "media_dir": str((output_dir / "media").resolve()),
    }
    (output_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(str(output_dir.resolve()))


if __name__ == "__main__":
    main()

