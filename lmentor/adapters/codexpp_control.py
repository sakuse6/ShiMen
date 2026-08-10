from __future__ import annotations

from dataclasses import asdict
from typing import List

from ..contracts import CommandEnvelope, CommandStatus, FilePreview, HealthStatus, RelayProfileInfo, WorkspaceInfo


class CodexPlusPlusAdapter:
    """Control-plane adapter for Codex++-managed capabilities."""

    def capabilities(self) -> List[str]:
        return ["relay", "worktree", "zed_remote", "config", "status", "sessions"]

    def codex_app_status(self) -> HealthStatus:
        return HealthStatus(installed=False, version=None, binary_path=None, error="codex++ control plane not wired")

    def preflight(self, project_path: str) -> CommandEnvelope:
        return CommandEnvelope(
            command="preflight",
            status=CommandStatus.OK,
            message="preflight stub",
            payload={"project_path": project_path},
        )

    def load_raw_config(self):
        return {"path": "", "content": "", "format": "toml"}

    def save_raw_config(self, content: str):
        return {"status": "ok", "bytes": len(content)}

    def list_relay_profiles(self) -> List[RelayProfileInfo]:
        return []

    def activate_relay_profile(self, profile_id: str):
        return {"status": "ok", "profile_id": profile_id}

    def test_relay_profile(self, profile_id: str):
        return {"status": "ok", "profile_id": profile_id}

    def upstream_worktree_defaults(self):
        return {"status": "ok", "defaults": {}}

    def upstream_worktree_create(self, workspace: WorkspaceInfo):
        return {"status": "ok", "workspace": asdict(workspace)}

    def list_zed_remote_projects(self):
        return {"status": "ok", "projects": []}

    def open_zed_remote(self, project_id: str):
        return {"status": "ok", "project_id": project_id}

