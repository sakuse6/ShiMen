export interface Project {
  name: string;
  path: string;
  encoded_name: string;
  session_count: number;
  last_active: string | null;
  has_claude_md: boolean;
  agent_ids?: string[];
  initialized: boolean;
}

export interface ProjectMeta {
  custom_name?: string;
  tags?: string[];
  notes?: string;
}

export interface ProjectDirectoryEntry {
  name: string;
  path: string;
  relative_path: string;
  kind: "directory" | "file";
}

export interface ProjectDirectoryListing {
  path: string;
  entries: ProjectDirectoryEntry[];
}

export interface SessionActivityTool {
  id: string;
  name: string;
  status: "success" | "running" | "error";
}

export interface SessionActivityRound {
  turnNumber: number;
  userPreview: string;
  skills: string[];
  workflow: string | null;
  stage: string | null;
  notes: string[];
  tools: SessionActivityTool[];
}

export interface Message {
  role: string;
  content: ContentBlock[];
  timestamp: number | null;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown }
  | { type: "thinking"; thinking: string };

export interface Session {
  id: string;
  path: string;
  messages: Message[];
  started_at: string | null;
  display_name?: string;
  last_active: string | null;
  project_path?: string;
}

export interface SessionSearchResult {
  sessionId: string;
  matchCount: number;
  previewText: string;
  firstMatchIndex: number;
}

export interface HistoryEntry {
  display: string;
  timestamp: number | null;
  project: string | null;
  sessionId: string | null;
}

export interface PermissionsConfig {
  allow: string[] | null;
  deny: string[] | null;
  defaultMode: string | null;
  additionalDirectories: string[] | null;
}

export interface McpServerConfig {
  command: string | null;
  args: string[] | null;
  env: Record<string, unknown> | null;
  cwd: string | null;
  type: string | null;
  url: string | null;
}

export interface HookAction {
  type: string;
  command: string | null;
  timeout: number | null;
}

export interface HookMatcher {
  matcher: string | null;
  hooks: HookAction[];
}

export interface SandboxConfig {
  enabled: boolean | null;
  allowCommand: string[] | null;
  denyCommand: string[] | null;
  allowPath: string[] | null;
  denyPath: string[] | null;
  network: string | null;
  profile: string | null;
}

export interface ContextCompactionConfig {
  threshold: number | null;
  method: string | null;
}

export interface ClaudeConfig {
  model: string | null;
  env: Record<string, string> | null;
  enabledPlugins: Record<string, boolean> | null;
  skipDangerousModePermissionPrompt: boolean | null;
  permissions: PermissionsConfig | null;
  mcpServers: Record<string, McpServerConfig> | null;
  apiProvider: string | null;
  smallModel: string | null;
  largeModel: string | null;
  allowedTools: string[] | null;
  disallowedTools: string[] | null;
  hooks: Record<string, HookMatcher[]> | null;
  sandbox: SandboxConfig | null;
  verbose: boolean | null;
  maxTurns: number | null;
  contextCompaction: ContextCompactionConfig | null;
}

export interface ConfigTemplate {
  id: string;
  name: string;
  description: string;
  config: ClaudeConfig;
}

export interface Preset {
  id: string;
  name: string;
  description?: string;
  config: ClaudeConfig;
  createdAt: string;
}

export interface BackupEntry {
  name: string;
  path: string;
  timestamp: string | null;
}

export type Page = "chat" | "manage";

export type ManageTab =
  | "overview"
  | "roster"
  | "projects"
  | "sessions"
  | "providers"
  | "tools"
  | "enhancements"
  | "config"
  | "environment";

export interface AgentInfo {
  id: string;
  display_name: string;
  version: string;
  icon: string;
  enabled: boolean;
}

export interface RosterAgentProfile {
  id: string;
  name: string;
  role_title: string;
  summary: string;
  tone: string;
  custom_instructions: string;
  enabled_skill_ids: string[];
  enabled: boolean;
  builtin: boolean;
}

export interface AgentMemoryEntry {
  id: string;
  title: string;
  content: string;
  shared: boolean;
  visible_to: string[];
  hidden_for: string[];
  enabled: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface RosterModuleSnapshot {
  lineage_name: string;
  user_name: string;
  agents: RosterAgentProfile[];
  active_agent_id: string;
  updated_at: string | null;
  memories: AgentMemoryEntry[];
  memory_updated_at: string | null;
}

export interface CustomCommand {
  id: string;
  name: string;
  command: string;
  agentId?: string | null;
  projectPath: string | null;
}

export interface AgentCommandPreset {
  name: string;
  command: string;
}

export interface ProjectPermissions {
  defaultMode: string | null;
  allow: string[] | null;
  deny: string[] | null;
  approvalPolicy?: "untrusted" | "on-request" | "never" | null;
  sandboxMode?: "read-only" | "workspace-write" | "danger-full-access" | null;
}

export interface HookCommand {
  type: string;
  command: string;
}

export interface HookEntry {
  matcher: string | null;
  hooks: HookCommand[];
}

export interface ProjectSettings {
  permissions: ProjectPermissions | null;
  hooks: Record<string, HookEntry[]> | null;
  env: Record<string, string> | null;
  model: string | null;
}

export interface ProjectMergeInfo {
  [primary: string]: string[];
}

export interface ChatSession {
  agent_id: string;
  session_id: string;
  process_id: number;
}

export interface StreamChunk {
  session_id: string;
  event_type: string;
  data: NormalizedEvent;
}

export interface AgentStreamChunk extends StreamChunk {
  agent_id: string;
}

export type NormalizedEvent =
  | { kind: "text_delta"; delta: string }
  | { kind: "message"; content: ContentBlock[] }
  | { kind: "tool_use_start"; call_id: string; tool: string; input: unknown }
  | { kind: "tool_use_result"; call_id: string; output: unknown; is_error: boolean }
  | { kind: "thinking"; delta: string }
  | { kind: "approval_request"; request_id: string; approval_kind: string; payload: unknown }
  | { kind: "session_resolved"; session_id: string }
  | { kind: "turn_complete"; reason: string; usage: unknown | null }
  | { kind: "error"; message: string; recoverable: boolean }
  | { kind: "raw"; agent: string; raw: unknown };

export interface InputFile {
  data: string;
  filename: string;
  label: string | null;
}

export interface SavedFile {
  path: string;
  label: string;
  index: number;
  batch_id: string;
}

export interface SkillLibraryEntry {
  id: string;
  name: string;
  title: string;
  description: string;
  path: string;
  path_display?: string;
  directory: string;
  directory_display?: string;
  source: "codex" | "agents" | "project";
  system: boolean;
}

export interface SkillImportCheck {
  status: "success" | "warning" | "error";
  label: string;
  detail: string;
}

export interface SkillImportCandidate {
  name: string;
  title: string;
  description: string;
  source_path: string;
  source_directory: string;
  target_directory: string;
  target_directory_display?: string;
}

export interface SkillImportValidation {
  valid: boolean;
  checks: SkillImportCheck[];
  errors: string[];
  warnings: string[];
  skill: SkillImportCandidate | null;
  codex_instruction: string;
}

export interface SkillImportResult {
  installed: boolean;
  installed_at: string;
  entry: SkillLibraryEntry;
  validation: SkillImportValidation;
  target_directory: string;
  target_directory_display?: string;
  codex_instruction: string;
}

export type CodexRuntimeImportKind = "sessions" | "skills" | "mcp" | "plugins" | "config";

export interface CodexRuntimeImportCounts {
  sessions: number;
  active_session_jsonl: number;
  archived_session_jsonl: number;
  session_index: number;
  skills: number;
  system_skills: number;
  plugins: number;
  mcp_servers: number;
  config_files: number;
  sqlite_files: number;
}

export interface CodexRuntimeImportSourceRecord {
  id: string;
  label: string;
  kind: "system" | "active" | "custom";
  home: string;
  available: boolean;
  summary: CodexRuntimeImportCounts;
  warnings: string[];
}

export interface CodexRuntimeImportSourcesSnapshot {
  active_home: string;
  system_home: string;
  isolated: boolean;
  sources: CodexRuntimeImportSourceRecord[];
}

export interface CodexRuntimeImportHomeSnapshot {
  home: string;
  exists: boolean;
  same_as_active_home: boolean;
  active_home: string;
  system_home: string;
  paths: Record<string, string>;
  counts: CodexRuntimeImportCounts;
  mcp_server_names: string[];
  sensitive_paths_skipped: string[];
  warnings: string[];
  items: CodexRuntimeImportItem[];
}

export interface CodexRuntimeImportItem {
  kind: CodexRuntimeImportKind;
  title: string;
  count: number;
  available: boolean;
  source_path: string;
  target_path: string;
  strategy: string;
  status: "ready" | "empty" | "blocked" | "planned";
  warnings: string[];
}

export interface CodexRuntimeImportPreview {
  source: CodexRuntimeImportHomeSnapshot;
  target: CodexRuntimeImportHomeSnapshot;
  kinds: CodexRuntimeImportKind[];
  items: CodexRuntimeImportItem[];
  ready_to_apply: boolean;
  apply_route: string;
  notes: string[];
}

export interface CodexRuntimeImportRequest {
  sourceHome?: string;
  kinds?: CodexRuntimeImportKind[];
}

export interface CodexRuntimeImportResult {
  executed: boolean;
  status: "planned" | "completed" | "failed";
  message: string;
  backup?: {
    backup_root: string;
    entries: Array<{ label: string; path: string }>;
  };
  summary?: Record<string, unknown>;
  preview: CodexRuntimeImportPreview;
}

export interface OverviewSnapshot {
  phase: string;
  shell_ready: boolean;
  ui_provider: string;
  runtime_provider: string;
  control_plane: string;
  interface_boundary: string;
  projects: number;
  sessions: number;
  active_provider: string;
}

export type LmentorModuleStatus = "ready" | "planned" | "disabled";

export interface ProviderRecord {
  id: string;
  name: string;
  kind: string;
  status: "ready" | "planned" | "disabled";
  source: string;
  notes: string;
}

export interface ToolPluginRecord {
  id: string;
  name: string;
  type: "tool" | "plugin";
  status: "ready" | "planned";
  owner: string;
  notes: string;
}

export interface EnhancementRecord {
  id: string;
  name: string;
  status: "ready" | "planned";
  owner: string;
  notes: string;
}

export interface ProviderProfile {
  id: string;
  name: string;
  provider_id: string;
  base_url: string;
  model: string;
  models: string[];
  reasoning_effort: "low" | "medium" | "high" | "xhigh";
  protocol: "responses" | "chat_completions" | "custom";
  mode: "official" | "mixed_api" | "pure_api" | "aggregate";
  api_key_masked: string;
  config_contents: string;
  auth_contents: string;
  notes: string;
  source: string;
  active: boolean;
}

export interface ProviderSyncTarget {
  id: string;
  sources: string[];
  is_current_provider: boolean;
  is_manual: boolean;
  is_saved: boolean;
}

export interface ProviderModuleSnapshot {
  current_provider: string;
  active_profile_id: string;
  profiles: ProviderProfile[];
  sync_targets: ProviderSyncTarget[];
  last_sync_target: string | null;
  sync_message: string | null;
}

export interface ProviderProfileInput {
  id?: string;
  name: string;
  provider_id: string;
  base_url: string;
  model: string;
  models: string[];
  reasoning_effort: "low" | "medium" | "high" | "xhigh";
  protocol: "responses" | "chat_completions" | "custom";
  mode: "official" | "mixed_api" | "pure_api" | "aggregate";
  api_key: string;
  config_contents: string;
  auth_contents: string;
  notes: string;
  source: string;
}

export interface ProviderModelsFetchResult {
  models: string[];
  fetched_from: string;
}

export interface ManagedSessionRecord {
  id: string;
  title: string;
  project_path: string;
  project_name: string;
  project_encoded_name: string;
  provider_id: string;
  provider_label: string;
  started_at: string | null;
  last_active: string | null;
  rollout_path: string | null;
  archived: boolean;
  message_count: number;
  can_resume: boolean;
  can_delete: boolean;
  can_export: boolean;
}

export interface SessionManagerSnapshot {
  sessions: ManagedSessionRecord[];
  current_provider: string;
  total: number;
}

export interface SessionMarkdownExport {
  session_id: string;
  title: string;
  markdown: string;
  filename: string;
}

export type ContextEntryKind = "mcp" | "skill" | "plugin";

export interface ContextEntryRecord {
  id: string;
  kind: ContextEntryKind;
  title: string;
  summary: string;
  enabled: boolean;
  body: string;
  source: "config" | "lmentor";
}

export interface ToolsPluginsModuleSnapshot {
  mcp_servers: ContextEntryRecord[];
  skills: ContextEntryRecord[];
  plugins: ContextEntryRecord[];
}

export interface ContextEntryInput {
  kind: ContextEntryKind;
  id: string;
  title: string;
  summary: string;
  enabled: boolean;
  body: string;
}

export interface EnhancementsSettings {
  enhancements_enabled: boolean;
  computer_use_guard_enabled: boolean;
  plugin_marketplace_unlock: boolean;
  plugin_auto_expand: boolean;
  session_delete: boolean;
  markdown_export: boolean;
  paste_fix: boolean;
  force_chinese_locale: boolean;
  project_move: boolean;
  thread_id_badge: boolean;
  conversation_view: boolean;
  thread_scroll_restore: boolean;
  zed_remote_open: boolean;
  zed_remote_project_registry_enabled: boolean;
  zed_remote_sync_to_settings: boolean;
  upstream_worktree_create: boolean;
  service_tier_controls: boolean;
  goals_enabled: boolean;
  stepwise_enabled: boolean;
  stepwise_direct_send: boolean;
  stepwise_base_url: string;
  stepwise_api_key_env: string;
  stepwise_model: string;
  stepwise_max_items: number;
  stepwise_max_input_chars: number;
  stepwise_max_output_tokens: number;
  stepwise_timeout_ms: number;
  image_overlay_enabled: boolean;
  image_overlay_path: string;
  image_overlay_opacity: number;
}

export interface EnhancementModuleGroup {
  id: string;
  title: string;
  description: string;
  items: EnhancementRecord[];
}

export interface EnhancementsModuleSnapshot {
  settings: EnhancementsSettings;
  groups: EnhancementModuleGroup[];
}

export interface OverviewModuleSnapshot {
  shell_ready: boolean;
  lineage_name?: string;
  current_provider: string;
  provider_count: number;
  session_count: number;
  tool_count: number;
  enhancement_enabled_count: number;
  interface_boundary: string;
  runtime_provider: string;
  codex_runtime?: {
    kind: string;
    version: string | null;
    platform: string | null;
    binary_path: string;
    binary_path_display?: string;
    runtime_dir: string | null;
    runtime_dir_display?: string | null;
    app_root?: string;
    app_root_display?: string;
    project_runtime_root?: string;
    project_runtime_root_display?: string;
    project_binary_path?: string;
    project_binary_path_display?: string;
    project_binary_exists?: boolean;
    using_project_runtime?: boolean;
    home_dir: string;
    home_dir_display?: string;
    system_home_dir: string;
    isolated: boolean;
    installed: boolean;
    error: string | null;
    skill_sync?: {
      target_dir: string;
      target_dir_display?: string;
      roots: Array<{
        label: string;
        path: string;
        path_display?: string;
        role: string;
        exists: boolean;
        skill_count: number;
        system_skill_count: number;
        raw_skill_count?: number;
        unique_skill_count?: number;
        duplicate_skill_count?: number;
      }>;
      external_count: number;
      active_skill_count: number;
      codex_skill_count: number;
      agent_skill_count: number;
      synced_at: string | null;
    };
    diagnostic_log?: string[];
  };
  ui_provider: string;
  control_plane: string;
  sync_message: string | null;
}
