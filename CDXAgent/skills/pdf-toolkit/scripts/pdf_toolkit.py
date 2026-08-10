import argparse
from pathlib import Path
from pypdf import PdfReader, PdfWriter


def extract_text(input_path: str, output_path: str) -> str:
    reader = PdfReader(input_path)
    chunks = []
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        chunks.append(f"## Page {index}\n\n{text.strip()}\n")
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(chunks), encoding="utf-8")
    return str(output.resolve())


def merge_pdfs(inputs, output_path: str) -> str:
    writer = PdfWriter()
    for item in inputs:
        reader = PdfReader(item)
        for page in reader.pages:
            writer.add_page(page)
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("wb") as handle:
        writer.write(handle)
    return str(output.resolve())


def split_pdf(input_path: str, output_dir: str) -> str:
    reader = PdfReader(input_path)
    target = Path(output_dir)
    target.mkdir(parents=True, exist_ok=True)
    for index, page in enumerate(reader.pages, start=1):
        writer = PdfWriter()
        writer.add_page(page)
        part_path = target / f"page-{index:03d}.pdf"
        with part_path.open("wb") as handle:
            writer.write(handle)
    return str(target.resolve())


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    extract = sub.add_parser("extract")
    extract.add_argument("--input", required=True)
    extract.add_argument("--output", required=True)

    merge = sub.add_parser("merge")
    merge.add_argument("--inputs", nargs="+", required=True)
    merge.add_argument("--output", required=True)

    split = sub.add_parser("split")
    split.add_argument("--input", required=True)
    split.add_argument("--output-dir", required=True)

    args = parser.parse_args()

    if args.command == "extract":
        print(extract_text(args.input, args.output))
    elif args.command == "merge":
        print(merge_pdfs(args.inputs, args.output))
    elif args.command == "split":
        print(split_pdf(args.input, args.output_dir))


if __name__ == "__main__":
    main()

