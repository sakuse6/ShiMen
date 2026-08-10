"""Install one validated Python dependency into the Lmentor runtime only."""

from __future__ import annotations

import argparse
import importlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


PACKAGE_SPECIFIER_RE = re.compile(
    r"^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\[[A-Za-z0-9_,.-]+\])?"
    r"(?:(?:==|!=|>=|<=|~=|>|<)[A-Za-z0-9*_.+-]+(?:,[A-Za-z0-9*_.+-]+)*)?$"
)
IMPORT_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]*$")
IMPORT_ALIASES = {
    "bio": ("biopython", "Bio"),
    "bs4": ("beautifulsoup4", "bs4"),
    "cv2": ("opencv-python", "cv2"),
    "docx": ("python-docx", "docx"),
    "fitz": ("PyMuPDF", "fitz"),
    "pil": ("Pillow", "PIL"),
    "pptx": ("python-pptx", "pptx"),
    "sklearn": ("scikit-learn", "sklearn"),
    "yaml": ("PyYAML", "yaml"),
}
PYPI_MIRRORS = (
    "https://mirrors.aliyun.com/pypi/simple/",
    "https://pypi.tuna.tsinghua.edu.cn/simple",
    "https://mirrors.ustc.edu.cn/pypi/simple",
)


def app_root() -> Path:
    configured = os.environ.get("LMENTOR_APP_ROOT", "").strip()
    return Path(configured).resolve() if configured else Path(__file__).resolve().parents[1]


def validate_package_specifier(value: str) -> str:
    specifier = str(value or "").strip()
    if not PACKAGE_SPECIFIER_RE.fullmatch(specifier):
        raise ValueError("包名只能包含 PyPI 包名、可选 extras 和版本约束。")
    return specifier


def validate_import_name(value: str) -> str:
    import_name = str(value or "").strip()
    if not IMPORT_NAME_RE.fullmatch(import_name):
        raise ValueError("导入名只能由字母、数字、下划线和点组成。")
    return import_name


def package_base_name(specifier: str) -> str:
    return re.split(r"[<>=!~\[]", specifier, maxsplit=1)[0].replace("_", "-").lower()


def resolve_package_and_import(package: str, import_name: str | None) -> tuple[str, str]:
    specifier = validate_package_specifier(package)
    raw_base_name = re.split(r"[<>=!~\[]", specifier, maxsplit=1)[0]
    alias = IMPORT_ALIASES.get(package_base_name(specifier))
    if alias:
        specifier = f"{alias[0]}{specifier[len(raw_base_name):]}"
        default_import = alias[1]
    else:
        default_import = package_base_name(specifier).replace("-", "_")
    return specifier, validate_import_name(import_name or default_import)


def using_project_venv(root: Path) -> bool:
    expected = root / ".venv"
    try:
        return Path(sys.prefix).resolve() == expected.resolve()
    except OSError:
        return False


def module_available(import_name: str, target: Path | None) -> bool:
    if target and target.exists():
        target_text = str(target)
        if target_text not in sys.path:
            sys.path.insert(0, target_text)
    try:
        importlib.import_module(import_name)
        return True
    except (ImportError, ModuleNotFoundError):
        return False


def run_checked(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, encoding="utf-8", errors="replace", capture_output=True, check=False)


def ensure_pip() -> None:
    probe = run_checked([sys.executable, "-m", "pip", "--version"])
    if probe.returncode == 0:
        return
    bootstrap = run_checked([sys.executable, "-m", "ensurepip", "--upgrade"])
    if bootstrap.returncode != 0:
        details = (bootstrap.stderr or bootstrap.stdout or "无法初始化 pip").strip()
        raise RuntimeError(details)


def main() -> int:
    parser = argparse.ArgumentParser(description="Install a Python package into the Lmentor runtime.")
    parser.add_argument("--package", required=True, help="Validated PyPI package specifier.")
    parser.add_argument("--import-name", help="Module name used to verify the installation.")
    args = parser.parse_args()

    package, import_name = resolve_package_and_import(args.package, args.import_name)
    root = app_root()
    target = None if using_project_venv(root) else root / ".lmentor" / "python-packages"

    if module_available(import_name, target):
        print(json.dumps({
            "package": package,
            "import_name": import_name,
            "installed": False,
            "available": True,
            "install_target": str(target) if target else str(root / ".venv"),
        }, ensure_ascii=False))
        return 0

    ensure_pip()
    base_command = [sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "--no-input"]
    if target:
        target.mkdir(parents=True, exist_ok=True)
        base_command.extend(["--target", str(target)])
    base_command.append(package)

    result = None
    selected_mirror = None
    failures: list[str] = []
    for mirror in PYPI_MIRRORS:
        result = run_checked([*base_command, "--index-url", mirror])
        if result.returncode == 0:
            selected_mirror = mirror
            break
        details = (result.stderr or result.stdout or "pip 安装失败").strip()
        failures.append(f"{mirror}: {details[-600:]}")
    if result is None or result.returncode != 0:
        raise RuntimeError("三个受控 PyPI 镜像均无法完成安装：\n" + "\n".join(failures))
    if not module_available(import_name, target):
        raise RuntimeError(f"安装完成后仍无法导入模块：{import_name}")

    print(json.dumps({
        "package": package,
        "import_name": import_name,
        "installed": True,
        "available": True,
        "install_target": str(target) if target else str(root / ".venv"),
        "index_url": selected_mirror,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
