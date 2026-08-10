from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, List, Optional

from .contracts import (
    Capability,
    ChatRequest,
    ChatSession,
    CommandEnvelope,
    CommandStatus,
    HealthStatus,
    ProjectInfo,
    RelayProfileInfo,
    SessionInfo,
    WorkspaceInfo,
)
from .adapters.codex_runtime import CodexRuntimeAdapter
from .adapters.codexpp_control import CodexPlusPlusAdapter


class LmentorFacade:
    """Unified compatibility facade for the fusion project.

    Frontend calls this facade through a stable command set. The facade then
    delegates to the isolated runtime adapter and the control-plane layer
    adapter.
    """

    def __init__(
        self,
        runtime: Optional[CodexRuntimeAdapter] = None,
        control_plane: Optional[CodexPlusPlusAdapter] = None,
    ) -> None:
        self.runtime = runtime or CodexRuntimeAdapter()
        self.control_plane = control_plane or CodexPlusPlusAdapter()

    def capabilities(self) -> CommandEnvelope:
        return CommandEnvelope(
            command="capabilities",
            message="Compatibility layer capabilities",
            payload={
                "capabilities": [cap.value for cap in Capability],
                "runtime": self.runtime.capabilities(),
                "control_plane": self.control_plane.capabilities(),
            },
        )

    def codex_runtime_status(self) -> CommandEnvelope:
        return self._wrap("codex_runtime_status", self.runtime.status())

    def codex_app_status(self) -> CommandEnvelope:
        return self._wrap("codex_app_status", self.control_plane.codex_app_status())

    def scan_projects(self) -> CommandEnvelope:
        return self._wrap("scan_projects", {"projects": [asdict(p) for p in self.runtime.scan_projects()]})

    def list_sessions(self, encoded_name: str) -> CommandEnvelope:
        sessions = self.runtime.list_sessions(encoded_name)
        return self._wrap("list_sessions", {"sessions": [asdict(s) for s in sessions]})

    def get_session_messages(self, session_id: str, encoded_name: str) -> CommandEnvelope:
        messages = self.runtime.get_session_messages(session_id, encoded_name)
        return self._wrap("get_session_messages", {"messages": [asdict(m) for m in messages]})

    def send_message(self, request: ChatRequest) -> CommandEnvelope:
        preflight = self.control_plane.preflight(request.project_path)
        if preflight.status != CommandStatus.OK:
            return preflight
        try:
            session = self.runtime.send_message(request)
        except NotImplementedError as error:
            return CommandEnvelope(
                command="send_message",
                status=CommandStatus.NOT_IMPLEMENTED,
                message=str(error),
                payload={"project_path": request.project_path},
            )
        return self._wrap("send_message", asdict(session))

    def abort_chat(self, session_id: str) -> CommandEnvelope:
        return self._wrap("abort_chat", self.runtime.abort_chat(session_id))

    def load_raw_config(self) -> CommandEnvelope:
        return self._wrap("load_raw_config", self.control_plane.load_raw_config())

    def save_raw_config(self, content: str) -> CommandEnvelope:
        return self._wrap("save_raw_config", self.control_plane.save_raw_config(content))

    def list_relay_profiles(self) -> CommandEnvelope:
        profiles = self.control_plane.list_relay_profiles()
        return self._wrap("list_relay_profiles", {"profiles": [asdict(p) for p in profiles]})

    def activate_relay_profile(self, profile_id: str) -> CommandEnvelope:
        return self._wrap("activate_relay_profile", self.control_plane.activate_relay_profile(profile_id))

    def test_relay_profile(self, profile_id: str) -> CommandEnvelope:
        return self._wrap("test_relay_profile", self.control_plane.test_relay_profile(profile_id))

    def upstream_worktree_defaults(self) -> CommandEnvelope:
        return self._wrap("upstream_worktree_defaults", self.control_plane.upstream_worktree_defaults())

    def upstream_worktree_create(self, workspace: WorkspaceInfo) -> CommandEnvelope:
        return self._wrap("upstream_worktree_create", self.control_plane.upstream_worktree_create(workspace))

    def list_zed_remote_projects(self) -> CommandEnvelope:
        return self._wrap("list_zed_remote_projects", self.control_plane.list_zed_remote_projects())

    def open_zed_remote(self, project_id: str) -> CommandEnvelope:
        return self._wrap("open_zed_remote", self.control_plane.open_zed_remote(project_id))

    def _wrap(self, command: str, payload: Any) -> CommandEnvelope:
        if isinstance(payload, CommandEnvelope):
            return payload
        return CommandEnvelope(command=command, payload=payload if isinstance(payload, dict) else {"value": payload})
