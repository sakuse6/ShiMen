from __future__ import annotations

from dataclasses import asdict
from typing import List, Optional

from ..contracts import ChatMessage, ChatRequest, ChatSession, HealthStatus, ProjectInfo


class CodexRuntimeAdapter:
    """Thin runtime adapter for the user-visible isolated runtime layer."""

    def capabilities(self) -> List[str]:
        return ["chat", "projects", "sessions", "status", "files"]

    def status(self) -> HealthStatus:
        return HealthStatus(installed=False, version=None, binary_path=None, error="runtime not wired")

    def scan_projects(self) -> List[ProjectInfo]:
        return []

    def list_sessions(self, encoded_name: str) -> List[ChatMessage]:
        return []

    def get_session_messages(self, session_id: str, encoded_name: str) -> List[ChatMessage]:
        return []

    def send_message(self, request: ChatRequest) -> ChatSession:
        raise NotImplementedError("Isolated runtime adapter is not wired yet")

    def abort_chat(self, session_id: str):
        return {"status": "ok", "session_id": session_id}
