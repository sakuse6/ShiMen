from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import platform
import signal
import socket
import subprocess
import shutil
import sys
import tarfile
import threading
import time
import traceback
import webbrowser
import zipfile
from dataclasses import dataclass
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen


def configure_console_streams() -> None:
    for stream in (sys.stdout, sys.stderr):
        if stream is None or not hasattr(stream, "reconfigure"):
            continue
        try:
            stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True, write_through=True)
        except (OSError, ValueError):
            pass


configure_console_streams()

COMPILED_INFO = globals().get("__compiled__", None)
IS_FROZEN = bool(getattr(sys, "frozen", False) or COMPILED_INFO is not None)
RESOURCE_ROOT = Path(__file__).resolve().parent
ORIGINAL_ARGV0 = getattr(COMPILED_INFO, "original_argv0", None)
COMPILED_CONTAINING_DIR = Path(getattr(COMPILED_INFO, "containing_dir", RESOURCE_ROOT)).resolve()
LAUNCHER_ENTRY_PATH = Path(ORIGINAL_ARGV0).resolve() if IS_FROZEN and ORIGINAL_ARGV0 else (Path(sys.argv[0]).resolve() if IS_FROZEN else Path(sys.executable).resolve())
INSTALL_ROOT_OVERRIDE = os.environ.get("LMENTOR_INSTALL_ROOT", "").strip()
ROOT_DIR = Path(INSTALL_ROOT_OVERRIDE).resolve() if INSTALL_ROOT_OVERRIDE else (LAUNCHER_ENTRY_PATH.parent if IS_FROZEN else RESOURCE_ROOT)
FRONTEND_DIR = RESOURCE_ROOT / "frontend-shell"
FRONTEND_DIST_DIR = FRONTEND_DIR / "dist"
DEFAULT_FRONTEND_HOST = "127.0.0.1"
DEFAULT_FRONTEND_PORT = 1420
DEFAULT_BRIDGE_HOST = "127.0.0.1"
DEFAULT_BRIDGE_PORT = 4318
BRIDGE_HEALTH_PATH = "/api/health"
BRIDGE_INVOKE_PATH = "/api/invoke"
STARTUP_TIMEOUT_SECONDS = 90.0
HEALTH_POLL_INTERVAL_SECONDS = 0.5
MONITOR_INTERVAL_SECONDS = 2.0
BROWSER_OPEN_DELAY_SECONDS = 0.5
MAX_RESTARTS = 2
NODE_COMMAND = "node.exe"
VITE_CLI_RELATIVE = Path("node_modules") / "vite" / "bin" / "vite.js"
BRIDGE_SCRIPT_RELATIVE = Path("scripts") / "lmentor-codex-bridge.mjs"
RUNTIME_CONFIG_SCRIPT_PATH = "/lmentor-runtime-config.js"
CODEX_RUNTIME_VERSION = "0.142.5"
CODEX_RUNTIME_PLATFORM = "win32-x64"
CODEX_RUNTIME_PROJECT_DIR = "CDXAgent"
CODEX_RUNTIME_ARCHIVE = "codex-package-x86_64-pc-windows-msvc.tar.gz"
MAIN_LOG_DIR = ROOT_DIR / "logs"
MAIN_LOG_FILE = MAIN_LOG_DIR / "main.log"
CODEX_RUNTIME_REQUIRED_FILES = [
    Path("bin") / "codex.exe",
    Path("codex-path") / "rg.exe",
    Path("codex-resources") / "codex-command-runner.exe",
    Path("codex-resources") / "codex-windows-sandbox-setup.exe",
    Path("codex-package.json"),
]
STARTUP_SPLASH_IMAGE_NAME = "1554.png"
STARTUP_SPLASH_DURATION_MS = 4000
ENVIRONMENT_ARCHIVE_NAME = "Lmentor-Environment.zip"
UPDATE_STATUS_FILE_NAME = ".lmentor-update-last.json"


def log_event(scope: str, message: str, level: str = "INFO") -> None:
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] [{level}] [{scope}] {message}"
    print(line)
    try:
        MAIN_LOG_DIR.mkdir(parents=True, exist_ok=True)
        with MAIN_LOG_FILE.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except OSError:
        pass


def show_pending_update_notice() -> None:
    """Display release notes exactly once after a successful in-place update."""
    status_path = ROOT_DIR / UPDATE_STATUS_FILE_NAME
    if not status_path.exists():
        return

    try:
        payload = json.loads(status_path.read_text(encoding="utf-8-sig"))
        if not isinstance(payload, dict) or not payload.get("firstLaunchNoticePending"):
            return

        version = str(payload.get("version") or "").strip() or "最新版本"
        notes = payload.get("releaseNotes")
        if not isinstance(notes, list):
            notes = []
        lines = [f"- {str(note).strip()}" for note in notes if str(note).strip()]
        if not lines:
            lines = ["- 已完成程序文件更新与完整性校验。"]

        payload["firstLaunchNoticePending"] = False
        payload["firstLaunchNoticeShownAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        temporary_path = status_path.with_suffix(status_path.suffix + ".tmp")
        temporary_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary_path.replace(status_path)

        import ctypes

        message = (
            f"师门已更新至 {version}。\n\n"
            "本次更新内容：\n"
            + "\n".join(lines)
            + "\n\n数据保护：\n"
            "- 不会修改 API 配置、聊天记录、项目、已安装 Skill、Python/R 环境或日志。\n"
            "- 若更新中断，可使用安装目录的 .lmentor-update-backups 备份进行恢复。\n\n"
            "使用提示：\n"
            "- 小导会先从已激活 Skill 中检索候选，再读取选中的规范执行任务。\n"
            "- Python 或 R 第三方依赖缺失时，会在隔离环境中自动安装、验证并重试。"
        )
        ctypes.windll.user32.MessageBoxW(0, message, "师门更新说明", 0x40)
        log_event("update", f"Displayed first-launch release notes for {version}.")
    except (OSError, ValueError, TypeError) as error:
        log_event("update", f"Unable to display release notes: {error}", level="WARNING")


def ensure_packaged_environment() -> None:
    archive_path = ROOT_DIR / ENVIRONMENT_ARCHIVE_NAME
    required_paths = (
        ROOT_DIR / ".venv" / "Scripts" / "python.exe",
        ROOT_DIR / ".Rlib",
        ROOT_DIR / "runtime" / "R-4.5.3" / "bin" / "Rscript.exe",
    )
    if not archive_path.exists():
        missing = ", ".join(str(path) for path in required_paths if not path.exists())
        if missing:
            log_event("environment", f"Optional isolated environment is not bundled; using system runtimes where available: {missing}", level="WARN")
        return

    print("[环境] 首次启动，正在展开隔离 Python、R 与扩展包环境...")
    root_resolved = ROOT_DIR.resolve()
    with zipfile.ZipFile(archive_path, "r") as archive:
        for entry in archive.infolist():
            target = (ROOT_DIR / entry.filename).resolve()
            if not target.is_relative_to(root_resolved):
                raise RuntimeError(f"环境归档包含非法路径：{entry.filename}")
        archive.extractall(ROOT_DIR)

    missing_after_extract = [path for path in required_paths if not path.exists()]
    if missing_after_extract:
        missing = ", ".join(str(path) for path in missing_after_extract)
        log_event("environment", f"Isolated environment extraction is incomplete; continuing with system runtimes: {missing}", level="WARN")

    if (ROOT_DIR / ".venv" / "pyvenv.cfg").exists():
        try:
            rebase_packaged_python_environment()
        except (OSError, RuntimeError) as error:
            log_event("environment", f"Unable to rebase isolated Python; using system Python: {error}", level="WARN")
    archive_path.unlink(missing_ok=True)
    print("[环境] 隔离环境已就绪。")


def find_python_311_home() -> Path | None:
    probes: list[list[str]] = []
    py_launcher = shutil.which("py.exe")
    if py_launcher:
        probes.append([py_launcher, "-3.11"])

    local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
    if local_app_data:
        probes.append([str(Path(local_app_data) / "Programs" / "Python" / "Python311" / "python.exe")])

    python_on_path = shutil.which("python.exe") or shutil.which("python")
    if python_on_path:
        probes.append([python_on_path])

    for probe in probes:
        try:
            result = subprocess.run(
                [*probe, "-c", "import sys; print(sys.base_prefix); raise SystemExit(0 if sys.version_info[:2] == (3, 11) else 1)"],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if result.returncode != 0:
            continue
        candidate = Path(result.stdout.strip())
        if (candidate / "python.exe").exists():
            return candidate
    return None


def rebase_packaged_python_environment() -> None:
    venv_path = ROOT_DIR / ".venv"
    config_path = venv_path / "pyvenv.cfg"
    python_home = find_python_311_home()
    if python_home is None:
        raise RuntimeError("未检测到 Python 3.11。请先安装 Python 3.11 后重新启动便携版。")
    if not config_path.exists():
        raise FileNotFoundError(f"隔离 Python 配置不存在：{config_path}")

    installed_python = python_home / "python.exe"
    config = "\n".join(
        (
            f"home = {python_home}",
            "implementation = CPython",
            "version = 3.11.9",
            f"executable = {installed_python}",
            f"command = {installed_python} -m venv {venv_path}",
            "include-system-site-packages = false",
            f"base-prefix = {python_home}",
            f"base-exec-prefix = {python_home}",
            f"base-executable = {installed_python}",
            "",
        )
    )
    config_path.write_text(config, encoding="utf-8")


def resolve_startup_splash_path() -> Path:
    return ROOT_DIR / STARTUP_SPLASH_IMAGE_NAME


def show_startup_splash() -> None:
    if os.name != "nt":
        return

    image_path = resolve_startup_splash_path()
    if not image_path.exists():
        log_event("startup", f"Startup splash image missing, skipping: {image_path}", level="WARNING")
        return

    powershell = shutil.which("powershell.exe") or shutil.which("pwsh.exe")
    if not powershell:
        log_event("startup", "PowerShell not found; startup splash skipped.", level="WARNING")
        return

    escaped_uri = image_path.resolve().as_uri().replace("'", "''")
    splash_script = f"""
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName WindowsBase

$bitmap = New-Object System.Windows.Media.Imaging.BitmapImage
$bitmap.BeginInit()
$bitmap.UriSource = [System.Uri]'{escaped_uri}'
$bitmap.CacheOption = [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
$bitmap.EndInit()
$bitmap.Freeze()

$image = New-Object System.Windows.Controls.Image
$image.Source = $bitmap
$image.Stretch = [System.Windows.Media.Stretch]::Uniform
$image.MaxWidth = [System.Windows.SystemParameters]::PrimaryScreenWidth * 0.72
$image.MaxHeight = [System.Windows.SystemParameters]::PrimaryScreenHeight * 0.72

$window = New-Object System.Windows.Window
$window.WindowStyle = [System.Windows.WindowStyle]::None
$window.ResizeMode = [System.Windows.ResizeMode]::NoResize
$window.AllowsTransparency = $true
$window.ShowInTaskbar = $false
$window.Topmost = $true
$window.WindowStartupLocation = [System.Windows.WindowStartupLocation]::CenterScreen
$window.SizeToContent = [System.Windows.SizeToContent]::WidthAndHeight
$window.Background = [System.Windows.Media.Brushes]::Transparent
$window.Content = $image

$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [System.TimeSpan]::FromMilliseconds({STARTUP_SPLASH_DURATION_MS})
$timer.Add_Tick({{
    $timer.Stop()
    $window.Close()
}})
$timer.Start()

[void]$window.ShowDialog()
"""
    encoded_script = base64.b64encode(splash_script.encode("utf-16le")).decode("ascii")
    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

    try:
        subprocess.run(
            [powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded_script],
            check=False,
            timeout=max(10.0, STARTUP_SPLASH_DURATION_MS / 1000.0 + 6.0),
            creationflags=creation_flags,
        )
    except (OSError, subprocess.SubprocessError) as error:
        log_event("startup", f"Startup splash failed: {error}", level="WARNING")


def is_frozen_app() -> bool:
    return IS_FROZEN


def resolve_launcher_binary_path() -> Path:
    if not is_frozen_app():
        return Path(sys.executable).resolve()

    preferred = ROOT_DIR / "Lmentor.exe"
    if preferred.exists():
        return preferred

    local_executables = sorted(path for path in ROOT_DIR.glob("*.exe") if path.is_file())
    if local_executables:
        return local_executables[0]

    return LAUNCHER_ENTRY_PATH


def launcher_entry_command() -> list[str]:
    if is_frozen_app():
        return [str(resolve_launcher_binary_path())]
    return [sys.executable, str(Path(__file__).resolve())]


@dataclass
class ManagedService:
    name: str
    command: list[str]
    cwd: Path
    env: dict[str, str]
    ready_check: Callable[[], tuple[bool, str]]
    process: subprocess.Popen[str] | None = None
    started_by_launcher: bool = False
    existing_instance: bool = False
    ready: bool = False
    ready_message: str = ""
    restarts: int = 0
    last_exit_code: int | None = None


@dataclass
class ManagedCodexRuntime:
    kind: str
    version: str
    platform: str
    runtime_dir: Path
    binary_path: Path
    home_dir: Path
    archive_path: Path


@dataclass
class StatusSnapshot:
    bridge_ok: bool = False
    frontend_ok: bool = False
    codex_known: bool = False
    codex_installed: bool | None = None
    codex_version: str | None = None
    codex_binary_path: str | None = None
    active_agent: str | None = None
    bridge_message: str = ""
    frontend_message: str = ""
    codex_message: str = ""


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Lmentor 一键启动器")
    parser.add_argument("--bridge-host", default=DEFAULT_BRIDGE_HOST, help="桥接服务监听地址")
    parser.add_argument("--bridge-port", type=int, default=DEFAULT_BRIDGE_PORT, help="桥接服务端口")
    parser.add_argument("--frontend-host", default=DEFAULT_FRONTEND_HOST, help="前端监听地址")
    parser.add_argument("--frontend-port", type=int, default=DEFAULT_FRONTEND_PORT, help="前端开发端口")
    parser.add_argument("--frontend-mode", choices=("auto", "dev", "static"), default=os.environ.get("LMENTOR_FRONTEND_MODE", "auto"), help="前端启动模式")
    parser.add_argument("--no-browser", action="store_true", help="启动后不自动打开浏览器")
    parser.add_argument("--timeout", type=float, default=STARTUP_TIMEOUT_SECONDS, help="单个服务启动等待超时")
    parser.add_argument("--monitor-interval", type=float, default=MONITOR_INTERVAL_SECONDS, help="监控轮询间隔")
    parser.add_argument("--serve-frontend-static", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--bridge-url", default="", help=argparse.SUPPRESS)
    return parser


def is_port_open(host: str, port: int, timeout: float = 0.5) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(timeout)
        return sock.connect_ex((host, port)) == 0


def find_tcp_listener_pids(port: int) -> set[int]:
    if os.name == "nt":
        result = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        pids: set[int] = set()
        suffix = f":{port}"
        for line in result.stdout.splitlines():
            parts = line.split()
            if len(parts) < 5 or parts[0].upper() != "TCP":
                continue
            local_addr = parts[1]
            state = parts[-2].upper()
            pid_text = parts[-1]
            if not local_addr.endswith(suffix) or not state.startswith("LISTEN") or not pid_text.isdigit():
                continue
            pids.add(int(pid_text))
        return pids

    result = subprocess.run(
        ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return {int(line.strip()) for line in result.stdout.splitlines() if line.strip().isdigit()}


def wait_for_port_closed(host: str, port: int, timeout: float = 8.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not is_port_open(host, port, timeout=0.2):
            return True
        time.sleep(0.2)
    return not is_port_open(host, port, timeout=0.2)


def app_local_data_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA")
    if base:
        return Path(base) / "Lmentor"
    return Path.home() / "AppData" / "Local" / "Lmentor"


def app_roaming_data_dir() -> Path:
    base = os.environ.get("APPDATA")
    if base:
        return Path(base) / "Lmentor"
    return Path.home() / "AppData" / "Roaming" / "Lmentor"


def ensure_path_inside(root: Path, target: Path) -> Path:
    root_resolved = root.resolve()
    target_resolved = target.resolve()
    try:
        target_resolved.relative_to(root_resolved)
    except ValueError as error:
        raise RuntimeError(f"Refusing path outside managed root: {target_resolved}") from error
    return target_resolved


def remove_tree_inside(root: Path, target: Path) -> None:
    resolved = ensure_path_inside(root, target)
    if resolved.exists():
        shutil.rmtree(resolved)


def safe_extract_tar_gz(archive_path: Path, target_dir: Path) -> None:
    target_root = target_dir.resolve()
    target_root.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive_path, "r:gz") as archive:
        for member in archive.getmembers():
            member_name = member.name.replace("\\", "/")
            if not member_name or member_name.startswith("/") or ".." in Path(member_name).parts:
                raise RuntimeError(f"Unsafe path in Codex runtime archive: {member.name}")
            member_target = (target_root / member_name).resolve()
            try:
                member_target.relative_to(target_root)
            except ValueError as error:
                raise RuntimeError(f"Unsafe target in Codex runtime archive: {member.name}") from error
            if member.issym() or member.islnk():
                raise RuntimeError(f"Refusing link entry in Codex runtime archive: {member.name}")
            archive.extract(member, target_root)


def run_codex_version(binary_path: Path, home_dir: Path | None = None) -> str:
    env = os.environ.copy()
    if home_dir is not None:
        env["CODEX_HOME"] = str(home_dir)
        env["LMENTOR_CODEX_HOME"] = str(home_dir)
    result = subprocess.run(
        [str(binary_path), "--version"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        check=False,
        timeout=20,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "unknown error").strip()
        raise RuntimeError(f"Managed runtime version check failed: {detail}")
    raw = (result.stdout or result.stderr or "").strip()
    return raw or CODEX_RUNTIME_VERSION


def validate_lmentor_codex_runtime(runtime_dir: Path, home_dir: Path) -> str:
    missing = [str(relative) for relative in CODEX_RUNTIME_REQUIRED_FILES if not (runtime_dir / relative).exists()]
    if missing:
        raise RuntimeError(f"Managed Codex runtime is incomplete: {', '.join(missing)}")
    return run_codex_version(runtime_dir / "bin" / "codex.exe", home_dir)


def project_codex_runtime_candidates(project_runtime_root: Path) -> list[Path]:
    candidates = [project_runtime_root]
    if project_runtime_root.exists():
        try:
            candidates.extend(
                child
                for child in project_runtime_root.iterdir()
                if child.is_dir()
            )
        except OSError:
            pass
    return candidates


def resolve_project_codex_runtime_dir(project_runtime_root: Path) -> Path | None:
    for candidate in project_codex_runtime_candidates(project_runtime_root):
        if all((candidate / relative).exists() for relative in CODEX_RUNTIME_REQUIRED_FILES):
            return candidate
    return None


def is_path_within(root: Path, target: Path) -> bool:
    try:
        target.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def is_project_codex_runtime(runtime_dir: Path) -> bool:
    return is_path_within(ROOT_DIR / CODEX_RUNTIME_PROJECT_DIR, runtime_dir)


def count_skill_directories(root: Path) -> int:
    if not root.exists():
        return 0
    if (root / "SKILL.md").exists():
        return 1

    total = 0
    try:
        for entry in root.iterdir():
            if not entry.is_dir():
                continue
            if (entry / "SKILL.md").exists():
                total += 1
                continue
            if entry.name == ".system":
                for system_entry in entry.iterdir():
                    if system_entry.is_dir() and (system_entry / "SKILL.md").exists():
                        total += 1
    except OSError:
        return total
    return total


def codex_skill_roots(runtime_dir: Path, home_dir: Path) -> list[tuple[str, Path]]:
    project_runtime_root = ROOT_DIR / CODEX_RUNTIME_PROJECT_DIR
    return [
        ("app-root skills", ROOT_DIR / "skills"),
        ("app-root .codex skills", ROOT_DIR / ".codex" / "skills"),
        ("app-root .agents skills", ROOT_DIR / ".agents" / "skills"),
        ("app-root .lmentor skills", ROOT_DIR / ".lmentor" / "skills"),
        ("project Codex runtime skills", project_runtime_root / "skills"),
        ("project Codex runtime .codex skills", project_runtime_root / ".codex" / "skills"),
        ("project Codex runtime .agents skills", project_runtime_root / ".agents" / "skills"),
        ("active runtime skills", runtime_dir / "skills"),
        ("active CODEX_HOME skills", home_dir / "skills"),
    ]


def log_codex_runtime_diagnostics(runtime: ManagedCodexRuntime) -> None:
    project_runtime_root = ROOT_DIR / CODEX_RUNTIME_PROJECT_DIR
    system_home = Path.home() / ".codex"
    isolated = runtime.home_dir.resolve() != system_home.resolve()
    using_project_runtime = is_project_codex_runtime(runtime.runtime_dir)

    log_event("codex-runtime", f"kind={runtime.kind}, version={runtime.version}, platform={runtime.platform}")
    log_event("codex-runtime", f"using project root runtime: {'yes' if using_project_runtime else 'no'}")
    log_event("codex-runtime", f"project runtime root: {project_runtime_root}")
    log_event("codex-runtime", f"runtime dir: {runtime.runtime_dir}")
    log_event("codex-runtime", f"codex binary: {runtime.binary_path}")
    log_event("codex-runtime", f"isolated CODEX_HOME: {'yes' if isolated else 'no'}")
    log_event("codex-runtime", f"CODEX_HOME: {runtime.home_dir}")
    log_event("codex-runtime", f"config.toml: {runtime.home_dir / 'config.toml'}")
    log_event("codex-runtime", f"auth.json: {runtime.home_dir / 'auth.json'}")
    log_event("codex-runtime", f"system Codex home: {system_home}")

    for label, root in codex_skill_roots(runtime.runtime_dir, runtime.home_dir):
        exists = root.exists()
        count = count_skill_directories(root)
        log_event("codex-skills", f"{label}: exists={'yes' if exists else 'no'}, skills={count}, path={root}")


def write_default_codex_home(home_dir: Path, *, managed_defaults: bool = True) -> None:
    home_dir.mkdir(parents=True, exist_ok=True)
    for child in ("sessions", "archived_sessions", "skills", "plugins", "logs", "tmp"):
        (home_dir / child).mkdir(parents=True, exist_ok=True)
    config_path = home_dir / "config.toml"
    if not config_path.exists():
        if managed_defaults:
            config_path.write_text(
                "\n".join([
                    "# Lmentor managed Codex home.",
                    "# API keys and login tokens are intentionally not stored here by the launcher.",
                    "model = \"gpt-5\"",
                    "approval_policy = \"never\"",
                    "sandbox_mode = \"danger-full-access\"",
                    "",
                ]),
                encoding="utf-8",
            )
        else:
            config_path.write_text("", encoding="utf-8")


def ensure_lmentor_codex_runtime() -> ManagedCodexRuntime:
    machine = platform.machine().lower()
    if machine in {"arm64", "aarch64"}:
        raise RuntimeError(
            "This Lmentor bundle contains the Windows x64 Codex runtime. "
            "For Windows ARM64, include codex-package-aarch64-pc-windows-msvc.tar.gz."
        )

    project_runtime_root = ROOT_DIR / CODEX_RUNTIME_PROJECT_DIR
    if project_runtime_root.exists():
        project_runtime_dir = resolve_project_codex_runtime_dir(project_runtime_root)
        if project_runtime_dir is None:
            raise RuntimeError(
                f"Project Codex runtime exists but is incomplete: {project_runtime_root}. "
                "Expected bin/codex.exe, codex-path/rg.exe, codex-resources and codex-package.json."
            )

        home_dir = project_runtime_dir
        write_default_codex_home(home_dir, managed_defaults=False)
        binary_path = project_runtime_dir / "bin" / "codex.exe"
        version = validate_lmentor_codex_runtime(project_runtime_dir, home_dir)
        log_event("codex-runtime", f"using project Codex runtime: {version}")
        log_event("codex-runtime", f"runtime: {project_runtime_dir}")
        log_event("codex-runtime", f"binary: {binary_path}")
        log_event("codex-runtime", f"project CODEX_HOME: {home_dir}")
        log_event("codex-runtime", f"project config.toml: {home_dir / 'config.toml'}")
        log_event("codex-runtime", f"project auth.json: {home_dir / 'auth.json'}")
        return ManagedCodexRuntime(
            "project-isolated",
            CODEX_RUNTIME_VERSION,
            CODEX_RUNTIME_PLATFORM,
            project_runtime_dir,
            binary_path,
            home_dir,
            project_runtime_root,
        )

    home_dir = app_roaming_data_dir() / "codex-home"
    write_default_codex_home(home_dir)

    archive_path = ROOT_DIR / CODEX_RUNTIME_ARCHIVE
    runtime_root = app_local_data_dir() / "runtime" / "codex"
    runtime_dir = runtime_root / CODEX_RUNTIME_VERSION / CODEX_RUNTIME_PLATFORM
    staging_parent = runtime_root / ".staging"
    staging_dir = staging_parent / f"codex-{CODEX_RUNTIME_VERSION}-{CODEX_RUNTIME_PLATFORM}"
    lock_path = runtime_root / ".codex-install.lock"

    binary_path = runtime_dir / "bin" / "codex.exe"
    if binary_path.exists():
        try:
            version = validate_lmentor_codex_runtime(runtime_dir, home_dir)
            log_event("codex-runtime", f"managed Codex ready: {version}")
            log_event("codex-runtime", f"binary: {binary_path}")
            log_event("codex-runtime", f"CODEX_HOME: {home_dir}")
            return ManagedCodexRuntime("managed", CODEX_RUNTIME_VERSION, CODEX_RUNTIME_PLATFORM, runtime_dir, binary_path, home_dir, archive_path)
        except Exception as error:
            log_event("codex-runtime", f"existing runtime is invalid, reinstalling: {error}", level="WARN")

    if not archive_path.exists():
        raise FileNotFoundError(f"Missing bundled Codex runtime archive: {archive_path}")

    runtime_root.mkdir(parents=True, exist_ok=True)
    staging_parent.mkdir(parents=True, exist_ok=True)

    lock_handle: int | None = None
    lock_deadline = time.monotonic() + 45
    while lock_handle is None:
        try:
            lock_handle = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(lock_handle, str(os.getpid()).encode("utf-8"))
        except FileExistsError:
            if time.monotonic() > lock_deadline:
                raise TimeoutError(f"Timed out waiting for Codex runtime install lock: {lock_path}")
            time.sleep(0.5)

    try:
        log_event("codex-runtime", f"installing bundled Codex runtime from {archive_path}")
        remove_tree_inside(runtime_root, staging_dir)
        safe_extract_tar_gz(archive_path, staging_dir)
        validate_lmentor_codex_runtime(staging_dir, home_dir)

        remove_tree_inside(runtime_root, runtime_dir)
        runtime_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(staging_dir), str(runtime_dir))

        version = validate_lmentor_codex_runtime(runtime_dir, home_dir)
        install_record = {
            "managedBy": "Lmentor",
            "version": CODEX_RUNTIME_VERSION,
            "platform": CODEX_RUNTIME_PLATFORM,
            "sourceArchive": str(archive_path),
            "installedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "detectedVersion": version,
        }
        (runtime_dir / "install.json").write_text(json.dumps(install_record, indent=2), encoding="utf-8")
        log_event("codex-runtime", f"installed managed Codex runtime: {version}")
    finally:
        if lock_handle is not None:
            os.close(lock_handle)
        try:
            lock_path.unlink(missing_ok=True)
        except OSError:
            pass

    return ManagedCodexRuntime("managed", CODEX_RUNTIME_VERSION, CODEX_RUNTIME_PLATFORM, runtime_dir, binary_path, home_dir, archive_path)


def force_restart_bridge_port(host: str, port: int) -> None:
    print(f"[bridge:restart] checking existing bridge on {host}:{port}...")
    pids = sorted(pid for pid in find_tcp_listener_pids(port) if pid != os.getpid())

    if not pids:
        if is_port_open(host, port):
            print("[bridge:restart] port is occupied, but no listener PID was detected.")
        else:
            print("[bridge:restart] no existing bridge process detected.")
        return

    print(f"[bridge:restart] found existing listener PID(s): {', '.join(str(pid) for pid in pids)}")
    for pid in pids:
        print(f"[bridge:restart] stopping old bridge process tree: PID {pid}")
        if os.name == "nt":
            result = subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
        else:
            try:
                os.kill(pid, signal.SIGTERM)
                result = subprocess.CompletedProcess(["kill", str(pid)], 0, "", "")
            except OSError as error:
                result = subprocess.CompletedProcess(["kill", str(pid)], 1, "", str(error))

        if result.returncode == 0:
            print(f"[bridge:restart] stopped PID {pid}.")
        else:
            detail = (result.stderr or result.stdout or "unknown error").strip()
            print(f"[bridge:restart] failed to stop PID {pid}: {detail}")

    if wait_for_port_closed(host, port):
        print(f"[bridge:restart] bridge port {port} has been released.")
    else:
        print(f"[bridge:restart] bridge port {port} is still occupied after stop attempt.")


def request_json(
    url: str,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    timeout: float = 2.0,
) -> tuple[int, dict[str, Any], str]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(url, data=data, method=method)
    request.add_header("Content-Type", "application/json")

    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                payload = {}
            return response.status, payload, raw
    except HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace") if error.fp else ""
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {}
        return error.code, payload, raw
    except URLError:
        return 0, {}, ""


def request_text(url: str, timeout: float = 2.0) -> tuple[int, str, dict[str, str]]:
    try:
        with urlopen(url, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return response.status, raw, dict(response.headers.items())
    except HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace") if error.fp else ""
        return error.code, raw, dict(error.headers.items()) if error.headers else {}
    except URLError:
        return 0, "", {}


def stream_process_output(prefix: str, stream: Any) -> None:
    for line in iter(stream.readline, ""):
        text = line.rstrip("\r\n")
        if text:
            print(f"[{prefix}] {text}")


def spawn_process(name: str, command: list[str], cwd: Path, env: dict[str, str]) -> subprocess.Popen[str]:
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    proc = subprocess.Popen(
        command,
        cwd=str(cwd),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        stdin=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        creationflags=creationflags,
    )

    if proc.stdout is not None:
        threading.Thread(target=stream_process_output, args=(f"{name}:stdout", proc.stdout), daemon=True).start()
    if proc.stderr is not None:
        threading.Thread(target=stream_process_output, args=(f"{name}:stderr", proc.stderr), daemon=True).start()
    return proc


def terminate_process(proc: subprocess.Popen[str] | None, name: str) -> None:
    if proc is None:
        return
    if proc.poll() is not None:
        return

    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def build_bridge_url(host: str, port: int) -> str:
    return f"http://{host}:{port}"


def build_frontend_url(host: str, port: int) -> str:
    return f"http://{host}:{port}"


def resolve_frontend_dist_dir() -> Path:
    if FRONTEND_DIST_DIR.exists() and (FRONTEND_DIST_DIR / "index.html").exists():
        return FRONTEND_DIST_DIR
    raise FileNotFoundError(f"未找到前端构建产物：{FRONTEND_DIST_DIR}")


def select_frontend_mode(requested_mode: str) -> str:
    normalized = (requested_mode or "auto").strip().lower()
    if normalized not in {"auto", "dev", "static"}:
        normalized = "auto"

    if normalized == "dev":
        resolve_vite_cli_js()
        return "dev"

    if normalized == "static":
        resolve_frontend_dist_dir()
        return "static"

    if is_frozen_app():
        resolve_frontend_dist_dir()
        return "static"

    vite_cli = FRONTEND_DIR / VITE_CLI_RELATIVE
    if vite_cli.exists() and (FRONTEND_DIR / "node_modules").exists():
        return "dev"

    resolve_frontend_dist_dir()
    return "static"


def bridge_health_check(bridge_url: str) -> tuple[bool, str]:
    status, payload, _ = request_json(f"{bridge_url}{BRIDGE_HEALTH_PATH}", timeout=2.0)
    if status != 200 or payload.get("ok") is not True:
        return False, "桥接健康检查未通过"
    return True, "桥接服务已就绪"


def bridge_codex_status(bridge_url: str) -> tuple[bool, str, dict[str, Any]]:
    status, payload, _ = request_json(
        f"{bridge_url}{BRIDGE_INVOKE_PATH}",
        method="POST",
        body={"command": "agent_list_statuses", "args": {}},
        timeout=5.0,
    )
    if status != 200 or payload.get("ok") is not True:
        error_text = payload.get("error") if isinstance(payload.get("error"), str) else None
        message = error_text or "无法读取运行环境状态"
        return False, message, {"error": error_text}

    result = payload.get("result")
    if not isinstance(result, list):
        return False, "运行环境状态格式不正确", {}

    for item in result:
        if not isinstance(item, dict) or item.get("id") != "codex":
            continue
        health = item.get("health") if isinstance(item.get("health"), dict) else {}
        installed = health.get("installed") if isinstance(health, dict) else None
        version = health.get("version") if isinstance(health, dict) else None
        binary_path = health.get("binary_path") if isinstance(health, dict) else None
        message = "隔离运行环境可用" if installed else "隔离运行环境不可用"
        return True, message, {
            "installed": installed,
            "version": version,
            "binary_path": binary_path,
        }

    return False, "未找到运行环境状态", {}


def frontend_health_check(frontend_url: str) -> tuple[bool, str]:
    status, body, headers = request_text(frontend_url, timeout=3.0)
    if status != 200:
        return False, "前端页面未响应"

    content_type = headers.get("Content-Type", "")
    if "text/html" not in content_type:
        return False, "前端端口已响应，但不是 HTML 页面"

    markers = ["@vite/client", "/src/main.tsx", "id=\"root\"", "vite"]
    if not any(marker in body for marker in markers):
        return False, "前端已响应，但不是当前项目页面"

    return True, "前端服务已就绪"


def serve_static_frontend(host: str, port: int, bridge_url: str) -> None:
    dist_dir = resolve_frontend_dist_dir()
    index_path = dist_dir / "index.html"
    index_html = index_path.read_text(encoding="utf-8")
    injected_index_html = index_html.replace(
        "</head>",
        f'  <script src="{RUNTIME_CONFIG_SCRIPT_PATH}"></script>\n  </head>',
        1,
    )
    runtime_payload = json.dumps({"bridgeUrl": bridge_url}, ensure_ascii=False)
    runtime_script = f"window.__LMENTOR_RUNTIME__ = {runtime_payload};\n".encode("utf-8")

    mimetypes.add_type("application/javascript", ".js")

    class StaticFrontendHandler(SimpleHTTPRequestHandler):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, directory=str(dist_dir), **kwargs)

        def log_message(self, format: str, *args: Any) -> None:
            log_event("frontend-static", format % args)

        def end_headers(self) -> None:
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            request_path = unquote(parsed.path or "/")

            if request_path == RUNTIME_CONFIG_SCRIPT_PATH:
                self.send_response(200)
                self.send_header("Content-Type", "application/javascript; charset=utf-8")
                self.send_header("Content-Length", str(len(runtime_script)))
                self.end_headers()
                self.wfile.write(runtime_script)
                return

            if request_path in {"/", "/index.html"}:
                self._serve_index_html()
                return

            relative_path = request_path.lstrip("/")
            if relative_path:
                candidate = (dist_dir / relative_path).resolve()
                try:
                    candidate.relative_to(dist_dir.resolve())
                except ValueError:
                    self.send_error(403, "Forbidden")
                    return

                if candidate.exists() and candidate.is_file():
                    return super().do_GET()

            if "." not in Path(request_path).name:
                self._serve_index_html()
                return

            self.send_error(404, "Not Found")

        def _serve_index_html(self) -> None:
            payload = injected_index_html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    class ReusableThreadingHTTPServer(ThreadingHTTPServer):
        allow_reuse_address = True

    server = ReusableThreadingHTTPServer((host, port), StaticFrontendHandler)
    log_event("frontend-static", f"serving {dist_dir} on http://{host}:{port} with bridge {bridge_url}")
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()


def launch_service(
    service: ManagedService,
    allow_existing: bool,
    port_probe: Callable[[], tuple[bool, str]],
) -> None:
    ready, message = port_probe()
    if allow_existing and ready:
        service.existing_instance = True
        service.ready = True
        service.ready_message = message
        print(f"[{service.name}] 检测到已有实例，直接复用。")
        return

    if service.process is not None and service.process.poll() is None:
        return

    print(f"[{service.name}] 正在启动：{' '.join(service.command)}")
    service.process = spawn_process(service.name, service.command, service.cwd, service.env)
    service.started_by_launcher = True
    service.existing_instance = False
    service.ready = False
    service.ready_message = ""


def wait_for_service_ready(
    service: ManagedService,
    port_probe: Callable[[], tuple[bool, str]],
    timeout: float,
) -> None:
    deadline = time.monotonic() + timeout
    last_message = ""

    while time.monotonic() < deadline:
        if service.process is not None:
            exit_code = service.process.poll()
            if exit_code is not None:
                service.last_exit_code = exit_code
                if service.restarts < MAX_RESTARTS:
                    service.restarts += 1
                    print(f"[{service.name}] 进程提前退出，准备重启（第 {service.restarts} 次）。")
                    service.process = None
                    time.sleep(1.0)
                    service.process = spawn_process(service.name, service.command, service.cwd, service.env)
                    continue
                raise RuntimeError(f"{service.name} 启动失败，退出码：{exit_code}")

        ready, message = port_probe()
        last_message = message
        if ready:
            service.ready = True
            service.ready_message = message
            return

        time.sleep(HEALTH_POLL_INTERVAL_SECONDS)

    raise TimeoutError(f"{service.name} 启动超时：{last_message or '未返回就绪信号'}")


def build_bridge_env(bridge_host: str, bridge_port: int, codex_runtime: ManagedCodexRuntime) -> dict[str, str]:
    env = os.environ.copy()
    project_venv = ROOT_DIR / ".venv"
    project_python_dir = project_venv / "Scripts"
    project_python_packages = ROOT_DIR / ".lmentor" / "python-packages"
    project_r_library = ROOT_DIR / ".Rlib"
    python_dependency_installer = ROOT_DIR / "scripts" / "ensure_python_package.py"
    r_dependency_installer = ROOT_DIR / "scripts" / "ensure_r_package.R"
    utf8_writer = ROOT_DIR / "scripts" / "write_utf8_file.ps1"
    bundled_r_home = ROOT_DIR / "runtime" / "R-4.5.3"
    configured_r_home = Path(env["R_HOME"]) if env.get("R_HOME") else None
    r_home_candidates = [bundled_r_home, configured_r_home, Path("C:/Program Files/R/R-4.5.3")]
    project_r_library.mkdir(parents=True, exist_ok=True)
    env["LMENTOR_BRIDGE_HOST"] = bridge_host
    env["LMENTOR_BRIDGE_PORT"] = str(bridge_port)
    env["LMENTOR_APP_ROOT"] = str(ROOT_DIR)
    env["LMENTOR_CODEX_CMD"] = str(codex_runtime.binary_path)
    env["LMENTOR_CODEX_HOME"] = str(codex_runtime.home_dir)
    env["CODEX_HOME"] = str(codex_runtime.home_dir)
    env["LMENTOR_CODEX_RUNTIME_DIR"] = str(codex_runtime.runtime_dir)
    env["LMENTOR_CODEX_PROJECT_ROOT"] = str(ROOT_DIR / CODEX_RUNTIME_PROJECT_DIR)
    env["LMENTOR_CODEX_PROJECT_CMD"] = str((ROOT_DIR / CODEX_RUNTIME_PROJECT_DIR / "bin" / "codex.exe").resolve())
    env["LMENTOR_CODEX_ISOLATED"] = "1" if codex_runtime.home_dir.resolve() != (Path.home() / ".codex").resolve() else "0"
    env["LMENTOR_CODEX_USING_PROJECT_RUNTIME"] = "1" if is_project_codex_runtime(codex_runtime.runtime_dir) else "0"
    env["LMENTOR_CODEX_RUNTIME_KIND"] = codex_runtime.kind
    env["LMENTOR_CODEX_RUNTIME_VERSION"] = codex_runtime.version
    env["LMENTOR_CODEX_RUNTIME_PLATFORM"] = codex_runtime.platform
    # When a portable build falls back to the host Python, keep any packages
    # acquired by an Agent in the application directory rather than globally.
    env["LMENTOR_PYTHON_PACKAGES"] = str(project_python_packages)
    env["LMENTOR_PYTHON_INSTALLER"] = str(python_dependency_installer)
    env["LMENTOR_R_LIBRARY"] = str(project_r_library)
    env["LMENTOR_R_INSTALLER"] = str(r_dependency_installer)
    env["LMENTOR_UTF8_WRITER"] = str(utf8_writer)
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    runtime_path_entries = [
        str(codex_runtime.runtime_dir / "bin"),
        str(codex_runtime.runtime_dir / "codex-path"),
    ]
    project_python = project_python_dir / "python.exe"
    if project_python.exists():
        python_executable = project_python
        pip_executable = project_python_dir / "pip.exe"
        env["VIRTUAL_ENV"] = str(project_venv)
        runtime_path_entries.insert(0, str(project_python_dir))
    else:
        python_home = find_python_311_home()
        python_executable = python_home / "python.exe" if python_home else None
        pip_executable = python_home / "Scripts" / "pip.exe" if python_home else None
        if python_home:
            runtime_path_entries.insert(0, str(python_home / "Scripts"))
            runtime_path_entries.insert(0, str(python_home))
        env.pop("VIRTUAL_ENV", None)
    for r_home in r_home_candidates:
        if r_home and (r_home / "bin" / "Rscript.exe").exists():
            env["R_HOME"] = str(r_home)
            runtime_path_entries.append(str(r_home / "bin"))
            break
    if python_executable and python_executable.exists():
        env["PYTHON"] = str(python_executable)
        if pip_executable and pip_executable.exists():
            env["PIP"] = str(pip_executable)
        else:
            env.pop("PIP", None)
    else:
        env.pop("PYTHON", None)
        env.pop("PIP", None)
    env["R_LIBS_USER"] = str(project_r_library)
    existing_python_path = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = os.pathsep.join([
        str(project_python_packages),
        *([existing_python_path] if existing_python_path else []),
    ])
    env["PATH"] = os.pathsep.join([*runtime_path_entries, env.get("PATH", "")])
    log_event("bridge-env", f"LMENTOR_APP_ROOT={env['LMENTOR_APP_ROOT']}")
    log_event("bridge-env", f"LMENTOR_CODEX_CMD={env['LMENTOR_CODEX_CMD']}")
    log_event("bridge-env", f"LMENTOR_CODEX_HOME={env['LMENTOR_CODEX_HOME']}")
    log_event("bridge-env", f"LMENTOR_CODEX_RUNTIME_KIND={env['LMENTOR_CODEX_RUNTIME_KIND']}")
    log_event("bridge-env", f"LMENTOR_CODEX_USING_PROJECT_RUNTIME={env['LMENTOR_CODEX_USING_PROJECT_RUNTIME']}")
    log_event("bridge-env", f"LMENTOR_CODEX_ISOLATED={env['LMENTOR_CODEX_ISOLATED']}")
    log_event("bridge-env", f"PYTHON={env.get('PYTHON', '')}")
    log_event("bridge-env", f"LMENTOR_PYTHON_PACKAGES={env['LMENTOR_PYTHON_PACKAGES']}")
    log_event("bridge-env", f"LMENTOR_UTF8_WRITER={env['LMENTOR_UTF8_WRITER']}")
    log_event("bridge-env", f"R_HOME={env.get('R_HOME', '')}")
    log_event("bridge-env", f"R_LIBS_USER={env['R_LIBS_USER']}")
    return env


def build_frontend_command(frontend_host: str, frontend_port: int, frontend_mode: str, bridge_url: str) -> list[str]:
    if frontend_mode == "static":
        return [
            *launcher_entry_command(),
            "--serve-frontend-static",
            "--frontend-host",
            frontend_host,
            "--frontend-port",
            str(frontend_port),
            "--bridge-url",
            bridge_url,
        ]

    return [
        resolve_node_executable(),
        str(resolve_vite_cli_js()),
        "--host",
        frontend_host,
        "--port",
        str(frontend_port),
        "--strictPort",
    ]


def build_frontend_env(bridge_url: str) -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("NODE_ENV", "development")
    env["VITE_LMENTOR_BRIDGE_URL"] = bridge_url
    return env


def resolve_node_executable() -> str:
    from shutil import which

    candidates = [
        RESOURCE_ROOT / "node" / "node.exe",
        RESOURCE_ROOT / "runtime" / "node" / "node.exe",
        ROOT_DIR / "node" / "node.exe",
        ROOT_DIR / "runtime" / "node" / "node.exe",
        FRONTEND_DIR / "node" / "node.exe",
        which("node.exe"),
        which("node"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return str(candidate)

    raise RuntimeError("未找到 node.exe，请把 Node.js 放入 PATH，或放到项目内的 node/node.exe。")


def resolve_vite_cli_js() -> Path:
    vite_cli = FRONTEND_DIR / VITE_CLI_RELATIVE
    if vite_cli.exists():
        return vite_cli
    raise RuntimeError("未找到 Vite 启动脚本，请先进入 frontend-shell 执行 npm install。")


def resolve_bridge_script() -> Path:
    bridge_script = FRONTEND_DIR / BRIDGE_SCRIPT_RELATIVE
    if bridge_script.exists():
        return bridge_script
    raise FileNotFoundError(f"未找到桥接脚本：{bridge_script}")


def print_banner(frontend_url: str, bridge_url: str, bridge_port: int, frontend_port: int, auto_open_browser: bool) -> None:
    print("Lmentor 一键启动器已启动")
    print(f"  根目录: {ROOT_DIR}")
    print(f"  前端地址: {frontend_url}")
    print(f"  前端端口: {frontend_port}")
    print(f"  桥接地址: {bridge_url}")
    print(f"  桥接端口: {bridge_port}")
    print(f"  浏览器: {'启动后自动打开' if auto_open_browser else '不会自动打开'}")


def collect_snapshot(bridge_url: str, frontend_url: str) -> StatusSnapshot:
    snapshot = StatusSnapshot()

    bridge_ok, bridge_message = bridge_health_check(bridge_url)
    snapshot.bridge_ok = bridge_ok
    snapshot.bridge_message = bridge_message

    if bridge_ok:
        codex_ok, codex_message, codex_info = bridge_codex_status(bridge_url)
        snapshot.codex_known = codex_ok
        snapshot.codex_message = codex_message
        snapshot.codex_installed = codex_info.get("installed")
        snapshot.codex_version = codex_info.get("version")
        snapshot.codex_binary_path = codex_info.get("binary_path")
        status, payload, _ = request_json(
            f"{bridge_url}{BRIDGE_INVOKE_PATH}",
            method="POST",
            body={"command": "agent_get_active", "args": {}},
            timeout=5.0,
        )
        if status == 200 and payload.get("ok") is True:
            active = payload.get("result")
            if isinstance(active, str):
                snapshot.active_agent = active

    frontend_ok, frontend_message = frontend_health_check(frontend_url)
    snapshot.frontend_ok = frontend_ok
    snapshot.frontend_message = frontend_message
    return snapshot


def format_snapshot(snapshot: StatusSnapshot) -> str:
    bridge = "已就绪" if snapshot.bridge_ok else "未就绪"
    frontend = "已就绪" if snapshot.frontend_ok else "未就绪"
    if snapshot.codex_known:
        codex_state = "可用" if snapshot.codex_installed else "不可用"
        codex_detail = snapshot.codex_version or "无版本信息"
    else:
        codex_state = "未知"
        codex_detail = snapshot.codex_message or "无法读取"
    active_agent = snapshot.active_agent or "未知"
    return (
        f"桥接: {bridge} | 前端: {frontend} | "
        f"运行环境: {codex_state} ({codex_detail}) | 当前智能体: {active_agent}"
    )


def print_snapshot(snapshot: StatusSnapshot) -> None:
    print(format_snapshot(snapshot))
    if snapshot.bridge_message:
        print(f"  - 桥接: {snapshot.bridge_message}")
    if snapshot.frontend_message:
        print(f"  - 前端: {snapshot.frontend_message}")
    if snapshot.codex_message:
        print(f"  - 运行环境: {snapshot.codex_message}")
    if snapshot.codex_binary_path:
        print(f"  - 运行环境路径: {snapshot.codex_binary_path}")


def open_browser(url: str) -> None:
    try:
        webbrowser.open(url, new=1, autoraise=True)
        print(f"[浏览器] 已尝试打开：{url}")
    except Exception as error:
        print(f"[浏览器] 自动打开失败，请手动访问：{url}（{error}）")


def wait_for_initial_services(
    bridge_service: ManagedService,
    frontend_service: ManagedService,
    bridge_url: str,
    frontend_url: str,
    timeout: float,
    open_browser_when_ready: bool,
) -> None:
    print("[启动] 正在等待桥接服务与前端服务就绪...")
    wait_for_service_ready(bridge_service, lambda: bridge_health_check(bridge_url), timeout)
    print(f"[桥接] {bridge_service.ready_message}")

    wait_for_service_ready(frontend_service, lambda: frontend_health_check(frontend_url), timeout)
    print(f"[前端] {frontend_service.ready_message}")

    snapshot = collect_snapshot(bridge_url, frontend_url)
    print_snapshot(snapshot)

    if open_browser_when_ready:
        time.sleep(BROWSER_OPEN_DELAY_SECONDS)
        open_browser(frontend_url)


def shutdown_services(services: list[ManagedService]) -> None:
    for service in services:
        service.ready = False
        terminate_process(service.process, service.name)
        service.process = None


def main() -> None:
    parser = build_arg_parser()
    args = parser.parse_args()

    if args.serve_frontend_static:
        serve_static_frontend(args.frontend_host, args.frontend_port, args.bridge_url or build_bridge_url(args.bridge_host, args.bridge_port))
        return

    show_startup_splash()
    show_pending_update_notice()
    ensure_packaged_environment()

    frontend_url = build_frontend_url(args.frontend_host, args.frontend_port)
    bridge_url = build_bridge_url(args.bridge_host, args.bridge_port)
    frontend_mode = select_frontend_mode(args.frontend_mode)

    if not FRONTEND_DIR.exists():
        raise FileNotFoundError(f"未找到前端目录：{FRONTEND_DIR}")

    npm_package = FRONTEND_DIR / "package.json"
    if frontend_mode == "dev" and not npm_package.exists():
        raise FileNotFoundError(f"未找到前端 package.json：{npm_package}")

    print_banner(frontend_url, bridge_url, args.bridge_port, args.frontend_port, auto_open_browser=not args.no_browser)
    print(
        f"  端口预检: 前端 {args.frontend_host}:{args.frontend_port} "
        f"{'占用' if is_port_open(args.frontend_host, args.frontend_port) else '空闲'}，"
        f"桥接 {args.bridge_host}:{args.bridge_port} "
        f"{'占用' if is_port_open(args.bridge_host, args.bridge_port) else '空闲'}"
    )
    log_event("startup", f"App root: {ROOT_DIR}")
    log_event("startup", f"Resource root: {RESOURCE_ROOT}")
    log_event("startup", f"Launcher entry: {LAUNCHER_ENTRY_PATH}")

    bridge_script = resolve_bridge_script()
    log_event("startup", f"Bridge script: {bridge_script}")
    log_event("startup", f"Frontend mode: {frontend_mode}")

    node_executable = resolve_node_executable()
    log_event("startup", f"Node: {node_executable}")
    if frontend_mode == "dev":
        vite_cli_js = resolve_vite_cli_js()
        log_event("startup", f"Vite CLI: {vite_cli_js}")
    else:
        dist_dir = resolve_frontend_dist_dir()
        log_event("startup", f"Static frontend dist: {dist_dir}")

    codex_runtime = ensure_lmentor_codex_runtime()
    log_event("startup", f"isolated runtime: {codex_runtime.kind} {codex_runtime.version} ({codex_runtime.platform})")
    log_event("startup", f"runtime binary: {codex_runtime.binary_path}")
    log_event("startup", f"runtime home: {codex_runtime.home_dir}")
    log_codex_runtime_diagnostics(codex_runtime)

    if frontend_mode == "dev" and not (FRONTEND_DIR / "node_modules").exists():
        raise RuntimeError("前端依赖未安装，请先进入 frontend-shell 执行 npm install。")

    bridge_service = ManagedService(
        name="bridge",
        command=[node_executable, str(bridge_script)],
        cwd=FRONTEND_DIR,
        env=build_bridge_env(args.bridge_host, args.bridge_port, codex_runtime),
        ready_check=lambda: bridge_health_check(bridge_url),
    )
    frontend_service = ManagedService(
        name="frontend",
        command=build_frontend_command(args.frontend_host, args.frontend_port, frontend_mode, bridge_url),
        cwd=ROOT_DIR if frontend_mode == "static" else FRONTEND_DIR,
        env=build_frontend_env(bridge_url),
        ready_check=lambda: frontend_health_check(frontend_url),
    )

    stop_event = threading.Event()

    def handle_signal(signum: int, _frame: Any) -> None:
        print(f"\n[停止] 收到信号 {signum}，正在关闭服务...")
        stop_event.set()

    signal.signal(signal.SIGINT, handle_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, handle_signal)

    try:
        force_restart_bridge_port(args.bridge_host, args.bridge_port)
        launch_service(bridge_service, allow_existing=False, port_probe=bridge_service.ready_check)
        launch_service(frontend_service, allow_existing=True, port_probe=frontend_service.ready_check)
        wait_for_initial_services(
            bridge_service,
            frontend_service,
            bridge_url,
            frontend_url,
            timeout=args.timeout,
            open_browser_when_ready=not args.no_browser,
        )

        last_status_line = ""
        while not stop_event.is_set():
            snapshot = collect_snapshot(bridge_url, frontend_url)
            status_line = format_snapshot(snapshot)
            if status_line != last_status_line:
                print(status_line)
                last_status_line = status_line

            for service in (bridge_service, frontend_service):
                if service.process is None:
                    ready, message = service.ready_check()
                    if ready:
                        service.ready = True
                        service.ready_message = message
                        continue

                    print(f"[{service.name}] 复用实例不可用，正在尝试接管并重新启动...")
                    service.existing_instance = False
                    service.ready = False
                    service.ready_message = ""
                    service.restarts = 0
                    service.process = spawn_process(service.name, service.command, service.cwd, service.env)
                    wait_for_service_ready(service, service.ready_check, args.timeout)
                    print(f"[{service.name}] 已恢复：{service.ready_message}")
                    if service.name == "frontend" and not args.no_browser:
                        open_browser(frontend_url)
                    break

                exit_code = service.process.poll()
                if exit_code is None:
                    continue

                service.last_exit_code = exit_code
                if stop_event.is_set():
                    continue

                print(f"[{service.name}] 进程异常退出，退出码 {exit_code}")
                if service.restarts < MAX_RESTARTS:
                    service.restarts += 1
                    print(f"[{service.name}] 准备自动重启（第 {service.restarts} 次）...")
                    time.sleep(1.0)
                    service.process = spawn_process(service.name, service.command, service.cwd, service.env)
                    wait_for_service_ready(service, service.ready_check, args.timeout)
                    print(f"[{service.name}] 已恢复：{service.ready_message}")
                    if service.name == "frontend" and not args.no_browser:
                        open_browser(frontend_url)
                    break

                print(f"[{service.name}] 达到最大重启次数，准备退出。")
                stop_event.set()
                break

            time.sleep(args.monitor_interval)

    finally:
        shutdown_services([frontend_service, bridge_service])


def shutil_which(command: str) -> bool:
    from shutil import which

    return which(command) is not None


def report_fatal_startup_error(error: BaseException) -> None:
    detail = "".join(traceback.format_exception(type(error), error, error.__traceback__))
    log_event("fatal", detail.rstrip(), level="ERROR")
    if os.name != "nt" or "--serve-frontend-static" in sys.argv:
        return

    try:
        import ctypes

        message = (
            "师门启动失败。\n\n"
            f"{error}\n\n"
            f"详细日志：{MAIN_LOG_FILE}"
        )
        ctypes.windll.user32.MessageBoxW(0, message, "师门启动失败", 0x10)
    except Exception:
        pass


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except BaseException as error:
        report_fatal_startup_error(error)
        raise SystemExit(1)
