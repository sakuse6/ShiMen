"""Lmentor compatibility layer package.

This package defines the stable command and data contracts used by the new
Lmentor-windows fusion project. The first implementation is intentionally thin:
it preserves a Jishu Hub-like frontend contract while leaving room for a 隔离智能体运行环境 runtime adapter and a Codex++ control-plane adapter.
"""

from .contracts import (
    Capability,
    ChatMessage,
    ChatRequest,
    ChatSession,
    CommandEnvelope,
    CommandStatus,
    ContentBlock,
    FilePreview,
    HealthStatus,
    ProjectInfo,
    RelayProfileInfo,
    SessionInfo,
    WorkspaceInfo,
)
from .facade import LmentorFacade
from .registry import LmentorCommandRegistry
