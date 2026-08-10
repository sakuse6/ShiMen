from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Dict, List, Optional


class CommandStatus(str, Enum):
    OK = "ok"
    FAILED = "failed"
    NOT_IMPLEMENTED = "not_implemented"
    NOT_CHECKED = "not_checked"


class Capability(str, Enum):
    CHAT = "chat"
    PROJECTS = "projects"
    SESSIONS = "sessions"
    CONFIG = "config"
    RELAY = "relay"
    WORKTREE = "worktree"
    ZED_REMOTE = "zed_remote"
    STATUS = "status"
    FILES = "files"


@dataclass(slots=True)
class CommandEnvelope:
    command: str
    status: CommandStatus = CommandStatus.OK
    message: str = ""
    payload: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["status"] = self.status.value
        return data


@dataclass(slots=True)
class ContentBlock:
    type: str
    text: Optional[str] = None
    tool_use_id: Optional[str] = None
    name: Optional[str] = None
    input: Optional[Dict[str, Any]] = None
    content: Optional[Any] = None
    thinking: Optional[str] = None


@dataclass(slots=True)
class ChatMessage:
    role: str
    content: List[ContentBlock]
    timestamp: Optional[int] = None


@dataclass(slots=True)
class ChatRequest:
    project_path: str
    message: str
    session_id: Optional[str] = None


@dataclass(slots=True)
class ChatSession:
    agent_id: str
    session_id: str
    process_id: int


@dataclass(slots=True)
class ProjectInfo:
    name: str
    path: str
    encoded_name: str
    session_count: int = 0
    last_active: Optional[str] = None
    has_claude_md: bool = False
    agent_ids: List[str] = field(default_factory=list)
    initialized: bool = False


@dataclass(slots=True)
class SessionInfo:
    id: str
    path: str
    messages: List[ChatMessage] = field(default_factory=list)
    display_name: Optional[str] = None
    project_path: Optional[str] = None
    started_at: Optional[str] = None
    last_active: Optional[str] = None


@dataclass(slots=True)
class FilePreview:
    path: str
    content: str
    truncated: bool
    size: int


@dataclass(slots=True)
class RelayProfileInfo:
    id: str
    name: str
    base_url: str
    protocol: str
    relay_mode: str
    active: bool = False


@dataclass(slots=True)
class WorkspaceInfo:
    path: str
    branch: Optional[str] = None
    remote: Optional[str] = None
    base_branch: Optional[str] = None


@dataclass(slots=True)
class HealthStatus:
    installed: bool = False
    version: Optional[str] = None
    binary_path: Optional[str] = None
    error: Optional[str] = None

