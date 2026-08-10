from __future__ import annotations

from dataclasses import dataclass
from typing import FrozenSet


@dataclass(frozen=True, slots=True)
class CommandSpec:
    name: str
    description: str


COMMANDS: FrozenSet[CommandSpec] = frozenset(
    {
        CommandSpec("capabilities", "Return exposed compatibility capabilities."),
        CommandSpec("codex_runtime_status", "Return isolated runtime health."),
        CommandSpec("codex_app_status", "Return Codex++ control-plane health."),
        CommandSpec("scan_projects", "List projects visible to the active runtime."),
        CommandSpec("list_sessions", "List sessions for a project."),
        CommandSpec("get_session_messages", "Fetch messages for a session."),
        CommandSpec("send_message", "Send a chat message via the isolated runtime."),
        CommandSpec("abort_chat", "Abort an active chat session."),
        CommandSpec("load_raw_config", "Read raw Codex config content."),
        CommandSpec("save_raw_config", "Persist raw Codex config content."),
        CommandSpec("list_relay_profiles", "List Codex++ relay profiles."),
        CommandSpec("activate_relay_profile", "Activate a relay profile."),
        CommandSpec("test_relay_profile", "Test a relay profile."),
        CommandSpec("upstream_worktree_defaults", "Return worktree defaults."),
        CommandSpec("upstream_worktree_create", "Create a worktree."),
        CommandSpec("list_zed_remote_projects", "List Zed remote projects."),
        CommandSpec("open_zed_remote", "Open a Zed remote project."),
    }
)
