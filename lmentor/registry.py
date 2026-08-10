from __future__ import annotations

from dataclasses import asdict
from typing import Any, Callable, Dict

from .contracts import ChatRequest, WorkspaceInfo
from .facade import LmentorFacade


class LmentorCommandRegistry:
    """Stable command registry for frontend consumption.

    The goal is to keep command names stable even if the internal backend
    implementation evolves from stubs into the real isolated runtime and control plane
    integration.
    """

    def __init__(self, facade: LmentorFacade | None = None) -> None:
        self.facade = facade or LmentorFacade()
        self._commands: Dict[str, Callable[[Dict[str, Any]], Any]] = {
            "capabilities": lambda payload: self.facade.capabilities().to_dict(),
            "codex_runtime_status": lambda payload: self.facade.codex_runtime_status().to_dict(),
            "codex_app_status": lambda payload: self.facade.codex_app_status().to_dict(),
            "scan_projects": lambda payload: self.facade.scan_projects().to_dict(),
            "list_sessions": lambda payload: self.facade.list_sessions(payload["encoded_name"]).to_dict(),
            "get_session_messages": lambda payload: self.facade.get_session_messages(
                payload["session_id"], payload["encoded_name"]
            ).to_dict(),
            "send_message": lambda payload: self.facade.send_message(
                ChatRequest(
                    project_path=payload["project_path"],
                    message=payload["message"],
                    session_id=payload.get("session_id"),
                )
            ).to_dict(),
            "abort_chat": lambda payload: self.facade.abort_chat(payload["session_id"]).to_dict(),
            "load_raw_config": lambda payload: self.facade.load_raw_config().to_dict(),
            "save_raw_config": lambda payload: self.facade.save_raw_config(payload["content"]).to_dict(),
            "list_relay_profiles": lambda payload: self.facade.list_relay_profiles().to_dict(),
            "activate_relay_profile": lambda payload: self.facade.activate_relay_profile(
                payload["profile_id"]
            ).to_dict(),
            "test_relay_profile": lambda payload: self.facade.test_relay_profile(payload["profile_id"]).to_dict(),
            "upstream_worktree_defaults": lambda payload: self.facade.upstream_worktree_defaults().to_dict(),
            "upstream_worktree_create": lambda payload: self.facade.upstream_worktree_create(
                WorkspaceInfo(
                    path=payload["path"],
                    branch=payload.get("branch"),
                    remote=payload.get("remote"),
                    base_branch=payload.get("base_branch"),
                )
            ).to_dict(),
            "list_zed_remote_projects": lambda payload: self.facade.list_zed_remote_projects().to_dict(),
            "open_zed_remote": lambda payload: self.facade.open_zed_remote(payload["project_id"]).to_dict(),
        }

    def dispatch(self, command: str, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
        payload = payload or {}
        if command not in self._commands:
            return {
                "command": command,
                "status": "not_implemented",
                "message": f"Unknown command: {command}",
                "payload": {},
            }
        return self._commands[command](payload)

    def list_commands(self) -> list[str]:
        return sorted(self._commands.keys())
