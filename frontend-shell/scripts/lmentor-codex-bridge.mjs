import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import * as fsSync from "node:fs";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { spawn } from "node:child_process";

const HOST = process.env.LMENTOR_BRIDGE_HOST || "127.0.0.1";
const PORT = Number(process.env.LMENTOR_BRIDGE_PORT || 4318);
const APP_ROOT = path.resolve(process.env.LMENTOR_APP_ROOT || path.join(process.cwd(), ".."));
const DEFAULT_PROJECT_CODEX_ROOT = path.resolve(process.env.LMENTOR_CODEX_PROJECT_ROOT || path.join(APP_ROOT, "CDXAgent"));
const SYSTEM_CODEX_HOME = path.join(os.homedir(), ".codex");
const CODEX_HOME = process.env.LMENTOR_CODEX_HOME || process.env.CODEX_HOME || DEFAULT_PROJECT_CODEX_ROOT;
const CODEX_SESSIONS_DIR = path.join(CODEX_HOME, "sessions");
const AGENT_SKILL_INDEX_DIR = path.join(CODEX_HOME, "lmentor-runtime", "agent-skill-indexes");
const CODEX_ARCHIVED_SESSIONS_DIR = path.join(CODEX_HOME, "archived_sessions");
const CODEX_INDEX_PATH = path.join(CODEX_HOME, "session_index.jsonl");
const CODEX_GLOBAL_STATE_PATH = path.join(CODEX_HOME, ".codex-global-state.json");
const CODEX_CONFIG_PATH = path.join(CODEX_HOME, "config.toml");
const CODEX_AUTH_PATH = path.join(CODEX_HOME, "auth.json");
const CODEX_SQLITE_DIR = path.join(CODEX_HOME, "sqlite");
const CODEX_SKILLS_DIR = path.join(CODEX_HOME, "skills");
const WORKSPACE_SKILLS_DIR = path.join(process.cwd(), "skills");
const APP_ROOT_SKILLS_DIR = path.join(APP_ROOT, "skills");
const CODEX_CLI_PATH = process.env.LMENTOR_CODEX_CMD
  || path.join(DEFAULT_PROJECT_CODEX_ROOT, "bin", "codex.exe");
const CODEX_RUNTIME_DIR = process.env.LMENTOR_CODEX_RUNTIME_DIR || "";
const CODEX_PROJECT_ROOT = DEFAULT_PROJECT_CODEX_ROOT;
const CODEX_PROJECT_CMD = process.env.LMENTOR_CODEX_PROJECT_CMD || path.join(CODEX_PROJECT_ROOT, "bin", "codex.exe");
const CODEX_RUNTIME_KIND = process.env.LMENTOR_CODEX_RUNTIME_KIND || (process.env.LMENTOR_CODEX_CMD ? "managed" : "system");
const CODEX_RUNTIME_VERSION = process.env.LMENTOR_CODEX_RUNTIME_VERSION || "";
const CODEX_RUNTIME_PLATFORM = process.env.LMENTOR_CODEX_RUNTIME_PLATFORM || "";
const CODEX_ISOLATED_ENV = process.env.LMENTOR_CODEX_ISOLATED || "";
const CODEX_USING_PROJECT_RUNTIME_ENV = process.env.LMENTOR_CODEX_USING_PROJECT_RUNTIME || "";
const BRIDGE_STATE_PATH = path.join(CODEX_HOME, "lmentor-bridge-state.json");
const PYTHON_DEPENDENCY_INSTALLER_PATH = path.join(APP_ROOT, "scripts", "ensure_python_package.py");
const R_DEPENDENCY_INSTALLER_PATH = path.join(APP_ROOT, "scripts", "ensure_r_package.R");
const UTF8_WRITER_PATH = path.join(APP_ROOT, "scripts", "write_utf8_file.ps1");
const SESSION_FILE_ROOT = path.join(process.cwd(), "session_files");
const STRUCTURED_CONFIG_PATH = path.join(CODEX_HOME, "lmentor-structured-config.json");
const BACKUP_DIR = path.join(CODEX_HOME, "lmentor-config-backups");
const EXPORT_DIR = path.join(CODEX_HOME, "lmentor-exports");
const MANAGED_SKILL_MARKER = ".lmentor-skill-source.json";
const IMPORTED_SKILL_MARKER = ".lmentor-skill-import.json";
const DEFAULT_LINEAGE_NAME = "师门";
const DEFAULT_USER_NAME = "用户";
const DEFAULT_BUILTIN_AGENT_ID = "xiaodao";
const DEFAULT_BUILTIN_AGENT_NAME = "小导";
const LEGACY_BUILTIN_AGENT_IDS = new Set(["shizun"]);
const LEGACY_BUILTIN_AGENT_NAMES = new Set(["当前道身", "师尊"]);
const CLAUDE_OFFICIAL_BASE_URL = "https://api.anthropic.com/v1";
const CLAUDE_MODEL_CATALOG_ENDPOINT = "https://api.anthropic.com/v1/models";
const CLAUDE_API_VERSION = "2023-06-01";
const CLAUDE_BUILTIN_MODELS = [
  "claude-sonnet-5",
  "claude-opus-4-8",
  "claude-haiku-4-5",
  "claude-fable-5",
];
const SHARED_CNMODEL_SECTION_KEY = "CNModel";
const DOMESTIC_AGGREGATE_PROVIDER_IDS = new Set([
  "siliconflow",
  "qiniu",
  "aionly",
  "localmodel",
]);
const DISABLED_MODEL_PROVIDER_IDS = new Set([
  "claude",
]);

const KNOWN_CHINESE_SKILL_PURPOSES = {
  "academic-research-suite": "用于学术研究、文献综述、论文写作、稿件审查、研究流程规划和实验方案评估。",
  "browser": "用于控制应用内浏览器，打开页面、点击、输入、截图并验证网页行为。",
  "control-in-app-browser": "用于控制应用内浏览器，打开页面、点击、输入、截图并验证网页行为。",
  "deep-research": "用于执行深入研究、证据检索、事实核查、文献综述和研究问题收敛。",
  "documents": "用于创建、修改、批注文档，并在导出前进行版面渲染检查。",
  "find-skills": "用于发现、筛选和安装适合当前任务的能力扩展。",
  "imagegen": "用于生成或编辑位图图像，例如插画、照片风格图、纹理、图标草稿和透明背景素材。",
  "openai-docs": "用于查询官方接口、模型、产品和开发流程文档，辅助选择合适能力并更新提示。",
  "ophanim": "用于把指定范围内的对话整理成稳定的思维导图，重建流程、决策、分支和循环关系。",
  "pdf": "用于读取、创建、检查和渲染便携文档文件，并验证版面和抽取结果。",
  "plugin-creator": "用于创建和维护本地插件目录、清单文件和市场入口。",
  "presentations": "用于创建或编辑演示文稿，组织页面结构、内容和视觉排版。",
  "self-improving-agent": "用于记录技能使用经验并沉淀改进建议，帮助代理在后续任务中持续优化。",
  "skill-creator": "用于规划和编写新的技能说明，帮助把专业流程沉淀成可复用能力。",
  "skill-installer": "用于从可用列表或代码仓库安装技能到当前技能目录。",
  "spreadsheets": "用于创建、修改、分析表格文件，处理公式、格式、图表和数据校验。",
  "template-creator": "用于把常用文档、演示稿或表格样式沉淀成可复用模板。",
  "web-access": "用于规范联网检索、网页访问、登录后操作和动态页面读取流程。",
};

const clients = new Set();
const activeRuns = new Map();
const providerProbeCache = new Map();
const SKILL_LIBRARY_CACHE_TTL_MS = 60_000;
const agentSkillIndexEntriesCache = new Map();
let skillLibraryCache = {
  key: "",
  syncedAtMs: 0,
  externalEntries: [],
  codexEntries: [],
};
let lastSkillSyncSnapshot = {
  target_dir: CODEX_SKILLS_DIR,
  target_dir_display: toInternalDisplayPath(CODEX_SKILLS_DIR),
  roots: [],
  external_count: 0,
  active_skill_count: 0,
  codex_skill_count: 0,
  agent_skill_count: 0,
  synced_at: null,
};

const AGENT_DEFINITIONS = [
  {
    id: "codex",
    display_name: "主智能体运行环境",
    icon: "codex",
    binary: "codex",
    install_hint: "项目已内置主智能体运行环境。",
    native_install_command: "winget install OpenJS.NodeJS",
    capabilities: "1152922608506850305",
    process_matchers: ["codex", "@openai/codex"],
  },
  {
    id: "claude-code",
    display_name: "扩展智能体运行环境",
    icon: "claude-code",
    binary: "claude",
    install_hint: "扩展智能体运行环境暂未启用。",
    native_install_command: "winget install OpenJS.NodeJS",
    capabilities: "1125902114460415",
    process_matchers: ["claude", "@anthropic-ai/claude-code"],
  },
  {
    id: "opencode",
    display_name: "OpenCode",
    icon: "opencode",
    binary: "opencode",
    install_hint: "npm install -g opencode",
    native_install_command: "winget install OpenJS.NodeJS",
    capabilities: "1048577",
    process_matchers: ["opencode"],
  },
];

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(payload));
}

function withCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function broadcast(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    client.write(data);
  }
}

function encodeProjectPath(projectPath) {
  return projectPath.replace(":\\", "--").replaceAll("\\", "-").replaceAll("/", "-").replaceAll(" ", "-");
}

function normalizeProjectRoot(projectPath) {
  const raw = String(projectPath || "").trim().replace(/^"(.*)"$/, "$1");
  if (!raw) return "";

  const resolved = path.resolve(raw);
  const parsed = path.parse(resolved);
  return resolved === parsed.root ? resolved : resolved.replace(/[\\/]+$/, "");
}

function basenameSafe(projectPath) {
  const trimmed = projectPath.replace(/[\\\/]+$/, "");
  return path.basename(trimmed) || trimmed;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function timestampForFile() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "-",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
}

function defaultProjectSettings() {
  return {
    permissions: {
      defaultMode: "bypassPermissions",
      allow: null,
      deny: null,
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    },
    hooks: null,
    env: null,
    model: null,
  };
}

function defaultEnhancementsSettings() {
  return {
    enhancements_enabled: true,
    computer_use_guard_enabled: false,
    plugin_marketplace_unlock: true,
    plugin_auto_expand: true,
    session_delete: true,
    markdown_export: true,
    paste_fix: false,
    force_chinese_locale: true,
    project_move: true,
    thread_id_badge: false,
    conversation_view: false,
    thread_scroll_restore: true,
    zed_remote_open: true,
    zed_remote_project_registry_enabled: true,
    zed_remote_sync_to_settings: false,
    upstream_worktree_create: true,
    service_tier_controls: false,
    goals_enabled: false,
    stepwise_enabled: false,
    stepwise_direct_send: false,
    stepwise_base_url: "",
    stepwise_api_key_env: "CODEX_STEPWISE_API_KEY",
    stepwise_model: "",
    stepwise_max_items: 6,
    stepwise_max_input_chars: 6000,
    stepwise_max_output_tokens: 500,
    stepwise_timeout_ms: 8000,
    image_overlay_enabled: false,
    image_overlay_path: "",
    image_overlay_opacity: 35,
  };
}

function defaultContextEntries() {
  return {
    mcp_servers: [],
    skills: [],
    plugins: [],
  };
}

function defaultAppPrefs() {
  return {
    alwaysOnTop: false,
    theme: "dark",
    fontSizes: ["s", "s"],
    language: "zh",
    activeAgentId: "codex",
    downloadedInstallerPath: null,
    downloadedInstallerVersion: null,
  };
}

function defaultAgentRosterProfile() {
  return {
    id: DEFAULT_BUILTIN_AGENT_ID,
    name: DEFAULT_BUILTIN_AGENT_NAME,
    role_title: "学术导师",
    summary: "以学术导师身份协助用户推进研究设计、文献分析、论文写作、方案论证与任务拆解。",
    tone: "严谨、审慎、启发式，强调概念界定、证据等级、方法适切性与论证边界。",
    custom_instructions: [
      "优先采用学术导师式引导，先明确研究目标、问题范围、方法路径与预期产出。",
      "在提出建议时同步说明论证依据、适用前提、证据强弱与潜在限制。",
      "若任务信息不足，应先通过澄清性提问收敛问题定义，再进入分析与写作环节。",
    ].join("\n"),
    enabled_skill_ids: ["academic-research-suite", "web-access", "ophanim"],
    enabled: true,
    builtin: true,
  };
}

function emptyAgentRosterProfileDefaults() {
  return {
    name: "",
    role_title: "",
    summary: "",
    tone: "",
    custom_instructions: "",
    enabled_skill_ids: [],
    enabled: true,
    builtin: false,
  };
}

function defaultMultiAgentWorkflowFoundation() {
  return [
    "各 Agent 仅在既定角色边界内开展工作，不得混同行为定位，也不得代替其他 Agent 发言。",
    "当任务与其他 Agent 的职责范围更为匹配时，应先提出切换建议，并提供可直接承接的任务交接摘要。",
    "交接摘要至少应包括：任务目标、已知事实、既有判断、未决问题与建议的下一步行动。",
    "若当前 Agent 已具备独立完成任务的条件，应直接完成工作，不因多 Agent 并行而转移责任。",
  ];
}

function defaultAgentRosterState() {
  return {
    lineageName: "",
    userName: "",
    activeAgentId: DEFAULT_BUILTIN_AGENT_ID,
    profiles: [defaultAgentRosterProfile()],
    updatedAt: null,
  };
}

function defaultAgentMemoryState() {
  return {
    entries: [],
    updatedAt: null,
  };
}

function normalizeAgentMemoryEntry(entry, index = 0) {
  const hiddenFor = ensureArray(entry?.hidden_for)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const visibleTo = ensureArray(entry?.visible_to)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return {
    id: firstNonEmptyString(typeof entry?.id === "string" ? entry.id : "", `memory-${index + 1}`),
    title: typeof entry?.title === "string" ? entry.title : "",
    content: typeof entry?.content === "string" ? entry.content : "",
    shared: entry?.shared !== false,
    visible_to: [...new Set(visibleTo)],
    hidden_for: [...new Set(hiddenFor)],
    enabled: entry?.enabled !== false,
    created_at: typeof entry?.created_at === "string" ? entry.created_at : null,
    updated_at: typeof entry?.updated_at === "string" ? entry.updated_at : null,
  };
}

function normalizeAgentMemoryState(state) {
  const fallback = defaultAgentMemoryState();
  const entries = ensureArray(state?.entries)
    .map((entry, index) => normalizeAgentMemoryEntry(entry, index))
    .filter((entry, index, list) => list.findIndex((item) => item.id === entry.id) === index);
  return {
    entries,
    updatedAt: typeof state?.updatedAt === "string" ? state.updatedAt : fallback.updatedAt,
  };
}

function resolveVisibleAgentMemories(memoryState, agentProfile) {
  const agentId = String(agentProfile?.id || "").trim();
  if (!agentId) return [];
  return ensureArray(memoryState?.entries).filter((entry) => {
    if (!entry?.enabled) return false;
    const hiddenFor = ensureArray(entry.hidden_for).map((item) => String(item || "").trim());
    if (hiddenFor.includes(agentId)) return false;
    const visibleTo = ensureArray(entry.visible_to).map((item) => String(item || "").trim()).filter(Boolean);
    if (entry.shared) {
      return true;
    }
    return visibleTo.includes(agentId);
  });
}

function buildAgentMemoryPrompt(memoryEntries) {
  const visibleEntries = ensureArray(memoryEntries);
  if (visibleEntries.length === 0) {
    return "";
  }
  const lines = ["<LMENTOR_AGENT_MEMORY>"];
  for (const entry of visibleEntries) {
    const title = String(entry.title || "").trim();
    const content = String(entry.content || "").trim();
    if (!content) continue;
    lines.push(`- ${title || "记忆条目"}：${content}`);
  }
  if (lines.length === 1) {
    return "";
  }
  lines.push("这些记忆为当前名册层已知背景。仅在与本轮任务相关时自然使用，不要逐条复述。");
  lines.push("</LMENTOR_AGENT_MEMORY>");
  return lines.join("\n");
}

function defaultBridgeState() {
  return {
    json: 1,
    manualProjects: [],
    hiddenProjects: [],
    projectMetas: {},
    projectMerges: {},
    lastProjectEncoded: null,
    sessionNames: {},
    sessionProviders: {},
    sessionToolTrace: {},
    presets: [],
    customCommands: [],
    projectSettingsShared: {},
    projectSettingsLocal: {},
    terminalSessions: {},
    providerProfiles: [],
    providerSyncLastTarget: null,
    providerSyncMessage: null,
    agentRoster: defaultAgentRosterState(),
    agentMemory: defaultAgentMemoryState(),
    enhancementsSettings: defaultEnhancementsSettings(),
    contextEntries: defaultContextEntries(),
    appPrefs: defaultAppPrefs(),
  };
}

function normalizeAgentRosterProfile(profile, index = 0) {
  const isPrimaryBuiltin = index === 0 && profile?.builtin !== false;
  const fallback = isPrimaryBuiltin ? defaultAgentRosterProfile() : emptyAgentRosterProfileDefaults();
  const rawId = typeof profile?.id === "string" ? profile.id.trim() : "";
  const rawName = typeof profile?.name === "string" ? profile.name.trim() : "";
  const normalizedId = isPrimaryBuiltin && (LEGACY_BUILTIN_AGENT_IDS.has(rawId) || !rawId)
    ? fallback.id
    : firstNonEmptyString(rawId, isPrimaryBuiltin ? fallback.id : `agent-${index + 1}`);
  const normalizedName = isPrimaryBuiltin && (!rawName || LEGACY_BUILTIN_AGENT_NAMES.has(rawName))
    ? fallback.name
    : (typeof profile?.name === "string" ? profile.name : fallback.name);
  return {
    id: normalizedId,
    name: normalizedName,
    role_title: typeof profile?.role_title === "string" ? profile.role_title : fallback.role_title,
    summary: typeof profile?.summary === "string" ? profile.summary : fallback.summary,
    tone: typeof profile?.tone === "string" ? profile.tone : fallback.tone,
    custom_instructions: typeof profile?.custom_instructions === "string" ? profile.custom_instructions : fallback.custom_instructions,
    enabled_skill_ids: ensureArray(profile?.enabled_skill_ids).map((item) => String(item || "").trim()).filter(Boolean),
    enabled: profile?.enabled !== false,
    builtin: profile?.builtin !== false,
  };
}

function normalizeAgentRosterState(state) {
  const fallback = defaultAgentRosterState();
  const lineageName = typeof state?.lineageName === "string" ? state.lineageName.trim() : "";
  const userName = typeof state?.userName === "string" ? state.userName.trim() : "";
  const profiles = ensureArray(state?.profiles)
    .map((profile, index) => normalizeAgentRosterProfile(profile, index))
    .filter((profile, index, list) => list.findIndex((item) => item.id === profile.id) === index);
  const normalizedProfiles = profiles.length > 0 ? profiles : [defaultAgentRosterProfile()];
  const rawActiveAgentId = typeof state?.activeAgentId === "string" ? state.activeAgentId.trim() : "";
  const normalizedActiveAgentId = LEGACY_BUILTIN_AGENT_IDS.has(rawActiveAgentId)
    ? fallback.activeAgentId
    : rawActiveAgentId;
  const activeAgentId = firstNonEmptyString(
    normalizedActiveAgentId,
    normalizedProfiles.find((profile) => profile.enabled)?.id,
    normalizedProfiles[0]?.id,
    fallback.activeAgentId,
  );

  return {
    lineageName,
    userName,
    activeAgentId,
    profiles: normalizedProfiles.map((profile) => ({
      ...profile,
      enabled: profile.id === activeAgentId ? true : profile.enabled,
    })),
    updatedAt: typeof state?.updatedAt === "string" ? state.updatedAt : fallback.updatedAt,
  };
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeRemoveTree(targetPath) {
  if (!targetPath || !(await pathExists(targetPath))) return;
  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await fs.rm(targetPath, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 120,
      });
      return;
    } catch (error) {
      lastError = error;
      const code = typeof error?.code === "string" ? error.code : "";
      if (!["ENOTEMPTY", "EPERM", "EBUSY", "EACCES"].includes(code)) {
        throw error;
      }
      await delay(120 * (attempt + 1));
    }
  }
  throw lastError;
}

async function readBridgeState() {
  const stored = await readJson(BRIDGE_STATE_PATH, null);
  const base = defaultBridgeState();
  const state = stored && typeof stored === "object" && !Array.isArray(stored)
    ? stored
    : {};

  return {
    ...base,
    ...state,
    manualProjects: ensureArray(state.manualProjects),
    hiddenProjects: ensureArray(state.hiddenProjects),
    projectMetas: ensureObject(state.projectMetas),
    projectMerges: ensureObject(state.projectMerges),
    lastProjectEncoded: typeof state.lastProjectEncoded === "string" ? state.lastProjectEncoded : null,
    sessionNames: ensureObject(state.sessionNames),
    sessionProviders: ensureObject(state.sessionProviders),
    sessionToolTrace: ensureObject(state.sessionToolTrace),
    presets: ensureArray(state.presets),
    customCommands: ensureArray(state.customCommands),
    projectSettingsShared: ensureObject(state.projectSettingsShared),
    projectSettingsLocal: ensureObject(state.projectSettingsLocal),
    terminalSessions: ensureObject(state.terminalSessions),
    providerProfiles: ensureArray(state.providerProfiles),
    agentRoster: normalizeAgentRosterState(state.agentRoster),
    agentMemory: normalizeAgentMemoryState(state.agentMemory),
    enhancementsSettings: {
      ...base.enhancementsSettings,
      ...ensureObject(state.enhancementsSettings),
    },
    contextEntries: {
      ...base.contextEntries,
      ...ensureObject(state.contextEntries),
    },
    appPrefs: {
      ...base.appPrefs,
      ...ensureObject(state.appPrefs),
    },
  };
}

async function updateBridgeState(updater) {
  const current = await readBridgeState();
  const nextValue = await updater(clone(current));
  const merged = {
    ...current,
    ...(nextValue && typeof nextValue === "object" ? nextValue : {}),
  };
  await writeJson(BRIDGE_STATE_PATH, merged);
  return merged;
}

async function readGlobalState() {
  return ensureObject(await readJson(CODEX_GLOBAL_STATE_PATH, {}));
}

async function readTextIfExists(filePath) {
  if (!(await pathExists(filePath))) return "";
  return fs.readFile(filePath, "utf8");
}

function decodeXmlEntities(value) {
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const normalized = String(entity || "").toLowerCase();
    if (normalized === "amp") return "&";
    if (normalized === "lt") return "<";
    if (normalized === "gt") return ">";
    if (normalized === "quot") return "\"";
    if (normalized === "apos") return "'";
    if (normalized.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
    }
    if (normalized.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
    }
    return match;
  });
}

function parseXmlAttributes(source) {
  const attrs = {};
  const attrPattern = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = attrPattern.exec(String(source || "")))) {
    attrs[match[1]] = decodeXmlEntities(match[2] ?? match[3] ?? "");
  }
  return attrs;
}

function readZipEntries(buffer) {
  const entries = new Map();
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("未能识别 XLSX 文件结构。");

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let cursor = buffer.readUInt32LE(eocdOffset + 16);
  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.slice(cursor + 46, cursor + 46 + fileNameLength).toString("utf8").replace(/\\/g, "/");

    if (buffer.readUInt32LE(localHeaderOffset) === 0x04034b50) {
      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = buffer.slice(dataStart, dataStart + compressedSize);
      if (method === 0) {
        entries.set(name, Buffer.from(compressed));
      } else if (method === 8) {
        entries.set(name, zlib.inflateRawSync(compressed));
      }
    }

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function parseSharedStrings(xml) {
  const strings = [];
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let itemMatch;
  while ((itemMatch = itemPattern.exec(String(xml || "")))) {
    const fragments = [];
    const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let textMatch;
    while ((textMatch = textPattern.exec(itemMatch[1]))) {
      fragments.push(decodeXmlEntities(textMatch[1]));
    }
    strings.push(fragments.join(""));
  }
  return strings;
}

function resolveFirstWorksheetEntry(entries) {
  const workbookXml = entries.get("xl/workbook.xml")?.toString("utf8") || "";
  const relsXml = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8") || "";
  const firstSheetTag = workbookXml.match(/<sheet\b[^>]*>/)?.[0] || "";
  const sheetAttrs = parseXmlAttributes(firstSheetTag);
  const relationshipId = sheetAttrs["r:id"] || sheetAttrs.id || "";
  if (relationshipId && relsXml) {
    const relPattern = /<Relationship\b[^>]*>/g;
    let relMatch;
    while ((relMatch = relPattern.exec(relsXml))) {
      const attrs = parseXmlAttributes(relMatch[0]);
      if (attrs.Id !== relationshipId || !attrs.Target) continue;
      const target = attrs.Target.startsWith("/")
        ? attrs.Target.slice(1)
        : path.posix.join("xl", attrs.Target);
      const normalized = path.posix.normalize(target).replace(/\\/g, "/");
      if (entries.has(normalized)) return normalized;
    }
  }

  if (entries.has("xl/worksheets/sheet1.xml")) return "xl/worksheets/sheet1.xml";
  return Array.from(entries.keys()).find((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry)) || "";
}

function readWorksheetCells(xml, sharedStrings, refs) {
  const wanted = new Set(refs.map((ref) => ref.toUpperCase()));
  const values = {};
  const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
  let cellMatch;
  while ((cellMatch = cellPattern.exec(String(xml || "")))) {
    const attrs = parseXmlAttributes(cellMatch[1] || cellMatch[3] || "");
    const ref = String(attrs.r || "").toUpperCase();
    if (!wanted.has(ref)) continue;
    const body = cellMatch[2] || "";
    const type = attrs.t || "";
    let raw = "";

    if (type === "inlineStr") {
      const fragments = [];
      const textPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
      let textMatch;
      while ((textMatch = textPattern.exec(body))) fragments.push(decodeXmlEntities(textMatch[1]));
      raw = fragments.join("");
    } else {
      raw = decodeXmlEntities(body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || "");
      if (type === "s") {
        raw = sharedStrings[Number.parseInt(raw, 10)] || "";
      }
    }

    values[ref] = String(raw || "").trim();
  }
  return values;
}

async function loadQuoteCarouselItems() {
  const sourcePath = path.join(APP_ROOT, "1.xlsx");
  if (!(await pathExists(sourcePath))) {
    return {
      items: [],
      source_path: sourcePath,
      range: "A1:A21",
      error: "未找到应用根目录下的 1.xlsx。",
      updated_at: null,
    };
  }

  const workbookBuffer = await fs.readFile(sourcePath);
  const entries = readZipEntries(workbookBuffer);
  const worksheetEntry = resolveFirstWorksheetEntry(entries);
  if (!worksheetEntry) throw new Error("未找到 XLSX 的第一个工作表。");

  const worksheetXml = entries.get(worksheetEntry)?.toString("utf8") || "";
  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml")?.toString("utf8") || "");
  const refs = Array.from({ length: 21 }, (_, index) => `A${index + 1}`);
  const cells = readWorksheetCells(worksheetXml, sharedStrings, refs);
  const items = refs.map((ref) => cells[ref]).filter((item) => item && item.trim());
  const stat = await fs.stat(sourcePath);

  return {
    items,
    source_path: sourcePath,
    range: "A1:A21",
    sheet_entry: worksheetEntry,
    updated_at: stat.mtime.toISOString(),
    error: null,
  };
}

async function readCodexConfigContents() {
  return readTextIfExists(CODEX_CONFIG_PATH);
}

async function readSessionIndexEntries() {
  if (!(await pathExists(CODEX_INDEX_PATH))) return [];
  const raw = await fs.readFile(CODEX_INDEX_PATH, "utf8");
  const byId = new Map();

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      const id = typeof parsed?.id === "string" ? parsed.id : "";
      if (!id) continue;
      byId.set(id, parsed);
    } catch {
      // Ignore malformed rows.
    }
  }

  return Array.from(byId.values());
}

async function findSessionJsonlPaths(sessionId) {
  const trimmed = String(sessionId || "").trim();
  if (!trimmed) return [];

  const roots = [CODEX_SESSIONS_DIR, CODEX_ARCHIVED_SESSIONS_DIR];
  const found = new Set();

  for (const root of roots) {
    if (!(await pathExists(root))) continue;
    const files = await walkFiles(
      root,
      (fullPath, entry) => entry.isFile() && fullPath.toLowerCase().endsWith(".jsonl"),
    );

    for (const filePath of files) {
      const basename = path.basename(filePath);
      if (basename.includes(trimmed)) {
        found.add(filePath);
        continue;
      }

      try {
        const head = await readSessionMetadataHead(filePath, 8192);
        for (const line of head.split(/\r?\n/)) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line);
          if (extractSessionIdFromRawRecord(parsed) === trimmed) {
            found.add(filePath);
            break;
          }
        }
      } catch {
        // Ignore malformed or unreadable files and keep scanning.
      }
    }
  }

  return Array.from(found);
}

async function rewriteSessionIndexWithout(sessionId) {
  if (!(await pathExists(CODEX_INDEX_PATH))) return;

  const raw = await fs.readFile(CODEX_INDEX_PATH, "utf8");
  const kept = [];

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (extractSessionIdFromRawRecord(parsed) === sessionId) {
        continue;
      }
    } catch {
      // Preserve malformed lines rather than risking unrelated data loss.
    }
    kept.push(line);
  }

  if (kept.length === 0) {
    await fs.rm(CODEX_INDEX_PATH, { force: true });
    return;
  }

  await fs.writeFile(CODEX_INDEX_PATH, `${kept.join("\n")}\n`, "utf8");
}

async function buildSessionFileMap() {
  const files = await walkFiles(
    CODEX_SESSIONS_DIR,
    (fullPath, entry) => entry.isFile() && fullPath.toLowerCase().endsWith(".jsonl"),
  );
  const byId = new Map();

  for (const filePath of files) {
    const basename = path.basename(filePath);
    const match = basename.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i);
    if (match) {
      byId.set(match[1], filePath);
    }
  }

  return byId;
}

function extractTextFromContentItems(items) {
  return ensureArray(items)
    .map((item) => {
      if (typeof item?.text === "string") return item.text;
      if (typeof item?.input === "string") return item.input;
      if (typeof item?.output === "string") return item.output;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function stripSessionTitleArtifacts(value) {
  return stripRosterPromptEnvelope(String(value || ""))
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, "")
    .replace(/<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/gi, "")
    .replace(/<!--JISHU_HUB_IMAGES_BEGIN-->[\s\S]*?<!--JISHU_HUB_IMAGES_END-->/g, "")
    .replace(/<!--LMENTOR_FILE_CONTEXT_BEGIN-->[\s\S]*?<!--LMENTOR_FILE_CONTEXT_END-->/g, "")
    .replace(/<!--LMENTOR_ATTACHMENTS_BEGIN-->[\s\S]*?<!--LMENTOR_ATTACHMENTS_END-->/g, "")
    .replace(/<!--LMENTOR_SKILLS_BEGIN-->[\s\S]*?<!--LMENTOR_SKILLS_END-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSessionDisplayName(...candidates) {
  for (const candidate of candidates) {
    const normalized = stripSessionTitleArtifacts(normalizeDisplayText(candidate));
    if (!normalized) continue;
    return normalized.length > 72 ? `${normalized.slice(0, 69).trim()}...` : normalized;
  }
  return "";
}

function isPlaceholderSessionName(value) {
  const normalized = stripSessionTitleArtifacts(normalizeDisplayText(value));
  return !normalized || normalized === "新对话";
}

function pushMessage(messages, role, content, timestamp) {
  if (!Array.isArray(content) || content.length === 0) return;
  const previous = messages[messages.length - 1];
  const signature = JSON.stringify({ role, content });
  const previousSignature = previous
    ? JSON.stringify({ role: previous.role, content: previous.content })
    : null;
  if (signature === previousSignature) return;
  messages.push({ role, content, timestamp });
}

const OPHANIM_ARTIFACT_BLOCK_RE = /<!--LMENTOR_OPHANIM_IMAGE_BEGIN-->[\s\S]*?<!--LMENTOR_OPHANIM_IMAGE_END-->/;

function isOphanimMindMapText(text) {
  const normalized = String(text || "");
  return /(^|\n)#?\s*OPHANIM Mind Map\b/.test(normalized)
    && /(^|\n)\[n\d{3,}\]/.test(normalized);
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateForSvg(value, max = 72) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function wrapSvgText(value, maxChars = 25) {
  const text = truncateForSvg(value, maxChars * 3);
  const lines = [];
  for (let offset = 0; offset < text.length; offset += maxChars) {
    lines.push(text.slice(offset, offset + maxChars));
  }
  return lines.length > 0 ? lines : ["未识别节点"];
}

function extractOphanimNodes(text) {
  const nodes = [];
  const lineRe = /^\[(n\d{3,})\]\s+(.+)$/gm;
  let match = null;
  while ((match = lineRe.exec(String(text || ""))) !== null) {
    const rawLine = match[2];
    nodes.push({
      id: match[1],
      text: truncateForSvg(rawLine.replace(/\s+\[codex\.[^\]]+\]/g, ""), 82),
      structure: rawLine.match(/\[codex\.structure=([^\]]+)\]/)?.[1] || "process",
      relation: rawLine.match(/\[codex\.relation=([^\]]+)\]/)?.[1] || "next",
    });
  }
  return nodes;
}

function ophanimNodeColor(structure) {
  const palette = {
    decision: ["#f59e0b", "#fff7df"],
    branch: ["#8b5cf6", "#f4efff"],
    loop: ["#ef4444", "#fff0f1"],
    constraint: ["#0284c7", "#eff9ff"],
    question: ["#0f766e", "#ecfdf5"],
    reaction: ["#db2777", "#fff1f8"],
    process: ["#2563eb", "#eff6ff"],
  };
  return palette[structure] || ["#475569", "#f8fafc"];
}

function buildOphanimSvg(text) {
  const nodes = extractOphanimNodes(text);
  const width = 1920;
  const rootWidth = 310;
  const rootHeight = 116;
  const nodeWidth = 520;
  const branchGap = 30;
  const leftNodes = nodes.filter((_node, index) => index % 2 === 0);
  const rightNodes = nodes.filter((_node, index) => index % 2 === 1);
  const maxBranchSize = Math.max(leftNodes.length, rightNodes.length, 1);
  const height = Math.max(760, 190 + maxBranchSize * 145);
  const rootX = (width - rootWidth) / 2;
  const rootY = (height - rootHeight) / 2;

  const layoutBranch = (branch, side) => {
    const planned = branch.map((node) => ({ ...node, lines: wrapSvgText(node.text) }));
    const total = planned.reduce((sum, node) => sum + Math.max(96, 48 + node.lines.length * 23), 0)
      + Math.max(0, planned.length - 1) * branchGap;
    let cursor = Math.max(72, (height - total) / 2);
    return planned.map((node) => {
      const cardHeight = Math.max(96, 48 + node.lines.length * 23);
      const positioned = {
        ...node,
        x: side === "left" ? 110 : width - 110 - nodeWidth,
        y: cursor,
        width: nodeWidth,
        height: cardHeight,
        side,
      };
      cursor += cardHeight + branchGap;
      return positioned;
    });
  };

  const positionedNodes = [...layoutBranch(leftNodes, "left"), ...layoutBranch(rightNodes, "right")];
  const connectors = positionedNodes.map((node) => {
    const startX = node.side === "left" ? node.x + node.width : node.x;
    const startY = node.y + node.height / 2;
    const endX = node.side === "left" ? rootX : rootX + rootWidth;
    const endY = rootY + rootHeight / 2;
    const bend = node.side === "left" ? 130 : -130;
    const [accent] = ophanimNodeColor(node.structure);
    return `<path d="M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`;
  }).join("\n");
  const cards = positionedNodes.map((node) => {
    const [accent, fill] = ophanimNodeColor(node.structure);
    const tag = String(node.structure || "process").replace(/[-_]/g, " ");
    const lines = node.lines.map((line, index) => `<tspan x="${node.x + 34}" dy="${index === 0 ? 0 : 23}">${escapeXml(line)}</tspan>`).join("");
    return `<g>
      <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="18" fill="${fill}" stroke="${accent}" stroke-width="2"/>
      <rect x="${node.x + 20}" y="${node.y + 18}" width="76" height="25" rx="12.5" fill="${accent}"/>
      <text x="${node.x + 58}" y="${node.y + 35}" fill="#ffffff" font-size="13" font-weight="800" text-anchor="middle">${escapeXml(node.id)}</text>
      <text x="${node.x + 114}" y="${node.y + 36}" fill="${accent}" font-size="13" font-weight="700">${escapeXml(tag)}</text>
      <text x="${node.x + 34}" y="${node.y + 69}" fill="#172033" font-size="17" font-weight="600">${lines}</text>
    </g>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f7fafc"/>
  <rect x="34" y="30" width="${width - 68}" height="${height - 60}" rx="28" fill="#f8fffc" stroke="#d6e5e1"/>
  <text x="72" y="82" fill="#10201d" font-size="30" font-weight="800">OPHANIM Mind Map</text>
  <text x="72" y="110" fill="#64748b" font-size="15">Validated conversation structure rendered as a visual mind map</text>
  ${connectors}
  <g>
    <rect x="${rootX}" y="${rootY}" width="${rootWidth}" height="${rootHeight}" rx="28" fill="#10201d" stroke="#0f766e" stroke-width="3"/>
    <text x="${rootX + rootWidth / 2}" y="${rootY + 50}" fill="#ffffff" font-size="24" font-weight="800" text-anchor="middle">对话思维导图</text>
    <text x="${rootX + rootWidth / 2}" y="${rootY + 80}" fill="#b7d9d2" font-size="15" font-weight="600" text-anchor="middle">${nodes.length} 个已验证节点</text>
  </g>
  ${cards || `<text x="${width / 2}" y="${rootY + rootHeight + 52}" fill="#64748b" font-size="16" text-anchor="middle">No Ophanim nodes detected.</text>`}
</svg>`;
}

function sanitizeFilePart(value) {
  return String(value || "session").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "session";
}

function toMarkdownPath(filePath) {
  return path.resolve(filePath).replace(/\\/g, "/");
}

async function ensureOphanimArtifact(projectPath, sessionId, text) {
  const normalizedProjectPath = String(projectPath || "").trim();
  const sourceText = String(text || "");
  if (!normalizedProjectPath || !isOphanimMindMapText(sourceText)) return null;

  const hash = crypto.createHash("sha1").update(sourceText, "utf8").digest("hex").slice(0, 12);
  const artifactDir = path.join(normalizedProjectPath, ".lmentor", "ophanim");
  const outputPath = path.join(artifactDir, `ophanim-${sanitizeFilePart(sessionId)}-${hash}.svg`);
  await fs.mkdir(artifactDir, { recursive: true });
  if (!(await pathExists(outputPath))) {
    await fs.writeFile(outputPath, buildOphanimSvg(sourceText), "utf8");
  }

  const markdownPath = toMarkdownPath(outputPath);
  const snapshot = sourceText.match(/### OPHANIM SNAPSHOT[\s\S]*$/)?.[0] || "";
  return {
    path: outputPath,
    markdown: [
      "<!--LMENTOR_OPHANIM_IMAGE_BEGIN-->",
      `Ophanim 思维导图图片: ${outputPath}`,
      "<!--LMENTOR_OPHANIM_IMAGE_END-->",
      "",
      `![Ophanim 思维导图](${markdownPath})`,
      snapshot ? `\n<!--\n${snapshot}\n-->` : "",
    ].join("\n"),
  };
}

async function appendOphanimArtifactReference(text, projectPath, sessionId) {
  const raw = String(text || "");
  if (!raw || OPHANIM_ARTIFACT_BLOCK_RE.test(raw)) return raw;
  const artifact = await ensureOphanimArtifact(projectPath, sessionId, raw);
  return artifact?.markdown || raw;
}

async function ensureOphanimArtifactsInMessages(messages, projectPath, sessionId) {
  if (!projectPath) return messages;
  for (const message of messages) {
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block?.type !== "text" || typeof block.text !== "string") continue;
      block.text = await appendOphanimArtifactReference(block.text, projectPath, sessionId);
    }
  }
  return messages;
}

async function readSessionMetadataHead(filePath, bytes = 65536) {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function parseSessionMetadataFast(filePath, indexEntry = null) {
  let sessionId = typeof indexEntry?.id === "string" ? indexEntry.id : null;
  let projectPath = null;
  let startedAt = null;
  let lastActive = typeof indexEntry?.updated_at === "string" ? indexEntry.updated_at : null;
  let titleCandidate = "";

  let head = "";
  try {
    head = await readSessionMetadataHead(filePath);
  } catch {
    head = "";
  }

  for (const line of head.split(/\r?\n/)) {
    if (!line.trim()) continue;

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const timestampIso = typeof parsed?.timestamp === "string" ? parsed.timestamp : null;
    if (timestampIso && !lastActive) {
      lastActive = timestampIso;
    }

    if (parsed?.type === "session_meta") {
      sessionId = sessionId || parsed?.payload?.id || null;
      projectPath = typeof parsed?.payload?.cwd === "string" ? parsed.payload.cwd : projectPath;
      startedAt = typeof parsed?.payload?.timestamp === "string" ? parsed.payload.timestamp : startedAt;
      continue;
    }

    if (!titleCandidate && parsed?.type === "event_msg" && parsed?.payload?.type === "user_message") {
      titleCandidate = buildSessionDisplayName(parsed?.payload?.message);
      continue;
    }

    if (!titleCandidate && parsed?.type === "response_item" && parsed?.payload?.type === "message" && parsed?.payload?.role === "user") {
      titleCandidate = buildSessionDisplayName(extractTextFromContentItems(parsed?.payload?.content));
    }
  }

  if (!lastActive) {
    try {
      const stat = await fs.stat(filePath);
      lastActive = stat.mtime.toISOString();
    } catch {
      lastActive = null;
    }
  }

  const resolvedId = sessionId || extractSessionIdFromRawRecord(indexEntry) || path.basename(filePath, ".jsonl");
  return {
    id: resolvedId,
    path: filePath,
    messages: [],
    started_at: startedAt,
    display_name: buildSessionDisplayName(indexEntry?.thread_name, titleCandidate),
    last_active: lastActive,
    project_path: projectPath,
    project_encoded_name: projectPath ? encodeProjectPath(projectPath) : "",
  };
}

async function parseSessionRollout(filePath, indexEntry = null, includeMessages = true) {
  if (!includeMessages) {
    return parseSessionMetadataFast(filePath, indexEntry);
  }

  const raw = await fs.readFile(filePath, "utf8");
  const messages = [];
  let sessionId = typeof indexEntry?.id === "string" ? indexEntry.id : null;
  let projectPath = null;
  let startedAt = null;
  let lastActive = typeof indexEntry?.updated_at === "string" ? indexEntry.updated_at : null;
  let titleCandidate = "";
  const parsedToolCalls = new Map();
  const ignoredToolCallIds = new Set();
  const emittedToolStarts = new Set();
  const emittedToolResults = new Set();
  let artifactCandidates = new Set();

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const timestampIso = typeof parsed?.timestamp === "string" ? parsed.timestamp : null;
    const timestampMs = timestampIso ? Date.parse(timestampIso) : null;
    if (timestampIso) {
      lastActive = timestampIso;
    }

    if (parsed?.type === "session_meta") {
      sessionId = sessionId || parsed?.payload?.id || null;
      projectPath = typeof parsed?.payload?.cwd === "string" ? parsed.payload.cwd : projectPath;
      startedAt = typeof parsed?.payload?.timestamp === "string" ? parsed.payload.timestamp : startedAt;
      continue;
    }

    if (!includeMessages) continue;

    if (parsed?.type === "event_msg" && parsed?.payload?.type === "user_message") {
      const text = normalizeMessageText(parsed.payload.message);
      artifactCandidates = new Set();
      if (!titleCandidate) {
        titleCandidate = buildSessionDisplayName(text);
      }
      if (text) {
        pushUserReplayMessage(messages, text, timestampMs);
      }
      continue;
    }

    if (parsed?.type === "event_msg" && parsed?.payload?.type === "agent_message") {
      const rawText = normalizeMessageText(parsed.payload.message);
      const artifacts = parsed.payload.phase === "final_answer"
        ? await resolveGeneratedArtifacts(artifactCandidates, projectPath)
        : [];
      const text = appendArtifactReferences(rawText, artifacts);
      if (text) {
        if (isReplayThinkingPhase(parsed.payload.phase, text)) {
          pushAssistantReplayThinking(messages, text, timestampMs);
        } else {
          pushAssistantReplayMessage(messages, text, timestampMs);
        }
      }
      continue;
    }

    if (parsed?.type === "response_item" && parsed?.payload?.type === "message") {
      const role = parsed.payload.role;
      if (role !== "user" && role !== "assistant") continue;
      const text = normalizeMessageText(extractTextFromContentItems(parsed.payload.content));
      if (role === "user") artifactCandidates = new Set();
      if (!titleCandidate && role === "user") {
        titleCandidate = buildSessionDisplayName(text);
      }
      if (text) {
        if (role === "assistant") {
          const artifacts = parsed.payload.phase === "final_answer"
            ? await resolveGeneratedArtifacts(artifactCandidates, projectPath)
            : [];
          const replayText = appendArtifactReferences(text, artifacts);
          if (isReplayThinkingPhase(parsed.payload.phase, replayText)) {
            pushAssistantReplayThinking(messages, replayText, timestampMs);
          } else {
            pushAssistantReplayMessage(messages, replayText, timestampMs);
          }
        } else {
          pushUserReplayMessage(messages, text, timestampMs);
        }
      }
      continue;
    }

    if (parsed?.type === "response_item" && parsed?.payload?.type === "custom_tool_call") {
      const callId = String(parsed.payload.call_id || `tool-${messages.length + 1}`);
      const normalized = normalizeTraceToolPayload(parsed.payload);
      if (!normalized) {
        ignoredToolCallIds.add(callId);
        continue;
      }
      parsedToolCalls.set(callId, normalized);
      collectArtifactCandidates(normalized.input, projectPath, artifactCandidates);
      if (emittedToolStarts.has(callId)) continue;
      emittedToolStarts.add(callId);
      pushMessage(messages, "assistant", [{
        type: "tool_use",
        id: callId,
        name: normalized.name,
        input: normalized.input,
      }], timestampMs);
      continue;
    }

    if (parsed?.type === "response_item" && parsed?.payload?.type === "custom_tool_call_output") {
      const callId = String(parsed.payload.call_id || "");
      if (ignoredToolCallIds.delete(callId)) continue;
      if (emittedToolResults.has(callId)) continue;
      emittedToolResults.add(callId);
      const tool = parsedToolCalls.get(callId);
      collectArtifactCandidates(parsed.payload.output, projectPath, artifactCandidates);
      pushMessage(messages, "user", [{
        type: "tool_result",
        tool_use_id: callId,
        content: tool?.semantic === "index" ? "已读取当前 Agent 的已激活 Skill 索引。" : (tool?.semantic === "skill" ? "已读取 Skill 规范。" : (parsed.payload.output || "")),
      }], timestampMs);
      continue;
    }

    if (parsed?.type === "response_item" && parsed?.payload?.type === "function_call") {
      const callId = String(parsed.payload.call_id || parsed.payload.id || `tool-${messages.length + 1}`);
      const normalized = normalizeTraceToolPayload(parsed.payload);
      if (!normalized) {
        ignoredToolCallIds.add(callId);
        continue;
      }
      parsedToolCalls.set(callId, normalized);
      collectArtifactCandidates(normalized.input, projectPath, artifactCandidates);
      if (emittedToolStarts.has(callId)) continue;
      emittedToolStarts.add(callId);
      pushMessage(messages, "assistant", [{
        type: "tool_use",
        id: callId,
        name: normalized.name,
        input: normalized.input,
      }], timestampMs);
      continue;
    }

    if (parsed?.type === "response_item" && parsed?.payload?.type === "function_call_output") {
      const callId = String(parsed.payload.call_id || "");
      if (ignoredToolCallIds.delete(callId)) continue;
      if (emittedToolResults.has(callId)) continue;
      emittedToolResults.add(callId);
      const tool = parsedToolCalls.get(callId);
      collectArtifactCandidates(parsed.payload.output, projectPath, artifactCandidates);
      pushMessage(messages, "user", [{
        type: "tool_result",
        tool_use_id: callId,
        content: tool?.semantic === "index" ? "已读取当前 Agent 的已激活 Skill 索引。" : (tool?.semantic === "skill" ? "已读取 Skill 规范。" : (parsed.payload.output || "")),
      }], timestampMs);
    }
  }

  const resolvedId = sessionId || extractSessionIdFromRawRecord(indexEntry) || path.basename(filePath, ".jsonl");
  return {
    id: resolvedId,
    path: filePath,
    messages,
    started_at: startedAt,
    display_name: buildSessionDisplayName(indexEntry?.thread_name, titleCandidate),
    last_active: lastActive,
    project_path: projectPath,
    project_encoded_name: projectPath ? encodeProjectPath(projectPath) : "",
  };
}

async function listSessionsAllInternalLive(options = {}) {
  const includeMessages = options.includeMessages !== false;
  const [indexEntries, sessionFileMap] = await Promise.all([
    readSessionIndexEntries(),
    buildSessionFileMap(),
  ]);

  const indexById = new Map(indexEntries.map((entry) => [entry.id, entry]));
  const sessionIds = new Set([...indexById.keys(), ...sessionFileMap.keys()]);
  const sessions = [];

  for (const sessionId of sessionIds) {
    const rolloutPath = sessionFileMap.get(sessionId) || await findSessionJsonlPath(sessionId);
    if (!rolloutPath) continue;
    const session = await parseSessionRollout(rolloutPath, indexById.get(sessionId) || null, includeMessages);
    sessions.push(session);
  }

  sessions.sort((left, right) => (right.last_active || "").localeCompare(left.last_active || ""));
  return sessions;
}

async function buildSessionManagerLive(bridgeState, sessions) {
  const liveProfiles = await extractLiveProviderProfiles();
  const profiles = liveProfiles;
  const activeProfile = liveProfiles.find((profile) => profile.active) || getActiveProfile(liveProfiles);
  const providerById = new Map();
  for (const profile of ensureArray(profiles)) {
    const providerId = firstNonEmptyString(profile?.provider_id, profile?.id);
    if (!providerId) continue;
    providerById.set(providerId, profile);
  }
  const sessionProviders = ensureObject(bridgeState.sessionProviders);
  const records = sessions.map((session) => {
    const mappedProviderId = firstNonEmptyString(
      sessionProviders[session.id],
      activeProfile?.provider_id,
      "codex",
    );
    const mappedProfile = providerById.get(mappedProviderId) || activeProfile || null;
    return {
      id: session.id,
      title: session.display_name || "\u65b0\u5bf9\u8bdd",
      project_path: session.project_path || "",
      project_name: session.project_path ? basenameSafe(session.project_path) : "未归档项目",
      project_encoded_name: session.project_path ? encodeProjectPath(session.project_path) : "",
      provider_id: mappedProviderId,
      provider_label: mappedProfile?.name || mappedProviderId || "默认运行环境",
      started_at: session.started_at || null,
      last_active: session.last_active || null,
      rollout_path: session.path || null,
      archived: false,
      message_count: Array.isArray(session.messages) ? session.messages.length : 0,
      can_resume: true,
      can_delete: true,
      can_export: true,
    };
  });

  return {
    sessions: records,
    current_provider: activeProfile?.name || activeProfile?.provider_id || "默认运行环境",
    total: records.length,
  };
}

function buildSessionMarkdownExportLive(session) {
  const title = session.display_name || "\u65b0\u5bf9\u8bdd";
  const filenameBase = session.display_name || session.id;
  const sections = [`# ${title}`, ""];

  for (const message of ensureArray(session.messages)) {
    const heading = message.role === "user" ? "## User" : "## Assistant";
    sections.push(heading);
    for (const block of ensureArray(message.content)) {
      if (block?.type === "text" && typeof block.text === "string") {
        sections.push(block.text);
      } else if (block?.type === "tool_use") {
        sections.push(`- Tool: ${block.name}`);
      } else if (block?.type === "tool_result") {
        sections.push(`- Tool Result: ${typeof block.content === "string" ? block.content : JSON.stringify(block.content)}`);
      }
    }
    sections.push("");
  }

  return {
    session_id: session.id,
    title,
    markdown: sections.join("\n").trim(),
    filename: `${filenameBase.replace(/[\\/:*?"<>|]+/g, "_") || session.id}.md`,
  };
}

async function deleteLiveSessionRecord(sessionId) {
  const trimmed = String(sessionId || "").trim();
  if (!trimmed) return readBridgeState();

  const activeRun = activeRuns.get(trimmed);
  if (activeRun) {
    activeRun.kill();
    activeRuns.delete(trimmed);
  }

  const filePaths = await findSessionJsonlPaths(trimmed);
  await Promise.all(filePaths.map((filePath) => fs.rm(filePath, { force: true })));
  await rewriteSessionIndexWithout(trimmed);

  return updateBridgeState((state) => {
    const nextNames = { ...state.sessionNames };
    delete nextNames[trimmed];
    const nextProviders = { ...state.sessionProviders };
    delete nextProviders[trimmed];
    const nextTerminals = { ...state.terminalSessions };
    delete nextTerminals[trimmed];
    return {
      ...state,
      sessionNames: nextNames,
      sessionProviders: nextProviders,
      terminalSessions: nextTerminals,
    };
  });
}

function appendArtifactReferences(text, artifactPaths) {
  const uniquePaths = [...new Set(ensureArray(artifactPaths).map((item) => String(item || "").trim()).filter(Boolean))];
  const missingPaths = uniquePaths.filter((filePath) => !String(text || "").includes(filePath));
  if (missingPaths.length === 0) return String(text || "").trim();
  return `${String(text || "").trim()}\n\n已生成成果文件：\n${missingPaths.map((filePath) => `- ${filePath}`).join("\n")}`.trim();
}

function pushAssistantReplayMessage(messages, text, timestamp) {
  const previous = messages[messages.length - 1];
  const previousText = previous?.role === "assistant" && previous.content?.length === 1 && previous.content[0]?.type === "text"
    ? String(previous.content[0].text || "")
    : "";
  if (previousText.split(/\n\n已生成成果文件：\n/)[0] === String(text || "").trim()) {
    previous.content = [{ type: "text", text }];
    return;
  }
  pushMessage(messages, "assistant", [{ type: "text", text }], timestamp);
}

function hasFinalDeliveryHeading(value) {
  return /(?:^|\n)\s*(?:\*\*)?(?:已完成|交付物|主要限制|最终交付|分析结果|阶段结果|阶段成果|主要结果|已复核的分析结果|交接文件|关键限制|最终验收结果)(?:\*\*)?\s*(?:\n|$)/.test(String(value || "").trim());
}

function isReplayThinkingPhase(phase, text = "") {
  return ["commentary", "reasoning", "analysis", "planning"].includes(String(phase || "").trim().toLowerCase())
    && !hasFinalDeliveryHeading(text);
}

function pushAssistantReplayThinking(messages, thinking, timestamp) {
  const normalized = String(thinking || "").trim();
  if (!normalized) return;
  const previous = messages[messages.length - 1];
  const previousThinking = previous?.role === "assistant" && previous.content?.length === 1 && previous.content[0]?.type === "thinking"
    ? String(previous.content[0].thinking || "").trim()
    : "";
  if (previousThinking === normalized) return;
  pushMessage(messages, "assistant", [{ type: "thinking", thinking: normalized }], timestamp);
}

function pushUserReplayMessage(messages, text, timestamp) {
  const previous = messages[messages.length - 1];
  const previousText = previous?.role === "user" && previous.content?.length === 1 && previous.content[0]?.type === "text"
    ? normalizeMessageText(previous.content[0].text)
    : "";
  const nextText = normalizeMessageText(text);
  if (previousText && nextText && (previousText === nextText || previousText.endsWith(nextText) || nextText.endsWith(previousText))) return;
  pushMessage(messages, "user", [{ type: "text", text }], timestamp);
}

const ARTIFACT_FILE_PATTERN = /(?:[A-Za-z]:[\\/][^\r\n<>:"|?*]+|(?:\.lmentor[\\/]|\.\.?[\\/])?[^\r\n<>:"|?*\\/]+(?:[\\/][^\r\n<>:"|?*\\/]+)*\.(?:md|markdown|txt|pdf|docx?|pptx?|xlsx?|csv|svg|png|jpe?g|gif|webp|bmp|json|html?))/gi;
const MAX_ARTIFACT_CANDIDATES_PER_TURN = 24;

function collectArtifactCandidates(value, projectPath, candidates) {
  if (!projectPath || candidates.size >= MAX_ARTIFACT_CANDIDATES_PER_TURN) return;
  const text = runtimeValueToText(value);
  if (!text) return;
  ARTIFACT_FILE_PATTERN.lastIndex = 0;
  let match = ARTIFACT_FILE_PATTERN.exec(text);
  while (match && candidates.size < MAX_ARTIFACT_CANDIDATES_PER_TURN) {
    const rawPath = String(match[0] || "").trim().replace(/^['"`]+|['"`.,;:]+$/g, "");
    if (rawPath) {
      const resolved = path.resolve(projectPath, rawPath);
      if (isPathInside(projectPath, resolved)) candidates.add(resolved);
    }
    match = ARTIFACT_FILE_PATTERN.exec(text);
  }
  ARTIFACT_FILE_PATTERN.lastIndex = 0;
}

async function resolveGeneratedArtifacts(candidates, projectPath) {
  const verified = [];
  for (const candidate of [...candidates].slice(0, MAX_ARTIFACT_CANDIDATES_PER_TURN)) {
    if (!isPathInside(projectPath, candidate)) continue;
    try {
      if ((await fs.stat(candidate)).isFile()) verified.push(candidate);
    } catch {
      // A planned output is not an artifact until it exists on disk.
    }
  }
  return [...new Set(verified)].slice(0, 12);
}

function normalizeProviderProfile(profile, index = 0) {
  const authContents = String(profile?.auth_contents || "");
  const providerId = normalizeProviderIdentifier(profile?.provider_id || profile?.id || "OpenAI");
  const normalized = {
    id: String(profile?.id || `provider-${index + 1}`),
    name: String(profile?.name || providerId || `Provider ${index + 1}`),
    provider_id: providerId,
    base_url: String(profile?.base_url || ""),
    model: String(profile?.model || ""),
    models: ensureArray(profile?.models).map((item) => String(item)).filter(Boolean),
    reasoning_effort: normalizeReasoningEffort(profile?.reasoning_effort),
    protocol: ["responses", "chat_completions", "custom"].includes(profile?.protocol) ? profile.protocol : "responses",
    mode: ["official", "mixed_api", "pure_api", "aggregate"].includes(profile?.mode) ? profile.mode : "mixed_api",
    api_key_masked: String(profile?.api_key_masked || "").trim() || deriveMaskedApiKey(authContents, String(profile?.api_key || "")),
    config_contents: String(profile?.config_contents || ""),
    auth_contents: authContents,
    notes: String(profile?.notes || ""),
    source: String(profile?.source || "Lmentor"),
    active: Boolean(profile?.active),
  };
  if (isClaudeProvider(providerId)) {
    const filteredModels = ensureArray(normalized.models).filter((item) => isClaudeModelId(item));
    return {
      ...normalized,
      name: normalized.name || "扩展供应商",
      base_url: firstNonEmptyString(normalized.base_url, CLAUDE_OFFICIAL_BASE_URL),
      protocol: "chat_completions",
      mode: "official",
      reasoning_effort: normalizeReasoningEffort(normalized.reasoning_effort || "medium"),
      models: normalizeModelCatalog(
        filteredModels.length > 0 ? filteredModels : CLAUDE_BUILTIN_MODELS,
        firstNonEmptyString(isClaudeModelId(normalized.model) ? normalized.model : "", CLAUDE_BUILTIN_MODELS[0]),
      ),
      model: firstNonEmptyString(isClaudeModelId(normalized.model) ? normalized.model : "", CLAUDE_BUILTIN_MODELS[0]),
    };
  }
  return normalized;
}

function getActiveProfile(profiles) {
  const normalized = ensureArray(profiles);
  return normalized.find((item) => item?.active) || normalized[0] || null;
}

async function extractLiveProviderProfiles() {
  const [configContents, authContents, config] = await Promise.all([
    readTextIfExists(CODEX_CONFIG_PATH),
    readTextIfExists(CODEX_AUTH_PATH),
    readLiveCodexConfigObject(),
  ]);

  if (!configContents.trim() && !authContents.trim() && Object.keys(config).length === 0) {
    return [];
  }

  const providerSections = isPlainObject(config.model_providers) ? config.model_providers : {};
  const activeProviderId = normalizeProviderIdentifier(firstNonEmptyString(
    config.model_provider,
    config.api_provider,
    config.provider_id,
    config.provider,
  ));
  const sharedModel = firstNonEmptyString(config.model, config.large_model, config.small_model);
  const sharedModels = extractProviderModelsFromConfig(config, getProviderSectionSnapshot(config, activeProviderId), sharedModel);
  const sharedReasoning = normalizeReasoningEffort(config.model_reasoning_effort ?? config.reasoning_effort);
  const sharedProtocol = normalizeProviderProtocol(config.wire_api ?? config.protocol);

  const liveEntries = Object.entries(providerSections).filter(([providerId]) => !isDisabledModelProvider(providerId));

  const liveProfiles = liveEntries.map(([providerId, providerSection], index) =>
    buildLiveProviderProfile({
      providerId,
      providerSection,
      configContents,
      authContents,
      sharedModel,
      sharedModels,
      sharedReasoning,
      sharedProtocol,
      activeProviderId,
      index,
    }),
  );

  if (liveProfiles.length === 0) {
    liveProfiles.push(buildLiveProviderProfile({
      providerId: activeProviderId || "codex",
      providerSection: getProviderSectionSnapshot(config, activeProviderId),
      configContents,
      authContents,
      sharedModel,
      sharedModels,
      sharedReasoning,
      sharedProtocol,
      activeProviderId: activeProviderId || "codex",
      index: 0,
    }));
  } else if (activeProviderId && !liveProfiles.some((profile) => providerIdentifierEquals(profile.provider_id, activeProviderId))) {
    liveProfiles.unshift(buildLiveProviderProfile({
      providerId: activeProviderId,
      providerSection: getProviderSectionSnapshot(config, activeProviderId),
      configContents,
      authContents,
      sharedModel,
      sharedModels,
      sharedReasoning,
      sharedProtocol,
      activeProviderId,
      index: 0,
    }));
  }

  return liveProfiles;
}

async function extractCurrentProviderProfile() {
  const liveProfiles = await extractLiveProviderProfiles();
  return liveProfiles.find((profile) => profile.active) || liveProfiles[0] || null;
}

function findMatchingProviderProfile(profiles, rawProfile = {}) {
  const rawId = firstNonEmptyString(typeof rawProfile?.id === "string" ? rawProfile.id : "");
  const rawProviderId = normalizeProviderIdentifier(rawProfile?.provider_id);
  const rawName = firstNonEmptyString(typeof rawProfile?.name === "string" ? rawProfile.name : "");

  return ensureArray(profiles).find((profile) =>
    (rawId && profile?.id === rawId)
    || (rawProviderId && providerIdentifierEquals(profile?.provider_id, rawProviderId))
    || (rawName && String(profile?.name || "").trim() === rawName)
  ) || null;
}

function assertSupportedManagedProvider(providerId) {
  if (isDisabledModelProvider(providerId)) {
    throw new Error("当前版本已移除该扩展供应商接入，仅保留后续适配接口预留。");
  }
}

function mergeProviderProfiles(savedProfiles, currentProfiles = null) {
  const normalized = ensureArray(savedProfiles)
    .filter((profile) => !isDisabledModelProvider(profile?.provider_id || profile?.id))
    .map((profile, index) => normalizeProviderProfile(profile, index));
  const byId = new Map(normalized.map((profile) => [profile.id, profile]));
  const findExistingProfile = (profile) => {
    if (!profile) return null;
    const direct = byId.get(profile.id);
    if (direct) return direct;
    const providerId = normalizeProviderIdentifier(profile.provider_id);
    if (!providerId) return null;
    return normalized.find((item) => providerIdentifierEquals(item.provider_id, providerId)) || null;
  };

  for (const currentProfile of ensureArray(currentProfiles).filter(Boolean)) {
    const normalizedCurrent = normalizeProviderProfile(currentProfile, byId.size);
    const existing = findExistingProfile(normalizedCurrent);
    const mergedModel = firstNonEmptyString(normalizedCurrent.model, existing?.model);
    const mergedModels = normalizeModelCatalog([
      ...ensureArray(existing?.models),
      ...ensureArray(normalizedCurrent.models),
    ], mergedModel);
    const finalModels = isClaudeProvider(normalizedCurrent.provider_id)
      ? normalizeModelCatalog(
        mergedModels.filter((item) => isClaudeModelId(item)),
        mergedModel,
      )
      : mergedModels;

    if (existing && existing.id !== normalizedCurrent.id) {
      byId.delete(existing.id);
    }

    const mergedProfile = {
      ...(existing || {}),
      ...normalizedCurrent,
      id: existing?.id || normalizedCurrent.id,
      model: mergedModel,
      models: finalModels,
      active: Boolean(normalizedCurrent.active || existing?.active),
    };
    byId.set(mergedProfile.id, mergedProfile);
  }

  const merged = Array.from(byId.values());
  const currentActive = ensureArray(currentProfiles).find((profile) => profile?.active) || null;
  const activeId = currentActive?.id || "";
  const activeProviderId = normalizeProviderIdentifier(currentActive?.provider_id);

  if (activeId || activeProviderId) {
    for (const profile of merged) {
      profile.active = Boolean(
        (activeId && profile.id === activeId)
        || (activeProviderId && providerIdentifierEquals(profile.provider_id, activeProviderId))
      );
    }
  }

  if (!merged.some((profile) => profile.active) && merged[0]) {
    merged.forEach((profile, index) => {
      profile.active = index === 0;
    });
  }
  return merged;
}

async function buildProviderModuleLive(bridgeState, sessions) {
  const liveProfiles = await extractLiveProviderProfiles();
  const profiles = liveProfiles;
  const activeProfile = liveProfiles.find((profile) => profile.active) || getActiveProfile(liveProfiles);

  return {
    current_provider: activeProfile?.name || activeProfile?.provider_id || "默认运行环境",
    active_profile_id: activeProfile?.id || "",
    profiles,
    sync_targets: profiles.map((profile) => ({
      id: profile.id,
      sources: [profile.source || "Lmentor"],
      is_current_provider: profile.id === activeProfile?.id,
      is_manual: profile.source === "Lmentor",
      is_saved: profile.source !== "Lmentor",
    })),
    last_sync_target: bridgeState.providerSyncLastTarget || activeProfile?.id || null,
    sync_message: firstNonEmptyString(
      bridgeState.providerSyncMessage,
      sessions.length > 0 ? `已识别 ${sessions.length} 个会话。` : "",
    ) || null,
  };
}

async function assertActiveProviderReachable() {
  const bridgeState = await readBridgeState();
  const liveProfiles = await extractLiveProviderProfiles();
  const profiles = mergeProviderProfiles(bridgeState.providerProfiles, liveProfiles);
  const activeProfile = liveProfiles.find((profile) => profile.active) || getActiveProfile(profiles);

  if (!activeProfile) {
    throw new Error("当前未找到可用的供应商配置。");
  }

  if (!(await pathExists(CODEX_CLI_PATH))) {
    throw new Error(`未找到智能体运行环境：${CODEX_CLI_PATH}`);
  }

  return true;
}

function buildProviderModule(bridgeState, sessions) {
  return buildProviderModuleLive(bridgeState, sessions);
}

function buildProviderSummaryLive(module) {
  return {
    current_provider: module.current_provider,
    provider_count: ensureArray(module.profiles).length,
    active_profile_id: module.active_profile_id,
  };
}

async function buildAgentRosterModuleLive(bridgeState) {
  const roster = normalizeAgentRosterState(bridgeState.agentRoster);
  const memory = normalizeAgentMemoryState(bridgeState.agentMemory);
  return {
    lineage_name: roster.lineageName,
    user_name: roster.userName,
    agents: roster.profiles,
    active_agent_id: roster.activeAgentId,
    updated_at: roster.updatedAt,
    memories: memory.entries,
    memory_updated_at: memory.updatedAt,
  };
}

function resolveRosterAgentProfile(bridgeState, requestedAgentId = "") {
  const roster = normalizeAgentRosterState(bridgeState.agentRoster);
  const memoryState = normalizeAgentMemoryState(bridgeState.agentMemory);
  const requestedId = String(requestedAgentId || "").trim();
  const agent =
    (requestedId ? roster.profiles.find((profile) => profile.id === requestedId) : null)
    || roster.profiles.find((profile) => profile.id === roster.activeAgentId)
    || roster.profiles[0]
    || null;
  return { roster: { ...roster, memoryState }, agent };
}

function describeRosterTeammates(roster, activeAgentId) {
  return ensureArray(roster?.profiles)
    .filter((profile) => profile?.id !== activeAgentId)
    .map((profile) => `${displayRosterAgentName(profile)}：${profile.role_title}${profile.summary ? `；${profile.summary}` : ""}`);
}

function rosterSkillAlias(skillId) {
  const aliases = {
    "academic-research-suite": "学术研究",
    "web-access": "联网检索",
    "ophanim": "对话思维导图",
  };
  return aliases[String(skillId || "").trim()] || "名册授权能力";
}

function displayRosterAgentName(profile, fallback = "未命名 Agent") {
  const normalized = String(profile?.name || "").trim();
  return normalized || fallback;
}

function normalizeContextEntry(kind, entry, index = 0) {
  return {
    id: String(entry?.id || `${kind}-${index + 1}`),
    kind,
    title: String(entry?.title || entry?.name || `${kind}-${index + 1}`),
    summary: String(entry?.summary || ""),
    enabled: entry?.enabled !== false,
    body: typeof entry?.body === "string" ? entry.body : JSON.stringify(entry?.body || {}, null, 2),
    source: entry?.source === "config" ? "config" : "lmentor",
  };
}

async function buildToolsPluginsModuleLive(bridgeState) {
  const contextEntries = ensureObject(bridgeState.contextEntries);
  return {
    mcp_servers: ensureArray(contextEntries.mcp_servers).map((entry, index) => normalizeContextEntry("mcp", entry, index)),
    skills: ensureArray(contextEntries.skills).map((entry, index) => normalizeContextEntry("skill", entry, index)),
    plugins: ensureArray(contextEntries.plugins).map((entry, index) => normalizeContextEntry("plugin", entry, index)),
  };
}

function buildToolsSummaryLive(module) {
  return {
    total: ensureArray(module.mcp_servers).length + ensureArray(module.skills).length + ensureArray(module.plugins).length,
  };
}

function buildEnhancementGroups(settings) {
  return [
    {
      id: "workflow",
      title: "工作流",
      description: "围绕会话与工作区体验的增强项。",
      items: [
        { id: "conversation_view", name: "Conversation View", status: settings.conversation_view ? "ready" : "planned", owner: "Lmentor", notes: "对话视图增强。" },
        { id: "thread_scroll_restore", name: "Scroll Restore", status: settings.thread_scroll_restore ? "ready" : "planned", owner: "Lmentor", notes: "切换会话后恢复滚动位置。" },
      ],
    },
    {
      id: "project",
      title: "项目",
      description: "围绕项目、插件与工具接入的增强项。",
      items: [
        { id: "project_move", name: "Project Move", status: settings.project_move ? "ready" : "planned", owner: "Lmentor", notes: "项目迁移与归属修复能力。" },
        { id: "plugin_marketplace_unlock", name: "Plugin Marketplace", status: settings.plugin_marketplace_unlock ? "ready" : "planned", owner: "Lmentor", notes: "插件市场入口控制。" },
      ],
    },
    {
      id: "advanced",
      title: "高级",
      description: "Goals、Stepwise 与远程能力入口。",
      items: [
        { id: "goals_enabled", name: "Goals", status: settings.goals_enabled ? "ready" : "planned", owner: "Lmentor", notes: "Goals 能力总开关。" },
        { id: "stepwise_enabled", name: "Stepwise", status: settings.stepwise_enabled ? "ready" : "planned", owner: "Lmentor", notes: "Stepwise 调度入口。" },
      ],
    },
  ];
}

async function buildEnhancementsModuleLive(bridgeState) {
  const settings = {
    ...defaultEnhancementsSettings(),
    ...ensureObject(bridgeState.enhancementsSettings),
  };

  return {
    settings,
    groups: buildEnhancementGroups(settings),
  };
}

function buildEnhancementSummaryLive(module) {
  return {
    enhancement_enabled_count: Object.values(module.settings).filter((value) => value === true).length,
  };
}

async function buildOverviewModuleLive(bridgeState, sessions) {
  const [providerModule, toolsModule, enhancementsModule, codexRuntime] = await Promise.all([
    buildProviderModuleLive(bridgeState, sessions),
    buildToolsPluginsModuleLive(bridgeState),
    buildEnhancementsModuleLive(bridgeState),
    getCodexRuntimeSnapshot(),
  ]);

  const toolCount =
    ensureArray(toolsModule.mcp_servers).length
    + ensureArray(toolsModule.skills).length
    + ensureArray(toolsModule.plugins).length;
  const enhancementEnabledCount = Object.values(enhancementsModule.settings).filter((value) => value === true).length;

  return {
    shell_ready: true,
    lineage_name: normalizeAgentRosterState(bridgeState.agentRoster).lineageName,
    current_provider: providerModule.current_provider,
    provider_count: ensureArray(providerModule.profiles).length,
    session_count: sessions.length,
    tool_count: toolCount,
    enhancement_enabled_count: enhancementEnabledCount,
    interface_boundary: "前端只调用 Lmentor bridge，本地运行时能力通过统一接口接入。",
    runtime_provider: "隔离运行环境桥接",
    codex_runtime: codexRuntime,
    ui_provider: "Lmentor frontend shell",
    control_plane: "Lmentor local service",
    sync_message: providerModule.sync_message,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCodexFsPath(value) {
  if (typeof value !== "string") return "";
  return value.replace(/^\\\\\?\\/, "").trim();
}

function isPathInside(rootPath, targetPath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toPortableLocalPath(value) {
  const normalized = normalizeCodexFsPath(value);
  if (!normalized) return "";
  const resolved = path.resolve(normalized);
  const roots = [
    ["app://", APP_ROOT],
    ["codex-home://", CODEX_HOME],
    ["frontend://", process.cwd()],
  ];
  for (const [prefix, rootPath] of roots) {
    if (!rootPath || !isPathInside(rootPath, resolved)) continue;
    const relative = path.relative(path.resolve(rootPath), resolved).replace(/\\/g, "/");
    return relative ? `${prefix}${relative}` : prefix;
  }
  return resolved;
}

function toPortableMarkerSource(value) {
  const normalized = normalizeCodexFsPath(value);
  if (!normalized) return "";
  const portable = toPortableLocalPath(normalized);
  if (!/^[A-Za-z]:[\\/]/.test(portable)) return portable;
  return `external://${path.basename(normalized) || "source"}`;
}

function toInternalDisplayPath(value) {
  const normalized = normalizeCodexFsPath(value);
  if (!normalized) return "";
  const resolved = path.resolve(normalized);
  const roots = [
    [APP_ROOT, "."],
    [CODEX_HOME, "CODEX_HOME"],
    [process.cwd(), "frontend"],
  ];
  for (const [rootPath, label] of roots) {
    if (!rootPath || !isPathInside(rootPath, resolved)) continue;
    const relative = path.relative(path.resolve(rootPath), resolved).replace(/\\/g, "/");
    if (!relative) return label;
    return label === "." ? `./${relative}` : `${label}/${relative}`;
  }
  return resolved;
}

function fromPortableLocalPath(value) {
  const raw = normalizeCodexFsPath(value);
  if (!raw) return "";
  const roots = [
    ["app://", APP_ROOT],
    ["codex-home://", CODEX_HOME],
    ["frontend://", process.cwd()],
  ];
  for (const [prefix, rootPath] of roots) {
    if (raw === prefix) return path.resolve(rootPath);
    if (raw.startsWith(prefix)) {
      return path.resolve(rootPath, raw.slice(prefix.length));
    }
  }
  return path.resolve(raw);
}

function parseSimpleFrontmatter(source) {
  if (typeof source !== "string") return {};
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return {};
  const result = {};
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex < 0) continue;
    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    if (key) result[key] = value;
  }
  return result;
}

function stripFrontmatter(source) {
  if (typeof source !== "string") return "";
  return source.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
}

function deriveSkillSummary(source) {
  const body = stripFrontmatter(source);
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    return line;
  }
  return "";
}

function canonicalSkillName(value) {
  return String(value || "")
    .trim()
    .replace(/^Skill:\s*/i, "")
    .replace(/\.imported-\d{8}-\d{6}$/i, "")
    .toLowerCase();
}

function lookupChineseSkillPurpose(...values) {
  for (const value of values) {
    const normalized = canonicalSkillName(value);
    if (KNOWN_CHINESE_SKILL_PURPOSES[normalized]) return KNOWN_CHINESE_SKILL_PURPOSES[normalized];
    const suffix = normalized.includes(":") ? normalized.split(":").pop() : normalized;
    if (KNOWN_CHINESE_SKILL_PURPOSES[suffix]) return KNOWN_CHINESE_SKILL_PURPOSES[suffix];
  }
  return "";
}

function isImportedConflictSkill(entry) {
  const directoryName = path.basename(String(entry?.directory || entry?.name || ""));
  return /\.imported-\d{8}-\d{6}$/i.test(directoryName);
}

function cleanChinesePurpose(value) {
  const line = String(value || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^[\s"'`“”‘’\-:：]+|[\s"'`“”‘’]+$/g, "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)[0] || "";
  return line.slice(0, 240);
}

function fallbackChineseSkillPurpose({ name, title }) {
  return lookupChineseSkillPurpose(name, title)
    || "未提供能力说明。";
}

function pickChineseSkillDescription({ marker, meta, raw, name, title }) {
  const candidates = [
    marker.zh_description,
    marker.chinese_description,
    meta.zh_description,
    meta.chinese_description,
    meta.description,
    deriveSkillSummary(raw),
  ];
  for (const candidate of candidates) {
    const cleaned = cleanChinesePurpose(candidate);
    if (cleaned) return cleaned;
  }
  return fallbackChineseSkillPurpose({ name, title });
}

function readAuthEnvOverridesSync() {
  try {
    if (!fsSync.existsSync(CODEX_AUTH_PATH)) return {};
    const raw = fsSync.readFileSync(CODEX_AUTH_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return {};
    const overrides = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!/^[A-Z0-9_]+$/.test(key)) continue;
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      overrides[key] = trimmed;
    }
    return overrides;
  } catch {
    return {};
  }
}

function buildCodexChildEnv(extra = {}) {
  const env = { ...process.env, ...readAuthEnvOverridesSync(), ...extra };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  const originalPath = String(env[pathKey] || "");
  const extraPathParts = [
    path.dirname(CODEX_CLI_PATH),
    path.join(CODEX_HOME, "codex-path"),
  ].filter(Boolean);
  env[pathKey] = [...extraPathParts, originalPath].filter(Boolean).join(path.delimiter);
  env.CODEX_HOME = CODEX_HOME;
  env.LMENTOR_CODEX_HOME = CODEX_HOME;
  // Keep CLI home-directory discovery inside the managed runtime as well.
  // Some skill loaders scan ~/.agents independently of CODEX_HOME on Windows.
  const homeRoot = path.parse(CODEX_HOME).root;
  env.HOME = CODEX_HOME;
  env.USERPROFILE = CODEX_HOME;
  env.HOMEDRIVE = homeRoot.replace(/[\\/]+$/, "");
  env.HOMEPATH = path.relative(homeRoot, CODEX_HOME).replace(/\//g, "\\") || "\\";
  env.CLAUDE_SKILL_DIR = path.join(CODEX_SKILLS_DIR, "web-access");
  env.LMENTOR_CODEX_CMD = CODEX_CLI_PATH;
  env.LMENTOR_CODEX_RUNTIME_DIR = CODEX_RUNTIME_DIR || CODEX_HOME;
  env.LMENTOR_CODEX_PROJECT_ROOT = CODEX_PROJECT_ROOT;
  env.LMENTOR_CODEX_ISOLATED = "1";
  env.LMENTOR_CODEX_USING_PROJECT_RUNTIME = isPathInside(CODEX_PROJECT_ROOT, CODEX_CLI_PATH) ? "1" : "0";
  env.LMENTOR_UTF8_WRITER = process.env.LMENTOR_UTF8_WRITER || UTF8_WRITER_PATH;
  env.PYTHONUTF8 = "1";
  env.PYTHONIOENCODING = "utf-8";
  return env;
}

async function readSkillMetadata(skillDir) {
  const imported = await readJson(path.join(skillDir, IMPORTED_SKILL_MARKER), null);
  const managed = await readJson(path.join(skillDir, MANAGED_SKILL_MARKER), null);
  return {
    ...ensureObject(managed),
    ...ensureObject(imported),
  };
}

async function readSkillLibraryEntry(skillDir, source, system) {
  const skillPath = path.join(skillDir, "SKILL.md");
  if (!(await pathExists(skillPath))) return null;
  const raw = await fs.readFile(skillPath, "utf8");
  const meta = parseSimpleFrontmatter(raw);
  const marker = await readSkillMetadata(skillDir);
  const name = path.basename(skillDir);
  const title = String(meta.name || name);
  const description = pickChineseSkillDescription({ marker, meta, raw, name, title });
  return {
    id: `${source}:${system ? "system:" : ""}${name}`,
    name,
    title,
    description,
    path: skillPath,
    path_display: toInternalDisplayPath(skillPath),
    directory: skillDir,
    directory_display: toInternalDisplayPath(skillDir),
    source,
    system,
  };
}

function uniquePaths(paths) {
  const seen = new Set();
  return paths.filter((entry) => {
    const normalized = path.resolve(String(entry || ""));
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function uniqueSkillRoots(roots) {
  const seen = new Set();
  const result = [];
  for (const root of roots) {
    const rootPath = String(root?.path || "").trim();
    if (!rootPath) continue;
    const normalized = path.resolve(rootPath);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push({
      label: String(root?.label || path.basename(normalized) || "skills"),
      path: normalized,
      role: String(root?.role || "project"),
    });
  }
  return result;
}

async function readManagedSkillMarker(skillDir) {
  const markerPath = path.join(skillDir, MANAGED_SKILL_MARKER);
  if (!(await pathExists(markerPath))) return null;
  return await readJson(markerPath, null);
}

async function listStandardSkillRoot(baseDir, source, { skipManaged = false } = {}) {
  const discovered = [];
  if (!(await pathExists(baseDir))) return discovered;
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const entryPath = path.join(baseDir, entry.name);
    const managedMarker = skipManaged && entry.name !== ".system" ? await readManagedSkillMarker(entryPath) : null;
    if (managedMarker?.source === "project") {
      continue;
    }
    if (entry.name === ".system") {
      const systemEntries = await fs.readdir(entryPath, { withFileTypes: true });
      for (const systemEntry of systemEntries) {
        if (!systemEntry.isDirectory()) continue;
        const record = await readSkillLibraryEntry(path.join(entryPath, systemEntry.name), source, true);
        if (record) discovered.push(record);
      }
      continue;
    }

    const record = await readSkillLibraryEntry(entryPath, source, false);
    if (record) discovered.push(record);
  }
  return discovered;
}

async function listExternalSkillRoot(baseDir) {
  const discovered = [];
  if (!(await pathExists(baseDir))) return discovered;

  const directSkill = await readSkillLibraryEntry(baseDir, "project", false);
  if (directSkill) {
    discovered.push(directSkill);
    return discovered;
  }

  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const entryPath = path.join(baseDir, entry.name);
    if (entry.name === ".system") {
      const systemEntries = await fs.readdir(entryPath, { withFileTypes: true });
      for (const systemEntry of systemEntries) {
        if (!systemEntry.isDirectory()) continue;
        const record = await readSkillLibraryEntry(path.join(entryPath, systemEntry.name), "project", true);
        if (record) discovered.push(record);
      }
      continue;
    }

    const record = await readSkillLibraryEntry(entryPath, "project", false);
    if (record) discovered.push(record);
  }

  return discovered;
}

function resolveDynamicSkillRootRecords(projectPath) {
  const runtimeRoot = CODEX_RUNTIME_DIR ? path.resolve(CODEX_RUNTIME_DIR) : "";
  const baseRoots = [
    { label: "frontend-shell skills", path: WORKSPACE_SKILLS_DIR, role: "workspace" },
    { label: "app-root skills", path: APP_ROOT_SKILLS_DIR, role: "app-root" },
    { label: "app-root .lmentor skills", path: path.join(APP_ROOT, ".lmentor", "skills"), role: "app-root" },
    { label: "app-root .codex skills", path: path.join(APP_ROOT, ".codex", "skills"), role: "app-root" },
    { label: "app-root .agents skills", path: path.join(APP_ROOT, ".agents", "skills"), role: "app-root" },
    { label: "项目运行环境 skills", path: path.join(CODEX_PROJECT_ROOT, "skills"), role: "project-codex" },
    { label: "项目运行环境 .codex skills", path: path.join(CODEX_PROJECT_ROOT, ".codex", "skills"), role: "project-codex" },
    { label: "项目运行环境 .agents skills", path: path.join(CODEX_PROJECT_ROOT, ".agents", "skills"), role: "project-codex" },
  ];

  if (runtimeRoot && path.resolve(runtimeRoot) !== path.resolve(CODEX_PROJECT_ROOT)) {
    baseRoots.push(
      { label: "active runtime skills", path: path.join(runtimeRoot, "skills"), role: "runtime" },
      { label: "active runtime .codex skills", path: path.join(runtimeRoot, ".codex", "skills"), role: "runtime" },
      { label: "active runtime .agents skills", path: path.join(runtimeRoot, ".agents", "skills"), role: "runtime" },
    );
  }

  const projectRoots = projectPath ? [
    { label: "current project skills", path: path.join(projectPath, "skills"), role: "current-project" },
    { label: "current project .lmentor skills", path: path.join(projectPath, ".lmentor", "skills"), role: "current-project" },
    { label: "current project .codex skills", path: path.join(projectPath, ".codex", "skills"), role: "current-project" },
    { label: "current project .agents skills", path: path.join(projectPath, ".agents", "skills"), role: "current-project" },
  ] : [];

  return uniqueSkillRoots([...baseRoots, ...projectRoots]);
}

function resolveDynamicSkillRoots(projectPath) {
  return resolveDynamicSkillRootRecords(projectPath).map((root) => root.path);
}

async function copyDirectoryRecursive(sourceDir, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, targetPath);
      continue;
    }
    await fs.copyFile(sourcePath, targetPath);
  }
}

function assertManagedSkillTarget(targetDir) {
  const resolvedTarget = path.resolve(targetDir);
  const resolvedRoot = path.resolve(CODEX_SKILLS_DIR);
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Unexpected managed skill target: ${resolvedTarget}`);
  }
  return resolvedTarget;
}

async function computeSkillDirectoryStamp(skillDir) {
  if (!(await pathExists(skillDir))) return null;
  try {
    const files = await walkFiles(skillDir, (_fullPath, entry) => entry.isFile());
    let newest = 0;
    let totalSize = 0;
    for (const filePath of files) {
      try {
        const stat = await fs.stat(filePath);
        newest = Math.max(newest, stat.mtimeMs || 0);
        totalSize += stat.size || 0;
      } catch {
        // Ignore files that disappear during a concurrent update.
      }
    }
    return `${files.length}:${Math.round(newest)}:${totalSize}`;
  } catch {
    return null;
  }
}

async function syncManagedSkillEntry(entry) {
  if (entry.source !== "project") return;
  const targetDir = assertManagedSkillTarget(path.join(CODEX_SKILLS_DIR, entry.name));
  const markerPath = path.join(targetDir, MANAGED_SKILL_MARKER);
  const existingMarker = await readJson(markerPath, null);
  const existingSourcePath = existingMarker?.source_path ? fromPortableLocalPath(existingMarker.source_path) : "";
  const sourceStamp = await computeSkillDirectoryStamp(entry.directory);
  if (await pathExists(targetDir)) {
    if (!existingMarker) {
      if (await pathExists(path.join(targetDir, "SKILL.md"))) return;
      await safeRemoveTree(targetDir);
    } else if (path.resolve(existingSourcePath) !== path.resolve(entry.directory)) {
      return;
    } else if (await pathExists(path.join(targetDir, "SKILL.md"))) {
      if (!existingMarker.source_stamp || existingMarker.source_stamp === sourceStamp) {
        if (!existingMarker.source_stamp && sourceStamp) {
          await writeJson(markerPath, {
            ...existingMarker,
            source_stamp: sourceStamp,
            synced_at: existingMarker.synced_at || new Date().toISOString(),
          });
        }
        return;
      }
    }
  }

  await safeRemoveTree(targetDir);
  await copyDirectoryRecursive(entry.directory, targetDir);
  await writeJson(markerPath, {
    source: entry.source,
    source_path: toPortableLocalPath(entry.directory),
    source_stamp: sourceStamp,
    synced_at: new Date().toISOString(),
  });
}

async function cleanupManagedSkillEntries(activeEntries) {
  if (!(await pathExists(CODEX_SKILLS_DIR))) return;
  const activeSources = new Set(activeEntries.map((entry) => path.resolve(entry.directory)));
  const entries = await fs.readdir(CODEX_SKILLS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".system") continue;
    const entryPath = path.join(CODEX_SKILLS_DIR, entry.name);
    const marker = await readManagedSkillMarker(entryPath);
    if (!marker?.source_path) continue;
    if (marker.source && marker.source !== "project") continue;
    const sourcePath = path.resolve(fromPortableLocalPath(marker.source_path));
    if (activeSources.has(sourcePath) && await pathExists(sourcePath)) continue;
    await safeRemoveTree(assertManagedSkillTarget(entryPath));
  }
}

function summarizeSkillRootEntries(entries) {
  const sorted = [...entries].sort((left, right) => {
    if (isImportedConflictSkill(left) !== isImportedConflictSkill(right)) {
      return isImportedConflictSkill(left) ? 1 : -1;
    }
    if (left.system !== right.system) return left.system ? 1 : -1;
    return String(left.title || left.name).localeCompare(String(right.title || right.name), "zh-CN", {
      numeric: true,
      sensitivity: "base",
    });
  });
  const deduped = [];
  const seenNames = new Set();
  for (const entry of sorted) {
    const key = canonicalSkillName(entry.name || entry.title);
    if (!key || seenNames.has(key)) continue;
    seenNames.add(key);
    deduped.push(entry);
  }
  return {
    raw_count: entries.length,
    unique_count: deduped.length,
    user_count: deduped.filter((entry) => !entry.system).length,
    system_count: deduped.filter((entry) => entry.system).length,
    duplicate_count: Math.max(0, entries.length - deduped.length),
  };
}

async function inspectSkillRoots(rootRecords) {
  const roots = [];
  for (const root of rootRecords) {
    const exists = await pathExists(root.path);
    let count = 0;
    let systemCount = 0;
    let rawCount = 0;
    let uniqueCount = 0;
    let duplicateCount = 0;
    if (exists) {
      try {
        const entries = await listExternalSkillRoot(root.path);
        const summary = summarizeSkillRootEntries(entries);
        count = summary.user_count;
        systemCount = summary.system_count;
        rawCount = summary.raw_count;
        uniqueCount = summary.unique_count;
        duplicateCount = summary.duplicate_count;
      } catch {
        count = 0;
        systemCount = 0;
        rawCount = 0;
        uniqueCount = 0;
        duplicateCount = 0;
      }
    }
    roots.push({
      label: root.label,
      path: root.path,
      path_display: toInternalDisplayPath(root.path),
      role: root.role,
      exists,
      skill_count: count,
      system_skill_count: systemCount,
      raw_skill_count: rawCount,
      unique_skill_count: uniqueCount,
      duplicate_skill_count: duplicateCount,
    });
  }
  return roots;
}

let skillLibrarySyncChain = Promise.resolve();

function skillLibraryCacheKey(projectPath = "") {
  return path.resolve(String(projectPath || APP_ROOT));
}

function hasFreshSkillLibraryCache(projectPath = "") {
  return skillLibraryCache.key === skillLibraryCacheKey(projectPath)
    && skillLibraryCache.syncedAtMs > 0
    && Date.now() - skillLibraryCache.syncedAtMs < SKILL_LIBRARY_CACHE_TTL_MS;
}

async function ensureSkillLibrarySynchronized(projectPath = "") {
  if (hasFreshSkillLibraryCache(projectPath)) {
    return skillLibraryCache.externalEntries;
  }
  const syncTask = skillLibrarySyncChain.then(async () => {
    if (hasFreshSkillLibraryCache(projectPath)) {
      return skillLibraryCache.externalEntries;
    }
    return ensureSkillLibrarySynchronizedUnlocked(projectPath);
  });
  skillLibrarySyncChain = syncTask.catch(() => {});
  return syncTask;
}

async function ensureSkillLibrarySynchronizedUnlocked(projectPath = "") {
  const rootRecords = resolveDynamicSkillRootRecords(projectPath);
  const externalEntries = [];
  for (const root of rootRecords) {
    externalEntries.push(...await listExternalSkillRoot(root.path));
  }
  for (const entry of externalEntries) {
    await syncManagedSkillEntry(entry);
  }
  await cleanupManagedSkillEntries(externalEntries);
  const [roots, codexEntries] = await Promise.all([
    inspectSkillRoots(rootRecords),
    listStandardSkillRoot(CODEX_SKILLS_DIR, "codex", { skipManaged: false }),
  ]);
  const activeSkillNames = new Set(
    [...externalEntries, ...codexEntries]
      .map((entry) => canonicalSkillName(entry.name || entry.title))
      .filter(Boolean),
  );
  lastSkillSyncSnapshot = {
    target_dir: CODEX_SKILLS_DIR,
    target_dir_display: toInternalDisplayPath(CODEX_SKILLS_DIR),
    roots,
    external_count: externalEntries.length,
    active_skill_count: activeSkillNames.size,
    codex_skill_count: codexEntries.length,
    agent_skill_count: 0,
    synced_at: new Date().toISOString(),
  };
  skillLibraryCache = {
    key: skillLibraryCacheKey(projectPath),
    syncedAtMs: Date.now(),
    externalEntries,
    codexEntries,
  };
  return externalEntries;
}

async function listSkillLibrary(projectPath = "") {
  const discovered = [];
  await ensureSkillLibrarySynchronized(projectPath);
  const cachedEntries = hasFreshSkillLibraryCache(projectPath)
    ? skillLibraryCache
    : {
      externalEntries: await ensureSkillLibrarySynchronized(projectPath),
      codexEntries: await listStandardSkillRoot(CODEX_SKILLS_DIR, "codex", { skipManaged: false }),
    };
  discovered.push(...cachedEntries.externalEntries, ...cachedEntries.codexEntries);
  const sorted = discovered.sort((left, right) => {
    if (left.system !== right.system) return left.system ? 1 : -1;
    const leftCanonical = canonicalSkillName(left.name || left.title);
    const rightCanonical = canonicalSkillName(right.name || right.title);
    if (leftCanonical === rightCanonical && isImportedConflictSkill(left) !== isImportedConflictSkill(right)) {
      return isImportedConflictSkill(left) ? 1 : -1;
    }
    if (left.source !== right.source) {
      const priority = { codex: 0, project: 1, agents: 2 };
      return (priority[left.source] ?? 9) - (priority[right.source] ?? 9);
    }
    return left.title.localeCompare(right.title, "zh-CN", { numeric: true, sensitivity: "base" });
  });

  const deduped = [];
  const seenNames = new Set();
  for (const entry of sorted) {
    const key = canonicalSkillName(entry.name || entry.title);
    if (!key || seenNames.has(key)) continue;
    seenNames.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function sanitizeAgentIndexFileName(agentId) {
  return String(agentId || "agent")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "agent";
}

function agentSkillIndexSignature(agentProfile) {
  const skillIds = [...new Set(ensureArray(agentProfile?.enabled_skill_ids)
    .map((value) => canonicalSkillName(value))
    .filter(Boolean))]
    .sort();
  return crypto.createHash("sha256").update(JSON.stringify({ version: 3, skillIds })).digest("hex");
}

function compactSkillIndexText(value, maxLength = 72) {
  const compacted = String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[|`]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1)}…` : compacted;
}

async function readAgentSkillManifestEntry(skillId) {
  const normalizedId = canonicalSkillName(skillId);
  const skillDir = path.join(CODEX_SKILLS_DIR, normalizedId);
  const marker = await readSkillMetadata(skillDir);
  const title = compactSkillIndexText(marker.title || normalizedId || skillId);
  const description = compactSkillIndexText(
    marker.zh_description
    || marker.chinese_description
    || fallbackChineseSkillPurpose({ name: normalizedId || skillId, title }),
  );
  return {
    title,
    description,
    skillPath: path.join(skillDir, "SKILL.md"),
  };
}

function agentSkillIndexCacheKey(agentProfile) {
  const agentId = String(agentProfile?.id || DEFAULT_BUILTIN_AGENT_ID).trim() || DEFAULT_BUILTIN_AGENT_ID;
  return `${agentId}:${agentSkillIndexSignature(agentProfile)}`;
}

function parseAgentSkillIndexEntries(content) {
  const entries = [];
  const rowPattern = /^\d+\. 名称：(.+)\r?\n\s+用途：(.+)\r?\n\s+规范文件：(.+)$/gm;
  for (const match of String(content || "").matchAll(rowPattern)) {
    entries.push({
      title: String(match[1] || "").trim(),
      description: String(match[2] || "").trim(),
      skillPath: String(match[3] || "").trim(),
    });
  }
  return entries;
}

function skillSearchTerms(value) {
  const text = String(value || "").normalize("NFKC").toLocaleLowerCase("zh-CN");
  const terms = new Set(text.match(/[\p{L}\p{N}_-]{2,}/gu) || []);
  for (const run of text.match(/\p{Script=Han}+/gu) || []) {
    for (let index = 0; index < run.length - 1; index += 1) {
      terms.add(run.slice(index, index + 2));
    }
  }
  return [...terms];
}

function selectAgentSkillCandidates(entries, message, limit = 3) {
  const queryTerms = skillSearchTerms(message);
  if (!queryTerms.length || !entries.length) return [];

  // Generic TF-IDF style matching keeps common wording from dominating and avoids domain-specific routing tables.
  const documents = entries.map((entry) => ({
    entry,
    titleTerms: new Set(skillSearchTerms(entry.title)),
    bodyTerms: new Set(skillSearchTerms(`${entry.title} ${entry.description}`)),
  }));
  const documentFrequency = new Map();
  for (const document of documents) {
    for (const term of document.bodyTerms) {
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }

  const totalDocuments = documents.length;
  return documents
    .map((document) => {
      let score = 0;
      for (const term of queryTerms) {
        if (!document.bodyTerms.has(term)) continue;
        const inverseFrequency = Math.log((totalDocuments + 1) / ((documentFrequency.get(term) || 0) + 1)) + 1;
        score += inverseFrequency * (document.titleTerms.has(term) ? 2 : 1);
      }
      return { ...document.entry, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "zh-CN"))
    .slice(0, limit)
    .map(({ score, ...entry }) => entry);
}

async function ensureAgentSkillIndex(agentProfile) {
  const agentId = String(agentProfile?.id || DEFAULT_BUILTIN_AGENT_ID).trim() || DEFAULT_BUILTIN_AGENT_ID;
  const signature = agentSkillIndexSignature(agentProfile);
  const cacheKey = agentSkillIndexCacheKey(agentProfile);
  const indexPath = path.join(AGENT_SKILL_INDEX_DIR, `${sanitizeAgentIndexFileName(agentId)}.md`);
  const existing = await readTextIfExists(indexPath);
  if (existing.startsWith(`<!-- LMENTOR_AGENT_SKILL_INDEX:${signature} -->`)) {
    if (!agentSkillIndexEntriesCache.has(cacheKey)) {
      agentSkillIndexEntriesCache.set(cacheKey, parseAgentSkillIndexEntries(existing));
    }
    return indexPath;
  }

  const enabledIds = ensureArray(agentProfile?.enabled_skill_ids).filter(Boolean);
  const manifestEntries = await Promise.all(enabledIds.map((skillId) => readAgentSkillManifestEntry(skillId)));
  const rows = enabledIds.map((skillId, index) => {
    const entry = manifestEntries[index];
    return `${index + 1}. 名称：${entry.title}\n   用途：${entry.description}\n   规范文件：${entry.skillPath}`;
  });
  const content = [
    `<!-- LMENTOR_AGENT_SKILL_INDEX:${signature} -->`,
    "# 当前 Agent 已激活 Skill 索引",
    "",
    `本索引仅列出当前 Agent 已授权的 ${enabledIds.length} 项 Skill。`,
    "桥接会依据本索引为每轮任务生成候选清单；候选不明确或无候选时，再按任务目标、交付物、输入材料与步骤依赖检索本索引。",
    "确认直接相关的候选后，必须读取其对应的 SKILL.md，并以其中的流程、输入输出与验证要求指导后续工具调用。",
    "只有寒暄、身份说明或无需工具的即时常识性答复可以不读取 Skill；不得把模型的一般知识当作跳过专业 Skill 的理由。",
    "不得为了选择 Skill 而扫描 Skill 目录或读取 Skill 正文；不得批量读取、遍历或执行无关 Skill。",
    "",
    ...rows,
    "",
  ].join("\n");
  await fs.mkdir(AGENT_SKILL_INDEX_DIR, { recursive: true });
  await fs.writeFile(indexPath, content, "utf8");
  agentSkillIndexEntriesCache.set(cacheKey, manifestEntries);
  return indexPath;
}

function resolveAgentSkillCandidates(agentProfile, message) {
  const entries = agentSkillIndexEntriesCache.get(agentSkillIndexCacheKey(agentProfile)) || [];
  return selectAgentSkillCandidates(entries, message);
}

function isValidSkillDirectoryName(value) {
  const name = String(value || "").trim();
  if (!name || name === "." || name === ".." || name === ".system") return false;
  return !/[<>:"/\\|?*\x00-\x1F]/.test(name);
}

async function readImportedSkillMarker(skillDir) {
  const markerPath = path.join(skillDir, IMPORTED_SKILL_MARKER);
  if (!(await pathExists(markerPath))) return null;
  return readJson(markerPath, null);
}

async function generateChineseSkillPurposeWithCodex({ skillDir, name, title, raw }) {
  const prompt = [
    "请阅读下面的 Skill 说明，为它生成一句中文作用说明。",
    "硬性要求：只输出一行现代汉语；不得出现任何英文字母或英文缩写；不要 Markdown；不要解释；不超过 80 个汉字。",
    "如果原文包含英文名称或缩写，请翻译成汉语含义。",
    `技能目录名：${name}`,
    `技能标题：${title || name}`,
    "",
    "SKILL.md 内容：",
    String(raw || "").slice(0, 12000),
  ].join("\n");

  try {
    const isCmdShim = CODEX_CLI_PATH.toLowerCase().endsWith(".cmd") || CODEX_CLI_PATH.toLowerCase().endsWith(".bat");
    const result = await runProcess(CODEX_CLI_PATH, ["exec", "--skip-git-repo-check", "-"], {
      cwd: skillDir,
      timeoutMs: 60000,
      windowsHide: true,
      shell: isCmdShim,
      input: prompt,
      env: buildCodexChildEnv(),
    });
    if (result.code !== 0) return "";
    return cleanChinesePurpose(result.stdout || result.stderr || "");
  } catch {
    return "";
  }
}

async function buildImportedSkillChinesePurpose({ skillDir, name, title, raw }) {
  const fromCodex = await generateChineseSkillPurposeWithCodex({ skillDir, name, title, raw });
  if (fromCodex) {
    return {
      zh_description: fromCodex,
      zh_description_source: "codex-cli",
    };
  }

  return {
    zh_description: fallbackChineseSkillPurpose({ name, title, raw }),
    zh_description_source: "fallback",
  };
}

async function validateSkillImportSource(skillFilePath) {
  const sourceFile = normalizeCodexFsPath(skillFilePath);
  const checks = [];
  const errors = [];
  const warnings = [];

  const addCheck = (status, label, detail) => {
    checks.push({ status, label, detail });
    if (status === "error") errors.push(detail || label);
    if (status === "warning") warnings.push(detail || label);
  };

  if (!sourceFile) {
    addCheck("error", "选择文件", "请选择一个 SKILL.md 文件。");
    return { valid: false, checks, errors, warnings, skill: null, codex_instruction: "" };
  }

  let stat = null;
  try {
    stat = await fs.stat(sourceFile);
  } catch {
    addCheck("error", "文件存在", `未找到文件：${sourceFile}`);
    return { valid: false, checks, errors, warnings, skill: null, codex_instruction: "" };
  }

  if (!stat.isFile()) {
    addCheck("error", "文件类型", "请选择具体的 SKILL.md 文件，而不是目录。");
    return { valid: false, checks, errors, warnings, skill: null, codex_instruction: "" };
  }
  addCheck("success", "文件存在", sourceFile);

  const basename = path.basename(sourceFile);
  if (basename.toLowerCase() !== "skill.md") {
    addCheck("error", "文件名", "Skill 入口文件必须命名为 SKILL.md。");
  } else {
    addCheck("success", "文件名", "入口文件命名正确。");
  }

  const sourceDir = path.dirname(sourceFile);
  const skillName = path.basename(sourceDir);
  if (!isValidSkillDirectoryName(skillName)) {
    addCheck("error", "目录名", `父目录名不能作为 skill 名称：${skillName || "(空)"}`);
  } else {
    addCheck("success", "目录名", skillName);
  }

  let raw = "";
  try {
    raw = await fs.readFile(sourceFile, "utf8");
  } catch (error) {
    addCheck("error", "读取内容", error instanceof Error ? error.message : String(error));
  }

  if (raw.trim()) {
    addCheck("success", "内容", "SKILL.md 内容非空。");
  } else {
    addCheck("error", "内容", "SKILL.md 内容为空。");
  }

  const meta = parseSimpleFrontmatter(raw);
  if (Object.keys(meta).length > 0) {
    addCheck("success", "Frontmatter", "已识别 frontmatter。");
  } else {
    addCheck("warning", "Frontmatter", "未识别 frontmatter；仍可安装，但建议补充 name 和 description。");
  }

  if (!meta.name) {
    addCheck("warning", "名称", "未在 frontmatter 中声明 name，将使用目录名。");
  }
  if (!meta.description) {
    addCheck("warning", "作用", "未在 frontmatter 中声明描述；安装时会由隔离运行环境分析并生成中文作用。");
  }

  const targetDir = assertManagedSkillTarget(path.join(CODEX_SKILLS_DIR, skillName || "unnamed-skill"));
  const targetDirDisplay = toInternalDisplayPath(targetDir);
  const importedMarker = await readImportedSkillMarker(targetDir);
  const sourceDirResolved = path.resolve(sourceDir);
  const targetDirResolved = path.resolve(targetDir);
  if (await pathExists(targetDir)) {
    if (sourceDirResolved === targetDirResolved) {
      addCheck("success", "安装位置", "该 skill 已位于运行环境 skill 目录。");
    } else if (importedMarker) {
      addCheck("warning", "覆盖安装", "目标位置已有 Lmentor 导入记录，安装时会覆盖旧版本。");
    } else {
      addCheck("error", "目标冲突", `运行环境 skill 目录已存在同名目录：${targetDirDisplay}`);
    }
  } else {
    addCheck("success", "安装位置", targetDirDisplay);
  }

  const title = String(meta.name || skillName || "").trim();
  const description = pickChineseSkillDescription({ marker: {}, meta, raw, name: skillName, title });
  const valid = errors.length === 0;
  const skill = skillName ? {
    name: skillName,
    title,
    description,
    source_path: sourceFile,
    source_directory: sourceDir,
    target_directory: targetDir,
    target_directory_display: targetDirDisplay,
  } : null;
  const codexInstruction = skill
    ? `安装位于 ${sourceDir} 目录下的 SKILL，并检查 skill 的可用性和完整性。`
    : "";

  return {
    valid,
    checks,
    errors,
    warnings,
    skill,
    codex_instruction: codexInstruction,
  };
}

async function installSkillFromFile(skillFilePath) {
  const validation = await validateSkillImportSource(skillFilePath);
  if (!validation.valid || !validation.skill) {
    const detail = validation.errors[0] || "Skill 校验未通过。";
    throw Object.assign(new Error(detail), { noFallback: true });
  }

  const { source_directory: sourceDir, target_directory: targetDir, name } = validation.skill;
  const sourceDirResolved = path.resolve(sourceDir);
  const targetDirResolved = path.resolve(targetDir);
  const startedAt = new Date().toISOString();

  if (sourceDirResolved !== targetDirResolved) {
    await safeRemoveTree(assertManagedSkillTarget(targetDir));
    await copyDirectoryRecursive(sourceDir, targetDir);
  }

  const targetSkillMd = path.join(targetDir, "SKILL.md");
  const targetRaw = await readTextIfExists(targetSkillMd);
  const chinesePurpose = await buildImportedSkillChinesePurpose({
    skillDir: targetDir,
    name,
    title: validation.skill.title,
    raw: targetRaw,
  });

  await writeJson(path.join(targetDir, IMPORTED_SKILL_MARKER), {
    source: "manual-import",
    source_path: toPortableMarkerSource(sourceDir),
    installed_at: startedAt,
    instruction: validation.codex_instruction,
    ...chinesePurpose,
    zh_description_language: "zh-CN",
  });

  const installedEntry = await readSkillLibraryEntry(targetDir, "codex", false);
  if (!installedEntry) {
    throw Object.assign(new Error("Skill 已复制，但运行环境扫描未识别到有效条目。"), { noFallback: true });
  }

  const library = await listSkillLibrary("");
  const available = library.some((entry) => entry.source === "codex" && entry.name === name);
  if (!available) {
    throw Object.assign(new Error("Skill 已复制，但当前技能库尚未报告为可用。"), { noFallback: true });
  }

  return {
    installed: true,
    installed_at: startedAt,
    entry: installedEntry,
    validation,
    target_directory: targetDir,
    target_directory_display: toInternalDisplayPath(targetDir),
    codex_instruction: validation.codex_instruction,
  };
}

const CODEX_RUNTIME_IMPORT_KINDS = ["sessions", "skills", "mcp", "plugins", "config"];

function normalizeImportKinds(value) {
  const requested = ensureArray(value)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const selected = requested.length > 0 ? requested : CODEX_RUNTIME_IMPORT_KINDS;
  return selected.filter((kind, index, array) => (
    CODEX_RUNTIME_IMPORT_KINDS.includes(kind) && array.indexOf(kind) === index
  ));
}

function resolveCodexImportHome(sourceHome = "") {
  return normalizeCodexFsPath(sourceHome) || SYSTEM_CODEX_HOME;
}

async function statFileOrNull(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

async function countFilesUnder(rootPath, matcher) {
  if (!(await pathExists(rootPath))) return 0;
  try {
    return (await walkFiles(rootPath, matcher)).length;
  } catch {
    return 0;
  }
}

async function countDirectories(rootPath) {
  if (!(await pathExists(rootPath))) return 0;
  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).length;
  } catch {
    return 0;
  }
}

async function readSessionIndexCount(indexPath) {
  if (!(await pathExists(indexPath))) return 0;
  try {
    const raw = await fs.readFile(indexPath, "utf8");
    let count = 0;
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (typeof parsed?.id === "string" || typeof parsed?.session_id === "string") {
          count += 1;
        }
      } catch {
        // Ignore malformed index rows during preview.
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function readSkillImportCount(skillsDir) {
  const entries = await listStandardSkillRoot(skillsDir, "codex").catch(() => []);
  return {
    total: entries.length,
    user: entries.filter((entry) => !entry.system).length,
    system: entries.filter((entry) => entry.system).length,
  };
}

async function readMcpServerNamesFromConfig(configPath) {
  const raw = await readTextIfExists(configPath);
  if (!raw.trim()) return [];
  try {
    const parsed = await parseTomlConfigString(raw);
    const mcpServers = ensureObject(parsed.mcp_servers || parsed.mcpServers);
    return Object.keys(mcpServers).sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
  } catch {
    return [];
  }
}

function importTargetPathForKind(homeDir, kind) {
  if (kind === "sessions") return path.join(homeDir, "sessions");
  if (kind === "skills") return path.join(homeDir, "skills");
  if (kind === "plugins") return path.join(homeDir, "plugins");
  if (kind === "mcp" || kind === "config") return path.join(homeDir, "config.toml");
  return homeDir;
}

function buildCodexImportItem({ kind, title, count, sourcePath, targetPath, strategy, available = true, warnings = [] }) {
  return {
    kind,
    title,
    count,
    available: Boolean(available),
    source_path: sourcePath,
    target_path: targetPath,
    strategy,
    status: available && count > 0 ? "ready" : "empty",
    warnings,
  };
}

async function summarizeCodexImportHome(homeDir) {
  const resolvedHome = path.resolve(resolveCodexImportHome(homeDir));
  const sessionsDir = path.join(resolvedHome, "sessions");
  const archivedSessionsDir = path.join(resolvedHome, "archived_sessions");
  const sessionIndexPath = path.join(resolvedHome, "session_index.jsonl");
  const skillsDir = path.join(resolvedHome, "skills");
  const pluginsDir = path.join(resolvedHome, "plugins");
  const configPath = path.join(resolvedHome, "config.toml");
  const authPath = path.join(resolvedHome, "auth.json");
  const sqliteDir = path.join(resolvedHome, "sqlite");

  const [
    homeExists,
    sessionsCount,
    archivedSessionsCount,
    sessionIndexCount,
    skillCounts,
    pluginCount,
    mcpServerNames,
    configStat,
    authExists,
    sqliteCount,
  ] = await Promise.all([
    pathExists(resolvedHome),
    countFilesUnder(sessionsDir, (fullPath, entry) => entry.isFile() && fullPath.toLowerCase().endsWith(".jsonl")),
    countFilesUnder(archivedSessionsDir, (fullPath, entry) => entry.isFile() && fullPath.toLowerCase().endsWith(".jsonl")),
    readSessionIndexCount(sessionIndexPath),
    readSkillImportCount(skillsDir),
    countDirectories(pluginsDir),
    readMcpServerNamesFromConfig(configPath),
    statFileOrNull(configPath),
    pathExists(authPath),
    countFilesUnder(sqliteDir, (fullPath, entry) => entry.isFile() && fullPath.toLowerCase().endsWith(".sqlite")),
  ]);

  const sessionTotal = Math.max(sessionsCount + archivedSessionsCount, sessionIndexCount);
  const sameAsActiveHome = path.resolve(resolvedHome) === path.resolve(CODEX_HOME);
  const warnings = [];
  if (sameAsActiveHome) {
    warnings.push("源目录与当前 Lmentor 隔离环境相同；启用隔离环境后应改为从本机默认环境导入。");
  }
  if (authExists) {
    warnings.push("检测到 auth.json；导入接口会默认跳过认证缓存和 token。");
  }

  const items = [
    buildCodexImportItem({
      kind: "sessions",
      title: "聊天记录",
      count: sessionTotal,
      sourcePath: sessionsDir,
      targetPath: importTargetPathForKind(CODEX_HOME, "sessions"),
      strategy: "copy-session-jsonl-and-index",
      warnings: sqliteCount > 0 ? ["检测到 sqlite 状态库；后续完整导入需要单独处理索引/状态库兼容。"] : [],
    }),
    buildCodexImportItem({
      kind: "skills",
      title: "Skills",
      count: skillCounts.user,
      sourcePath: skillsDir,
      targetPath: importTargetPathForKind(CODEX_HOME, "skills"),
      strategy: "copy-user-skills-with-conflict-check",
      warnings: skillCounts.system > 0 ? [`系统 skills ${skillCounts.system} 个默认不导入。`] : [],
    }),
    buildCodexImportItem({
      kind: "mcp",
      title: "MCP 服务",
      count: mcpServerNames.length,
      sourcePath: configPath,
      targetPath: importTargetPathForKind(CODEX_HOME, "mcp"),
      strategy: "merge-mcp-server-sections",
    }),
    buildCodexImportItem({
      kind: "plugins",
      title: "Plugins",
      count: pluginCount,
      sourcePath: pluginsDir,
      targetPath: importTargetPathForKind(CODEX_HOME, "plugins"),
      strategy: "copy-plugin-directories-with-conflict-check",
    }),
    buildCodexImportItem({
      kind: "config",
      title: "非敏感配置",
      count: configStat ? 1 : 0,
      sourcePath: configPath,
      targetPath: importTargetPathForKind(CODEX_HOME, "config"),
      strategy: "merge-config-excluding-auth-and-secrets",
      warnings: ["后续实现应跳过 auth.json、cap_sid、token、API key 和本机绝对路径风险项。"],
    }),
  ];

  return {
    home: resolvedHome,
    exists: homeExists,
    same_as_active_home: sameAsActiveHome,
    active_home: path.resolve(CODEX_HOME),
    system_home: path.resolve(SYSTEM_CODEX_HOME),
    paths: {
      sessions: sessionsDir,
      archived_sessions: archivedSessionsDir,
      session_index: sessionIndexPath,
      skills: skillsDir,
      plugins: pluginsDir,
      config: configPath,
      sqlite: sqliteDir,
    },
    counts: {
      sessions: sessionTotal,
      active_session_jsonl: sessionsCount,
      archived_session_jsonl: archivedSessionsCount,
      session_index: sessionIndexCount,
      skills: skillCounts.user,
      system_skills: skillCounts.system,
      plugins: pluginCount,
      mcp_servers: mcpServerNames.length,
      config_files: configStat ? 1 : 0,
      sqlite_files: sqliteCount,
    },
    mcp_server_names: mcpServerNames,
    sensitive_paths_skipped: [
      authPath,
      path.join(resolvedHome, "cap_sid"),
      path.join(resolvedHome, ".sandbox-secrets"),
    ],
    warnings,
    items,
  };
}

async function listCodexRuntimeImportSources() {
  const sources = [];
  const systemSource = await summarizeCodexImportHome(SYSTEM_CODEX_HOME);
  sources.push({
    id: "system-codex-home",
    label: "本机智能体运行环境",
    kind: "system",
    home: systemSource.home,
    available: systemSource.exists,
    summary: systemSource.counts,
    warnings: systemSource.warnings,
  });

  if (path.resolve(CODEX_HOME) !== path.resolve(SYSTEM_CODEX_HOME)) {
    const activeSource = await summarizeCodexImportHome(CODEX_HOME);
    sources.push({
      id: "active-lmentor-codex-home",
      label: "当前 Lmentor 隔离运行环境",
      kind: "active",
      home: activeSource.home,
      available: activeSource.exists,
      summary: activeSource.counts,
      warnings: activeSource.warnings,
    });
  }

  return {
    active_home: path.resolve(CODEX_HOME),
    system_home: path.resolve(SYSTEM_CODEX_HOME),
    isolated: path.resolve(CODEX_HOME) !== path.resolve(SYSTEM_CODEX_HOME),
    sources,
  };
}

async function previewCodexRuntimeImport(args = {}) {
  const sourceHome = resolveCodexImportHome(args.sourceHome || args.home || SYSTEM_CODEX_HOME);
  const kinds = normalizeImportKinds(args.kinds);
  const source = await summarizeCodexImportHome(sourceHome);
  const target = await summarizeCodexImportHome(CODEX_HOME);
  const selected = new Set(kinds);
  const items = source.items.filter((item) => selected.has(item.kind));
  const readyItems = items.filter((item) => item.status === "ready");
  const readyToApply = source.exists && !source.same_as_active_home && readyItems.length > 0;
  const notes = [
    "执行导入前会自动备份目标 CODEX_HOME 中对应目录或配置文件。",
    "导入会跳过 auth.json、cap_sid、token、API key、password、credential 和 sandbox secrets。",
    "聊天记录采用复制 jsonl + 合并 session_index；MCP/config 采用字段级合并，不整文件覆盖。",
  ];

  if (!source.exists) {
    notes.unshift("未找到来源运行环境，暂时不能执行导入。");
  }
  if (source.same_as_active_home) {
    notes.unshift("来源目录与当前 Lmentor CODEX_HOME 相同，已禁止自导入。");
  }
  if (readyItems.length === 0) {
    notes.unshift("当前选择的内容没有可导入项目。");
  }

  return {
    source,
    target,
    kinds,
    items,
    ready_to_apply: readyToApply,
    apply_route: "codex_runtime_import_execute",
    notes,
  };
}

function conflictPathFor(targetPath, stamp) {
  const parsed = path.parse(targetPath);
  return path.join(parsed.dir, `${parsed.name}.imported-${stamp}${parsed.ext}`);
}

function stripImportedConflictSuffix(value) {
  return String(value || "").replace(/\.imported-\d{8}-\d{6}$/i, "");
}

async function copyFileWithConflict(sourcePath, targetPath, stamp) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  let finalPath = targetPath;
  if (await pathExists(finalPath)) {
    finalPath = conflictPathFor(finalPath, stamp);
  }
  await fs.copyFile(sourcePath, finalPath);
  return finalPath;
}

async function copyTreeFilesWithConflicts(sourceRoot, targetRoot, stamp, matcher = null) {
  if (!(await pathExists(sourceRoot))) return { copied: 0, skipped: 0, files: [] };
  const files = await walkFiles(sourceRoot, (fullPath, entry) => {
    if (!entry.isFile()) return false;
    return matcher ? matcher(fullPath, entry) : true;
  });
  const copiedFiles = [];
  for (const sourcePath of files) {
    const relativePath = path.relative(sourceRoot, sourcePath);
    const targetPath = path.join(targetRoot, relativePath);
    copiedFiles.push(await copyFileWithConflict(sourcePath, targetPath, stamp));
  }
  return { copied: copiedFiles.length, skipped: 0, files: copiedFiles };
}

async function copyTopLevelDirectoriesWithConflicts(sourceRoot, targetRoot, stamp, options = {}) {
  if (!(await pathExists(sourceRoot))) return { copied: 0, skipped: 0, directories: [] };
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const copiedDirs = [];
  let skipped = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (options.skipSystem && entry.name === ".system") {
      skipped += 1;
      continue;
    }
    const sourceDir = path.join(sourceRoot, entry.name);
    let targetDir = path.join(targetRoot, entry.name);
    if (await pathExists(targetDir)) {
      targetDir = path.join(targetRoot, `${entry.name}.imported-${stamp}`);
    }
    await copyDirectoryRecursive(sourceDir, targetDir);
    copiedDirs.push(targetDir);
  }
  return { copied: copiedDirs.length, skipped, directories: copiedDirs };
}

async function annotateImportedSkillDirectories(targetDirs, sourceRoot, installedAt) {
  const annotations = [];
  for (const targetDir of ensureArray(targetDirs)) {
    const targetSkillMd = path.join(targetDir, "SKILL.md");
    if (!(await pathExists(targetSkillMd))) continue;
    const raw = await readTextIfExists(targetSkillMd);
    const meta = parseSimpleFrontmatter(raw);
    const directoryName = path.basename(targetDir);
    const sourceName = stripImportedConflictSuffix(directoryName);
    const title = String(meta.name || sourceName || directoryName).trim();
    const chinesePurpose = await buildImportedSkillChinesePurpose({
      skillDir: targetDir,
      name: sourceName || directoryName,
      title,
      raw,
    });
    await writeJson(path.join(targetDir, IMPORTED_SKILL_MARKER), {
      source: "codex-home-import",
      source_path: toPortableMarkerSource(path.join(sourceRoot, sourceName || directoryName)),
      installed_at: installedAt,
      ...chinesePurpose,
      zh_description_language: "zh-CN",
    });
    annotations.push({
      directory: targetDir,
      name: sourceName || directoryName,
      zh_description_source: chinesePurpose.zh_description_source,
    });
  }
  return annotations;
}

async function backupImportTargets(kinds, stamp) {
  const backupRoot = path.join(CODEX_HOME, "lmentor-import-backups", stamp);
  const backedUp = [];
  await fs.mkdir(backupRoot, { recursive: true });

  const candidates = [];
  if (kinds.includes("sessions")) {
    candidates.push(["sessions", path.join(CODEX_HOME, "sessions")]);
    candidates.push(["archived_sessions", path.join(CODEX_HOME, "archived_sessions")]);
    candidates.push(["session_index.jsonl", CODEX_INDEX_PATH]);
  }
  if (kinds.includes("skills")) candidates.push(["skills", CODEX_SKILLS_DIR]);
  if (kinds.includes("plugins")) candidates.push(["plugins", path.join(CODEX_HOME, "plugins")]);
  if (kinds.includes("mcp") || kinds.includes("config")) candidates.push(["config.toml", CODEX_CONFIG_PATH]);

  for (const [label, sourcePath] of candidates) {
    if (!(await pathExists(sourcePath))) continue;
    const targetPath = path.join(backupRoot, label);
    const stat = await fs.stat(sourcePath);
    if (stat.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, targetPath);
    } else if (stat.isFile()) {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
    }
    backedUp.push({ label, path: targetPath });
  }

  return { backup_root: backupRoot, entries: backedUp };
}

async function mergeSessionIndexFile(sourceIndexPath, targetIndexPath) {
  if (!(await pathExists(sourceIndexPath))) return { added: 0, skipped: 0 };
  const existingIds = new Set();
  const outputLines = [];

  if (await pathExists(targetIndexPath)) {
    const targetRaw = await fs.readFile(targetIndexPath, "utf8");
    for (const line of targetRaw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      outputLines.push(line);
      try {
        const parsed = JSON.parse(line);
        const id = extractSessionIdFromRawRecord(parsed) || parsed?.id || parsed?.session_id;
        if (id) existingIds.add(String(id));
      } catch {
        // Preserve malformed rows in target and continue.
      }
    }
  }

  let added = 0;
  let skipped = 0;
  const sourceRaw = await fs.readFile(sourceIndexPath, "utf8");
  for (const line of sourceRaw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let id = "";
    try {
      const parsed = JSON.parse(line);
      id = String(extractSessionIdFromRawRecord(parsed) || parsed?.id || parsed?.session_id || "");
    } catch {
      id = "";
    }
    if (id && existingIds.has(id)) {
      skipped += 1;
      continue;
    }
    if (id) existingIds.add(id);
    outputLines.push(line);
    added += 1;
  }

  await fs.mkdir(path.dirname(targetIndexPath), { recursive: true });
  await fs.writeFile(targetIndexPath, outputLines.length > 0 ? `${outputLines.join("\n")}\n` : "", "utf8");
  return { added, skipped };
}

function sanitizeImportedConfig(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeImportedConfig(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "string" && /\b[A-Za-z]:[\\/]/.test(value)) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const sanitized = {};
  for (const [key, item] of Object.entries(value)) {
    if (/api[_-]?key|token|secret|password|auth|credential|cap_sid/i.test(key)) {
      continue;
    }
    const nextValue = sanitizeImportedConfig(item);
    if (nextValue === undefined) continue;
    sanitized[key] = nextValue;
  }
  return sanitized;
}

function deepMergeObjects(base, overlay) {
  const result = { ...ensureObject(base) };
  for (const [key, value] of Object.entries(ensureObject(overlay))) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMergeObjects(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function readConfigObjectFromPath(configPath) {
  const raw = await readTextIfExists(configPath);
  if (!raw.trim()) return {};
  return parseTomlConfigString(raw);
}

async function mergeMcpServersFromConfig(sourceConfigPath) {
  const sourceConfig = await readConfigObjectFromPath(sourceConfigPath);
  const sourceMcp = ensureObject(sourceConfig.mcp_servers || sourceConfig.mcpServers);
  const names = Object.keys(sourceMcp);
  if (names.length === 0) return { merged: 0, names: [] };

  const targetConfig = await readLiveCodexConfigObject();
  const targetMcp = ensureObject(targetConfig.mcp_servers || targetConfig.mcpServers);
  targetConfig.mcp_servers = {
    ...targetMcp,
    ...sanitizeImportedConfig(sourceMcp),
  };
  await writeLiveCodexConfigObject(targetConfig);
  return { merged: names.length, names };
}

async function mergeNonSensitiveConfig(sourceConfigPath) {
  const sourceConfig = sanitizeImportedConfig(await readConfigObjectFromPath(sourceConfigPath));
  const targetConfig = await readLiveCodexConfigObject();
  const merged = deepMergeObjects(targetConfig, sourceConfig);
  await writeLiveCodexConfigObject(merged);
  return { merged: Object.keys(sourceConfig).length };
}

async function executeCodexRuntimeImport(args = {}) {
  const preview = await previewCodexRuntimeImport(args);
  if (!preview.source.exists) {
    throw Object.assign(new Error("导入源运行环境不存在，已拒绝执行。"), { noFallback: true });
  }
  if (path.resolve(preview.source.home) === path.resolve(CODEX_HOME)) {
    throw Object.assign(new Error("导入源与当前隔离 CODEX_HOME 相同，已拒绝执行。"), { noFallback: true });
  }
  if (!preview.ready_to_apply) {
    throw Object.assign(new Error("当前预览没有可导入项目，已拒绝执行。"), { noFallback: true });
  }

  const kinds = normalizeImportKinds(args.kinds);
  const stamp = timestampForFile();
  const backup = await backupImportTargets(kinds, stamp);
  const sourceHome = preview.source.home;
  const summary = {};

  if (kinds.includes("sessions")) {
    const active = await copyTreeFilesWithConflicts(
      path.join(sourceHome, "sessions"),
      path.join(CODEX_HOME, "sessions"),
      stamp,
      (fullPath) => fullPath.toLowerCase().endsWith(".jsonl"),
    );
    const archived = await copyTreeFilesWithConflicts(
      path.join(sourceHome, "archived_sessions"),
      path.join(CODEX_HOME, "archived_sessions"),
      stamp,
      (fullPath) => fullPath.toLowerCase().endsWith(".jsonl"),
    );
    const index = await mergeSessionIndexFile(path.join(sourceHome, "session_index.jsonl"), CODEX_INDEX_PATH);
    summary.sessions = {
      copied_active: active.copied,
      copied_archived: archived.copied,
      index_added: index.added,
      index_skipped: index.skipped,
    };
  }

  if (kinds.includes("skills")) {
    const copiedSkills = await copyTopLevelDirectoriesWithConflicts(
      path.join(sourceHome, "skills"),
      CODEX_SKILLS_DIR,
      stamp,
      { skipSystem: true },
    );
    const analyzed = await annotateImportedSkillDirectories(
      copiedSkills.directories,
      path.join(sourceHome, "skills"),
      new Date().toISOString(),
    );
    summary.skills = {
      ...copiedSkills,
      chinese_purpose_generated: analyzed.length,
      chinese_purpose_entries: analyzed,
    };
  }

  if (kinds.includes("plugins")) {
    summary.plugins = await copyTopLevelDirectoriesWithConflicts(
      path.join(sourceHome, "plugins"),
      path.join(CODEX_HOME, "plugins"),
      stamp,
    );
  }

  if (kinds.includes("mcp")) {
    summary.mcp = await mergeMcpServersFromConfig(path.join(sourceHome, "config.toml"));
  }

  if (kinds.includes("config")) {
    summary.config = await mergeNonSensitiveConfig(path.join(sourceHome, "config.toml"));
  }

  const nextPreview = await previewCodexRuntimeImport(args);
  return {
    executed: true,
    status: "completed",
    message: "已将本机运行环境的可迁移内容导入到 Lmentor 隔离环境。认证缓存、token、API key 与 sandbox secrets 已跳过。",
    backup,
    summary,
    preview: nextPreview,
  };
}

async function walkFiles(rootPath, matcher, found = []) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, matcher, found);
      continue;
    }
    if (matcher(fullPath, entry)) {
      found.push(fullPath);
    }
  }
  return found;
}

function extractSessionIdFromRawRecord(record) {
  if (record?.type === "session_meta" && typeof record?.payload?.id === "string") {
    return record.payload.id;
  }
  if (record?.type === "thread.started" && typeof record?.thread_id === "string") {
    return record.thread_id;
  }
  if (record?.payload?.thread_id && typeof record.payload.thread_id === "string") {
    return record.payload.thread_id;
  }
  return null;
}

async function findSessionJsonlPath(sessionId) {
  if (!sessionId) return null;
  const candidates = await walkFiles(
    CODEX_SESSIONS_DIR,
    (fullPath, entry) => entry.isFile() && fullPath.toLowerCase().endsWith(".jsonl"),
  );

  for (const filePath of candidates) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const firstLines = raw.split(/\r?\n/, 3).filter(Boolean);
      for (const line of firstLines) {
        const parsed = JSON.parse(line);
        if (extractSessionIdFromRawRecord(parsed) === sessionId) {
          return filePath;
        }
      }
    } catch {
      // Ignore malformed session files and continue scanning.
    }
  }

  return null;
}

function cleanTraceText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function decodeTraceWrappedPrompt(value) {
  const normalized = cleanTraceText(value);
  const base64Line = normalized
    .split("\n")
    .find((line) => line.trim().startsWith("Base64:"));
  if (!base64Line) return normalized;
  const encoded = base64Line.replace(/^Base64:\s*/, "").trim();
  if (!encoded) return normalized;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8").trim();
    return decoded || normalized;
  } catch {
    return normalized;
  }
}

function stripRosterPromptEnvelope(value) {
  const normalized = cleanTraceText(value);
  if (!normalized) return "";

  const taggedMatch = normalized.match(/<LMENTOR_USER_REQUEST>\s*([\s\S]*?)\s*<\/LMENTOR_USER_REQUEST>/i);
  if (taggedMatch?.[1]) {
    return taggedMatch[1].trim();
  }

  const legacyMarker = "下面是用户的原始请求，请把它视为本轮真正的用户消息：";
  const markerIndex = normalized.indexOf(legacyMarker);
  if (markerIndex >= 0) {
    return normalized.slice(markerIndex + legacyMarker.length).trim();
  }

  return normalized;
}

function stripControlPromptBlocks(value) {
  return stripRosterPromptEnvelope(decodeTraceWrappedPrompt(value))
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, "")
    .replace(/<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/gi, "")
    .replace(/<!--JISHU_HUB_IMAGES_BEGIN-->[\s\S]*?<!--JISHU_HUB_IMAGES_END-->/g, "")
    .replace(/<!--LMENTOR_FILE_CONTEXT_BEGIN-->[\s\S]*?<!--LMENTOR_FILE_CONTEXT_END-->/g, "")
    .replace(/<!--LMENTOR_ATTACHMENTS_BEGIN-->[\s\S]*?<!--LMENTOR_ATTACHMENTS_END-->/g, "")
    .replace(/<!--LMENTOR_SKILLS_BEGIN-->[\s\S]*?<!--LMENTOR_SKILLS_END-->/g, "")
    .trim();
}

function shortPreview(value, fallback = "当前轮次") {
  const cleaned = stripControlPromptBlocks(value).replace(/\s+/g, " ");
  if (!cleaned) return fallback;
  return cleaned.length > 96 ? `${cleaned.slice(0, 96)}...` : cleaned;
}

function parseBacktickedValues(input) {
  if (typeof input !== "string") return [];
  return [...input.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim()).filter(Boolean);
}

function mergeUnique(values) {
  return [...new Set(values.filter(Boolean))];
}

const TRACE_SKILL_STOP_WORDS = new Set([
  "skill",
  "skills",
  "workflow",
  "mode",
  "stage",
  "codex",
  "agent",
]);

function normalizeTraceSkillCandidate(candidate) {
  if (typeof candidate !== "string") return null;
  const cleaned = candidate.trim().replace(/^['"`]+|['"`，。；：、,.!?]+$/g, "");
  if (!cleaned) return null;
  if (!/^[A-Za-z][A-Za-z0-9:_-]{1,63}$/.test(cleaned)) return null;
  if (TRACE_SKILL_STOP_WORDS.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

function collectTraceSkillMentions(text, skills) {
  if (typeof text !== "string" || !text.trim()) return;
  const patterns = [
    /\bSkill:\s*([A-Za-z][A-Za-z0-9:_-]{1,63})/gi,
    /(?:属于|归入|归为|使用|启用|调用|指定的|按你指定的|按照你指定的|切换到|进入|路由到)\s*`?([A-Za-z][A-Za-z0-9:_-]{1,63})`?/gi,
  ];
  for (const pattern of patterns) {
    let match = null;
    while ((match = pattern.exec(text)) !== null) {
      const normalized = normalizeTraceSkillCandidate(match[1] || "");
      if (normalized) skills.add(normalized);
    }
  }
}

function parseTraceSignals(text) {
  const normalized = cleanTraceText(text);
  if (!normalized) {
    return {
      skills: [],
      workflow: null,
      stage: null,
      notes: [],
    };
  }

  const skills = new Set();
  const notes = [];
  let workflow = null;
  let stage = null;

  const activeSkillLine = normalized.match(/^-+\s*Active skill:\s*(.+)$/mi);
  if (activeSkillLine) {
    for (const token of activeSkillLine[1].split(/\s*\+\s*|,\s*/)) {
      const values = parseBacktickedValues(token);
      if (values.length > 0) {
        values.forEach((value) => skills.add(value));
        continue;
      }
      const cleaned = token.trim();
      if (cleaned) skills.add(cleaned);
    }
  }

  const workflowLine = normalized.match(/^-+\s*(?:Current workflow|Workflow):\s*(.+)$/mi);
  if (workflowLine) {
    workflow = workflowLine[1].trim();
  }

  const stageLine = normalized.match(/^-+\s*(?:Current stage|Stage):\s*(.+)$/mi);
  if (stageLine) {
    stage = stageLine[1].trim();
  }

  for (const line of normalized.split("\n")) {
    if (/^-+\s*(已完成|本轮正在做|下一步 gate|下一个 gate|阻塞|剩余事项|本轮完成内容)\s*[:：]/.test(line)) {
      notes.push(line.replace(/^-+\s*/, "").trim());
    }
  }

  if (skills.size === 0) {
    const implied = normalized.match(/(?:Active skill|指定的|进入)\s+`([^`]+)`/g) || [];
    implied.flatMap((chunk) => parseBacktickedValues(chunk)).forEach((value) => skills.add(value));
  }

  collectTraceSkillMentions(normalized, skills);

  return {
    skills: Array.from(skills),
    workflow,
    stage,
    notes,
  };
}

function mergeTraceRounds(rounds) {
  const merged = [];

  for (const round of ensureArray(rounds)) {
    const previous = merged[merged.length - 1];
    if (
      previous
      && previous.userPreview === round.userPreview
      && ensureArray(previous.tools).length === 0
      && ensureArray(round.tools).length === 0
    ) {
      previous.skills = mergeUnique([...ensureArray(previous.skills), ...ensureArray(round.skills)]);
      previous.workflow = previous.workflow || round.workflow || null;
      previous.stage = previous.stage || round.stage || null;
      previous.notes = mergeUnique([...ensureArray(previous.notes), ...ensureArray(round.notes)]);
      continue;
    }

    merged.push({
      ...round,
      skills: ensureArray(round.skills),
      notes: ensureArray(round.notes),
      tools: ensureArray(round.tools),
    });
  }

  return merged.map((round, index) => ({
    ...round,
    turnNumber: index + 1,
  }));
}

function normalizeStoredSessionTool(raw, index = 0) {
  const id = String(raw?.id || `tool-${index + 1}`).trim();
  const status = raw?.status === "error" ? "error" : (raw?.status === "running" ? "running" : "success");
  return {
    id,
    name: String(raw?.name || "tool").trim() || "tool",
    status,
    user_preview: String(raw?.user_preview || "").trim(),
  };
}

async function persistSessionToolTrace(sessionId, userPreview, tools) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId || !tools?.size) return;

  const normalizedTools = [...tools.values()]
    .map((tool, index) => normalizeStoredSessionTool({ ...tool, user_preview: userPreview }, index))
    .filter((tool) => tool.id);
  if (normalizedTools.length === 0) return;

  await updateBridgeState((state) => {
    const trace = ensureObject(state.sessionToolTrace);
    const previous = ensureArray(trace[normalizedSessionId])
      .map((tool, index) => normalizeStoredSessionTool(tool, index));
    const merged = new Map(previous.map((tool) => [tool.id, tool]));
    normalizedTools.forEach((tool) => merged.set(tool.id, tool));
    return {
      sessionToolTrace: {
        ...trace,
        [normalizedSessionId]: [...merged.values()].slice(-80),
      },
    };
  });
}

async function buildSessionActivityTrace(sessionId) {
  const rolloutPath = await findSessionJsonlPath(sessionId);
  if (!rolloutPath) {
    return [];
  }

  const [raw, bridgeState] = await Promise.all([
    fs.readFile(rolloutPath, "utf8"),
    readBridgeState(),
  ]);
  const storedTools = ensureArray(bridgeState.sessionToolTrace?.[sessionId])
    .map((tool, index) => normalizeStoredSessionTool(tool, index))
    // Older bridge versions persisted transport failures and raw command shells
    // without their original arguments. The JSONL log is authoritative for
    // ordinary commands; retain only semantic tools in this fallback store.
    .filter((tool) => !["error", "shell_command", "node", "getcontent", "setcontent"].includes(tool.name.toLowerCase()));
  const rounds = [];
  const toolIndexByCallId = new Map();
  let currentRound = null;
  let turnNumber = 0;

  const ensureRound = (userPreview = "当前轮次") => {
    if (currentRound) return currentRound;
    turnNumber += 1;
    currentRound = {
      turnNumber,
      userPreview,
      skills: [],
      workflow: null,
      stage: null,
      notes: [],
      tools: [],
    };
    rounds.push(currentRound);
    return currentRound;
  };

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed?.type === "event_msg" && parsed?.payload?.type === "user_message") {
      const userMessage = typeof parsed.payload.message === "string" ? parsed.payload.message : "";
      const userSignals = parseTraceSignals(userMessage);
      const userPreview = shortPreview(userMessage, "");
      if (!userPreview && userSignals.skills.length === 0 && !userSignals.workflow && !userSignals.stage && userSignals.notes.length === 0) {
        continue;
      }
      turnNumber += 1;
      currentRound = {
        turnNumber,
        userPreview: userPreview || "用户消息",
        skills: userSignals.skills,
        workflow: userSignals.workflow,
        stage: userSignals.stage,
        notes: userSignals.notes,
        tools: [],
      };
      rounds.push(currentRound);
      continue;
    }

    if (parsed?.type === "response_item" && parsed?.payload?.type === "message" && parsed?.payload?.role === "user") {
      const userText = ensureArray(parsed.payload.content)
        .map((item) => (typeof item?.text === "string" ? item.text : ""))
        .filter(Boolean)
        .join("\n");
      const userSignals = parseTraceSignals(userText);
      const userPreview = shortPreview(userText, "");
      if (!currentRound) {
        if (!userPreview && userSignals.skills.length === 0 && !userSignals.workflow && !userSignals.stage && userSignals.notes.length === 0) {
          continue;
        }
        turnNumber += 1;
        currentRound = {
          turnNumber,
          userPreview: userPreview || "用户消息",
          skills: userSignals.skills,
          workflow: userSignals.workflow,
          stage: userSignals.stage,
          notes: userSignals.notes,
          tools: [],
        };
        rounds.push(currentRound);
      }
      continue;
    }

    if (parsed?.type === "response_item" && parsed?.payload?.type === "custom_tool_call") {
      const round = ensureRound();
      const normalized = normalizeTraceToolPayload(parsed.payload);
      if (!normalized) continue;
      const tool = {
        id: String(parsed.payload.call_id || `tool-${round.tools.length + 1}`),
        name: normalized.name,
        status: parsed.payload.status === "failed" ? "error" : "success",
      };
      round.tools.push(tool);
      toolIndexByCallId.set(tool.id, tool);
      continue;
    }

    if (parsed?.type === "response_item" && parsed?.payload?.type === "function_call") {
      const round = ensureRound();
      const normalized = normalizeTraceToolPayload(parsed.payload);
      if (!normalized) continue;
      const tool = {
        id: String(parsed.payload.call_id || parsed.payload.id || `tool-${round.tools.length + 1}`),
        name: normalized.name,
        status: "running",
      };
      round.tools.push(tool);
      toolIndexByCallId.set(tool.id, tool);
      continue;
    }

    if (parsed?.type === "response_item" && parsed?.payload?.type === "custom_tool_call_output") {
      const tool = toolIndexByCallId.get(String(parsed.payload.call_id || ""));
      if (tool) {
        tool.status = toolOutputIndicatesFailure(parsed.payload.output) ? "error" : "success";
      }
      continue;
    }

    if (parsed?.type === "response_item" && parsed?.payload?.type === "function_call_output") {
      const tool = toolIndexByCallId.get(String(parsed.payload.call_id || ""));
      if (tool) {
        tool.status = toolOutputIndicatesFailure(parsed.payload.output) ? "error" : "success";
      }
      continue;
    }

    let assistantText = null;
    if (parsed?.type === "response_item" && parsed?.payload?.type === "message" && parsed?.payload?.role === "assistant") {
      assistantText = ensureArray(parsed.payload.content)
        .map((item) => (typeof item?.text === "string" ? item.text : ""))
        .filter(Boolean)
        .join("\n");
    } else if (parsed?.type === "event_msg" && parsed?.payload?.type === "agent_message") {
      assistantText = typeof parsed.payload.message === "string" ? parsed.payload.message : "";
    }

    if (assistantText) {
      const round = ensureRound();
      const signals = parseTraceSignals(assistantText);
      round.skills = mergeUnique([...round.skills, ...signals.skills]);
      round.workflow = round.workflow || signals.workflow;
      round.stage = round.stage || signals.stage;
      round.notes = mergeUnique([...round.notes, ...signals.notes]);
    }
  }

  if (storedTools.length > 0) {
    const consumed = new Set();
    for (const round of rounds) {
      const ids = new Set(ensureArray(round.tools).map((tool) => String(tool?.id || "")));
      for (const tool of storedTools) {
        if (tool.user_preview && tool.user_preview !== round.userPreview) continue;
        if (tool.name === "shell_command" && round.tools.some((item) => isSemanticSkillToolName(item?.name))) continue;
        if (isSemanticSkillToolName(tool.name) && round.tools.some((item) => item?.name === tool.name)) continue;
        if (!ids.has(tool.id)) {
          round.tools.push({ id: tool.id, name: tool.name, status: tool.status });
          ids.add(tool.id);
        }
        if (isSemanticSkillToolName(tool.name)) {
          round.skills = mergeUnique([...round.skills, tool.name.slice("skill:".length)]);
        }
        consumed.add(tool.id);
      }
    }

    const unassigned = storedTools.filter((tool) => !consumed.has(tool.id));
    if (unassigned.length > 0) {
      const round = rounds[rounds.length - 1] || ensureRound();
      const ids = new Set(ensureArray(round.tools).map((tool) => String(tool?.id || "")));
      for (const tool of unassigned) {
        if (tool.name === "shell_command" && round.tools.some((item) => isSemanticSkillToolName(item?.name))) continue;
        if (isSemanticSkillToolName(tool.name) && round.tools.some((item) => item?.name === tool.name)) continue;
        if (!ids.has(tool.id)) {
          round.tools.push({ id: tool.id, name: tool.name, status: tool.status });
          ids.add(tool.id);
        }
        if (isSemanticSkillToolName(tool.name)) {
          round.skills = mergeUnique([...round.skills, tool.name.slice("skill:".length)]);
        }
      }
    }
  }

  return mergeTraceRounds(rounds);
}

function maskSecret(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return "*****";
}

function extractSensitiveString(value, keyHint = "") {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractSensitiveString(item, keyHint);
      if (nested) return nested;
    }
    return "";
  }

  if (!isPlainObject(value)) {
    return "";
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = `${keyHint}.${key}`.toLowerCase();
    if (typeof nestedValue === "string" && /(?:api[_-]?key|token|secret|password)/i.test(normalizedKey)) {
      const trimmed = nestedValue.trim();
      if (trimmed) return trimmed;
    }
    if (nestedValue && typeof nestedValue === "object") {
      const nested = extractSensitiveString(nestedValue, normalizedKey);
      if (nested) return nested;
    }
  }

  return "";
}

function deriveMaskedApiKey(authContents, fallback = "") {
  const parsed = parseAuthContentsSnapshot(authContents);
  const secret = extractSensitiveString(parsed) || extractSensitiveString(authContents);
  if (secret) {
    return maskSecret(secret);
  }
  return maskSecret(fallback);
}

function normalizeReasoningEffort(value) {
  return ["low", "medium", "high", "xhigh"].includes(value) ? value : "high";
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function normalizeProviderIdentifier(value, fallback = "") {
  const raw = firstNonEmptyString(value, fallback);
  const normalized = raw.toLowerCase();
  if (normalized === "openai") return "OpenAI";
  if (normalized === "claude") return "Claude";
  if (normalized === "openai-relay" || normalized === "infinity") return "Infinity";
  return raw;
}

function isDisabledModelProvider(providerId) {
  return DISABLED_MODEL_PROVIDER_IDS.has(normalizeProviderIdentifier(providerId).toLowerCase());
}

function providerIdentifierEquals(left, right) {
  const normalizedLeft = normalizeProviderIdentifier(left).toLowerCase();
  const normalizedRight = normalizeProviderIdentifier(right).toLowerCase();
  return Boolean(normalizedLeft) && normalizedLeft === normalizedRight;
}

function isClaudeProvider(providerId) {
  return providerIdentifierEquals(providerId, "Claude");
}

function isClaudeModelId(value) {
  return String(value || "").trim().toLowerCase().startsWith("claude");
}

function isDomesticAggregateProvider(providerId) {
  return DOMESTIC_AGGREGATE_PROVIDER_IDS.has(normalizeProviderIdentifier(providerId).toLowerCase());
}

function resolveProviderSectionKey(providerId) {
  if (isDomesticAggregateProvider(providerId) || providerIdentifierEquals(providerId, SHARED_CNMODEL_SECTION_KEY)) {
    return SHARED_CNMODEL_SECTION_KEY;
  }
  return normalizeProviderIdentifier(providerId);
}

function getProviderAuthEnvKey(providerId) {
  if (isClaudeProvider(providerId)) return "ANTHROPIC_API_KEY";
  return "OPENAI_API_KEY";
}

function findProviderSectionEntry(config, providerId) {
  const providerSections = isPlainObject(config?.model_providers) ? config.model_providers : {};
  const normalizedId = normalizeProviderIdentifier(providerId);
  if (!normalizedId) return null;

  const resolvedKey = resolveProviderSectionKey(normalizedId);
  if (isPlainObject(providerSections[resolvedKey])) {
    return [resolvedKey, providerSections[resolvedKey]];
  }

  if (isPlainObject(providerSections[normalizedId])) {
    return [normalizedId, providerSections[normalizedId]];
  }

  const matchedKey = Object.keys(providerSections).find((key) => providerIdentifierEquals(key, normalizedId));
  if (!matchedKey || !isPlainObject(providerSections[matchedKey])) {
    return null;
  }
  return [matchedKey, providerSections[matchedKey]];
}

function getProviderSectionSnapshot(config, providerId) {
  const direct = findProviderSectionEntry(config, providerId);
  if (direct) {
    return direct[1];
  }

  const activeId = normalizeProviderIdentifier(config?.model_provider);
  const activeEntry = findProviderSectionEntry(config, activeId);
  if (activeEntry) {
    return activeEntry[1];
  }
  return null;
}

function normalizeProviderProtocol(value) {
  const normalized = firstNonEmptyString(typeof value === "string" ? value : "");
  if (normalized === "chat_completions" || normalized === "chat-completions" || normalized === "chatCompletions") {
    return "chat_completions";
  }
  if (normalized === "custom") {
    return "custom";
  }
  return "responses";
}

function deriveProviderMode(providerId, providerSection, activeProviderId = "") {
  const normalizedId = normalizeProviderIdentifier(providerId).toLowerCase();
  const explicitMode = firstNonEmptyString(
    providerSection?.mode,
    providerSection?.provider_mode,
    providerSection?.providerMode,
  ).toLowerCase();
  const baseUrl = firstNonEmptyString(
    providerSection?.base_url,
    providerSection?.baseUrl,
    providerSection?.api_base,
    providerSection?.apiBase,
    providerSection?.endpoint,
    providerSection?.url,
  ).toLowerCase();

  if (!normalizedId) {
    return "mixed_api";
  }

  if (explicitMode === "official" || explicitMode === "mixed_api" || explicitMode === "pure_api" || explicitMode === "aggregate") {
    return explicitMode;
  }

  if (isDomesticAggregateProvider(normalizedId)) {
    return "aggregate";
  }

  if (normalizedId === "codex-default" || normalizedId === "openai" || normalizedId === "claude") {
    return "official";
  }

  if (baseUrl) {
    return baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost") ? "mixed_api" : "pure_api";
  }

  return "mixed_api";
}

function extractProviderModelsFromConfig(config, providerSection, currentModel = "") {
  const configuredModels = [
    currentModel,
    config?.model,
    config?.small_model,
    config?.large_model,
    providerSection?.model,
    providerSection?.small_model,
    providerSection?.large_model,
  ];
  const providerModels = [
    ...ensureArray(providerSection?.models),
    ...ensureArray(config?.models),
  ];
  return normalizeModelCatalog([...configuredModels, ...providerModels], currentModel || config?.model || providerSection?.model || "");
}

function displayManagedProviderName(explicitName, providerId, fallback = "") {
  const normalizedId = normalizeProviderIdentifier(providerId).toLowerCase();
  const normalizedName = firstNonEmptyString(explicitName);
  if (normalizedId === "infinity") {
    if (!normalizedName || normalizedName === "本地中转站" || normalizedName === "本地供应商" || normalizedName.toLowerCase() === "openai-relay") {
      return "Infinity";
    }
  }
  return normalizedName || fallback;
}

function extractProviderSectionKeyFromProfile(profile) {
  const rawId = firstNonEmptyString(profile?.id);
  if (!rawId.startsWith("codex-live:")) return "";
  return rawId.slice("codex-live:".length).trim();
}

function buildLiveProviderProfile({
  providerId,
  providerSection,
  configContents,
  authContents,
  sharedModel,
  sharedModels,
  sharedReasoning,
  sharedProtocol,
  activeProviderId,
  index,
}) {
  const normalizedProviderId = normalizeProviderIdentifier(providerId);
  const section = isPlainObject(providerSection) ? providerSection : {};
  const sectionProviderId = normalizeProviderIdentifier(section.provider_id);
  const effectiveProviderId = firstNonEmptyString(sectionProviderId, normalizedProviderId);
  const isActive = Boolean(
    (normalizedProviderId && providerIdentifierEquals(normalizedProviderId, activeProviderId))
    || (effectiveProviderId && providerIdentifierEquals(effectiveProviderId, activeProviderId))
  );
  const isClaude = isClaudeProvider(effectiveProviderId);
  const model = isClaude
    ? firstNonEmptyString(section.model, CLAUDE_BUILTIN_MODELS[0])
    : firstNonEmptyString(
      section.model,
      section.small_model,
      section.large_model,
      isActive ? sharedModel : "",
    );
  const models = isClaude
    ? normalizeModelCatalog(
      [
        ...(ensureArray(section.models).length > 0 ? ensureArray(section.models) : CLAUDE_BUILTIN_MODELS),
        model,
      ],
      model,
    )
    : (
      isActive
        ? extractProviderModelsFromConfig(
          {
            model: sharedModel,
            small_model: section.small_model,
            large_model: section.large_model,
            models: section.models,
          },
          section,
          model,
        )
        : normalizeModelCatalog(
          [
            section.model,
            section.small_model,
            section.large_model,
            ...ensureArray(section.models),
          ],
          model,
        )
    );

  return normalizeProviderProfile({
    id: `codex-live:${providerId}`,
    name: displayManagedProviderName(
      section.name,
      effectiveProviderId || normalizedProviderId,
      firstNonEmptyString(effectiveProviderId, normalizedProviderId, isActive ? "Current Runtime" : `Provider ${index + 1}`),
    ),
    provider_id: effectiveProviderId || normalizedProviderId || "OpenAI",
    base_url: isClaude
      ? firstNonEmptyString(
        section.base_url,
        section.baseUrl,
        section.api_base,
        section.apiBase,
        section.endpoint,
        section.url,
        CLAUDE_OFFICIAL_BASE_URL,
      )
      : firstNonEmptyString(
        section.base_url,
        section.baseUrl,
        section.api_base,
        section.apiBase,
        section.endpoint,
        section.url,
      ),
    model,
    models: models.length > 0 ? models : sharedModels,
    reasoning_effort: normalizeReasoningEffort(section.reasoning_effort ?? section.reasoningEffort ?? sharedReasoning),
    protocol: normalizeProviderProtocol(section.wire_api ?? section.protocol ?? sharedProtocol),
    mode: deriveProviderMode(normalizedProviderId, section, activeProviderId),
    api_key_masked: deriveMaskedApiKey(authContents),
    config_contents: configContents,
    auth_contents: authContents,
    notes: isActive
      ? "Derived from the active runtime configuration snapshot."
      : `Derived from runtime provider "${normalizedProviderId || index + 1}".`,
    source: "Lmentor",
    active: isActive,
  }, index);
}

function normalizeModelCatalog(models, currentModel = "") {
  const deduped = [];
  const seen = new Set();

  const push = (value) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    deduped.push(trimmed);
  };

  push(currentModel);
  for (const model of ensureArray(models)) {
    push(model);
  }

  return deduped;
}

function parseAuthContentsSnapshot(value) {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildStoredAuthContents(rawAuthContents, apiKey, existingAuthContents = "", providerId = "") {
  const parsed = {
    ...parseAuthContentsSnapshot(existingAuthContents),
    ...parseAuthContentsSnapshot(rawAuthContents),
  };
  if (typeof apiKey === "string" && apiKey.trim()) {
    parsed[getProviderAuthEnvKey(providerId)] = apiKey.trim();
  }
  return Object.keys(parsed).length > 0 ? JSON.stringify(parsed, null, 2) : "";
}

function extractProviderApiKey(profile, rawProfile = {}) {
  const envKey = getProviderAuthEnvKey(profile?.provider_id || rawProfile?.provider_id);
  const direct = typeof rawProfile?.api_key === "string" ? rawProfile.api_key.trim() : "";
  if (direct) return direct;
  const parsedAuth = parseAuthContentsSnapshot(profile?.auth_contents);
  const authKey = Object.keys(parsedAuth).find((key) => key.toLowerCase() === envKey.toLowerCase());
  if (authKey && typeof parsedAuth[authKey] === "string") {
    const explicit = parsedAuth[authKey].trim();
    if (explicit) return explicit;
  }
  return "";
}

function buildProviderModelCatalogEndpoints(profile, normalizedBaseUrl) {
  const providerId = firstNonEmptyString(profile?.provider_id).toLowerCase();
  const protocol = normalizeProviderProtocol(profile?.protocol);
  const mode = firstNonEmptyString(profile?.mode).toLowerCase();
  const isAggregate = mode === "aggregate";
  const hasV1Suffix = /\/v1$/i.test(normalizedBaseUrl);
  const endpoints = [];
  const push = (value) => {
    const next = String(value || "").replace(/\/+$/, "");
    if (!next || endpoints.includes(next)) return;
    endpoints.push(next);
  };

  if (hasV1Suffix) {
    push(`${normalizedBaseUrl}/models`);
  } else if (isAggregate || protocol === "chat_completions") {
    push(`${normalizedBaseUrl}/v1/models`);
    push(`${normalizedBaseUrl}/models`);
  } else {
    push(`${normalizedBaseUrl}/models`);
    push(`${normalizedBaseUrl}/v1/models`);
  }

  if (providerId === "siliconflow") {
    push("https://api.siliconflow.cn/v1/models");
  }
  if (providerId === "qiniu") {
    push("https://api.qnaigc.com/v1/models");
  }
  if (providerId === "aionly") {
    push("https://api.aiionly.com/v1/models");
    push("https://api.aiionly.com/models");
  }

  return endpoints;
}

function normalizePublicCatalogModels(models, currentModel = "") {
  return normalizeModelCatalog(
    ensureArray(models).map((item) => String(item || "").trim()).filter(Boolean),
    currentModel,
  );
}

function isLikelyPublicModelId(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.length > 64) return false;
  if (text.includes("http://") || text.includes("https://")) return false;
  if (text.includes(".js") || text.includes(".css") || text.includes(".svg") || text.includes(".png")) return false;
  if (text.includes("_next") || text.includes("assets/") || text.includes("chunks/")) return false;
  if (text.startsWith("./") || text.startsWith("../") || text.startsWith("/")) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (text.includes("/")) {
    const parts = text.split("/");
    if (parts.length !== 2) return false;
    const [vendor, model] = parts;
    if (!vendor || !model) return false;
    if (vendor.length > 24 || model.length > 40) return false;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(vendor)) return false;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(model)) return false;
    return true;
  }
  return /^(?:deepseek|qwen|glm|moonshot|kimi|claude|gpt|gemini|hunyuan|minimax|doubao|baichuan|ernie|step|yi|mistral|llama)[A-Za-z0-9._-]*$/i.test(text);
}

function parseJsonEscapedModelIds(text) {
  const found = new Set();
  const pattern = /\\"id\\":\s*\\"([^"\\]+)\\"/g;
  let match = pattern.exec(text);
  while (match) {
    const candidate = String(match[1] || "").trim();
    if (isLikelyPublicModelId(candidate)) {
      found.add(candidate);
    }
    match = pattern.exec(text);
  }
  return Array.from(found);
}

function parseLoosePublicModelIds(text) {
  const found = new Set();
  const pattern = /[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+|(?:deepseek|qwen|glm|moonshot|kimi|claude|gpt|gemini|hunyuan|minimax|doubao|baichuan|ernie|step|yi|mistral|llama)[A-Za-z0-9._-]*/gi;
  let match = pattern.exec(text);
  while (match) {
    const candidate = String(match[0] || "").trim();
    if (isLikelyPublicModelId(candidate)) {
      found.add(candidate);
    }
    match = pattern.exec(text);
  }
  return Array.from(found);
}

function builtInAggregateCatalog(providerId) {
  const normalized = String(providerId || "").trim().toLowerCase();
  if (normalized === "siliconflow") {
    return [
      "deepseek-ai/DeepSeek-V3",
      "deepseek-ai/DeepSeek-R1",
      "deepseek-ai/DeepSeek-V3.1-Terminus",
      "deepseek-ai/DeepSeek-V4-Flash",
      "deepseek-ai/DeepSeek-V4-Pro",
      "Qwen/Qwen3-32B",
      "Qwen/Qwen2.5-72B-Instruct",
      "THUDM/GLM-4-9B-Chat",
      "moonshotai/Kimi-K2-Instruct",
      "meta-llama/Llama-3.3-70B-Instruct",
    ];
  }
  if (normalized === "qiniu") {
    return [
      "deepseek-v3",
      "deepseek-r1",
      "deepseek-r1-0528",
      "qwen-turbo",
      "qwen3-32b",
      "qwen3-max",
      "kimi-k2",
      "MiniMax-M1",
      "moonshotai/kimi-k2-0905",
      "deepseek/deepseek-v3.1-terminus",
    ];
  }
  if (normalized === "aionly") {
    return [
      "deepseek-chat",
      "deepseek-reasoner",
      "deepseek-v3",
      "deepseek-r1",
      "qwen-turbo",
      "qwen-plus",
      "qwen-max",
      "glm-4-plus",
      "moonshot-v1-8k",
      "claude-3-5-sonnet",
      "gpt-4o-mini",
      "gemini-2.5-flash",
    ];
  }
  return [];
}

async function fetchPublicAggregateModelCatalog(profile, currentModel = "") {
  const providerId = firstNonEmptyString(profile?.provider_id).toLowerCase();
  if (!providerId) {
    return null;
  }

  try {
    if (providerId === "qiniu") {
      const response = await fetchJsonWithTimeout("https://apidocs.qnaigc.com/397274067e0", {
        headers: {
          "User-Agent": "Lmentor-Bridge",
          Accept: "text/html,application/xhtml+xml",
        },
      }, 12000);
      if (response.ok) {
        const html = await response.text();
        const models = normalizePublicCatalogModels(parseJsonEscapedModelIds(html), currentModel);
        if (models.length > 0) {
          return {
            models,
            fetched_from: "public-docs:qiniu",
          };
        }
      }
    }

    if (providerId === "siliconflow") {
      const response = await fetchJsonWithTimeout("https://siliconflow.cn/models", {
        headers: {
          "User-Agent": "Lmentor-Bridge",
          Accept: "text/html,application/xhtml+xml",
        },
      }, 12000);
      if (response.ok) {
        const html = await response.text();
        const models = normalizePublicCatalogModels(parseLoosePublicModelIds(html), currentModel);
        if (models.length > 0) {
          return {
            models,
            fetched_from: "public-catalog:siliconflow",
          };
        }
      }
    }

    if (providerId === "aionly") {
      const response = await fetchJsonWithTimeout("https://www.aiionly.com/modelSquare", {
        headers: {
          "User-Agent": "Lmentor-Bridge",
          Accept: "text/html,application/xhtml+xml",
        },
      }, 12000);
      if (response.ok) {
        const html = await response.text();
        const models = normalizePublicCatalogModels(parseLoosePublicModelIds(html), currentModel);
        if (models.length > 0) {
          return {
            models,
            fetched_from: "public-catalog:aionly",
          };
        }
      }
    }
  } catch {
    // Fall through to built-in catalog.
  }

  const builtIn = normalizePublicCatalogModels(builtInAggregateCatalog(providerId), currentModel);
  if (builtIn.length > 0) {
    return {
      models: builtIn,
      fetched_from: `builtin-catalog:${providerId}`,
    };
  }

  return null;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function extractModelNamesFromUpstreamPayload(payload) {
  const models = [];
  const push = (value) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed) models.push(trimmed);
  };

  const extractFromItem = (item) => {
    if (typeof item === "string") {
      push(item);
      return;
    }
    if (!isPlainObject(item)) return;
    push(item.id);
    push(item.model);
    push(item.name);
    push(item.slug);
  };

  if (Array.isArray(payload)) {
    payload.forEach(extractFromItem);
  } else if (Array.isArray(payload?.data)) {
    payload.data.forEach(extractFromItem);
  } else if (Array.isArray(payload?.models)) {
    payload.models.forEach(extractFromItem);
  } else if (Array.isArray(payload?.items)) {
    payload.items.forEach(extractFromItem);
  }

  return Array.from(new Set(models));
}

async function fetchClaudeModelsFromUpstream(profile, apiKey, currentModel = "") {
  const fallbackModels = normalizeModelCatalog(
    ensureArray(profile?.models).filter((item) => isClaudeModelId(item)).length > 0
      ? ensureArray(profile?.models).filter((item) => isClaudeModelId(item))
      : CLAUDE_BUILTIN_MODELS,
    isClaudeModelId(currentModel) ? currentModel : CLAUDE_BUILTIN_MODELS[0],
  );

  if (!apiKey) {
    return {
      models: fallbackModels,
      fetched_from: "builtin-catalog:claude",
    };
  }

  try {
    const response = await fetchJsonWithTimeout(CLAUDE_MODEL_CATALOG_ENDPOINT, {
      headers: {
        "User-Agent": "Lmentor-Bridge",
        Accept: "application/json",
        "x-api-key": apiKey,
        "anthropic-version": CLAUDE_API_VERSION,
      },
    }, 12000);

    if (response.ok) {
      const payload = await response.json();
      const models = extractModelNamesFromUpstreamPayload(payload).filter((item) => isClaudeModelId(item));
      if (models.length > 0) {
        return {
          models: normalizeModelCatalog(models, isClaudeModelId(currentModel) ? currentModel : (fallbackModels[0] || "")),
          fetched_from: CLAUDE_MODEL_CATALOG_ENDPOINT,
        };
      }
    }
  } catch {
    // Fall through to built-in catalog.
  }

  return {
    models: fallbackModels,
    fetched_from: "builtin-catalog:claude",
  };
}

async function fetchProviderModelsFromUpstream(profile, rawProfile = {}) {
  const baseUrl = firstNonEmptyString(profile?.base_url, rawProfile?.base_url);
  const currentModel = firstNonEmptyString(profile?.model, rawProfile?.model);
  const fallbackModels = normalizeModelCatalog(profile?.models ?? rawProfile?.models, currentModel);
  const apiKey = extractProviderApiKey(profile, rawProfile);

  if (isClaudeProvider(profile?.provider_id)) {
    return fetchClaudeModelsFromUpstream(profile, apiKey, currentModel);
  }

  if (!baseUrl) {
    return {
      models: fallbackModels,
      fetched_from: "local-config",
    };
  }

  const headers = {
    "User-Agent": "Lmentor-Bridge",
    Accept: "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const endpoints = buildProviderModelCatalogEndpoints(profile, normalizedBaseUrl);
  const providerId = firstNonEmptyString(profile?.provider_id).toLowerCase();
  const isAggregateProvider = firstNonEmptyString(profile?.mode).toLowerCase() === "aggregate";

  let lastError = "";
  for (const endpoint of endpoints) {
    try {
      const response = await fetchJsonWithTimeout(endpoint, { headers }, 12000);
      if (!response.ok) {
        if (response.status === 401) {
          lastError = "上游鉴权失败（HTTP 401），请检查当前供应商的 API Key 是否正确。";
        } else {
          lastError = `HTTP ${response.status}`;
        }
        if (response.status === 401 && isAggregateProvider) {
          const fallback = await fetchPublicAggregateModelCatalog(profile, currentModel);
          if (fallback) {
            return fallback;
          }
        }
        continue;
      }
      const payload = await response.json();
      const models = extractModelNamesFromUpstreamPayload(payload);
      if (models.length > 0) {
        return {
          models: normalizeModelCatalog(models, currentModel),
          fetched_from: endpoint,
        };
      }
      lastError = "response missing models";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        lastError = `请求超时：${endpoint}`;
      } else {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  if (isAggregateProvider && (lastError.includes("401") || lastError.includes("超时") || lastError.includes("fetch failed"))) {
    const fallback = await fetchPublicAggregateModelCatalog({ ...profile, provider_id: providerId }, currentModel);
    if (fallback) {
      return fallback;
    }
  }

  throw new Error(lastError || `无法从上游获取模型列表：${baseUrl}`);
}

async function writeLiveProviderFiles(profile, sourceProfile = profile) {
  const authContents = typeof profile?.auth_contents === "string" ? profile.auth_contents : "";
  const apiKey = typeof sourceProfile?.api_key === "string" ? sourceProfile.api_key.trim() : "";

  const baseConfig = await readLiveCodexConfigObject();
  const nextConfig = applyProviderToConfig(baseConfig, profile);
  await writeLiveCodexConfigObject(nextConfig);

  const nextAuth = buildStoredAuthContents(authContents, apiKey, authContents, profile?.provider_id);
  if (nextAuth.trim()) {
    await fs.mkdir(path.dirname(CODEX_AUTH_PATH), { recursive: true });
    await fs.writeFile(CODEX_AUTH_PATH, nextAuth, "utf8");
  }
}

function codexPermissionModeFromConfig(config) {
  const approvalPolicy = typeof config?.approval_policy === "string" ? config.approval_policy : null;
  const sandboxMode = typeof config?.sandbox_mode === "string" ? config.sandbox_mode : null;

  if (approvalPolicy === "never" && sandboxMode === "danger-full-access") {
    return {
      defaultMode: "bypassPermissions",
      approvalPolicy,
      sandboxMode,
    };
  }

  if (approvalPolicy === "untrusted" && sandboxMode === "read-only") {
    return {
      defaultMode: "plan",
      approvalPolicy,
      sandboxMode,
    };
  }

  return {
    defaultMode: "bypassPermissions",
    approvalPolicy: approvalPolicy || "never",
    sandboxMode: sandboxMode || "danger-full-access",
  };
}

function codexPermissionPresetToConfig(mode) {
  if (mode === "bypassPermissions") {
    return {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    };
  }

  if (mode === "plan") {
    return {
      approvalPolicy: "untrusted",
      sandboxMode: "read-only",
    };
  }

  return {
    approvalPolicy: "never",
    sandboxMode: "danger-full-access",
  };
}

function isKnownCodexPermissionMode(mode) {
  return mode === "default" || mode === "plan" || mode === "bypassPermissions";
}

function mergeCodexPermissionSettings(settings, config) {
  const normalized = settings && typeof settings === "object" ? settings : defaultProjectSettings();
  const permissions = normalized.permissions && typeof normalized.permissions === "object"
    ? normalized.permissions
    : defaultProjectSettings().permissions;
  const derived = codexPermissionModeFromConfig(config);

  return {
    ...defaultProjectSettings(),
    ...normalized,
    permissions: {
      ...defaultProjectSettings().permissions,
      ...permissions,
      defaultMode: permissions?.defaultMode ?? derived.defaultMode,
      approvalPolicy: derived.approvalPolicy,
      sandboxMode: derived.sandboxMode,
    },
  };
}

function applyCodexPermissionMode(config, mode) {
  const nextConfig = { ...ensureObject(config) };
  const preset = codexPermissionPresetToConfig(mode);
  nextConfig.approval_policy = preset.approvalPolicy;
  nextConfig.sandbox_mode = preset.sandboxMode;
  return nextConfig;
}

function toIsoFromMs(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? new Date(numeric).toISOString() : null;
}

function decodeBase64Utf8(value) {
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function decodeWrappedPromptTitle(title) {
  if (typeof title !== "string") return null;
  const base64Line = title
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("Base64:"));
  if (!base64Line) return null;
  const encoded = base64Line.replace(/^Base64:\s*/, "").trim();
  if (!encoded) return null;
  const decoded = decodeBase64Utf8(encoded);
  return decoded && decoded.trim() ? decoded.trim() : null;
}

function decodeDisplayText(value) {
  if (typeof value !== "string") return "";
  const decoded = decodeWrappedPromptTitle(value);
  return (decoded || value).trim();
}

function normalizeDisplayText(value) {
  const raw = decodeDisplayText(value).replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (/^\?+$/.test(raw)) return "";
  return raw;
}

function normalizeMessageText(value) {
  const raw = stripControlPromptBlocks(decodeDisplayText(value))
    .replace(/\r\n/g, "\n")
    .trim();
  if (!raw) return "";
  if (/^\?+$/.test(raw.replace(/\n/g, ""))) return "";
  return raw;
}

function quoteTomlKey(key) {
  return JSON.stringify(String(key));
}

function serializeTomlValue(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeTomlValue(item)).join(", ")}]`;
  }
  if (value === null || value === undefined) {
    return JSON.stringify("");
  }
  return JSON.stringify(String(value));
}

function serializeTomlTable(lines, pathParts, table) {
  const primitiveEntries = [];
  const nestedEntries = [];

  for (const [key, value] of Object.entries(ensureObject(table))) {
    if (value === undefined || value === null) continue;
    if (isPlainObject(value)) nestedEntries.push([key, value]);
    else primitiveEntries.push([key, value]);
  }

  if (pathParts.length > 0) {
    lines.push(`[${pathParts.map((part) => quoteTomlKey(part)).join(".")}]`);
  }

  for (const [key, value] of primitiveEntries) {
    lines.push(`${quoteTomlKey(key)} = ${serializeTomlValue(value)}`);
  }

  if (primitiveEntries.length > 0 && nestedEntries.length > 0) {
    lines.push("");
  }

  nestedEntries.forEach(([key, value], index) => {
    serializeTomlTable(lines, [...pathParts, key], value);
    if (index < nestedEntries.length - 1) {
      lines.push("");
    }
  });
}

function serializeTomlDocument(value) {
  const lines = [];
  serializeTomlTable(lines, [], ensureObject(value));
  return `${lines.join("\n").trim()}\n`;
}

function stripUtf8Bom(text) {
  return typeof text === "string" && text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function sanitizeManagedProviderConfig(config) {
  const nextConfig = { ...ensureObject(config) };
  const providerSections = isPlainObject(nextConfig.model_providers) ? { ...nextConfig.model_providers } : {};
  let changed = false;

  for (const [sectionKey, sectionValue] of Object.entries(providerSections)) {
    const effectiveProviderId = normalizeProviderIdentifier(firstNonEmptyString(sectionValue?.provider_id, sectionKey));
    if (!isDisabledModelProvider(effectiveProviderId)) {
      continue;
    }
    delete providerSections[sectionKey];
    changed = true;
  }

  if (changed) {
    nextConfig.model_providers = providerSections;
  }

  const activeProviderId = normalizeProviderIdentifier(firstNonEmptyString(
    nextConfig.model_provider,
    nextConfig.provider_id,
    nextConfig.provider,
  ));

  if (!isDisabledModelProvider(activeProviderId)) {
    return { config: nextConfig, changed };
  }

  const fallbackEntry = Object.entries(providerSections).find(([sectionKey, sectionValue]) =>
    !isDisabledModelProvider(firstNonEmptyString(sectionValue?.provider_id, sectionKey)),
  ) || null;

  if (fallbackEntry) {
    const [fallbackKey, fallbackSection] = fallbackEntry;
    const fallbackModel = firstNonEmptyString(
      fallbackSection?.model,
      ensureArray(fallbackSection?.models)[0],
      "",
    );
    nextConfig.model_provider = fallbackKey;
    nextConfig.provider_id = fallbackKey;
    nextConfig.model = fallbackModel;
    nextConfig.review_model = fallbackModel;
    nextConfig.models = normalizeModelCatalog(fallbackSection?.models, fallbackModel);
  } else {
    delete nextConfig.model_provider;
    delete nextConfig.provider_id;
    delete nextConfig.model;
    delete nextConfig.review_model;
    delete nextConfig.models;
  }

  return { config: nextConfig, changed: true };
}

async function readLiveCodexConfigObject() {
  if (!(await pathExists(CODEX_CONFIG_PATH))) {
    return {};
  }

  const raw = stripUtf8Bom(await fs.readFile(CODEX_CONFIG_PATH, "utf8"));
  if (!raw.trim()) {
    return {};
  }

  const pythonScript = [
    "import json, sys, tomllib",
    "source = sys.stdin.buffer.read().decode('utf-8')",
    "print(json.dumps(tomllib.loads(source), ensure_ascii=False))",
  ].join("\n");

  const result = await runProcess("python", ["-c", pythonScript], {
    timeoutMs: 10000,
    windowsHide: true,
    input: raw,
  });

  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || "无法解析运行环境配置。").trim());
  }

  try {
    const parsed = JSON.parse(result.stdout || "{}");
    const sanitized = sanitizeManagedProviderConfig(parsed);
    if (sanitized.changed) {
      await writeLiveCodexConfigObject(sanitized.config);
    }
    return ensureObject(sanitized.config);
  } catch {
    throw new Error("运行环境配置解析结果无效。");
  }
}

async function parseTomlConfigString(raw) {
  const source = stripUtf8Bom(String(raw || ""));
  if (!source.trim()) {
    return {};
  }

  const pythonScript = [
    "import json, sys, tomllib",
    "source = sys.stdin.buffer.read().decode('utf-8')",
    "print(json.dumps(tomllib.loads(source), ensure_ascii=False))",
  ].join("\n");

  const result = await runProcess("python", ["-c", pythonScript], {
    timeoutMs: 10000,
    windowsHide: true,
    input: source,
  });

  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || "无法解析运行环境配置。").trim());
  }

  try {
    const parsed = JSON.parse(result.stdout || "{}");
    return ensureObject(parsed);
  } catch {
    throw new Error("运行环境配置解析结果无效。");
  }
}

function applyProviderToConfig(baseConfig, profile) {
  const nextConfig = {
    ...ensureObject(baseConfig),
  };
  const providerId = normalizeProviderIdentifier(profile?.provider_id, profile?.id || "OpenAI");
  assertSupportedManagedProvider(providerId);
  const isClaude = isClaudeProvider(providerId);
  const explicitSectionKey = extractProviderSectionKeyFromProfile(profile);
  const providerSectionKey = firstNonEmptyString(explicitSectionKey, resolveProviderSectionKey(providerId));
  const providerName = displayManagedProviderName(profile?.name, providerId, providerId);
  const model = isClaude
    ? firstNonEmptyString(isClaudeModelId(profile?.model) ? profile?.model : "", CLAUDE_BUILTIN_MODELS[0])
    : firstNonEmptyString(profile?.model);
  const models = normalizeModelCatalog(
    isClaude
      ? (ensureArray(profile?.models).filter((item) => isClaudeModelId(item)).length > 0
        ? ensureArray(profile?.models).filter((item) => isClaudeModelId(item))
        : CLAUDE_BUILTIN_MODELS)
      : profile?.models,
    model,
  );
  const reasoningEffort = normalizeReasoningEffort(profile?.reasoning_effort);
  const protocol = isClaude ? "chat_completions" : normalizeProviderProtocol(profile?.protocol);
  const baseUrl = firstNonEmptyString(profile?.base_url, isClaude ? CLAUDE_OFFICIAL_BASE_URL : "");

  nextConfig.model_provider = providerSectionKey;
  nextConfig.provider_id = providerSectionKey;
  nextConfig.model = model;
  nextConfig.model_reasoning_effort = reasoningEffort;
  if (model) {
    nextConfig.review_model = model;
  }
  if (models.length > 0) {
    nextConfig.models = models;
  }

  const providerSections = isPlainObject(nextConfig.model_providers) ? { ...nextConfig.model_providers } : {};
  const existingEntry = findProviderSectionEntry(nextConfig, providerId);
  if (!explicitSectionKey && existingEntry && existingEntry[0] !== providerSectionKey) {
    delete providerSections[existingEntry[0]];
  }
  const existingSection = ensureObject(providerSections[providerSectionKey] || existingEntry?.[1]);
  providerSections[providerSectionKey] = {
    ...existingSection,
    name: providerName,
    provider_id: providerId,
    wire_api: protocol,
    protocol,
    model,
    models,
    reasoning_effort: reasoningEffort,
    ...(providerIdentifierEquals(providerId, "OpenAI") ? { requires_openai_auth: true } : {}),
    ...(isClaude ? {
      requires_openai_auth: false,
      env_key: "ANTHROPIC_API_KEY",
      env_key_instructions: "Set ANTHROPIC_API_KEY to your Claude API key.",
    } : {}),
    ...(baseUrl ? { base_url: baseUrl } : {}),
  };
  nextConfig.model_providers = providerSections;

  return nextConfig;
}

async function writeLiveCodexConfigObject(config) {
  await fs.mkdir(path.dirname(CODEX_CONFIG_PATH), { recursive: true });
  await fs.writeFile(CODEX_CONFIG_PATH, serializeTomlDocument(config), "utf8");
}

function runProcess(command, args = [], options = {}) {
  const {
    cwd,
    timeoutMs = 20000,
    shell = false,
    windowsHide = true,
    input = null,
    env = null,
  } = options;

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        shell,
        windowsHide,
        env: env ? { ...process.env, ...env } : process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({
        code: -1,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill();
    }, timeoutMs);

    if (input) {
      child.stdin.end(input, "utf8");
    } else {
      child.stdin.end();
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (killed) {
        resolve({
          code: code ?? -1,
          stdout,
          stderr: `${stderr}\nProcess timed out after ${timeoutMs}ms`.trim(),
        });
        return;
      }
      resolve({
        code: code ?? 0,
        stdout,
        stderr,
      });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        code: -1,
        stdout,
        stderr: `${stderr}\n${error instanceof Error ? error.message : String(error)}`.trim(),
      });
    });
  });
}

function validateManagedPythonPackageSpecifier(value) {
  const specifier = String(value || "").trim();
  const valid = /^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\[[A-Za-z0-9_,.-]+\])?(?:(?:==|!=|>=|<=|~=|>|<)[A-Za-z0-9*_.+-]+(?:,[A-Za-z0-9*_.+-]+)*)?$/.test(specifier);
  if (!valid) {
    throw new Error("Python 包名只能包含受支持的 PyPI 包名、可选 extras 和版本约束，不能包含 URL、路径、参数或命令片段。");
  }
  return specifier;
}

function validateManagedPythonImportName(value) {
  const importName = String(value || "").trim();
  if (!importName || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(importName)) {
    throw new Error("Python 导入名只能由字母、数字、下划线和点组成，且必须以字母或下划线开头。");
  }
  return importName;
}

async function ensureManagedPythonPackage(args = {}) {
  const packageSpecifier = validateManagedPythonPackageSpecifier(args.package);
  const importName = validateManagedPythonImportName(args.import_name || args.importName || packageSpecifier.split(/[<>=!~\[]/, 1)[0].replaceAll("-", "_"));
  if (!(await pathExists(PYTHON_DEPENDENCY_INSTALLER_PATH))) {
    throw new Error(`缺少项目级 Python 依赖安装器：${PYTHON_DEPENDENCY_INSTALLER_PATH}`);
  }

  const pythonExecutable = String(process.env.PYTHON || "python.exe").trim();
  console.log(`[lmentor-runtime-bridge] Ensuring isolated Python package: ${packageSpecifier} (${importName})`);
  const result = await runProcess(pythonExecutable, [
    PYTHON_DEPENDENCY_INSTALLER_PATH,
    "--package", packageSpecifier,
    "--import-name", importName,
  ], {
    timeoutMs: 15 * 60 * 1000,
    windowsHide: true,
    env: buildCodexChildEnv(),
  });
  const raw = String(result.stdout || result.stderr || "").trim();
  if (result.code !== 0) {
    throw new Error(raw || `安装 Python 包失败：${packageSpecifier}`);
  }

  try {
    return { ...JSON.parse(raw), command: "ensure_python_package" };
  } catch {
    return {
      package: packageSpecifier,
      import_name: importName,
      installed: true,
      output: raw,
      command: "ensure_python_package",
    };
  }
}

async function commandExists(commandName) {
  const trimmed = String(commandName || "").trim();
  if (!trimmed) return false;
  const result = await runProcess("where.exe", [trimmed], { timeoutMs: 5000, windowsHide: true });
  return result.code === 0 && Boolean(result.stdout.trim());
}

async function detectVersion(commandName, args = ["--version"]) {
  const lower = String(commandName || "").toLowerCase();
  const needsShell = lower.endsWith(".cmd") || lower.endsWith(".bat");
  const result = await runProcess(commandName, args, { timeoutMs: 10000, windowsHide: true, shell: needsShell });
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || `Unable to detect version for ${commandName}`).trim());
  }
  const raw = (result.stdout || result.stderr || "").trim();
  const normalized = raw.match(/\bv?\d+\.\d+\.\d+(?:[-+.\w]*)?\b/);
  return normalized?.[0] || raw || null;
}

function parseVersionOutput(output) {
  const raw = String(output || "").trim();
  const normalized = raw.match(/\bv?\d+\.\d+\.\d+(?:[-+.\w]*)?\b/);
  return normalized?.[0] || raw || null;
}

async function safeDetectVersion(commandName, args = ["--version"]) {
  try {
    return await detectVersion(commandName, args);
  } catch {
    return null;
  }
}

async function detectPythonRuntime() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const candidates = [
    { command: "py", args: ["-3.13", "--version"] },
    { command: "python", args: ["--version"] },
    { command: path.join(localAppData, "Programs", "Python", "Python313", "python.exe"), args: ["--version"] },
    { command: path.join(process.env.ProgramFiles || "C:\\Program Files", "Python313", "python.exe"), args: ["--version"] },
  ];

  for (const candidate of candidates) {
    const isPath = path.isAbsolute(candidate.command);
    if (isPath && !fsSync.existsSync(candidate.command)) continue;
    const result = await runProcess(candidate.command, candidate.args, { timeoutMs: 10000, windowsHide: true });
    if (result.code !== 0) continue;
    return {
      installed: true,
      version: parseVersionOutput(result.stdout || result.stderr),
      command: candidate.command,
    };
  }

  return { installed: false, version: null, command: null };
}

async function detectCodexVersion() {
  const isCmdShim = CODEX_CLI_PATH.toLowerCase().endsWith(".cmd") || CODEX_CLI_PATH.toLowerCase().endsWith(".bat");
  const result = await runProcess(CODEX_CLI_PATH, ["--version"], {
    timeoutMs: 10000,
    windowsHide: true,
    shell: isCmdShim,
    env: buildCodexChildEnv(),
  });
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || `Unable to detect version for ${CODEX_CLI_PATH}`).trim());
  }
  const raw = (result.stdout || result.stderr || "").trim();
  const normalized = raw.match(/\bv?\d+\.\d+\.\d+(?:[-+.\w]*)?\b/);
  return normalized?.[0] || raw || null;
}

async function detectCodexCliHealth() {
  const installed = await pathExists(CODEX_CLI_PATH);
  let version = null;
  let error = installed ? null : `未找到智能体运行环境：${CODEX_CLI_PATH}`;

  if (installed) {
    try {
      version = await detectCodexVersion();
      error = null;
    } catch (versionError) {
      error = versionError instanceof Error ? versionError.message : String(versionError);
    }
  }

  return {
    installed,
    version,
    error,
    binary_path: installed ? CODEX_CLI_PATH : null,
    runtime_kind: CODEX_RUNTIME_KIND,
    runtime_dir: CODEX_RUNTIME_DIR || null,
    runtime_home: CODEX_HOME,
    runtime_version: CODEX_RUNTIME_VERSION || version,
    runtime_platform: CODEX_RUNTIME_PLATFORM || null,
    isolated: path.resolve(CODEX_HOME) !== path.resolve(SYSTEM_CODEX_HOME),
    last_checked_at: Date.now(),
  };
}

async function getCodexRuntimeSnapshot() {
  let skillSyncError = null;
  try {
    await ensureSkillLibrarySynchronized("");
  } catch (error) {
    skillSyncError = error instanceof Error ? error.message : String(error);
  }

  const health = await detectCodexCliHealth();
  const projectBinaryExists = await pathExists(CODEX_PROJECT_CMD);
  const runtimeInsideProjectRoot = CODEX_RUNTIME_DIR ? isPathInside(CODEX_PROJECT_ROOT, CODEX_RUNTIME_DIR) : false;
  const binaryInsideProjectRoot = isPathInside(CODEX_PROJECT_ROOT, CODEX_CLI_PATH);
  const usingProjectRuntime = CODEX_USING_PROJECT_RUNTIME_ENV === "1" || runtimeInsideProjectRoot || binaryInsideProjectRoot;
  const isolated = CODEX_ISOLATED_ENV
    ? CODEX_ISOLATED_ENV === "1"
    : path.resolve(CODEX_HOME) !== path.resolve(SYSTEM_CODEX_HOME);
  const diagnosticLog = [
    usingProjectRuntime
      ? `已确认使用项目根目录运行环境：${toInternalDisplayPath(CODEX_CLI_PATH)}`
      : `未命中项目根目录运行环境，当前路径：${toInternalDisplayPath(CODEX_CLI_PATH)}`,
    isolated
      ? `已确认 CODEX_HOME 隔离：${toInternalDisplayPath(CODEX_HOME)}`
      : `CODEX_HOME 未隔离，当前指向系统目录：${CODEX_HOME}`,
    `运行时配置文件：${toInternalDisplayPath(CODEX_CONFIG_PATH)}`,
    `运行时认证文件：${toInternalDisplayPath(CODEX_AUTH_PATH)}`,
    `本机默认配置不参与运行时读取：${path.join(SYSTEM_CODEX_HOME, "config.toml")} / ${path.join(SYSTEM_CODEX_HOME, "auth.json")}`,
    projectBinaryExists
      ? `项目运行环境存在：${toInternalDisplayPath(CODEX_PROJECT_CMD)}`
      : `项目运行环境缺失：${toInternalDisplayPath(CODEX_PROJECT_CMD)}`,
    `Skill 实时同步目标：${toInternalDisplayPath(CODEX_SKILLS_DIR)}`,
    `Skill 最近同步：${lastSkillSyncSnapshot.synced_at || "尚未同步"}，可用技能 ${lastSkillSyncSnapshot.active_skill_count} 个，外部根技能 ${lastSkillSyncSnapshot.external_count} 个。`,
  ];
  if (skillSyncError) {
    diagnosticLog.push(`Skill 同步异常：${skillSyncError}`);
  }

  return {
    kind: CODEX_RUNTIME_KIND,
    version: health.version || CODEX_RUNTIME_VERSION || null,
    platform: CODEX_RUNTIME_PLATFORM || null,
    binary_path: CODEX_CLI_PATH,
    binary_path_display: toInternalDisplayPath(CODEX_CLI_PATH),
    runtime_dir: CODEX_RUNTIME_DIR || null,
    runtime_dir_display: CODEX_RUNTIME_DIR ? toInternalDisplayPath(CODEX_RUNTIME_DIR) : null,
    app_root: APP_ROOT,
    app_root_display: toInternalDisplayPath(APP_ROOT),
    project_runtime_root: CODEX_PROJECT_ROOT,
    project_runtime_root_display: toInternalDisplayPath(CODEX_PROJECT_ROOT),
    project_binary_path: CODEX_PROJECT_CMD,
    project_binary_path_display: toInternalDisplayPath(CODEX_PROJECT_CMD),
    project_binary_exists: projectBinaryExists,
    using_project_runtime: usingProjectRuntime,
    home_dir: CODEX_HOME,
    home_dir_display: toInternalDisplayPath(CODEX_HOME),
    system_home_dir: SYSTEM_CODEX_HOME,
    isolated,
    installed: health.installed,
    error: health.error,
    skill_sync: lastSkillSyncSnapshot,
    diagnostic_log: diagnosticLog,
  };
}

function buildRosterAgentPrompt(agentProfile, message, roster = null, skillIndexPath = "", skillCandidates = []) {
  const normalizedMessage = String(message || "")
    .replace(/<!--JISHU_HUB_IMAGES_BEGIN-->[\s\S]*?<!--JISHU_HUB_IMAGES_END-->/g, "")
    .replace(/<!--LMENTOR_ATTACHMENTS_BEGIN-->[\s\S]*?<!--LMENTOR_ATTACHMENTS_END-->/g, "")
    .trim();

  if (!agentProfile) {
    return normalizedMessage;
  }

  const allowedSkills = ensureArray(agentProfile.enabled_skill_ids).filter(Boolean);
  const normalizedAllowedSkills = new Set(allowedSkills.map((skillId) => canonicalSkillName(skillId)));
  const hasAcademicResearchSuite = normalizedAllowedSkills.has("academic-research-suite");
  const isXiaodao = String(agentProfile.id || "").trim() === DEFAULT_BUILTIN_AGENT_ID;
  const visibleMemories = resolveVisibleAgentMemories(roster?.memoryState, agentProfile);
  const memoryPrompt = buildAgentMemoryPrompt(visibleMemories);
  const sections = [
    "<LMENTOR_AGENT_PROFILE>",
    roster?.lineageName ? `当前所属师门：${roster.lineageName}` : "",
    roster?.userName ? `当前来访者：${roster.userName}` : "",
    `当前 Agent：${displayRosterAgentName(agentProfile)}`,
    `身份定位：${agentProfile.role_title}`,
    agentProfile.summary ? `职责说明：${agentProfile.summary}` : "",
    agentProfile.tone ? `语气设定：${agentProfile.tone}` : "",
    agentProfile.custom_instructions ? `自定义设定：\n${agentProfile.custom_instructions}` : "",
    allowedSkills.length > 0 && skillIndexPath ? `已激活 Skill 索引：${skillIndexPath}` : "",
    skillCandidates.length > 0
      ? `本轮候选 Skill（由桥接基于已授权 Skill 的名称与用途动态检索，不是固定路由）：\n${skillCandidates.map((entry, index) => `${index + 1}. ${entry.title}：${entry.description}\n   规范文件：${entry.skillPath}`).join("\n")}`
      : "",
    "</LMENTOR_AGENT_PROFILE>",
    "<LMENTOR_RESPONSE_RULES>",
    "你必须稳定扮演上述 Agent，在不偏离用户真实目标的前提下完成本轮任务。",
    "语气设定、自定义设定、身份定位属于本轮高优先级硬约束，必须贯穿整段回复，不能只在开头点缀一句。",
    "不要说“我会按这个设定执行”“我正在扮演某个角色”之类跳出身份的话；直接以该身份说话、思考和回答。",
    "如果语气设定要求文言文、古风、仙侠、导师式、严肃学术等明确风格，则正文整体都必须遵守该风格，除非用户本轮明确要求改用别的风格。",
    "如果用户询问你是谁、你能做什么、你能调用什么 skill、当前设定为何，请直接完整回答，不要反问，不要要求用户先给具体任务。",
    "如果问题简单且不需要工具或联网，请直接回答，避免不必要的长时间思考。",
    isXiaodao && allowedSkills.length > 0
      ? "小导工具调用总流程：对于每一项实质性用户任务，在回答、分析文件、联网、编写内容或执行命令前，先完整理解任务目标、输入、预期交付物、约束和风险；先审阅桥接提供的本轮候选 Skill，按任务范围和步骤依赖确认最相关的一至三个候选，再只读取确认候选的 SKILL.md，并严格按其规则调用工具、执行、核验和交付。若候选不足、无候选或任务范围存在歧义，才读取上方完整 Skill 索引进行补充检索。不得跳过这一步直接凭一般能力处理本可由已激活 Skill 改善质量、可靠性或可追溯性的任务。"
      : allowedSkills.length > 0
        ? "收到请求后，先根据任务含义判断是否需要专业 Skill。需要时，先读取上方“已激活 Skill 索引”，从中定位最相关的一至三个候选项；只读取确认直接相关的 SKILL.md，并严格执行其流程与工具要求。不得一次性读取、扫描、执行或复述全部已激活 Skill。"
      : "当前 Agent 没有配置特长 skill；直接依据自身通用能力完成任务，不得虚构 skill 调用。",
    isXiaodao && allowedSkills.length > 0
      ? "小导不得把候选检索误解为逐项扫描全部 Skill，也不得把未经检索的猜测、计划或通用回答包装为已按专业流程完成。候选检索、读取选中规范、实际工具调用与结果核验应构成连续证据链；若任务不需要工具，仍须完成候选的适用性判断，再采用模型通用能力。桥接候选仅缩短检索，不替代你的任务理解与专业判断。"
      : "",
    hasAcademicResearchSuite
      ? "学术工作流优先级：当用户目标需要连续完成研究问题澄清、苏格拉底式引导、文献或证据综述、研究计划或方法设计、论文/章节撰写或修订、同行评审、引文与学术规范核验、实验或研究方案设计中的两项及以上时，academic-research-suite 必须作为本轮首选的主工作流 Skill。先读取它的 SKILL.md，再由其流程决定是否调用其他已授权的专门 Skill。不得因索引中存在 literature-review、scientific-writing、research-lookup、experimental-design、peer-review、citation-management 等单点 Skill，就绕过综合学术工作流。"
      : "",
    hasAcademicResearchSuite
      ? "如果用户直接提及 academic-research-suite、ARS 或 /ars- 指令，必须读取并遵循 academic-research-suite/SKILL.md。只有用户明确要求一个原子型专门操作，且不要求研究问题、证据、方法、写作或审查之间的联动时，才可以优先使用相应的单点 Skill；这不是基于表面关键词的硬编码分流，而是依据任务范围、交付物和步骤依赖作出的工作流判断。"
      : "",
    allowedSkills.length > 0
      ? "若检索后确认已激活 Skill 均不适用，才使用模型自身的通用能力直接完成任务；不要为了形式而调用无关 Skill。即使运行环境还安装了其他 Skill，也只能把当前 Agent 已授权的 Skill 作为其特长调用范围。"
      : "",
    "在 Windows 环境读取含中文的本地 skill 或参考文件时，优先使用 Node 的 UTF-8 读取方式：node -e \"process.stdout.write(require('node:fs').readFileSync(process.argv[1], 'utf8'))\" \"绝对路径\"。不要直接使用 Get-Content；它在隔离运行环境的输出通道中可能产生乱码。一次只读取一个明确的绝对路径，不要用变量或多条命令拼接读取动作，以避免本地安全策略误拦截。",
    "在 Windows 环境生成或覆盖含中文的文章、报告、Markdown、HTML、SVG 或脚本时，必须使用师门的 UTF-8 无 BOM 写入器：& $env:LMENTOR_UTF8_WRITER -Path '绝对路径' -Text $content。其中 $content 必须是完整正文；写入器会创建父目录并回读验证。不要使用 Set-Content、Out-File、重定向符号或默认编码写入，因为它们可能把中文替换为“？”。若需在工具输出中展示中文，同时设置 [Console]::OutputEncoding 和 $OutputEncoding 为 UTF-8。写入后必须用 Node 的 UTF-8 读取方式复核；若发现连续两个或以上英文问号，必须以原始正文重新写入后再交付。",
    "依赖闭环：当任务所需 Python 模块或 R 包在执行前的导入检查中缺失，或执行时明确出现 ModuleNotFoundError、ImportError、package not found 等依赖缺失错误，先确认该依赖确为完成当前任务所必需，再由你自行安装到师门隔离环境，无需询问或要求用户手工干预。安装后必须完成导入/加载验证，并继续重试原来的只读或安全可重复步骤；不得因为缺少第三方包而降级为假设性结果、只给安装教程或提前结束。Python 必须使用：& $env:PYTHON $env:LMENTOR_PYTHON_INSTALLER --package 'PyPI包名' --import-name '导入名'；安装器会依次使用阿里云、清华和中科大 PyPI 镜像，并安装到师门隔离 Python 环境。R 必须使用：& (Get-Command Rscript -ErrorAction Stop).Source $env:LMENTOR_R_INSTALLER --package 'CRAN包名'；它会安装到师门 .Rlib。不得使用全局 pip、npm 或随意修改系统环境；不得接受 URL、路径、安装参数或命令片段作为包名。若失败的步骤会产生文件、提交数据或修改外部状态，安装后必须先向用户说明，不得自行重复执行。",
    "若以中文作答，一律默认使用简体中文；即便读取到繁体中文技能、模板、示例或资料，面向用户的最终输出也要转换为简体中文，除非用户明确要求保留繁体或原文。",
    "</LMENTOR_RESPONSE_RULES>",
    memoryPrompt,
    "<LMENTOR_USER_REQUEST>",
    normalizedMessage,
    "</LMENTOR_USER_REQUEST>",
  ].filter(Boolean);

  return sections.join("\n\n");
}

function prepareCodexPrompt(message, agentProfile = null, roster = null, skillIndexPath = "", skillCandidates = []) {
  const basePrompt = buildRosterAgentPrompt(agentProfile, message, roster, skillIndexPath, skillCandidates);
  if (!agentProfile) {
    return basePrompt;
  }

  const teammateLines = describeRosterTeammates(roster, agentProfile.id);
  const workflowRules = defaultMultiAgentWorkflowFoundation();
  const sections = [
    basePrompt,
    "<LMENTOR_MULTI_AGENT_FOUNDATION>",
    `当前名册 Agent 总数：${ensureArray(roster?.profiles).length || 1}`,
    teammateLines.length > 0 ? `其他可切换 Agent：\n${teammateLines.join("\n")}` : "其他可切换 Agent：暂无",
    "多 Agent 协作基础规则：",
    ...workflowRules.map((line, index) => `${index + 1}. ${line}`),
    "</LMENTOR_MULTI_AGENT_FOUNDATION>",
  ].filter(Boolean);

  return sections.join("\n\n");
}

function pushDiagnosticLine(buffer, line, maxLines = 40) {
  const text = String(line || "").replace(/\r/g, "").trimEnd();
  if (!text) return;
  buffer.push(text);
  if (buffer.length > maxLines) {
    buffer.splice(0, buffer.length - maxLines);
  }
}

function formatCodexRunFailure({ code, signal, stderr, stdoutLines }) {
  const header = ["Codex 进程异常退出。"];
  if (code !== null && code !== undefined) {
    header.push(`退出码：${code}`);
  }
  if (signal) {
    header.push(`信号：${signal}`);
  }

  const parts = [header.join(" ")];
  const trimmedStderr = String(stderr || "").trim();
  if (trimmedStderr) {
    parts.push(`stderr:\n${trimmedStderr}`);
  }
  if (stdoutLines.length > 0) {
    parts.push(`stdout:\n${stdoutLines.join("\n")}`);
  }
  return parts.join("\n\n");
}

async function resolveCodexPermissionArgs(projectPath) {
  const bridgeState = await readBridgeState();
  const savedMode = bridgeState.projectSettingsLocal[projectPath]?.permissions?.defaultMode || null;
  const effectiveMode = isKnownCodexPermissionMode(savedMode) ? savedMode : "bypassPermissions";
  const preset = codexPermissionPresetToConfig(effectiveMode);

  return [
    "-c",
    `approval_policy=${JSON.stringify(preset.approvalPolicy)}`,
    "-c",
    `sandbox_mode=${JSON.stringify(preset.sandboxMode)}`,
  ];
}

function isTrackableRuntimeItem(item) {
  const type = String(item?.type || "").trim();
  return Boolean(type) && !["agent_message", "reasoning", "compaction", "system_message", "error"].includes(type);
}

function runtimeToolName(item) {
  const type = String(item?.type || "tool").trim();
  if (type === "command_execution") return "shell_command";
  if (type === "mcp_tool_call") return `${item?.server || "mcp"}/${item?.tool || "tool"}`;
  if (["image_generation_call", "image_generation", "imagegen"].includes(type)) return "imagegen";
  if (["web_search_call", "web_search"].includes(type)) return "web_search";
  return String(item?.name || item?.tool || item?.tool_name || type || "tool");
}

function runtimeCommandText(item) {
  return firstNonEmptyString(
    typeof item?.command === "string" ? item.command : "",
    typeof item?.input?.command === "string" ? item.input.command : "",
    typeof item?.arguments?.command === "string" ? item.arguments.command : "",
    typeof item?.parameters?.command === "string" ? item.parameters.command : "",
  );
}

function parseRuntimeToolArguments(argumentsValue) {
  if (argumentsValue && typeof argumentsValue === "object" && !Array.isArray(argumentsValue)) {
    return argumentsValue;
  }
  if (typeof argumentsValue !== "string" || !argumentsValue.trim()) return {};
  try {
    const parsed = JSON.parse(argumentsValue);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function runtimeCommandFromArguments(argumentsValue) {
  const parsed = parseRuntimeToolArguments(argumentsValue);
  return typeof parsed.command === "string" ? parsed.command : "";
}

function normalizeTraceToolPayload(payload) {
  const rawInput = parseRuntimeToolArguments(payload?.arguments ?? payload?.input);
  const command = runtimeCommandFromArguments(rawInput);
  const runtimeItem = {
    type: String(payload?.name || "") === "shell_command" ? "command_execution" : "",
    command,
  };
  const semanticTool = runtimeSemanticTool(runtimeItem);
  if (isInternalRuntimeScaffolding(runtimeItem) && !semanticTool) return null;
  return {
    name: semanticTool?.name || String(payload?.name || "tool"),
    input: semanticTool?.input || rawInput,
    semantic: semanticTool?.semantic || null,
  };
}

function extractSkillReferenceFromCommand(command) {
  const normalized = String(command || "").replaceAll("\\", "/");
  const match = normalized.match(/skills\/(?:\.system\/)?([^/'\"]+)\/SKILL\.md\b/i);
  if (!match?.[1]) return null;

  const skillId = canonicalSkillName(match[1]);
  if (!skillId) return null;
  return {
    skillId,
    skillPath: normalized.match(/[^'\"]*skills\/(?:\.system\/)?[^/'\"]+\/SKILL\.md\b/i)?.[0] || "",
  };
}

function runtimeSemanticTool(item) {
  if (String(item?.type || "").trim() !== "command_execution") return null;
  const command = runtimeCommandText(item);
  if (/lmentor-runtime[\\/]+agent-skill-indexes[\\/]+[^\\/]+\.md\b/i.test(command)) {
    return {
      name: "skill_index",
      input: { operation: "read_skill_index" },
      semantic: "index",
    };
  }

  const skill = extractSkillReferenceFromCommand(command);
  if (!skill) return null;
  return {
    name: `skill:${skill.skillId}`,
    input: {
      skill_id: skill.skillId,
      skill_path: skill.skillPath,
      operation: "load_instructions",
    },
    semantic: "skill",
  };
}

function isInternalRuntimeScaffolding(item) {
  if (String(item?.type || "").trim() !== "command_execution") return false;
  const command = runtimeCommandText(item);
  if (!command) return false;

  // The generated manifest is implementation detail. A concrete SKILL.md read is
  // exposed as a semantic Skill event instead of a PowerShell or Node command.
  return /lmentor-runtime[\\/]+agent-skill-indexes[\\/]+[^\\/]+\.md\b/i.test(command);
}

function isSemanticSkillToolName(name) {
  return /^skill:[A-Za-z0-9_-]+$/i.test(String(name || "").trim());
}

function runtimeCallId(item, fallback) {
  return String(item?.call_id || item?.id || fallback).trim();
}

function runtimeToolInput(item) {
  return item?.arguments || item?.input || item?.parameters || item?.prompt || {
    type: item?.type || "tool",
  };
}

function runtimeValueToText(value) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function describeRuntimeToolError(error) {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const detail = firstNonEmptyString(
      typeof error.message === "string" ? error.message : "",
      typeof error.detail === "string" ? error.detail : "",
      typeof error.reason === "string" ? error.reason : "",
      typeof error.error_description === "string" ? error.error_description : "",
    );
    if (detail) return detail;
    const type = typeof error.type === "string" ? error.type.trim() : "";
    const code = typeof error.code === "string" || typeof error.code === "number" ? String(error.code) : "";
    if (type || code) {
      return `工具调用失败：上游未提供详细原因（${[type, code].filter(Boolean).join(" / ")}）。`;
    }
  }
  return "工具调用失败：上游未提供详细原因。";
}

function toolOutputIndicatesFailure(value) {
  const output = runtimeValueToText(value);
  return /Exit code:\s*[1-9]|rejected:\s*blocked by policy|\b(?:tool )?(?:failed|failure)\b/i.test(output);
}

function runtimeToolOutput(item) {
  if (item?.error) {
    const description = describeRuntimeToolError(item.error);
    const fallback = runtimeValueToText(item?.result || item?.output || item?.aggregated_output || item?.text);
    return fallback ? `${description}\n\n${fallback}` : description;
  }
  return runtimeValueToText(item?.result || item?.output || item?.aggregated_output || item?.text);
}

function runtimeToolFailed(item) {
  const exitCode = item?.exit_code;
  return Boolean(item?.error)
    || item?.status === "failed"
    || item?.status === "declined"
    || (exitCode !== undefined && exitCode !== null && Number(exitCode) !== 0)
    || toolOutputIndicatesFailure(item?.result || item?.output || item?.aggregated_output || item?.text);
}

async function spawnCodexRun({ projectPath, sessionId, message, pendingSessionId, imagePaths = [], rosterAgentId = "" }) {
  const bridgeState = await readBridgeState();
  const { roster, agent: activeRosterAgent } = resolveRosterAgentProfile(bridgeState, rosterAgentId);
  const skillIndexPath = activeRosterAgent?.enabled_skill_ids?.length
    ? await ensureAgentSkillIndex(activeRosterAgent)
    : "";
  const skillCandidates = activeRosterAgent?.enabled_skill_ids?.length
    ? resolveAgentSkillCandidates(activeRosterAgent, message)
    : [];
  const streamAgentId = activeRosterAgent?.id || DEFAULT_BUILTIN_AGENT_ID;
  const permissionArgs = await resolveCodexPermissionArgs(projectPath);
  const imageArgs = ensureArray(imagePaths)
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .flatMap((filePath) => ["--image", filePath]);
  const commandArgs = sessionId
    ? ["exec", "resume", sessionId, ...permissionArgs, ...imageArgs, "--json", "--skip-git-repo-check", "-"]
    : ["exec", ...permissionArgs, ...imageArgs, "--json", "--skip-git-repo-check", "-"];

  const codexUsesShell = CODEX_CLI_PATH.toLowerCase().endsWith(".cmd") || CODEX_CLI_PATH.toLowerCase().endsWith(".bat");
  const child = spawn(CODEX_CLI_PATH, commandArgs, {
    cwd: projectPath,
    shell: codexUsesShell,
    windowsHide: true,
    env: buildCodexChildEnv(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end(prepareCodexPrompt(message, activeRosterAgent, roster, skillIndexPath, skillCandidates), "utf8");

  const streamId = sessionId || pendingSessionId || `pending-${Date.now()}`;
  activeRuns.set(streamId, child);

  let sawTurnComplete = false;
  let stderrBuffer = "";
  let stdoutBuffer = "";
  const plainStdoutLines = [];
  const capturedTools = new Map();
  const artifactCandidates = new Set();
  const userPreview = shortPreview(message, "当前轮次");
  let resolvedSessionId = sessionId || "";

  const emit = (data) => {
    broadcast({
      agent_id: streamAgentId,
      session_id: streamId,
      event_type: data.kind,
      data,
    });
  };

  const emitToolStart = (item) => {
    const callId = runtimeCallId(item, `tool-${Date.now()}-${capturedTools.size + 1}`);
    const semanticTool = runtimeSemanticTool(item);
    if (isInternalRuntimeScaffolding(item) && !semanticTool) {
      return null;
    }
    const tool = semanticTool?.name || runtimeToolName(item);
    const input = semanticTool?.input || runtimeToolInput(item);
    collectArtifactCandidates(input, projectPath, artifactCandidates);
    if (!capturedTools.has(callId)) {
      capturedTools.set(callId, { id: callId, name: tool, status: "running" });
      emit({ kind: "tool_use_start", call_id: callId, tool, input });
    }
    return callId;
  };

  const emitToolResult = (item) => {
    const callId = emitToolStart(item);
    if (!callId) return;
    const isError = runtimeToolFailed(item);
    collectArtifactCandidates(runtimeToolOutput(item), projectPath, artifactCandidates);
    const existing = capturedTools.get(callId);
    capturedTools.set(callId, {
      ...(existing || { id: callId, name: runtimeSemanticTool(item)?.name || runtimeToolName(item) }),
      status: isError ? "error" : "success",
    });
    emit({ kind: "tool_use_result", call_id: callId, output: runtimeToolOutput(item), is_error: isError });
  };

  const finishTurn = async (reason, usage) => {
    const artifacts = await resolveGeneratedArtifacts(artifactCandidates, projectPath);
    if (artifacts.length > 0) {
      emit({ kind: "text_delta", delta: appendArtifactReferences("", artifacts) });
    }
    const persist = capturedTools.size > 0
      ? persistSessionToolTrace(resolvedSessionId || streamId, userPreview, capturedTools)
      : Promise.resolve();
    void persist.catch(() => {}).finally(() => {
      emit({ kind: "turn_complete", reason, usage: usage || null });
    });
  };

  const parseStdoutLine = (line) => {
    if (!line) return;
    if (!line.trim().startsWith("{")) {
      pushDiagnosticLine(plainStdoutLines, line);
      return;
    }

    let payload;
    try {
      payload = JSON.parse(line);
    } catch {
      pushDiagnosticLine(plainStdoutLines, line);
      return;
    }

    const type = payload?.type;
    if (type === "thread.started" && typeof payload.thread_id === "string") {
      resolvedSessionId = payload.thread_id;
      emit({ kind: "session_resolved", session_id: payload.thread_id });
      return;
    }

    if (type === "item.started" || type === "item.completed") {
      const item = payload.item || {};
      if (item.type === "agent_message" && typeof item.text === "string" && item.text) {
        collectArtifactCandidates(item.text, projectPath, artifactCandidates);
        emit({ kind: "text_delta", delta: item.text });
        return;
      }

      if (item.type === "command_execution") {
        if (type === "item.started") {
          emitToolStart({ ...item, input: { command: item.command || "" } });
        } else {
          emitToolResult(item);
        }
        return;
      }

      if (item.type === "mcp_tool_call") {
        if (type === "item.started") {
          emitToolStart(item);
        } else {
          emitToolResult(item);
        }
        return;
      }

      if (isTrackableRuntimeItem(item)) {
        if (type === "item.started") {
          emitToolStart(item);
        } else {
          emitToolResult(item);
        }
        return;
      }

      emit({ kind: "raw", agent: "codex", raw: payload });
      return;
    }

    if (type === "turn.completed") {
      sawTurnComplete = true;
      void finishTurn("complete", payload.usage || null);
      return;
    }

    if (type === "turn.failed" || type === "turn.cancelled" || type === "turn.aborted") {
      sawTurnComplete = true;
      const message = firstNonEmptyString(
        typeof payload?.error?.message === "string" ? payload.error.message : "",
        typeof payload?.message === "string" ? payload.message : "",
      );
      if (message) {
        emit({ kind: "error", message, recoverable: false });
      }
      void finishTurn(type, payload.usage || null);
      return;
    }

    emit({ kind: "raw", agent: "codex", raw: payload });
  };

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || "";
    for (const line of lines) parseStdoutLine(line);
  });

  child.stderr.on("data", (chunk) => {
    stderrBuffer += chunk.toString("utf8");
  });

  child.on("close", (code, signal) => {
    activeRuns.delete(streamId);
    if (stdoutBuffer.trim()) {
      parseStdoutLine(stdoutBuffer.trim());
      stdoutBuffer = "";
    }

    if (!sawTurnComplete) {
      const text = formatCodexRunFailure({
        code,
        signal,
        stderr: stderrBuffer,
        stdoutLines: plainStdoutLines,
      });
      emit({ kind: "error", message: text, recoverable: false });
      void finishTurn("error", null);
    }
  });

  child.on("error", (error) => {
    activeRuns.delete(streamId);
    const text = formatCodexRunFailure({
      code: null,
      signal: null,
      stderr: stderrBuffer || error.message,
      stdoutLines: plainStdoutLines,
    });
    emit({ kind: "error", message: text, recoverable: false });
    emit({ kind: "turn_complete", reason: "error", usage: null });
  });

  return {
    agent_id: streamAgentId,
    session_id: streamId,
    process_id: child.pid || 0,
  };
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const table = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".pdf": "application/pdf",
  };
  return table[ext] || "application/octet-stream";
}

async function readClipboardFilePaths() {
  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-Command", "Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }"], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });

    let output = "";
    ps.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    ps.on("close", () => {
      resolve(output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean));
    });
    ps.on("error", () => resolve([]));
  });
}

async function runPowerShellSelection(script) {
  // A native picker is intentionally modal and can remain open while the user
  // navigates disks. Do not apply the ordinary short command timeout to it.
  const result = await runProcess("powershell.exe", ["-NoProfile", "-STA", "-Command", script], {
    timeoutMs: 15 * 60 * 1000,
    windowsHide: true,
  });
  if (result.code !== 0) {
    throw new Error((result.stderr || result.stdout || "绯荤粺閫夋嫨鍣ㄦ墦寮€澶辫触").trim());
  }
  return result.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

async function openNativeFileDialog(multiple = false) {
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dlg = New-Object System.Windows.Forms.OpenFileDialog",
    "$dlg.Multiselect = " + (multiple ? "$true" : "$false"),
    "$dlg.CheckFileExists = $true",
    "$dlg.CheckPathExists = $true",
    "$dlg.Title = '閫夋嫨鏂囦欢'",
    "if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
    "  $dlg.FileNames | ForEach-Object { Write-Output $_ }",
    "}",
  ].join("; ");
  return runPowerShellSelection(script);
}

async function openNativeDirectoryDialog() {
  const helperCandidates = [
    path.join(APP_ROOT, "tools", "LmentorFolderPicker.exe"),
    path.join(APP_ROOT, "runtime", "tools", "LmentorFolderPicker.exe"),
  ];
  for (const helperPath of helperCandidates) {
    if (!(await pathExists(helperPath))) continue;
    const helperResult = await runProcess(helperPath, [], {
      timeoutMs: 15 * 60 * 1000,
      windowsHide: true,
    });
    if (helperResult.code !== 0) {
      throw new Error((helperResult.stderr || helperResult.stdout || "System folder picker failed to open.").trim());
    }
    return helperResult.stdout.split(/\r?\n/).map((item) => item.trim()).find(Boolean) ?? null;
  }

  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dlg = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$dlg.Description = 'Select project folder'",
    "$dlg.ShowNewFolderButton = $true",
    // An invisible topmost owner prevents the picker from opening behind the
    // browser window on packaged Windows builds.
    "$owner = New-Object System.Windows.Forms.Form",
    "$owner.TopMost = $true",
    "$owner.ShowInTaskbar = $false",
    "$owner.Opacity = 0",
    "$owner.Show()",
    "$owner.Activate()",
    "try { if ($dlg.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dlg.SelectedPath } } finally { $dlg.Dispose(); $owner.Close(); $owner.Dispose() }",
  ].join("; ");
  const result = await runPowerShellSelection(script);
  return result[0] ?? null;
}

async function createBackupIfExists(targetPath, prefix) {
  if (!(await pathExists(targetPath))) return null;
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `${prefix}-${timestampForFile()}${path.extname(targetPath)}`);
  await fs.copyFile(targetPath, backupPath);
  return backupPath;
}

async function listBackups() {
  if (!(await pathExists(BACKUP_DIR))) return [];
  const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(BACKUP_DIR, entry.name);
    const stats = await fs.stat(fullPath);
    items.push({
      name: entry.name,
      path: fullPath,
      timestamp: new Date(stats.mtimeMs).toLocaleString("zh-CN"),
    });
  }
  return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

async function exportFile(targetPath, suffix) {
  await fs.mkdir(EXPORT_DIR, { recursive: true });
  const outputPath = path.join(EXPORT_DIR, `${timestampForFile()}-${suffix}${path.extname(targetPath)}`);
  await fs.copyFile(targetPath, outputPath);
  return outputPath;
}

async function detectEnvironment() {
  const [nodeInstalled, npmInstalled, pythonRuntime] = await Promise.all([
    commandExists("node"),
    commandExists("npm"),
    detectPythonRuntime(),
  ]);
  const [nodeVersion, npmVersion, pythonVersion] = await Promise.all([
    nodeInstalled ? safeDetectVersion("node") : null,
    npmInstalled ? safeDetectVersion("npm") : null,
    Promise.resolve(pythonRuntime.version),
  ]);

  return {
    node_installed: nodeInstalled,
    node_version: nodeVersion,
    npm_installed: npmInstalled,
    npm_version: npmVersion,
    python_installed: pythonRuntime.installed,
    python_version: pythonVersion,
  };
}

async function detectAgentStatuses(activeAgentId) {
  const statuses = [];
  for (const definition of AGENT_DEFINITIONS) {
    try {
      if (definition.id === "codex") {
        const health = await detectCodexCliHealth();
        statuses.push({
          id: definition.id,
          display_name: definition.display_name,
          icon: definition.icon,
          capabilities: definition.capabilities,
          install_hint: definition.install_hint,
          native_install_command: definition.native_install_command,
          health,
          active: definition.id === activeAgentId,
        });
        continue;
      }

      const installed = await commandExists(definition.binary);
      let version = null;
      let binaryPath = null;
      let error = installed ? null : "未安装";

      if (installed) {
        try {
          const binaryPathResult = await runProcess("where.exe", [definition.binary], { timeoutMs: 5000 });
          binaryPath = binaryPathResult.code === 0
            ? binaryPathResult.stdout.split(/\r?\n/).find(Boolean) ?? null
            : null;
        } catch (pathError) {
          if (!error) {
            error = pathError instanceof Error ? pathError.message : String(pathError);
          }
        }

        try {
          version = await detectVersion(binaryPath || definition.binary);
          error = null;
        } catch (versionError) {
          error = versionError instanceof Error ? versionError.message : String(versionError);
        }
      }

      statuses.push({
        id: definition.id,
        display_name: definition.display_name,
        icon: definition.icon,
        capabilities: definition.capabilities,
        install_hint: definition.install_hint,
        native_install_command: definition.native_install_command,
        health: {
          installed,
          version,
          error,
          binary_path: binaryPath,
          last_checked_at: Date.now(),
        },
        active: definition.id === activeAgentId,
      });
    } catch (statusError) {
      statuses.push({
        id: definition.id,
        display_name: definition.display_name,
        icon: definition.icon,
        capabilities: definition.capabilities,
        install_hint: definition.install_hint,
        native_install_command: definition.native_install_command,
        health: {
          installed: false,
          version: null,
          error: statusError instanceof Error ? statusError.message : String(statusError),
          binary_path: null,
          last_checked_at: Date.now(),
        },
        active: definition.id === activeAgentId,
      });
    }
  }
  return statuses.map(({ active, ...rest }) => rest);
}

function findAgentDefinition(agentId) {
  return AGENT_DEFINITIONS.find((definition) => definition.id === agentId) || null;
}

function escapePowerShellString(value) {
  return String(value || "").replace(/'/g, "''");
}

async function restartAgentCli(agentId) {
  const definition = findAgentDefinition(agentId);
  if (!definition) {
    throw new Error(`不支持重启该 CLI：${agentId}`);
  }

  for (const child of activeRuns.values()) {
    child.kill();
  }
  activeRuns.clear();

  const processMatchers = ensureArray(definition.process_matchers)
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  const matcherConditions = processMatchers.map((matcher) => {
    const escaped = escapePowerShellString(matcher);
    return `($_.CommandLine -like '*${escaped}*' -or $_.Name -like '*${escaped}*')`;
  });

  if (matcherConditions.length > 0) {
    const psScript = [
      "$bridgeMarker = 'lmentor-codex-bridge.mjs'",
      "$targets = Get-CimInstance Win32_Process | Where-Object {",
      "  $_.ProcessId -ne $PID -and $_.CommandLine -notlike \"*$bridgeMarker*\" -and (",
      `    ${matcherConditions.join(" -or ")}`,
      "  )",
      "}",
      "foreach ($target in $targets) {",
      "  try { Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop } catch {}",
      "}",
    ].join("\n");
    await runProcess("powershell.exe", ["-NoProfile", "-Command", psScript], {
      timeoutMs: 15000,
      windowsHide: true,
    });
  }

  const installed = definition.id === "codex"
    ? await pathExists(CODEX_CLI_PATH)
    : await commandExists(definition.binary);
  if (!installed) {
    throw new Error(`${definition.display_name} 未安装，无法重启。`);
  }

  try {
    if (definition.id === "codex") {
      await detectCodexVersion();
    } else {
      await detectVersion(definition.binary);
    }
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `${definition.display_name} 重启后健康检查失败：${error.message}`
        : `${definition.display_name} 重启后健康检查失败。`,
    );
  }

  return {
    agent_id: definition.id,
    display_name: definition.display_name,
    restarted_at: new Date().toISOString(),
  };
}

async function restartIsolatedCodexCli() {
  for (const child of activeRuns.values()) {
    child.kill();
  }
  activeRuns.clear();

  const normalizedCodexCliPath = path.resolve(CODEX_CLI_PATH);
  const normalizedCodexHome = path.resolve(CODEX_HOME);
  const normalizedProjectRoot = path.resolve(CODEX_PROJECT_ROOT);
  const binaryName = path.basename(normalizedCodexCliPath);

  const psScript = [
    `$targetExe = '${escapePowerShellString(normalizedCodexCliPath)}'`,
    `$targetHome = '${escapePowerShellString(normalizedCodexHome)}'`,
    `$targetProject = '${escapePowerShellString(normalizedProjectRoot)}'`,
    `$targetName = '${escapePowerShellString(binaryName)}'`,
    "$bridgeMarker = 'lmentor-codex-bridge.mjs'",
    "$targets = Get-CimInstance Win32_Process | Where-Object {",
    "  $cmd = [string]$_.CommandLine",
    "  $exe = [string]$_.ExecutablePath",
    "  $_.ProcessId -ne $PID -and",
    "  $cmd -notlike \"*$bridgeMarker*\" -and",
    "  (",
    "    ($exe -and [System.StringComparer]::OrdinalIgnoreCase.Equals($exe, $targetExe)) -or",
    "    ($cmd -and $cmd -like \"*$targetExe*\") -or",
    "    ($cmd -and $cmd -like \"*$targetHome*\") -or",
    "    ($cmd -and $cmd -like \"*$targetProject*\" -and $cmd -like \"*$targetName*\")",
    "  )",
    "}",
    "foreach ($target in $targets) {",
    "  try { Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop } catch {}",
    "}",
  ].join("\n");

  await runProcess("powershell.exe", ["-NoProfile", "-Command", psScript], {
    timeoutMs: 15000,
    windowsHide: true,
  });

  const installed = await pathExists(CODEX_CLI_PATH);
  if (!installed) {
    throw new Error(`未找到隔离运行环境：${CODEX_CLI_PATH}`);
  }

  try {
    await detectCodexVersion();
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `隔离运行环境重启后健康检查失败：${error.message}`
        : "隔离运行环境重启后健康检查失败。",
    );
  }

  return {
    agent_id: "codex",
    display_name: "主智能体运行环境",
    restarted_at: new Date().toISOString(),
    runtime_home: CODEX_HOME,
    binary_path: CODEX_CLI_PATH,
    isolated: path.resolve(CODEX_HOME) !== path.resolve(SYSTEM_CODEX_HOME),
    using_project_runtime: isPathInside(CODEX_PROJECT_ROOT, CODEX_CLI_PATH),
  };
}

async function dynamicBuiltInCommands() {
  const cwd = process.cwd();
  const commands = [
    { name: "打开当前工作区", command: `code "${cwd}"` },
    { name: "鍒楀嚭褰撳墠鏂囦欢", command: `rg --files "${cwd}"` },
  ];
  if (await pathExists(path.join(cwd, ".git"))) {
    commands.push({ name: "查看 Git 状态", command: `git -C "${cwd}" status --short` });
  }
  return commands;
}

async function openTerminalWindow({ cwd, commandStr }) {
  const psScript = [
    "$arguments = @(",
    '"/k",',
    `"cd /d \\"${cwd.replace(/\\/g, "\\\\")}\\" && ${commandStr.replace(/"/g, '\\"')}"`,
    ")",
    '$process = Start-Process -FilePath "cmd.exe" -ArgumentList $arguments -PassThru',
    "$process.Id",
  ].join("\n");
  const result = await runProcess("powershell.exe", ["-NoProfile", "-Command", psScript], { timeoutMs: 10000 });
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "无法打开终端窗口。");
  }
  return Number(result.stdout.trim());
}

async function focusTerminalPid(pid) {
  const psScript = `(New-Object -ComObject WScript.Shell).AppActivate(${pid})`;
  const result = await runProcess("powershell.exe", ["-NoProfile", "-Command", psScript], { timeoutMs: 5000 });
  return result.code === 0;
}

async function queryLatestNpmVersion(packageName) {
  const result = await runProcess("npm", ["view", packageName, "version", "--json"], { timeoutMs: 15000 });
  if (result.code !== 0) return null;
  try {
    const parsed = JSON.parse(result.stdout);
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return result.stdout.trim() || null;
  }
}

async function queryLatestRelease() {
  const currentVersion = await readPackageVersion();
  try {
    const response = await fetch("https://api.github.com/repos/wang5766171/jishu-hub/releases/latest", {
      headers: { "User-Agent": "Lmentor-Bridge" },
    });
    if (!response.ok) {
      return { latest_version: null, has_update: false, release_url: "", error: `HTTP ${response.status}` };
    }
    const payload = await response.json();
    const latestVersion = typeof payload.tag_name === "string" ? payload.tag_name.replace(/^v/, "") : null;
    return {
      latest_version: latestVersion,
      has_update: Boolean(latestVersion && latestVersion !== currentVersion),
      release_url: typeof payload.html_url === "string" ? payload.html_url : "",
      error: null,
    };
  } catch (error) {
    return {
      latest_version: null,
      has_update: false,
      release_url: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function scanProjects() {
  const bridgeState = await readBridgeState();
  const globalState = await readGlobalState();
  const allSessions = await listSessionsAllInternalLive();

  const roots = new Set();
  for (const root of ensureArray(globalState["electron-saved-workspace-roots"])) {
    if (typeof root === "string" && root.trim()) roots.add(root);
  }
  for (const root of ensureArray(globalState["active-workspace-roots"])) {
    if (typeof root === "string" && root.trim()) roots.add(root);
  }
  for (const root of bridgeState.manualProjects) {
    if (typeof root === "string" && root.trim()) roots.add(root);
  }
  for (const session of allSessions) {
    if (session.project_path) roots.add(session.project_path);
  }

  const hidden = new Set(bridgeState.hiddenProjects);
  const counts = new Map();
  const lastActive = new Map();

  for (const session of allSessions) {
    const cwd = session.project_path;
    if (!cwd) continue;
    counts.set(cwd, (counts.get(cwd) || 0) + 1);
    const previous = lastActive.get(cwd);
    if (!previous || (session.last_active && session.last_active > previous)) {
      lastActive.set(cwd, session.last_active);
    }
  }

  const projects = [];
  for (const cwd of roots) {
    if (!(await pathExists(cwd))) continue;
    const encodedName = encodeProjectPath(cwd);
    if (hidden.has(encodedName)) continue;

    projects.push({
      name: basenameSafe(cwd),
      path: cwd,
      encoded_name: encodedName,
      session_count: counts.get(cwd) || 0,
      last_active: lastActive.get(cwd) || null,
      has_claude_md: await pathExists(path.join(cwd, ".claude", "CLAUDE.md")),
      agent_ids: ["codex"],
      initialized: true,
    });
  }

  projects.sort((a, b) => (b.last_active || "").localeCompare(a.last_active || ""));
  return projects;
}

async function handleInvoke(command, args = {}) {
  switch (command) {
    case "ensure_python_package":
      return { result: await ensureManagedPythonPackage(args) };
    case "scan_projects":
      return { result: await scanProjects() };
    case "load_project_metas": {
      const state = await readBridgeState();
      return { result: state.projectMetas };
    }
    case "save_project_meta": {
      await updateBridgeState((state) => ({
        ...state,
        projectMetas: {
          ...state.projectMetas,
          [String(args.encodedName || "")]: args.meta || {},
        },
      }));
      return { result: null };
    }
    case "get_project_merges": {
      const state = await readBridgeState();
      return { result: state.projectMerges };
    }
    case "merge_projects_logical": {
      await updateBridgeState((state) => {
        const primary = String(args.primary || "");
        const secondaries = ensureArray(args.secondaries).map((item) => String(item));
        return {
          ...state,
          projectMerges: {
            ...state.projectMerges,
            [primary]: secondaries,
          },
        };
      });
      return { result: null };
    }
    case "split_project": {
      await updateBridgeState((state) => {
        const encodedName = String(args.primary || args.encodedName || "");
        const nextMerges = { ...state.projectMerges };
        delete nextMerges[encodedName];
        return {
          ...state,
          projectMerges: nextMerges,
        };
      });
      return { result: null };
    }
    case "load_last_project": {
      const state = await readBridgeState();
      return { result: state.lastProjectEncoded };
    }
    case "save_last_project": {
      await updateBridgeState((state) => ({
        ...state,
        lastProjectEncoded: typeof args.encodedName === "string" ? args.encodedName : null,
      }));
      return { result: null };
    }
    case "add_project": {
      const targetPath = normalizeProjectRoot(args.path);
      if (!targetPath) {
        throw new Error("项目路径不能为空。");
      }
      const targetInfo = await fs.stat(targetPath).catch(() => null);
      if (!targetInfo?.isDirectory()) {
        throw new Error("项目路径必须是一个已存在的文件夹。");
      }

      await updateBridgeState((state) => {
        const next = new Set(state.manualProjects);
        next.add(targetPath);
        const hidden = new Set(state.hiddenProjects);
        hidden.delete(encodeProjectPath(targetPath));
        return {
          ...state,
          manualProjects: Array.from(next),
          hiddenProjects: Array.from(hidden),
        };
      });

      const projects = await scanProjects();
      return { result: projects.find((item) => item.path === targetPath) || null };
    }
    case "remove_project": {
      const encodedName = String(args.encodedName || "");
      await updateBridgeState((state) => ({
        ...state,
        hiddenProjects: Array.from(new Set([...state.hiddenProjects, encodedName])),
      }));
      return { result: null };
    }
    case "init_project":
      return { result: true };
    case "load_claude_md": {
      const projectPath = String(args.projectPath || "");
      const claudePath = path.join(projectPath, ".claude", "CLAUDE.md");
      if (!(await pathExists(claudePath))) return { result: null };
      return { result: await fs.readFile(claudePath, "utf8") };
    }
    case "list_sessions": {
      const encodedName = String(args.encodedName || "");
      // Chat sidebar only needs metadata. Avoid parsing full rollout bodies on
      // startup, which can stall the app when large session files exist.
      const sessions = await listSessionsAllInternalLive({ includeMessages: false });
      return { result: sessions.filter((session) => session.project_encoded_name === encodedName) };
    }
    case "list_all_sessions": {
      const sessions = await listSessionsAllInternalLive({ includeMessages: false });
      return { result: sessions };
    }
    case "load_session_manager": {
      const bridgeState = await readBridgeState();
      const sessions = await listSessionsAllInternalLive({ includeMessages: true });
      return { result: await buildSessionManagerLive(bridgeState, sessions) };
    }
    case "delete_session_record": {
      const sessionId = String(args.sessionId || "");
      const nextState = await deleteLiveSessionRecord(sessionId);
      const sessions = await listSessionsAllInternalLive({ includeMessages: true });
      return { result: await buildSessionManagerLive(nextState, sessions) };
    }
    case "export_session_markdown": {
      const sessionId = String(args.sessionId || "");
      const sessions = await listSessionsAllInternalLive({ includeMessages: true });
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) {
        throw new Error(`鏈壘鍒颁細璇濓細${sessionId}`);
      }
      return { result: buildSessionMarkdownExportLive(session) };
    }
    case "get_session_messages": {
      const sessionId = String(args.sessionId || "");
      const sessions = await listSessionsAllInternalLive({ includeMessages: true });
      const session = sessions.find((item) => item.id === sessionId);
      if (session?.messages?.length) {
        await ensureOphanimArtifactsInMessages(session.messages, session.project_path, session.id);
      }
      return { result: session?.messages || [] };
    }
    case "get_session_activity_trace": {
      const sessionId = String(args.sessionId || "");
      return { result: await buildSessionActivityTrace(sessionId) };
    }
    case "get_session_names": {
      const state = await readBridgeState();
      const sessions = await listSessionsAllInternalLive({ includeMessages: false });
      const names = {};
      for (const session of sessions) {
        if (session.display_name) {
          names[session.id] = session.display_name;
        } else if (!state.sessionNames[session.id]) {
          names[session.id] = "\u65b0\u5bf9\u8bdd";
        }
      }
      for (const [sessionId, savedName] of Object.entries(state.sessionNames)) {
        if (!isPlaceholderSessionName(savedName)) {
          names[sessionId] = savedName;
        }
      }
      return { result: names };
    }
    case "rename_session": {
      await updateBridgeState((state) => ({
        ...state,
        sessionNames: {
          ...state.sessionNames,
          [String(args.sessionId || "")]: String(args.name || "").trim(),
        },
      }));
      return { result: null };
    }
    case "delete_session_name": {
      await updateBridgeState((state) => {
        const nextNames = { ...state.sessionNames };
        delete nextNames[String(args.sessionId || "")];
        return {
          ...state,
          sessionNames: nextNames,
        };
      });
      return { result: null };
    }
    case "send_message": {
      const projectPath = String(args.projectPath || "").trim();
      const agentId = String(args.agentId || "").trim();
      const message = String(args.message || "");
      const sessionId = typeof args.sessionId === "string" && args.sessionId.trim() ? args.sessionId.trim() : null;
      const pendingSessionId = typeof args.pendingSessionId === "string" && args.pendingSessionId.trim()
        ? args.pendingSessionId.trim()
        : `pending-${Date.now()}`;
      const imagePaths = ensureArray(args.imagePaths)
        .map((item) => String(item || "").trim())
        .filter(Boolean);

      if (!projectPath) {
        throw new Error("缺少项目路径，无法发送消息。");
      }
      if (!message.trim()) {
        throw new Error("消息内容不能为空。");
      }

      await assertActiveProviderReachable();
      return { result: await spawnCodexRun({ projectPath, sessionId, message, pendingSessionId, imagePaths, rosterAgentId: agentId }) };
    }
    case "abort_chat": {
      const sessionId = String(args.sessionId || "");
      const child = activeRuns.get(sessionId);
      if (child) {
        child.kill();
        activeRuns.delete(sessionId);
      }
      return { result: null };
    }
    case "load_config": {
      if (!(await pathExists(STRUCTURED_CONFIG_PATH))) {
        throw Object.assign(new Error("当前未启用结构化配置，请使用原始配置编辑模式。"), { noFallback: true });
      }
      return { result: await readJson(STRUCTURED_CONFIG_PATH, {}) };
    }
    case "load_raw_config": {
      const content = (await pathExists(CODEX_CONFIG_PATH)) ? await fs.readFile(CODEX_CONFIG_PATH, "utf8") : "";
      return { result: { content, format: "toml" } };
    }
    case "save_config": {
      await createBackupIfExists(STRUCTURED_CONFIG_PATH, "structured-config");
      await writeJson(STRUCTURED_CONFIG_PATH, args.config || {});
      return { result: null };
    }
    case "save_raw_config": {
      await createBackupIfExists(CODEX_CONFIG_PATH, "codex-config");
      await fs.mkdir(path.dirname(CODEX_CONFIG_PATH), { recursive: true });
      await fs.writeFile(CODEX_CONFIG_PATH, String(args.content || ""), "utf8");
      return { result: null };
    }
    case "list_config_templates":
      return { result: [] };
    case "list_presets": {
      const state = await readBridgeState();
      return { result: state.presets };
    }
    case "save_preset": {
      const preset = clone(args.preset || {});
      const nextState = await updateBridgeState((state) => {
        const id = typeof preset.id === "string" && preset.id ? preset.id : `${Date.now()}`;
        const normalized = {
          ...preset,
          id,
          createdAt: typeof preset.createdAt === "string" && preset.createdAt ? preset.createdAt : new Date().toISOString(),
        };
        const presets = [...state.presets];
        const index = presets.findIndex((item) => item.id === id);
        if (index >= 0) presets[index] = normalized;
        else presets.unshift(normalized);
        return {
          ...state,
          presets,
        };
      });
      return { result: nextState.presets };
    }
    case "apply_preset": {
      const id = String(args.id || "");
      const state = await readBridgeState();
      const preset = state.presets.find((item) => item.id === id);
      if (!preset) {
        throw new Error(`鏈壘鍒伴璁撅細${id}`);
      }
      await createBackupIfExists(STRUCTURED_CONFIG_PATH, "structured-config");
      await writeJson(STRUCTURED_CONFIG_PATH, preset.config);
      return { result: null };
    }
    case "delete_preset": {
      const id = String(args.id || "");
      await updateBridgeState((state) => ({
        ...state,
        presets: state.presets.filter((item) => item.id !== id),
      }));
      return { result: null };
    }
    case "list_backups":
      return { result: await listBackups() };
    case "restore_backup": {
      const backupPath = String(args.backupPath || "");
      if (!(await pathExists(backupPath))) {
        throw new Error("备份文件不存在。");
      }
      const targetPath = backupPath.endsWith(".toml") ? CODEX_CONFIG_PATH : STRUCTURED_CONFIG_PATH;
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(backupPath, targetPath);
      return { result: null };
    }
    case "export_config_dialog": {
      if (!(await pathExists(STRUCTURED_CONFIG_PATH))) {
        throw new Error("当前没有可导出的结构化配置。");
      }
      return { result: await exportFile(STRUCTURED_CONFIG_PATH, "structured-config") };
    }
    case "export_raw_config_dialog": {
      if (!(await pathExists(CODEX_CONFIG_PATH))) {
        throw new Error("当前没有可导出的原始配置。");
      }
      return { result: await exportFile(CODEX_CONFIG_PATH, "codex-config") };
    }
    case "import_config_dialog":
      throw new Error("当前桥接层暂不支持图形导入，请直接编辑配置文件。");
    case "load_project_settings": {
      const state = await readBridgeState();
      return { result: state.projectSettingsShared[String(args.projectPath || "")] || defaultProjectSettings() };
    }
    case "load_project_settings_local": {
      const [state, liveConfig] = await Promise.all([
        readBridgeState(),
        readLiveCodexConfigObject(),
      ]);
      const projectPath = String(args.projectPath || "");
      return {
        result: mergeCodexPermissionSettings(
          state.projectSettingsLocal[projectPath] || defaultProjectSettings(),
          liveConfig,
        ),
      };
    }
    case "save_project_settings": {
      await updateBridgeState((state) => ({
        ...state,
        projectSettingsShared: {
          ...state.projectSettingsShared,
          [String(args.projectPath || "")]: args.settings || defaultProjectSettings(),
        },
      }));
      return { result: null };
    }
    case "save_project_settings_local": {
      const projectPath = String(args.projectPath || "");
      const nextSettings = args.settings || defaultProjectSettings();
      const requestedMode = nextSettings?.permissions?.defaultMode || "bypassPermissions";
      const permissionMode = isKnownCodexPermissionMode(requestedMode) ? requestedMode : "bypassPermissions";
      const preset = codexPermissionPresetToConfig(permissionMode);
      const normalizedSettings = {
        ...nextSettings,
        permissions: nextSettings?.permissions ? {
          ...nextSettings.permissions,
          approvalPolicy: preset.approvalPolicy,
          sandboxMode: preset.sandboxMode,
        } : nextSettings?.permissions,
      };
      await updateBridgeState((state) => ({
        ...state,
        projectSettingsLocal: {
          ...state.projectSettingsLocal,
          [projectPath]: normalizedSettings,
        },
      }));
      return { result: null };
    }
    case "find_session_terminal": {
      const state = await readBridgeState();
      const sessionId = String(args.sessionId || "");
      return { result: state.terminalSessions[sessionId] || null };
    }
    case "focus_session_terminal": {
      const state = await readBridgeState();
      const sessionId = String(args.sessionId || "");
      const terminal = state.terminalSessions[sessionId];
      if (!terminal?.pid) return { result: false };
      return { result: await focusTerminalPid(terminal.pid) };
    }
    case "open_in_terminal": {
      const projectPath = String(args.projectPath || "").trim();
      const resumeSessionId = String(args.resumeSessionId || "").trim();
      if (!projectPath) {
        throw new Error("缺少项目路径，无法打开终端。");
      }
      const commandStr = resumeSessionId ? `codex resume ${resumeSessionId}` : "cmd";
      return { result: await openTerminalWindow({ cwd: projectPath, commandStr }) };
    }
    case "register_terminal_session": {
      const sessionId = String(args.sessionId || "");
      const nextState = await updateBridgeState((state) => ({
        ...state,
        terminalSessions: {
          ...state.terminalSessions,
          [sessionId]: {
            pid: Number(args.pid || 0),
            project_path: String(args.projectPath || ""),
            started_at: new Date().toISOString(),
          },
        },
      }));
      return { result: nextState.terminalSessions[sessionId] || null };
    }
    case "list_custom_commands": {
      const state = await readBridgeState();
      return { result: state.customCommands };
    }
    case "save_custom_command": {
      const cmd = clone(args.cmd || {});
      const nextState = await updateBridgeState((state) => {
        const commands = [...state.customCommands];
        const index = commands.findIndex((item) => item.id === cmd.id);
        if (index >= 0) commands[index] = cmd;
        else commands.unshift(cmd);
        return {
          ...state,
          customCommands: commands,
        };
      });
      return { result: nextState.customCommands };
    }
    case "delete_custom_command": {
      const id = String(args.id || "");
      await updateBridgeState((state) => ({
        ...state,
        customCommands: state.customCommands.filter((item) => item.id !== id),
      }));
      return { result: null };
    }
    case "agent_command_presets":
      return { result: await dynamicBuiltInCommands() };
    case "run_in_terminal": {
      const cwd = String(args.cwd || process.cwd());
      const commandStr = String(args.commandStr || "").trim();
      if (!commandStr) {
        throw new Error("命令内容不能为空。");
      }
      return { result: await openTerminalWindow({ cwd, commandStr }) };
    }
    case "check_environment":
      return { result: await detectEnvironment() };
    case "check_available_updates": {
      const packages = ensureArray(args.packages);
      const results = [];
      for (const item of packages) {
        const [id, packageName] = Array.isArray(item) ? item : [null, null];
        if (!id || !packageName) continue;
        const latestVersion = await queryLatestNpmVersion(String(packageName));
        results.push({
          id: String(id),
          latest_version: latestVersion,
          error: latestVersion ? null : "鏈煡璇㈠埌鐗堟湰淇℃伅",
        });
      }
      return { result: results };
    }
    case "install_agent_command": {
      const commandText = String(args.command || "").trim();
      if (!commandText) {
        throw new Error("安装命令不能为空。");
      }
      const result = await runProcess("cmd.exe", ["/d", "/s", "/c", commandText], {
        cwd: process.cwd(),
        timeoutMs: 600000,
      });
      if (result.code !== 0) {
        throw new Error((result.stderr || result.stdout || "安装失败。").trim());
      }
      return { result: { stdout: result.stdout.trim(), stderr: result.stderr.trim() } };
    }
    case "list_providers": {
      const bridgeState = await readBridgeState();
      const sessions = await listSessionsAllInternalLive({ includeMessages: false });
      return { result: buildProviderSummaryLive(await buildProviderModuleLive(bridgeState, sessions)) };
    }
    case "load_provider_module": {
      const bridgeState = await readBridgeState();
      const sessions = await listSessionsAllInternalLive({ includeMessages: false });
      return { result: await buildProviderModuleLive(bridgeState, sessions) };
    }
    case "save_provider_profile": {
      const raw = ensureObject(args.profile);
      assertSupportedManagedProvider(raw.provider_id ?? raw.id ?? "");
      const liveProfiles = await extractLiveProviderProfiles();
      const liveProfile = findMatchingProviderProfile(liveProfiles, raw);
      const nextState = await updateBridgeState((state) => {
        const existingIndex = state.providerProfiles.findIndex((item) => item.id === raw.id);
        const existing = existingIndex >= 0 ? state.providerProfiles[existingIndex] : null;
        const apiKey = typeof raw.api_key === "string" ? raw.api_key.trim() : "";
        const authContents = buildStoredAuthContents(
          raw.auth_contents,
          apiKey,
          existing?.auth_contents || liveProfile?.auth_contents,
          raw.provider_id ?? existing?.provider_id ?? liveProfile?.provider_id,
        );
        const model = firstNonEmptyString(
          typeof raw.model === "string" ? raw.model : "",
          existing?.model,
          liveProfile?.model,
        );
        const models = normalizeModelCatalog(
          raw.models ?? existing?.models ?? liveProfile?.models,
          model,
        );
        const nextProfile = normalizeProviderProfile({
          id: firstNonEmptyString(typeof raw.id === "string" ? raw.id : "", existing?.id, liveProfile?.id),
          name: firstNonEmptyString(typeof raw.name === "string" ? raw.name : "", existing?.name, liveProfile?.name),
          provider_id: firstNonEmptyString(typeof raw.provider_id === "string" ? raw.provider_id : "", existing?.provider_id, liveProfile?.provider_id),
          base_url: firstNonEmptyString(typeof raw.base_url === "string" ? raw.base_url : "", existing?.base_url, liveProfile?.base_url),
          model,
          models,
          reasoning_effort: raw.reasoning_effort ?? existing?.reasoning_effort ?? liveProfile?.reasoning_effort,
          protocol: raw.protocol ?? existing?.protocol ?? liveProfile?.protocol,
          mode: raw.mode ?? existing?.mode ?? liveProfile?.mode,
          api_key_masked: apiKey ? `${apiKey.slice(0, 3)}****${apiKey.slice(-2)}` : existing?.api_key_masked || liveProfile?.api_key_masked,
          config_contents: firstNonEmptyString(
            typeof raw.config_contents === "string" ? raw.config_contents : "",
            existing?.config_contents,
            liveProfile?.config_contents,
          ),
          auth_contents: authContents,
          notes: firstNonEmptyString(typeof raw.notes === "string" ? raw.notes : "", existing?.notes, liveProfile?.notes),
          source: firstNonEmptyString(typeof raw.source === "string" ? raw.source : "", existing?.source, liveProfile?.source),
          active: existing?.active ?? false,
        }, existingIndex >= 0 ? existingIndex : state.providerProfiles.length);

        const profiles = [...state.providerProfiles];
        if (existingIndex >= 0) profiles[existingIndex] = { ...nextProfile, active: existing?.active ?? false };
        else profiles.unshift({ ...nextProfile, active: profiles.length === 0 });

        if (!profiles.some((item) => item.active) && profiles[0]) {
          profiles[0] = { ...profiles[0], active: true };
        }

        return {
          ...state,
          providerProfiles: profiles,
        };
      });
      const target =
        findMatchingProviderProfile(nextState.providerProfiles, raw)
        || nextState.providerProfiles.find((item) => item.active)
        || nextState.providerProfiles[0]
        || null;
      if (target) {
        await writeLiveProviderFiles(target, {
          ...raw,
          auth_contents: target.auth_contents,
          reasoning_effort: target.reasoning_effort,
        });
      }
      const sessions = await listSessionsAllInternalLive({ includeMessages: false });
      return { result: await buildProviderModuleLive(nextState, sessions) };
    }
    case "delete_provider_profile": {
      const id = String(args.id || "");
      const bridgeState = await readBridgeState();
      const sessions = await listSessionsAllInternalLive({ includeMessages: false });
      const providerModule = await buildProviderModuleLive(bridgeState, sessions);
      const target =
        providerModule.profiles.find((item) => item.id === id)
        || providerModule.profiles.find((item) => providerIdentifierEquals(item.provider_id, id))
        || null;

      if (target) {
        const nextConfig = await readLiveCodexConfigObject();
        const providerSections = isPlainObject(nextConfig.model_providers) ? { ...nextConfig.model_providers } : {};
        const sectionKey =
          firstNonEmptyString(extractProviderSectionKeyFromProfile(target))
          || findProviderSectionEntry(nextConfig, target.provider_id)?.[0]
          || "";

        if (sectionKey && providerSections[sectionKey] !== undefined) {
          delete providerSections[sectionKey];
          nextConfig.model_providers = providerSections;

          const activeProviderKey = normalizeProviderIdentifier(firstNonEmptyString(
            nextConfig.model_provider,
            nextConfig.provider_id,
            nextConfig.provider,
          ));
          const removedProviderMatchedActive = providerIdentifierEquals(activeProviderKey, target.provider_id)
            || providerIdentifierEquals(activeProviderKey, sectionKey);

          if (removedProviderMatchedActive) {
            const fallbackEntry = Object.entries(providerSections).find(([fallbackKey, fallbackSection]) =>
              !isDisabledModelProvider(firstNonEmptyString(fallbackSection?.provider_id, fallbackKey)),
            ) || null;

            if (fallbackEntry) {
              const [fallbackKey, fallbackSection] = fallbackEntry;
              const fallbackModel = firstNonEmptyString(
                fallbackSection?.model,
                ensureArray(fallbackSection?.models)[0],
                "",
              );
              nextConfig.model_provider = fallbackKey;
              nextConfig.provider_id = fallbackKey;
              nextConfig.model = fallbackModel;
              nextConfig.review_model = fallbackModel;
              nextConfig.models = normalizeModelCatalog(fallbackSection?.models, fallbackModel);
            } else {
              delete nextConfig.model_provider;
              delete nextConfig.provider_id;
              delete nextConfig.model;
              delete nextConfig.review_model;
              delete nextConfig.models;
            }
          }

          await writeLiveCodexConfigObject(nextConfig);
        }
      }

      const nextState = await updateBridgeState((state) => {
        const target = state.providerProfiles.find((item) => item.id === id);
        const profiles = state.providerProfiles.filter((item) => item.id !== id);
        const sessionProviders = { ...state.sessionProviders };

        if (target) {
          for (const [sessionId, providerId] of Object.entries(sessionProviders)) {
            if (providerId === target.provider_id) delete sessionProviders[sessionId];
          }
        }

        const normalizedProfiles = profiles.some((item) => item.active)
          ? profiles
          : profiles.map((item, index) => ({ ...item, active: index === 0 }));

        return {
          ...state,
          providerProfiles: normalizedProfiles,
          sessionProviders,
        };
      });
      return { result: await buildProviderModuleLive(nextState, sessions) };
    }
    case "activate_provider_profile": {
      const id = String(args.id || "");
      {
        const bridgeState = await readBridgeState();
        const sessions = await listSessionsAllInternalLive({ includeMessages: false });
        const providerModule = await buildProviderModuleLive(bridgeState, sessions);
        const target =
          providerModule.profiles.find((item) => item.id === id)
          || providerModule.profiles.find((item) => providerIdentifierEquals(item.provider_id, id))
          || null;
        if (!target) {
          throw new Error(`鏈壘鍒颁緵搴斿晢锛?{id}`);
        }
        await writeLiveProviderFiles(target, target);
        const nextState = await updateBridgeState((state) => ({
          ...state,
          providerProfiles: state.providerProfiles.map((item) => ({
            ...item,
            active: providerIdentifierEquals(item.provider_id, target.provider_id),
          })),
          providerSyncLastTarget: target.provider_id,
          providerSyncMessage: `宸插垏鎹㈠綋鍓嶄緵搴斿晢锛?{target.name}`,
        }));
        const latestSessions = await listSessionsAllInternalLive({ includeMessages: false });
        return { result: await buildProviderModuleLive(nextState, latestSessions) };
      }
      const nextState = await updateBridgeState((state) => ({
        ...state,
        providerProfiles: state.providerProfiles.map((item) => ({
          ...item,
          active: item.id === id,
        })),
        providerSyncMessage: "已切换当前供应商。",
      }));
      const sessions = await listSessionsAllInternal({ includeMessages: false });
      return { result: await buildProviderModule(nextState, sessions) };
    }
    case "fetch_provider_models": {
      const raw = ensureObject(args.profile);
      assertSupportedManagedProvider(raw.provider_id ?? raw.id ?? "");
      const bridgeState = await readBridgeState();
      const existing = bridgeState.providerProfiles.find((item) => item.id === raw.id) || null;
      const configContents = await readCodexConfigContents();
      const liveProfiles = await extractLiveProviderProfiles();
      const liveProfile = findMatchingProviderProfile(liveProfiles, raw);
      const apiKey = typeof raw.api_key === "string" ? raw.api_key.trim() : "";
      const profile = normalizeProviderProfile({
        id: firstNonEmptyString(typeof raw.id === "string" ? raw.id : "", existing?.id, liveProfile?.id),
        name: firstNonEmptyString(typeof raw.name === "string" ? raw.name : "", existing?.name, liveProfile?.name),
        provider_id: firstNonEmptyString(typeof raw.provider_id === "string" ? raw.provider_id : "", existing?.provider_id, liveProfile?.provider_id),
        base_url: firstNonEmptyString(typeof raw.base_url === "string" ? raw.base_url : "", existing?.base_url, liveProfile?.base_url),
        model: firstNonEmptyString(typeof raw.model === "string" ? raw.model : "", existing?.model, liveProfile?.model),
        models: normalizeModelCatalog(raw.models ?? existing?.models ?? liveProfile?.models, firstNonEmptyString(typeof raw.model === "string" ? raw.model : "", existing?.model, liveProfile?.model)),
        reasoning_effort: raw.reasoning_effort ?? existing?.reasoning_effort ?? liveProfile?.reasoning_effort,
        protocol: raw.protocol ?? existing?.protocol ?? liveProfile?.protocol,
        mode: raw.mode ?? existing?.mode ?? liveProfile?.mode,
        api_key_masked: apiKey ? maskSecret(apiKey) : existing?.api_key_masked || liveProfile?.api_key_masked,
        config_contents: firstNonEmptyString(
          typeof raw.config_contents === "string" ? raw.config_contents : "",
          existing?.config_contents,
          liveProfile?.config_contents,
          configContents,
        ),
        auth_contents: buildStoredAuthContents(
          raw.auth_contents,
          apiKey,
          existing?.auth_contents || liveProfile?.auth_contents,
          raw.provider_id ?? existing?.provider_id ?? liveProfile?.provider_id,
        ),
        notes: firstNonEmptyString(typeof raw.notes === "string" ? raw.notes : "", existing?.notes, liveProfile?.notes),
        source: firstNonEmptyString(typeof raw.source === "string" ? raw.source : "", existing?.source, liveProfile?.source),
        active: existing?.active ?? liveProfile?.active ?? false,
      }, existing ? bridgeState.providerProfiles.findIndex((item) => item.id === existing.id) : bridgeState.providerProfiles.length, configContents);
      return { result: await fetchProviderModelsFromUpstream(profile, raw) };
    }
    case "set_provider_profile_model": {
      const id = String(args.id || "");
      const model = String(args.model || "").trim();
      const reasoningEffort = args.reasoning_effort == null ? null : normalizeReasoningEffort(args.reasoning_effort);
      if (!id) {
        throw new Error("缺少供应商条目 ID。");
      }
      if (!model) {
        throw new Error("缺少模型名称。");
      }

      const bridgeState = await readBridgeState();
      const sessions = await listSessionsAllInternalLive({ includeMessages: false });
      const providerModule = await buildProviderModuleLive(bridgeState, sessions);
      const target =
        providerModule.profiles.find((item) => item.id === id)
        || providerModule.profiles.find((item) => providerIdentifierEquals(item.provider_id, id))
        || null;
      if (!target) {
        throw new Error(`鏈壘鍒颁緵搴斿晢妗ｆ锛?{id}`);
      }

      const nextProfile = normalizeProviderProfile({
        ...target,
        model,
        models: normalizeModelCatalog(target.models, model),
        reasoning_effort: reasoningEffort || target.reasoning_effort,
      }, 0, target.config_contents);

      await writeLiveProviderFiles(nextProfile, nextProfile);
      const nextState = await updateBridgeState((state) => {
        const existingIndex = state.providerProfiles.findIndex((item) => item.id === nextProfile.id);
        const profiles = [...state.providerProfiles];
        if (existingIndex >= 0) {
          profiles[existingIndex] = {
            ...profiles[existingIndex],
            ...nextProfile,
            active: true,
          };
        } else {
          profiles.unshift({ ...nextProfile, active: true });
        }

        return {
          ...state,
          providerProfiles: profiles.map((item) => ({
            ...item,
            active: providerIdentifierEquals(item.provider_id, nextProfile.provider_id),
          })),
          providerSyncLastTarget: nextProfile.provider_id,
          providerSyncMessage: `宸插垏鎹㈡ā鍨嬪埌 ${nextProfile.model}`,
        };
      });
      const latestSessions = await listSessionsAllInternalLive({ includeMessages: false });
      return { result: await buildProviderModuleLive(nextState, latestSessions) };
    }
    case "sync_provider_sessions": {
      const targetId = String(args.id || "");
      {
        const bridgeState = await readBridgeState();
        const sessions = await listSessionsAllInternalLive({ includeMessages: false });
        const providerModule = await buildProviderModuleLive(bridgeState, sessions);
        const target =
          providerModule.profiles.find((item) => item.id === targetId)
          || providerModule.profiles.find((item) => providerIdentifierEquals(item.provider_id, targetId))
          || getActiveProfileLive(providerModule.profiles);
        if (!target) {
          throw new Error("没有可用于同步的供应商。");
        }
        await writeLiveProviderFiles(target, target);
        const nextState = await updateBridgeState((state) => {
          const sessionProviders = { ...state.sessionProviders };
          for (const session of sessions) {
            sessionProviders[session.id] = target.provider_id;
          }
          return {
            ...state,
            providerProfiles: state.providerProfiles.map((item) => ({
              ...item,
              active: providerIdentifierEquals(item.provider_id, target.provider_id),
            })),
            sessionProviders,
            providerSyncLastTarget: target.provider_id,
            providerSyncMessage: `已将默认供应商切换为“${target.name}”，并为 ${sessions.length} 个会话建立统一供应商映射。`,
          };
        });
        const latestSessions = await listSessionsAllInternalLive({ includeMessages: false });
        return { result: await buildProviderModuleLive(nextState, latestSessions) };
      }
      const nextState = await updateBridgeState(async (state) => {
        const sessions = await listSessionsAllInternal({ includeMessages: false });
        const target =
          state.providerProfiles.find((item) => item.id === targetId)
          || state.providerProfiles.find((item) => providerIdentifierEquals(item.provider_id, targetId))
          || getActiveProfile(state.providerProfiles);

        if (!target) return state;

        const sessionProviders = { ...state.sessionProviders };
        for (const session of sessions) {
          sessionProviders[session.id] = target.provider_id;
        }

        return {
          ...state,
          providerProfiles: state.providerProfiles.map((item) => ({
            ...item,
            active: item.id === target.id,
          })),
          sessionProviders,
          providerSyncLastTarget: target.provider_id,
          providerSyncMessage: `已将 ${sessions.length} 个会话同步到供应商“${target.name}”。`,
        };
      });
      const sessions = await listSessionsAllInternal({ includeMessages: false });
      return { result: await buildProviderModule(nextState, sessions) };
    }
    case "list_tools_and_plugins": {
      const bridgeState = await readBridgeState();
      return { result: buildToolsSummaryLive(await buildToolsPluginsModuleLive(bridgeState)) };
    }
    case "load_tools_plugins_module": {
      const bridgeState = await readBridgeState();
      return { result: await buildToolsPluginsModuleLive(bridgeState) };
    }
    case "list_skill_library": {
      return { result: await listSkillLibrary(String(args.projectPath || "").trim()) };
    }
    case "validate_skill_import": {
      return { result: await validateSkillImportSource(String(args.skillFilePath || "").trim()) };
    }
    case "install_skill_from_file": {
      return { result: await installSkillFromFile(String(args.skillFilePath || "").trim()) };
    }
    case "codex_runtime_import_sources": {
      return { result: await listCodexRuntimeImportSources() };
    }
    case "codex_runtime_import_preview": {
      return { result: await previewCodexRuntimeImport(args) };
    }
    case "codex_runtime_import_execute": {
      return { result: await executeCodexRuntimeImport(args) };
    }
    case "save_context_entry_record": {
      const entry = ensureObject(args.entry);
      const bridgeState = await readBridgeState();
      const nextState = await saveLiveContextEntry({
        kind: entry.kind === "skill" || entry.kind === "plugin" ? entry.kind : "mcp",
        id: String(entry.id || "").trim(),
        title: String(entry.title || "").trim() || String(entry.id || "").trim(),
        summary: String(entry.summary || "").trim(),
        enabled: entry.enabled !== false,
        body: String(entry.body || ""),
      }, bridgeState);
      return { result: await buildToolsPluginsModuleLive(nextState) };
    }
    case "delete_context_entry_record": {
      const kind = String(args.kind || "");
      const id = String(args.id || "");
      const nextState = await deleteLiveContextEntry(kind, id);
      return { result: await buildToolsPluginsModuleLive(nextState) };
    }
    case "toggle_context_entry_record": {
      const kind = String(args.kind || "");
      const id = String(args.id || "");
      const nextState = await toggleLiveContextEntry(kind, id);
      return { result: await buildToolsPluginsModuleLive(nextState) };
    }
    case "list_enhancements": {
      const bridgeState = await readBridgeState();
      return { result: buildEnhancementSummaryLive(await buildEnhancementsModuleLive(bridgeState)) };
    }
    case "load_enhancements_module": {
      const bridgeState = await readBridgeState();
      return { result: await buildEnhancementsModuleLive(bridgeState) };
    }
    case "save_enhancements_settings": {
      const nextState = await updateBridgeState((state) => ({
        ...state,
        enhancementsSettings: {
          ...state.enhancementsSettings,
          ...ensureObject(args.settings),
        },
      }));
      const config = await readLiveCodexConfigObject();
      config.features = {
        ...ensureObject(config.features),
        goals_enabled: Boolean(nextState.enhancementsSettings.goals_enabled),
        service_tier_controls: Boolean(nextState.enhancementsSettings.service_tier_controls),
        upstream_worktree_create: Boolean(nextState.enhancementsSettings.upstream_worktree_create),
        computer_use_guard_enabled: Boolean(nextState.enhancementsSettings.computer_use_guard_enabled),
      };
      await writeLiveCodexConfigObject(config);
      return { result: await buildEnhancementsModuleLive(nextState) };
    }
    case "load_overview": {
      const projects = await scanProjects();
      const sessions = await listSessionsAllInternalLive({ includeMessages: false });
      {
        const bridgeState = await readBridgeState();
        const providerModule = await buildProviderModuleLive(bridgeState, sessions);
        return {
          result: {
            phase: "2",
            shell_ready: true,
            ui_provider: "Jishu Hub 前端壳层",
            runtime_provider: "隔离运行环境实时桥接",
            control_plane: "Lmentor 本地兼容服务层",
            interface_boundary: "前端只调用 Lmentor，Codex++ 仅以服务能力接入",
            projects: projects.length,
            sessions: sessions.length,
            active_provider: providerModule.current_provider,
          },
        };
      }
      return {
        result: {
          phase: "1",
          shell_ready: true,
          ui_provider: "Jishu Hub 前端壳层",
          runtime_provider: "隔离运行环境实时桥接",
          control_plane: "Lmentor 本地兼容服务层",
          interface_boundary: "前端只调用 Lmentor，Codex++ 只以服务能力接入",
          projects: projects.length,
          sessions: sessions.length,
          active_provider: "Codex",
        },
      };
    }
    case "load_overview_module": {
      const bridgeState = await readBridgeState();
      const sessions = await listSessionsAllInternalLive({ includeMessages: false });
      return { result: await buildOverviewModuleLive(bridgeState, sessions) };
    }
    case "list_project_directory": {
      const projectPath = String(args.projectPath || "").trim();
      const requestedPath = String(args.path || projectPath).trim();
      if (!projectPath) {
        throw new Error("Missing projectPath for directory listing");
      }

      const rootPath = path.resolve(projectPath);
      const targetPath = path.resolve(requestedPath || projectPath);
      if (!isPathInside(rootPath, targetPath)) {
        throw new Error("Requested path is outside of the current project");
      }
      const stat = await fs.stat(targetPath);
      if (!stat.isDirectory()) {
        throw new Error("Requested path is not a directory");
      }

      const dirents = await fs.readdir(targetPath, { withFileTypes: true });
      const entries = dirents
        .filter((dirent) => dirent.isDirectory() || dirent.isFile())
        .map((dirent) => {
          const entryPath = path.join(targetPath, dirent.name);
          return {
            name: dirent.name,
            path: entryPath,
            relative_path: path.relative(rootPath, entryPath),
            kind: dirent.isDirectory() ? "directory" : "file",
          };
        })
        .sort((left, right) => {
          if (left.kind !== right.kind) {
            return left.kind === "directory" ? -1 : 1;
          }
          return left.name.localeCompare(right.name, "zh-CN", { numeric: true, sensitivity: "base" });
        });

      return {
        result: {
          path: targetPath,
          entries,
        },
      };
    }
    case "read_text_file": {
      const targetPath = String(args.path || "");
      const content = await fs.readFile(targetPath, "utf8");
      return {
        result: {
          path: targetPath,
          content,
          truncated: false,
          size: Buffer.byteLength(content, "utf8"),
        },
      };
    }
    case "read_file_as_base64": {
      const targetPath = String(args.path || "");
      const data = await fs.readFile(targetPath);
      return { result: data.toString("base64") };
    }
    case "read_file_as_data_url": {
      const targetPath = String(args.path || "");
      const data = await fs.readFile(targetPath);
      return { result: `data:${mimeTypeFor(targetPath)};base64,${data.toString("base64")}` };
    }
    case "read_image_as_data_url": {
      const targetPath = String(args.path || "");
      const data = await fs.readFile(targetPath);
      return { result: `data:${mimeTypeFor(targetPath)};base64,${data.toString("base64")}` };
    }
    case "open_file_with_system": {
      const targetPath = path.resolve(String(args.path || ""));
      const stat = await fs.stat(targetPath);
      if (!stat.isFile()) throw new Error("只能打开存在的文件。");
      const child = spawn("explorer.exe", [targetPath], {
        detached: true,
        windowsHide: true,
        stdio: "ignore",
      });
      child.unref();
      return { result: null };
    }
    case "ensure_ophanim_artifact": {
      const projectPath = String(args.projectPath || "").trim();
      const sessionId = String(args.sessionId || "").trim();
      const text = String(args.text || "");
      return { result: await ensureOphanimArtifact(projectPath, sessionId, text) };
    }
    case "get_clipboard_file_paths":
      return { result: await readClipboardFilePaths() };
    case "open_file_dialog":
      return { result: await openNativeFileDialog(Boolean(args.multiple)) };
    case "open_directory_dialog":
      return { result: await openNativeDirectoryDialog() };
    case "save_session_files": {
      const files = ensureArray(args.files);
      const batchId = `batch-${Date.now()}`;
      const projectPath = String(args.projectPath || "").trim();
      const sessionRoot = projectPath
        ? path.join(projectPath, ".lmentor", "session_files")
        : SESSION_FILE_ROOT;
      const batchDir = path.join(sessionRoot, batchId);
      await fs.mkdir(batchDir, { recursive: true });

      const saved = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index] || {};
        const filename = path.basename(String(file.filename || `file-${index + 1}`));
        const label = file.label == null ? filename : String(file.label);
        const data = typeof file.data === "string" ? file.data : "";
        const outputPath = path.join(batchDir, filename);
        await fs.writeFile(outputPath, Buffer.from(data, "base64"));
        saved.push({
          path: outputPath,
          label,
          index,
          batch_id: batchId,
        });
      }
      return { result: saved };
    }
    case "open_url":
      return { fallback: true };
    case "agent_list_statuses": {
      const state = await readBridgeState();
      return { result: await detectAgentStatuses(state.appPrefs.activeAgentId) };
    }
    case "agent_get_active": {
      const state = await readBridgeState();
      return { result: state.appPrefs.activeAgentId };
    }
    case "agent_refresh_health": {
      const state = await readBridgeState();
      return { result: await detectAgentStatuses(state.appPrefs.activeAgentId) };
    }
    case "agent_restart_active": {
      const state = await readBridgeState();
      const activeAgentId = state.appPrefs.activeAgentId || "codex";
      return { result: await restartAgentCli(activeAgentId) };
    }
    case "agent_restart_codex": {
      return { result: await restartIsolatedCodexCli() };
    }
    case "agent_set_active": {
      const id = String(args.id || "codex");
      const nextState = await updateBridgeState((state) => ({
        ...state,
        appPrefs: {
          ...state.appPrefs,
          activeAgentId: id,
        },
      }));
      return { result: nextState.appPrefs.activeAgentId };
    }
    case "load_agent_roster_module": {
      const state = await readBridgeState();
      return { result: await buildAgentRosterModuleLive(state) };
    }
    case "save_agent_memory_entry": {
      const raw = ensureObject(args.entry);
      const nextState = await updateBridgeState((state) => {
        const memory = normalizeAgentMemoryState(state.agentMemory);
        const now = new Date().toISOString();
        const nextEntry = normalizeAgentMemoryEntry({
          ...raw,
          id: firstNonEmptyString(typeof raw.id === "string" ? raw.id : "", `memory-${Date.now()}`),
          created_at: typeof raw.created_at === "string" ? raw.created_at : now,
          updated_at: now,
        }, memory.entries.length);
        const existingIndex = memory.entries.findIndex((entry) => entry.id === nextEntry.id);
        const entries = [...memory.entries];
        if (existingIndex >= 0) {
          entries[existingIndex] = {
            ...entries[existingIndex],
            ...nextEntry,
            created_at: entries[existingIndex].created_at || nextEntry.created_at,
            updated_at: now,
          };
        } else {
          entries.unshift(nextEntry);
        }
        return {
          ...state,
          agentMemory: {
            entries,
            updatedAt: now,
          },
        };
      });
      return { result: await buildAgentRosterModuleLive(nextState) };
    }
    case "delete_agent_memory_entry": {
      const id = String(args.id || "").trim();
      if (!id) {
        throw new Error("缺少要删除的记忆 ID。");
      }
      const nextState = await updateBridgeState((state) => {
        const memory = normalizeAgentMemoryState(state.agentMemory);
        return {
          ...state,
          agentMemory: {
            entries: memory.entries.filter((entry) => entry.id !== id),
            updatedAt: new Date().toISOString(),
          },
        };
      });
      return { result: await buildAgentRosterModuleLive(nextState) };
    }
    case "toggle_agent_memory_visibility": {
      const id = String(args.id || "").trim();
      const agentId = String(args.agent_id || "").trim();
      const mode = String(args.mode || "hidden_for").trim();
      if (!id || !agentId) {
        throw new Error("缺少记忆 ID 或 Agent ID。");
      }
      const nextState = await updateBridgeState((state) => {
        const memory = normalizeAgentMemoryState(state.agentMemory);
        const now = new Date().toISOString();
        const entries = memory.entries.map((entry) => {
          if (entry.id !== id) return entry;
          const field = mode === "visible_to" ? "visible_to" : "hidden_for";
          const current = ensureArray(entry[field]).map((item) => String(item || "").trim()).filter(Boolean);
          const next = current.includes(agentId)
            ? current.filter((item) => item !== agentId)
            : [...current, agentId];
          return {
            ...entry,
            [field]: next,
            updated_at: now,
          };
        });
        return {
          ...state,
          agentMemory: {
            entries,
            updatedAt: now,
          },
        };
      });
      return { result: await buildAgentRosterModuleLive(nextState) };
    }
    case "toggle_agent_memory_shared": {
      const id = String(args.id || "").trim();
      const fallbackAgentId = String(args.agent_id || "").trim();
      if (!id) {
        throw new Error("缺少记忆 ID。");
      }
      const nextState = await updateBridgeState((state) => {
        const memory = normalizeAgentMemoryState(state.agentMemory);
        const roster = normalizeAgentRosterState(state.agentRoster);
        const now = new Date().toISOString();
        const entries = memory.entries.map((entry) => (
          entry.id === id
            ? {
              ...entry,
              shared: !entry.shared,
              visible_to: entry.shared
                ? (ensureArray(entry.visible_to).length > 0
                  ? ensureArray(entry.visible_to)
                  : [firstNonEmptyString(fallbackAgentId, roster.activeAgentId)].filter(Boolean))
                : ensureArray(entry.visible_to),
              updated_at: now,
            }
            : entry
        ));
        return {
          ...state,
          agentMemory: {
            entries,
            updatedAt: now,
          },
        };
      });
      return { result: await buildAgentRosterModuleLive(nextState) };
    }
    case "toggle_agent_memory_enabled": {
      const id = String(args.id || "").trim();
      if (!id) {
        throw new Error("缺少记忆 ID。");
      }
      const nextState = await updateBridgeState((state) => {
        const memory = normalizeAgentMemoryState(state.agentMemory);
        const now = new Date().toISOString();
        const entries = memory.entries.map((entry) => (
          entry.id === id
            ? {
              ...entry,
              enabled: !entry.enabled,
              updated_at: now,
            }
            : entry
        ));
        return {
          ...state,
          agentMemory: {
            entries,
            updatedAt: now,
          },
        };
      });
      return { result: await buildAgentRosterModuleLive(nextState) };
    }
    case "save_agent_roster_profile": {
      const raw = ensureObject(args.profile);
      const nextState = await updateBridgeState((state) => {
        const roster = normalizeAgentRosterState(state.agentRoster);
        const nextProfile = normalizeAgentRosterProfile({
          ...raw,
          id: firstNonEmptyString(typeof raw.id === "string" ? raw.id : "", roster.profiles[0]?.id, defaultAgentRosterProfile().id),
          builtin: raw.builtin !== false,
        }, 0);
        const existingIndex = roster.profiles.findIndex((profile) => profile.id === nextProfile.id);
        const profiles = [...roster.profiles];
        if (existingIndex >= 0) {
          profiles[existingIndex] = {
            ...profiles[existingIndex],
            ...nextProfile,
          };
        } else {
          profiles.push(nextProfile);
        }

        const activeAgentId = firstNonEmptyString(
          String(args.active_agent_id || "").trim(),
          roster.activeAgentId,
          nextProfile.id,
        );

        return {
          ...state,
          agentRoster: {
            lineageName: roster.lineageName,
            userName: roster.userName,
            activeAgentId,
            profiles,
            updatedAt: new Date().toISOString(),
          },
        };
      });
      return { result: await buildAgentRosterModuleLive(nextState) };
    }
    case "save_agent_roster_lineage": {
      const lineageName = String(args.lineage_name || "").trim();
      const nextState = await updateBridgeState((state) => {
        const roster = normalizeAgentRosterState(state.agentRoster);
        return {
          ...state,
          agentRoster: {
            ...roster,
            lineageName,
            updatedAt: new Date().toISOString(),
          },
        };
      });
      return { result: await buildAgentRosterModuleLive(nextState) };
    }
    case "save_agent_roster_identity": {
      const nextState = await updateBridgeState((state) => {
        const roster = normalizeAgentRosterState(state.agentRoster);
        const nextLineageName = typeof args.lineage_name === "string"
          ? (args.lineage_name.trim() || DEFAULT_LINEAGE_NAME)
          : roster.lineageName;
        const nextUserName = typeof args.user_name === "string"
          ? (args.user_name.trim() || DEFAULT_USER_NAME)
          : roster.userName;
        return {
          ...state,
          agentRoster: {
            ...roster,
            lineageName: nextLineageName,
            userName: nextUserName,
            updatedAt: new Date().toISOString(),
          },
        };
      });
      return { result: await buildAgentRosterModuleLive(nextState) };
    }
    case "delete_agent_roster_profile": {
      const id = String(args.id || "").trim();
      if (!id) {
        throw new Error("缺少要删除的 Agent ID。");
      }
      const nextState = await updateBridgeState((state) => {
        const roster = normalizeAgentRosterState(state.agentRoster);
        const target = roster.profiles.find((profile) => profile.id === id);
        if (!target) {
          throw new Error(`未找到名册 Agent：${id}`);
        }
        if (target.builtin) {
          throw new Error("内置 Agent 不支持删除。");
        }
        const profiles = roster.profiles.filter((profile) => profile.id !== id);
        if (profiles.length === 0) {
          throw new Error("至少保留一个 Agent。");
        }
        const activeAgentId = roster.activeAgentId === id
          ? (profiles.find((profile) => profile.enabled)?.id || profiles[0]?.id || defaultAgentRosterProfile().id)
          : roster.activeAgentId;
        return {
          ...state,
          agentRoster: {
            ...roster,
            activeAgentId,
            profiles,
            updatedAt: new Date().toISOString(),
          },
        };
      });
      return { result: await buildAgentRosterModuleLive(nextState) };
    }
    case "set_active_agent_roster_profile": {
      const id = String(args.id || "").trim();
      if (!id) {
        throw new Error("缺少名册 Agent ID。");
      }
      const nextState = await updateBridgeState((state) => {
        const roster = normalizeAgentRosterState(state.agentRoster);
        const exists = roster.profiles.some((profile) => profile.id === id);
        if (!exists) {
          throw new Error(`未找到名册 Agent：${id}`);
        }
        return {
          ...state,
          agentRoster: {
            ...roster,
            activeAgentId: id,
            updatedAt: new Date().toISOString(),
          },
        };
      });
      return { result: await buildAgentRosterModuleLive(nextState) };
    }
    case "check_prerequisite": {
      const commandName = String(args.command || "").trim();
      return { result: commandName ? await commandExists(commandName) : false };
    }
    case "load_always_on_top": {
      const state = await readBridgeState();
      return { result: Boolean(state.appPrefs.alwaysOnTop) };
    }
    case "toggle_always_on_top": {
      const nextState = await updateBridgeState((state) => ({
        ...state,
        appPrefs: {
          ...state.appPrefs,
          alwaysOnTop: !state.appPrefs.alwaysOnTop,
        },
      }));
      return { result: nextState.appPrefs.alwaysOnTop };
    }
    case "load_theme": {
      const state = await readBridgeState();
      return { result: state.appPrefs.theme };
    }
    case "load_quote_carousel_items": {
      return { result: await loadQuoteCarouselItems() };
    }
    case "save_theme": {
      const theme = String(args.theme || "dark");
      await updateBridgeState((state) => ({
        ...state,
        appPrefs: {
          ...state.appPrefs,
          theme,
        },
      }));
      return { result: null };
    }
    case "load_font_sizes": {
      const state = await readBridgeState();
      return { result: state.appPrefs.fontSizes };
    }
    case "save_font_sizes": {
      const base = String(args.fontSizeBase || "s");
      const prose = String(args.fontSizeProse || base);
      await updateBridgeState((state) => ({
        ...state,
        appPrefs: {
          ...state.appPrefs,
          fontSizes: [base, prose],
        },
      }));
      return { result: null };
    }
    case "save_language": {
      await updateBridgeState((state) => ({
        ...state,
        appPrefs: {
          ...state.appPrefs,
          language: "zh",
        },
      }));
      return { result: null };
    }
    case "check_for_update":
      return { result: await queryLatestRelease() };
    case "download_update": {
      const state = await readBridgeState();
      const installerPath = state.appPrefs.downloadedInstallerPath;
      if (installerPath && await pathExists(installerPath)) {
        return {
          result: {
            version: state.appPrefs.downloadedInstallerVersion,
            installer_path: installerPath,
          },
        };
      }
      return { result: { version: null, installer_path: null } };
    }
    case "install_update": {
      const installerPath = String(args.installerPath || "").trim();
      if (!installerPath || !(await pathExists(installerPath))) {
        throw new Error("安装程序不存在。");
      }
      spawn(installerPath, [], { detached: true, windowsHide: false, stdio: "ignore" }).unref();
      return { result: null };
    }
    default:
      return { fallback: true };
  }
}

const server = http.createServer(async (req, res) => {
  withCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write("retry: 1500\n\n");
    clients.add(res);
    req.on("close", () => {
      clients.delete(res);
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, { ok: true, service: "lmentor-codex-bridge" });
    return;
  }

  if (req.method === "POST" && req.url === "/api/invoke") {
    let rawBody = "";
    req.on("data", (chunk) => {
      rawBody += chunk.toString("utf8");
    });
    req.on("end", async () => {
      try {
        const body = rawBody ? JSON.parse(rawBody) : {};
        const result = await handleInvoke(body.command, body.args || {});

        if (result?.fallback) {
          sendJson(res, 501, {
            ok: false,
            fallback: true,
            error: `Bridge 鏆傛湭瀹炵幇鍛戒护锛?{body.command}`,
          });
          return;
        }

        sendJson(res, 200, {
          ok: true,
          result: result?.result ?? null,
        });
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          fallback: Boolean(error?.fallback),
          noFallback: Boolean(error?.noFallback),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: "未找到接口。" });
});

server.listen(PORT, HOST, async () => {
  await fs.mkdir(SESSION_FILE_ROOT, { recursive: true });
  const runtimeSnapshot = await getCodexRuntimeSnapshot().catch((error) => ({
    diagnostic_log: [`runtime snapshot failed: ${error instanceof Error ? error.message : String(error)}`],
  }));
  console.log(`[lmentor-codex-bridge] listening on http://${HOST}:${PORT}`);
  console.log(`[lmentor-codex-bridge] app root: ${APP_ROOT}`);
  console.log(`[lmentor-runtime-bridge] isolated runtime: ${CODEX_CLI_PATH}`);
  console.log(`[lmentor-codex-bridge] CODEX_HOME: ${CODEX_HOME}`);
  for (const line of ensureArray(runtimeSnapshot.diagnostic_log)) {
    console.log(`[lmentor-codex-bridge] ${line}`);
  }
});

process.on("SIGINT", () => {
  for (const child of activeRuns.values()) {
    child.kill();
  }
  server.close(() => process.exit(0));
});


