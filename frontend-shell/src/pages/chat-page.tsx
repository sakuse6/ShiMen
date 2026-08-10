import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useDeferredValue } from "react";
import { useInvoke, invokeCommand } from "@/hooks/use-invoke";
import type { ReactNode } from "react";
import { streamStore, useSessionStream, useStreamingSessionIds, type SessionStreamState } from "@/hooks/use-stream-store";
import { MessageView, type MessageSearchNavigation, type MessageSearchStatus } from "@/components/sessions/message-view";
import { RenameSessionDialog } from "@/components/sessions/rename-session-dialog";
import { DeleteSessionDialog } from "@/components/sessions/delete-session-dialog";
import { ChatInput } from "@/components/sessions/chat-input";
import { StreamingMessage } from "@/components/sessions/streaming-message";
import { clearImageCache } from "@/components/sessions/inline-image";
import { StatusBar as ObservabilityStatusBar } from "@/components/observability";
import { classifyToolName, isInternalToolScaffolding } from "@/components/observability/tool-call-card";
import { useFileViewer } from "@/components/file-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import {
  HardDrive, MessageSquare, Search, X, Pencil, RotateCw, FolderOpen, SquarePen, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, ArrowRight, ChevronUp, ChevronDown, ChevronRight, PictureInPicture2, Folder, FileText, Wrench, Trash2, Copy,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { emit, listen } from "@/lmentor/platform/event";
import { lmentorCommands } from "@/lmentor/api";
import { cn } from "@/lib/utils";
import { searchSessions } from "@/lib/session-search";
import { openFloatingSession } from "@/lib/floating-window";
import { resolveSessionTitle } from "@/lib/session-title";
import { formatSkillDisplayName } from "@/lib/skill-display";
import { AgentLogo, useAgent, useRosterAgent } from "@/agents";
import type {
  Session,
  Project,
  ProjectMeta,
  ProjectSettings,
  Message,
  ContentBlock,
  AgentStreamChunk,
  SessionSearchResult,
  ProviderModuleSnapshot,
  ProviderProfile,
  ProjectDirectoryEntry,
  ProjectDirectoryListing,
  SessionActivityRound,
} from "@/types";

function TerminalIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2" y="3" width="20" height="18" rx="3" />
      <polyline points="7 10 10 13 7 16" />
      <line x1="13" y1="16" x2="17" y2="16" />
    </svg>
  );
}

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

function extractRealSessionId(data: unknown): string | null {
  const obj = data as Record<string, unknown> | null;
  if (!obj) return null;
  if (obj.kind === "session_resolved") {
    const normalizedSid = obj.session_id;
    if (typeof normalizedSid === "string" && normalizedSid.length >= 8) {
      return normalizedSid;
    }
  }
  const sid = obj.session_id;
  if (typeof sid === "string" && !sid.startsWith("pending-") && !sid.startsWith("new_session_") && sid.length >= 8) {
    return sid;
  }
  return null;
}

function normalizeMessageText(value: string): string {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function displayRosterAgentName(name: string | null | undefined, fallback = "未择道身") {
  const normalized = String(name || "").trim();
  return normalized || fallback;
}

function contentBlockSignature(block: ContentBlock): string {
  if (block.type === "text") return `text:${normalizeMessageText(block.text)}`;
  if (block.type === "thinking") return `thinking:${normalizeMessageText(block.thinking)}`;
  if (block.type === "tool_use") return `tool_use:${block.id}:${block.name}:${JSON.stringify(block.input ?? null)}`;
  return `tool_result:${block.tool_use_id}:${JSON.stringify(block.content ?? null)}`;
}

function messageSignature(message: Message): string {
  return `${message.role}|${message.content.map(contentBlockSignature).join("||")}`;
}

function tailHasEquivalentMessage(messages: Message[], candidate: Message, lookback = 3): boolean {
  const signature = messageSignature(candidate);
  return messages.slice(-lookback).some((message) => messageSignature(message) === signature);
}

async function attachOphanimArtifactToContent(
  content: ContentBlock[],
  projectPath: string | null,
  sessionId: string,
): Promise<ContentBlock[]> {
  const text = content
    .filter((block): block is ContentBlock & { type: "text" } => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
  if (!projectPath || !text.includes("OPHANIM Mind Map") || text.includes("LMENTOR_OPHANIM_IMAGE_BEGIN")) {
    return content;
  }

  try {
    const artifact = await invokeCommand<{ path: string; markdown: string } | null>("ensure_ophanim_artifact", {
      projectPath,
      sessionId,
      text,
    });
    if (!artifact?.markdown) return content;

    const next = [...content];
    const lastTextIndex = next.map((block) => block.type).lastIndexOf("text");
    if (lastTextIndex >= 0) {
      const block = next[lastTextIndex];
      if (block.type === "text") {
        next[lastTextIndex] = { ...block, text: artifact.markdown };
      }
    } else {
      next.push({ type: "text", text: artifact.markdown });
    }
    return next;
  } catch (error) {
    console.error("Failed to create ophanim artifact:", error);
    return content;
  }
}

type SidebarInspectorTab = "actions" | "directory";

interface ActionRoundTool {
  id: string;
  name: string;
  kind: ReturnType<typeof classifyToolName>;
  input: unknown;
  status: "success" | "running" | "error";
}

interface ActionRoundSummary {
  turnNumber: number;
  userPreview: string;
  tools: ActionRoundTool[];
  skills: string[];
  workflow: string | null;
  stage: string | null;
  notes: string[];
  isStreaming: boolean;
}

function ActionRoundToolList({ tools }: { tools: ActionRoundTool[] }) {
  const [showAllShellCommands, setShowAllShellCommands] = useState(false);
  const shellCommands = tools.filter((tool) => tool.kind === "shell_exec");
  const nonShellTools = tools.filter((tool) => tool.kind !== "shell_exec");
  const visibleShellCommands = showAllShellCommands ? shellCommands : shellCommands.slice(0, 3);
  const hiddenShellCount = Math.max(0, shellCommands.length - visibleShellCommands.length);
  const visibleTools = [...nonShellTools, ...visibleShellCommands];

  return (
    <>
      {visibleTools.map((tool) => (
        <div key={tool.id} className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/65 px-2.5 py-2">
          <span className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            tool.status === "error" ? "bg-red-500" : tool.status === "running" ? "bg-amber-500" : "bg-emerald-500",
          )} />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={tool.name}>
            {tool.name}
          </span>
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {tool.kind}
          </span>
        </div>
      ))}
      {shellCommands.length > 3 ? (
        <button
          type="button"
          onClick={() => setShowAllShellCommands((value) => !value)}
          className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border/60 px-2.5 py-2 text-xs text-muted-foreground transition-fast hover:bg-accent/45 hover:text-foreground"
        >
          {showAllShellCommands ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showAllShellCommands ? "收起命令" : `展开其余 ${hiddenShellCount} 条命令`}
        </button>
      ) : null}
    </>
  );
}

interface UsageExampleItem {
  title: string;
  prompt: string;
  alternatePrompt?: string;
  mode?: string;
}

interface UsageExampleGroup {
  title: string;
  kicker: string;
  accentClass: string;
  skills?: string[];
  items: UsageExampleItem[];
}

const startupQuotes = [
  "我们总是在意自己错过太多，却不曾注意自己拥有多少",
  "当环境最昏暗时，火焰燃烧的光芒才最夺目",
  "正因为没有翅膀，人们才会寻找飞翔的方法",
  "上帝会扼住你的喉咙，但不会让你窒息",
  "青春是萤火绚丽的流动银河，灿烂却也极致短暂",
  "家人是比梦想更重要的事情",
  "或许幸福像玻璃一样，因为平时从未察觉",
  "隔岸观火的人永远无法明白起火的原因，只有置身风暴，才能找到风暴眼之所在",
  "你既然已经做出了选择，又何必去问为什么选择",
  "真正重要的东西，总是没有的人比拥有的人清楚",
  "只会躲在后方摇旗呐喊的人注定不会有追随者",
  "一个人若没有怀揣过大的梦想，也就无法到达向往的地方",
  "人类的赞歌就是勇气的赞歌，人类的伟大就是勇气的伟大",
  "过去从未逝去，它甚至还未过去",
  "与其装点自己的终点，不如漂亮地活到最后。",
  "什么事都不做的人生，只是活着的生命，和缓慢的死没什么区别。",
  "只要活着就有自己能做到的事",
  "不相信自己的人，连努力的价值都没有",
  "世界上没有偶然，有的只是必然",
  "人的梦想是永远不会结束的",
  "只要能努力，就应当去努力；只要还能前进，就要向前走去",
] as const;

function pickStartupQuote(quotes: readonly string[]): string {
  if (quotes.length === 0) return "";
  const index = Math.floor(Math.random() * quotes.length);
  return quotes[index] ?? quotes[0] ?? "";
}

const startupQuote = pickStartupQuote(startupQuotes);

const usageExampleGroups: UsageExampleGroup[] = [
  {
    title: "快速开始",
    kicker: "Academic Research Suite",
    accentClass: "bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.22),transparent_58%),linear-gradient(135deg,rgba(20,184,166,0.14),rgba(15,23,42,0.02))]",
    skills: ["academic-research-suite", "web-access"],
    items: [
      {
        title: "启动完整研究 pipeline",
        prompt: "我想做一篇关于 AI 对高等教育质量保障影响的研究论文",
        mode: "完整研究流程",
      },
      {
        title: "苏格拉底引导模式",
        prompt: "引导我研究 AI 在教育评估中的应用",
        mode: "socratic mode",
      },
      {
        title: "引导式论文撰写",
        prompt: "引导我写一篇关于少子化影响的论文",
        mode: "plan mode",
      },
      {
        title: "审查现有论文",
        prompt: "帮我审查这篇论文",
        mode: "review mode",
      },
      {
        title: "查看 pipeline 进度",
        prompt: "进度",
        alternatePrompt: "status",
        mode: "进度查询",
      },
    ],
  },
  {
    title: "Deep Research",
    kicker: "个别 Skill 使用 · 深度研究，8 种模式",
    accentClass: "bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.22),transparent_58%),linear-gradient(135deg,rgba(14,165,233,0.13),rgba(15,23,42,0.02))]",
    skills: ["academic-research-suite", "web-access"],
    items: [
      {
        title: "完整研究",
        prompt: "研究 AI 对高等教育的影响",
        mode: "full mode",
      },
      {
        title: "快速简报",
        prompt: "给我一份 AI 对高等教育影响的快速摘要",
        mode: "quick mode",
      },
      {
        title: "系统性文献回顾",
        prompt: "帮我做 AI 对高等教育影响的系统性文献回顾，含 PRISMA",
        mode: "systematic-review mode",
      },
      {
        title: "苏格拉底引导",
        prompt: "引导我研究 AI 在教育评估中的应用",
        mode: "socratic mode",
      },
      {
        title: "事实核查",
        prompt: "帮我核查这些说法",
        mode: "fact-check mode",
      },
      {
        title: "文献回顾",
        prompt: "帮我做文献回顾",
        mode: "lit-review mode",
      },
      {
        title: "论文研究质量审查",
        prompt: "审查这篇论文的研究质量",
        mode: "review mode",
      },
      {
        title: "三向论文比较",
        prompt: "帮我比较这几篇论文的 WHY、HOW、WHAT 差异",
        mode: "three-way-scan mode",
      },
    ],
  },
  {
    title: "Academic Paper",
    kicker: "个别 Skill 使用 · 学术论文撰写，11 种模式",
    accentClass: "bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.24),transparent_58%),linear-gradient(135deg,rgba(251,191,36,0.13),rgba(15,23,42,0.02))]",
    skills: ["academic-research-suite"],
    items: [
      {
        title: "完整撰写",
        prompt: "帮我写一篇论文",
        mode: "full mode",
      },
      {
        title: "引导规划",
        prompt: "引导我写论文",
        mode: "plan mode",
      },
      {
        title: "只做大纲",
        prompt: "先帮我搭论文大纲",
        mode: "outline-only mode",
      },
      {
        title: "论文修订",
        prompt: "我有初稿，这是审稿意见",
        mode: "revision mode",
      },
      {
        title: "修订路线图",
        prompt: "帮我整理这些审稿意见成修订路线图",
        mode: "revision-coach mode",
      },
      {
        title: "摘要撰写",
        prompt: "帮我写这篇的摘要",
        mode: "abstract-only mode",
      },
      {
        title: "文献回顾论文",
        prompt: "把这批数据写成文献回顾论文",
        mode: "lit-review mode",
      },
      {
        title: "格式转换",
        prompt: "转换成 LaTeX",
        alternatePrompt: "引用格式转 IEEE",
        mode: "format-convert mode",
      },
      {
        title: "引用检查",
        prompt: "检查引用格式",
        mode: "citation-check mode",
      },
      {
        title: "AI 使用声明",
        prompt: "帮我生成 NeurIPS 的 AI 使用声明",
        mode: "disclosure mode",
      },
      {
        title: "审稿回复审计",
        prompt: "帮我检查这份审稿回复是否完整覆盖了审稿意见",
        mode: "rebuttal-audit mode",
      },
    ],
  },
  {
    title: "Academic Paper Reviewer",
    kicker: "个别 Skill 使用 · 论文审查，6 种模式",
    accentClass: "bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.22),transparent_58%),linear-gradient(135deg,rgba(251,113,133,0.12),rgba(15,23,42,0.02))]",
    skills: ["academic-research-suite"],
    items: [
      {
        title: "完整审查",
        prompt: "审查这篇论文",
        mode: "full mode",
      },
      {
        title: "快速评估",
        prompt: "快速评估这篇论文",
        mode: "quick mode",
      },
      {
        title: "引导改进",
        prompt: "引导我改进这篇论文",
        mode: "guided mode",
      },
      {
        title: "方法论聚焦",
        prompt: "检查研究方法",
        mode: "methodology-focus mode",
      },
      {
        title: "再审验收",
        prompt: "验收修订",
        mode: "re-review mode",
      },
      {
        title: "校准审稿器",
        prompt: "用我的 gold set 校准 reviewer",
        mode: "calibration mode",
      },
    ],
  },
  {
    title: "Academic Pipeline",
    kicker: "个别 Skill 使用 · 全流程调度器",
    accentClass: "bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.20),transparent_58%),linear-gradient(135deg,rgba(139,92,246,0.12),rgba(15,23,42,0.02))]",
    skills: ["academic-research-suite"],
    items: [
      {
        title: "从 Stage 1 开始",
        prompt: "我想做一篇完整的研究论文",
        mode: "完整 pipeline",
      },
      {
        title: "从 Stage 2.5 进入",
        prompt: "我已经有论文，帮我审查",
        mode: "先做学术诚信审查",
      },
      {
        title: "从 Stage 4 进入",
        prompt: "我收到审稿意见了",
        mode: "返修与回应",
      },
    ],
  },
  {
    title: "导师常用案例",
    kicker: "项目、图解与日常研究",
    accentClass: "bg-[radial-gradient(circle_at_top_right,rgba(100,116,139,0.20),transparent_58%),linear-gradient(135deg,rgba(148,163,184,0.12),rgba(15,23,42,0.02))]",
    items: [
      {
        title: "医学研究",
        prompt: "帮我研究一下阿尔兹海默症的早期治疗方法",
        mode: "联网证据整理",
      },
      {
        title: "论文写作",
        prompt: "我该如何进行关于 Agent 的专业论文撰写？",
        mode: "选题到大纲",
      },
      {
        title: "概念图解",
        prompt: "MCP 和 skill 有什么区别？请用图表告诉我",
        mode: "图表解释",
      },
      {
        title: "多智能体协作",
        prompt: "我想在同一个项目里同时使用主智能体与扩展智能体，如何拆分任务并保持上下文不冲突？",
        mode: "协作规划",
      },
      {
        title: "图片与文件分析",
        prompt: "我会上传一张界面截图，请帮我根据图片标注定位问题，并整理成可执行的修改清单",
        mode: "附件分析",
      },
      {
        title: "会话整理检索",
        prompt: "帮我把这个项目里的历史会话按主题整理一下，并告诉我哪些对话最值得继续跟进",
        mode: "会话管理",
      },
      {
        title: "配置迁移",
        prompt: "我想把模型、环境变量和供应商配置整理成一个可复用预设，请帮我设计配置方案",
        mode: "配置方案",
      },
      {
        title: "代码审查流程",
        prompt: "帮我设计一套代码审查流程，要求能检查风险、测试缺口和改动摘要",
        mode: "工程流程",
      },
    ],
  },
];

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const element = document.createElement("textarea");
  element.value = text;
  element.setAttribute("readonly", "true");
  element.style.position = "fixed";
  element.style.left = "-9999px";
  document.body.appendChild(element);
  element.select();
  document.execCommand("copy");
  document.body.removeChild(element);
}

function isUserToolResultOnlyMessage(msg: Message): boolean {
  if (msg.role !== "user" || msg.content.length === 0) return false;
  return msg.content.every((block) => block.type === "tool_result");
}

function sanitizeRoundPreviewText(value: string): string {
  const normalized = String(value || "");
  const base64Line = normalized
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("Base64:"));
  let decoded = normalized;
  if (base64Line) {
    try {
      const encoded = base64Line.replace(/^Base64:\s*/, "").trim();
      const restored = atob(encoded);
      decoded = decodeURIComponent(Array.from(restored).map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""));
    } catch {
      decoded = normalized;
    }
  }

  const taggedMatch = decoded.match(/<LMENTOR_USER_REQUEST>\s*([\s\S]*?)\s*<\/LMENTOR_USER_REQUEST>/i);
  const rosterStripped = taggedMatch?.[1]
    ? taggedMatch[1]
    : (() => {
      const legacyMarker = "下面是用户的原始请求，请把它视为本轮真正的用户消息：";
      const markerIndex = decoded.indexOf(legacyMarker);
      return markerIndex >= 0 ? decoded.slice(markerIndex + legacyMarker.length) : decoded;
    })();

  return rosterStripped
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, "")
    .replace(/<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>/gi, "")
    .replace(/<!--JISHU_HUB_IMAGES_BEGIN-->[\s\S]*?<!--JISHU_HUB_IMAGES_END-->/g, "")
    .replace(/<!--LMENTOR_FILE_CONTEXT_BEGIN-->[\s\S]*?<!--LMENTOR_FILE_CONTEXT_END-->/g, "")
    .replace(/<!--LMENTOR_ATTACHMENTS_BEGIN-->[\s\S]*?<!--LMENTOR_ATTACHMENTS_END-->/g, "")
    .replace(/<!--LMENTOR_SKILLS_BEGIN-->[\s\S]*?<!--LMENTOR_SKILLS_END-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMessagePreview(msg: Message): string {
  const text = sanitizeRoundPreviewText(msg.content
    .map((block) => {
      if (block.type === "text") return block.text;
      if (block.type === "thinking") return block.thinking;
      return "";
    })
    .join(" "));

  if (!text) return "\u672c\u8f6e\u672a\u8bb0\u5f55\u7528\u6237\u6587\u672c";
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
}

function hasMeaningfulUserRound(message: Message): boolean {
  if (message.role !== "user" || isUserToolResultOnlyMessage(message)) return false;
  const preview = sanitizeRoundPreviewText(message.content
    .map((block) => {
      if (block.type === "text") return block.text;
      if (block.type === "thinking") return block.thinking;
      return "";
    })
    .join(" "));
  if (preview) return true;

  const skills = new Set<string>();
  collectMessageSkillNames(message, skills);
  return skills.size > 0;
}

function collectSkillNames(source: unknown, found: Set<string>) {
  if (!source) return;
  if (typeof source === "string") {
    const regex = /[\\/ ]skills[\\/](?:\.system[\\/])?([^\\/]+)[\\/]SKILL\.md/gi;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(source)) !== null) {
      const name = match[1]?.trim();
      if (name) found.add(name);
    }
    return;
  }

  if (Array.isArray(source)) {
    source.forEach((item) => collectSkillNames(item, found));
    return;
  }

  if (typeof source === "object") {
    const record = source as Record<string, unknown>;
    const skillId = typeof record.skill_id === "string" ? record.skill_id.trim() : "";
    if (skillId) found.add(skillId);
    Object.values(record).forEach((value) => collectSkillNames(value, found));
  }
}

const skillContextStopWords = new Set([
  "skill",
  "skills",
  "workflow",
  "mode",
  "stage",
  "codex",
  "agent",
]);

function normalizeSkillCandidate(candidate: string) {
  const cleaned = candidate.trim().replace(/^['"`]+|['"`，。；：、,.!?]+$/g, "");
  if (!cleaned) return null;
  if (!/^[A-Za-z][A-Za-z0-9:_-]{1,63}$/.test(cleaned)) return null;
  if (skillContextStopWords.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

function collectContextualSkillMentions(source: unknown, found: Set<string>) {
  if (typeof source !== "string" || !source.trim()) return;
  const patterns = [
    /\bSkill:\s*([A-Za-z][A-Za-z0-9:_-]{1,63})/gi,
    /(?:属于|归入|归为|使用|启用|调用|指定的|按你指定的|按照你指定的|切换到|进入|路由到)\s*`?([A-Za-z][A-Za-z0-9:_-]{1,63})`?/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(source)) !== null) {
      const normalized = normalizeSkillCandidate(match[1] || "");
      if (normalized) found.add(normalized);
    }
  }
}

function collectPromptSelectedSkills(source: unknown, found: Set<string>) {
  if (typeof source !== "string" || !source.includes("<!--LMENTOR_SKILLS_BEGIN-->")) return;
  const blockMatch = source.match(/<!--LMENTOR_SKILLS_BEGIN-->([\s\S]*?)<!--LMENTOR_SKILLS_END-->/);
  if (!blockMatch?.[1]) return;
  const activeLine = blockMatch[1]
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("- Active skill:"));
  if (!activeLine) return;

  const matches = activeLine.match(/`([^`]+)`/g) || [];
  matches
    .map((item) => item.replace(/`/g, "").trim())
    .filter(Boolean)
    .forEach((item) => found.add(item));
}

function collectMessageSkillNames(message: Message, found: Set<string>) {
  message.content.forEach((block) => {
    if (block.type === "text") {
      collectPromptSelectedSkills(block.text, found);
      collectSkillNames(block.text, found);
      collectContextualSkillMentions(block.text, found);
      return;
    }
    if (block.type === "thinking") {
      collectPromptSelectedSkills(block.thinking, found);
      collectContextualSkillMentions(block.thinking, found);
    }
  });
}

function buildActionRounds(messages: Message[]): ActionRoundSummary[] {
  const rounds: ActionRoundSummary[] = [];
  let currentRound: ActionRoundSummary | null = null;

  const ensureRound = (preview: string) => {
    currentRound = {
      turnNumber: rounds.length + 1,
      userPreview: preview,
      tools: [],
      skills: [],
      workflow: null,
      stage: null,
      notes: [],
      isStreaming: false,
    };
    rounds.push(currentRound);
  };

  const pushTool = (tool: ActionRoundTool) => {
    if (isInternalToolScaffolding(tool.name, tool.input)) return;
    if (!currentRound) {
      ensureRound("\u81ea\u52a8\u521b\u5efa\u7684\u5de5\u5177\u8f6e\u6b21");
    }
    currentRound!.tools.push(tool);
    const skillNames = new Set(currentRound!.skills);
    collectSkillNames(tool.input, skillNames);
    currentRound!.skills = Array.from(skillNames);
  };

  messages.forEach((msg) => {
    if (msg.role === "user" && !isUserToolResultOnlyMessage(msg)) {
      if (!hasMeaningfulUserRound(msg)) {
        return;
      }
      ensureRound(extractMessagePreview(msg));
      const skillNames = new Set<string>();
      collectMessageSkillNames(msg, skillNames);
      currentRound!.skills = Array.from(skillNames);
      return;
    }

    if (!currentRound) return;
    msg.content.forEach((block, blockIndex) => {
      if (block.type === "tool_use") {
        pushTool({
          id: block.id || `${block.name}-${currentRound!.turnNumber}-${blockIndex}`,
          name: block.name,
          kind: classifyToolName(block.name),
          input: block.input,
          status: "success",
        });
        return;
      }
      const skillNames = new Set(currentRound!.skills);
      if (block.type === "text") {
        collectSkillNames(block.text, skillNames);
        collectContextualSkillMentions(block.text, skillNames);
      }
      if (block.type === "thinking") {
        collectContextualSkillMentions(block.thinking, skillNames);
      }
      currentRound!.skills = Array.from(skillNames);
    });
  });

  return rounds;
}

function mapTraceRounds(rounds: SessionActivityRound[]): ActionRoundSummary[] {
  return rounds.map((round) => ({
    turnNumber: round.turnNumber,
    userPreview: round.userPreview,
    tools: round.tools.filter((tool) => !isInternalToolScaffolding(tool.name)).map((tool) => ({
      ...tool,
      kind: classifyToolName(tool.name),
      input: null,
    })),
    skills: round.skills,
    workflow: round.workflow,
    stage: round.stage,
    notes: round.notes,
    isStreaming: false,
  }));
}

function mergeUniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function mergeRoundTools(primary: ActionRoundTool[], secondary: ActionRoundTool[]): ActionRoundTool[] {
  const merged = new Map<string, ActionRoundTool>();
  [...secondary, ...primary].forEach((tool, index) => {
    if (isInternalToolScaffolding(tool?.name || "", tool?.input)) return;
    const id = String(tool?.id || `${tool?.name || "tool"}-${index}`).trim();
    if (!id) return;
    merged.set(id, {
      ...tool,
      id,
      name: String(tool?.name || "tool"),
      kind: tool?.kind ?? classifyToolName(String(tool?.name || "tool")),
      status: tool?.status === "error" || tool?.status === "running" ? tool.status : "success",
      input: tool?.input ?? null,
    });
  });
  return Array.from(merged.values());
}

function mergeActionRoundSummaries(
  fallbackRounds: ActionRoundSummary[],
  tracedRounds: ActionRoundSummary[],
): ActionRoundSummary[] {
  if (tracedRounds.length === 0) return fallbackRounds;
  if (fallbackRounds.length === 0) return tracedRounds;

  const total = Math.max(fallbackRounds.length, tracedRounds.length);
  const merged: ActionRoundSummary[] = [];

  for (let index = 0; index < total; index += 1) {
    const fallback = fallbackRounds[index] ?? null;
    const traced = tracedRounds[index] ?? null;

    if (!fallback && traced) {
      merged.push({ ...traced, turnNumber: merged.length + 1 });
      continue;
    }
    if (fallback && !traced) {
      merged.push({ ...fallback, turnNumber: merged.length + 1 });
      continue;
    }
    if (!fallback || !traced) continue;

    merged.push({
      turnNumber: merged.length + 1,
      userPreview: traced.userPreview?.trim() || fallback.userPreview,
      tools: mergeRoundTools(fallback.tools, traced.tools),
      skills: mergeUniqueStrings([...fallback.skills, ...traced.skills]),
      workflow: traced.workflow || fallback.workflow || null,
      stage: traced.stage || fallback.stage || null,
      notes: mergeUniqueStrings([...fallback.notes, ...traced.notes]),
      isStreaming: fallback.isStreaming || traced.isStreaming,
    });
  }

  return merged;
}

function buildLiveActionRound(currentStream: SessionStreamState, turnNumber: number): ActionRoundSummary | null {
  const hasLiveContent = Boolean(
    currentStream.pendingUserMessage
    || currentStream.tools.length > 0
    || currentStream.isStreaming,
  );
  if (!hasLiveContent) return null;

  const skillNames = new Set<string>();
  currentStream.tools.forEach((tool) => collectSkillNames(tool.input, skillNames));
  collectPromptSelectedSkills(currentStream.pendingUserMessage, skillNames);

  return {
    turnNumber,
    userPreview: sanitizeRoundPreviewText(currentStream.pendingUserMessage || "") || "\u5f53\u524d\u8f6e\u6b21\u6b63\u5728\u5904\u7406\u4e2d",
    tools: currentStream.tools.filter((tool) => !isInternalToolScaffolding(tool.name, tool.input)).map((tool) => ({
      id: tool.id,
      name: tool.name,
      kind: classifyToolName(tool.name),
      input: tool.input,
      status: tool.isError ? "error" : tool.output === undefined && currentStream.isStreaming ? "running" : "success",
    })),
    skills: Array.from(skillNames),
    workflow: null,
    stage: null,
    notes: [],
    isStreaming: true,
  };
}

function formatDirectoryLabel(entry: ProjectDirectoryEntry, projectRoot: string): string {
  const relative = entry.relative_path || entry.path.replace(projectRoot, "").replace(/^[\\/]+/, "");
  return relative || entry.name;
}

function DirectoryTree({
  rootPath,
  nodesByPath,
  expandedPaths,
  loadingPaths,
  selectedPath,
  onToggle,
  onSelect,
  onOpenFile,
}: {
  rootPath: string;
  nodesByPath: Record<string, ProjectDirectoryEntry[]>;
  expandedPaths: Set<string>;
  loadingPaths: Record<string, boolean>;
  selectedPath: string | null;
  onToggle: (entry: ProjectDirectoryEntry) => void;
  onSelect: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const renderEntries = (parentPath: string, depth: number): ReactNode => {
    const entries = nodesByPath[parentPath] ?? [];
    return entries.map((entry) => {
      const isDirectory = entry.kind === "directory";
      const isExpanded = expandedPaths.has(entry.path);
      const isLoading = Boolean(loadingPaths[entry.path]);
      const isSelected = selectedPath === entry.path;

      return (
        <div key={entry.path}>
          <button
            type="button"
            onClick={() => {
              onSelect(entry.path);
              if (isDirectory) onToggle(entry);
            }}
            onDoubleClick={() => {
              onSelect(entry.path);
              if (isDirectory) {
                onToggle(entry);
                return;
              }
              onOpenFile(entry.path);
            }}
            className={cn(
              "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-fast",
              isSelected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent/45 hover:text-foreground",
            )}
            style={{ paddingLeft: `${depth * 0.95 + 0.5}rem` }}
            title={formatDirectoryLabel(entry, rootPath)}
          >
            {isDirectory ? (
              isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            {isDirectory ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-[var(--icon-folder)]" />
            ) : (
              <FileText className="h-4 w-4 shrink-0 text-[var(--icon-action)]" />
            )}
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            {isLoading ? <span className="shrink-0 text-[11px] text-muted-foreground/70">{"\u52a0\u8f7d\u4e2d"}</span> : null}
          </button>
          {isDirectory && isExpanded ? (
            <div>{renderEntries(entry.path, depth + 1)}</div>
          ) : null}
        </div>
      );
    });
  };

  return <div className="space-y-0.5">{renderEntries(rootPath, 0)}</div>;
}

export function ChatPage({
  currentProject,
  currentProjectMeta,
  onRefresh,
  sessionNames,
  refetchNames,
  onSwitchProject,
  onProjectSessionsLoadingChange,
  currentSessionId,
  onSessionChange,
  navigateToSession,
}: {
  currentProject: Project | null;
  currentProjectMeta?: ProjectMeta;
  onRefresh: () => Promise<number>;
  sessionNames: Record<string, string> | null;
  refetchNames: (silent?: boolean) => Promise<Record<string, string>>;
  onSwitchProject: () => void;
  onProjectSessionsLoadingChange?: (loading: boolean) => void;
  currentSessionId?: string | null;
  onSessionChange?: (sessionId: string | null) => void;
  navigateToSession?: string | null;
}) {
  const { t } = useTranslation();
  const { activeId: runtimeActiveId, active: activeRuntime } = useAgent();
  const { activeId, active: activeRoster } = useRosterAgent();
  const { openViewer } = useFileViewer();
  const projectId = currentProject?.encoded_name ?? null;
  const projectPathForSettings = currentProject?.path ?? null;

  // selectedSession: null or real backend UUID 鈥?never fake IDs
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<Message[]>([]);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [examplesSidebarCollapsed, setExamplesSidebarCollapsed] = useState(true);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<SidebarInspectorTab>("actions");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [messageSearchStatus, setMessageSearchStatus] = useState<MessageSearchStatus>({ current: 0, total: 0 });
  const [messageSearchNavigation, setMessageSearchNavigation] = useState<MessageSearchNavigation | null>(null);
  const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);
  const [optimisticSessions, setOptimisticSessions] = useState<Session[]>([]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [reasoningMenuOpen, setReasoningMenuOpen] = useState(false);
  const [modelSwitching, setModelSwitching] = useState(false);
  const [modelSwitchNotice, setModelSwitchNotice] = useState<string | null>(null);
  const [usageExampleDraft, setUsageExampleDraft] = useState<string | null>(null);
  const [directoryNodesByPath, setDirectoryNodesByPath] = useState<Record<string, ProjectDirectoryEntry[]>>({});
  const [directoryLoadingPaths, setDirectoryLoadingPaths] = useState<Record<string, boolean>>({});
  const [expandedDirectoryPaths, setExpandedDirectoryPaths] = useState<Set<string>>(new Set());
  const [selectedDirectoryPath, setSelectedDirectoryPath] = useState<string | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const titleRefreshTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const messageAreaRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(activeId);
  const projectIdRef = useRef<string | null>(projectId);
  const currentProjectPathRef = useRef<string | null>(projectPathForSettings);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const selectedSessionRef = useRef<string | null>(null);
  const visitedSessions = useRef(new Set<string>());
  const scrollMemory = useRef(new Map<string, number>());
  const scrollAction = useRef<{ type: "bottom" } | { type: "restore", top: number } | null>(null);
  const sessionMessagesRef = useRef(sessionMessages);
  sessionMessagesRef.current = sessionMessages;
  const newSessionStreamIdsRef = useRef<Set<string>>(new Set());
  const refetchSessionsRef = useRef<((silent?: boolean) => Promise<Session[]>) | null>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const reasoningMenuRef = useRef<HTMLDivElement>(null);
  // Holds the latest handleSelectSession so the navigateToSession effect always
  // invokes the freshest closure (current projectId/selectedSession) instead of
  // a stale one captured when navigateToSession last changed. (K-MED-7)
  const handleSelectSessionRef = useRef<(sessionId: string) => void>(() => {});
  /**
   * Per-session messages cache. Keyed by canonical session id (the id we
   * started the stream with) AND by resolvedId once known. While a session is
   * streaming, we never re-fetch from JSONL on session switch 鈥?we use the
   * cached snapshot to avoid duplicating the user message that has already
   * been written to JSONL by the CLI but is also being rendered live by
   * `<StreamingMessage>` from the pending state.
   */
  const sessionMessagesCacheRef = useRef<Map<string, Message[]>>(new Map());
  // Subscribe to streaming state for the currently-selected session. Drives
  // whether the streaming bubble is rendered and whether the input is in Stop mode.
  const currentStream = useSessionStream(selectedSession);
  const streamingSessionIds = useStreamingSessionIds();
  const {
    data: providerModule,
    setData: setProviderModule,
    refetch: refetchProviderModule,
  } = useInvoke<ProviderModuleSnapshot>(lmentorCommands.providers.module, undefined, runtimeActiveId ?? undefined);

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen("workspace-data-changed", async () => {
      if (cancelled) return;
      await refetchProviderModule(true);
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    }).catch(console.error);

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [refetchProviderModule]);

  const fileToolCount = useMemo(() => {
    return sessionMessages.reduce((count, msg) => (
      count + msg.content.filter((block) => {
        if (block.type !== "tool_use") return false;
        const name = block.name.toLowerCase();
        return name.includes("read") || name.includes("edit") || name.includes("write");
      }).length
    ), 0);
  }, [sessionMessages]);

  const activityTraceSessionId = useMemo(() => {
    if (currentStream?.resolvedId) return currentStream.resolvedId;
    if (!selectedSession || selectedSession === "new" || selectedSession.startsWith("pending-")) return "";
    return selectedSession;
  }, [currentStream?.resolvedId, selectedSession]);

  const {
    data: sessionActivityTrace,
    error: sessionActivityTraceError,
    refetch: refetchSessionActivityTrace,
  } = useInvoke<SessionActivityRound[]>(
    activityTraceSessionId ? lmentorCommands.sessions.activityTrace : "",
    activityTraceSessionId ? { sessionId: activityTraceSessionId } : undefined,
    activityTraceSessionId,
  );

  const actionRounds = useMemo(() => {
    const fallbackRounds = buildActionRounds(sessionMessages);
    const tracedRounds = sessionActivityTrace && sessionActivityTrace.length > 0
      ? mapTraceRounds(sessionActivityTrace)
      : [];
    const baseRounds = mergeActionRoundSummaries(fallbackRounds, tracedRounds);
    const liveRound = currentStream ? buildLiveActionRound(currentStream, baseRounds.length + 1) : null;
    return liveRound ? [...baseRounds, liveRound] : baseRounds;
  }, [currentStream, sessionActivityTrace, sessionMessages]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  useEffect(() => {
    currentProjectPathRef.current = projectPathForSettings;
  }, [projectPathForSettings]);

  // Single hook for current project's sessions
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const { data: sessions, loading: sessionsLoading, setData: setSessions, refetch: refetchSessions } = useInvoke<Session[]>(
    projectId ? "list_sessions" : "",
    projectId ? { encodedName: projectId } : undefined,
    activeId + "_" + listRefreshKey,
  );

  useEffect(() => {
    refetchSessionsRef.current = refetchSessions;
  }, [refetchSessions]);

  useEffect(() => {
    // Clear sessions when switching agents to avoid showing stale data from previous agent
    setSessions(null);
  }, [activeId, setSessions]);

  useEffect(() => {
    onProjectSessionsLoadingChange?.(Boolean(projectId && sessionsLoading));
  }, [projectId, sessionsLoading, onProjectSessionsLoadingChange]);

  useEffect(() => {
    return () => onProjectSessionsLoadingChange?.(false);
  }, [onProjectSessionsLoadingChange]);

  const searchResults = useMemo<SessionSearchResult[]>(() => {
    if (!sessions || !deferredSearchQuery.trim()) return [];
    return searchSessions(sessions, deferredSearchQuery);
  }, [sessions, deferredSearchQuery]);

  // Build one display row per canonical session. A temporary stream id and
  // the persisted Codex id describe the same conversation after resolution.
  let displaySessions = sessions ?? [];
  if (deferredSearchQuery.trim() && sessions) {
    displaySessions = searchResults.map((r: SessionSearchResult) => sessions.find(s => s.id === r.sessionId)!).filter(Boolean) as Session[];
  } else if (!deferredSearchQuery.trim()) {
    const persistedKeys = new Set(displaySessions.map((session) => streamStore.resolveSessionKey(session.id)));
    const pendingOnly = optimisticSessions.filter((session) => !persistedKeys.has(streamStore.resolveSessionKey(session.id)));
    const seen = new Set<string>();
    displaySessions = [...pendingOnly, ...displaySessions].filter((session) => {
      const key = streamStore.resolveSessionKey(session.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const hasSearchQuery = searchQuery.trim().length > 0;
  const showMessageSearchControls = hasSearchQuery && !!selectedSession && selectedSession !== "new";
  const showStartComposer = !!projectId && (!selectedSession || selectedSession === "new");
  const supportsAccessModeSwitch = runtimeActiveId === "claude-code" || runtimeActiveId === "codex";
  const [accessRefreshKey, setAccessRefreshKey] = useState(0);
  const { data: projectSettings } = useInvoke<ProjectSettings>(
    supportsAccessModeSwitch && projectPathForSettings ? "load_project_settings_local" : "",
    supportsAccessModeSwitch && projectPathForSettings ? { projectPath: projectPathForSettings } : undefined,
    accessRefreshKey,
  );
  const messageSearchTotal = showMessageSearchControls ? messageSearchStatus.total : 0;
  const messageSearchLabel = messageSearchTotal > 0
    ? `${messageSearchStatus.current}/${messageSearchTotal}`
    : "0/0";

  const requestMessageSearchNavigation = useCallback((direction: 1 | -1) => {
    setMessageSearchNavigation((prev) => ({
      direction,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  }, []);

  const handleMessageSearchStatusChange = useCallback((status: MessageSearchStatus) => {
    setMessageSearchStatus((prev) => (
      prev.current === status.current && prev.total === status.total ? prev : status
    ));
  }, []);

  const loadProjectDirectory = useCallback(async (targetPath: string) => {
    if (!projectPathForSettings) return;
    setDirectoryLoadingPaths((prev) => ({ ...prev, [targetPath]: true }));
    setDirectoryError(null);

    try {
      const listing = await invokeCommand<ProjectDirectoryListing>(
        lmentorCommands.projects.directory,
        { projectPath: projectPathForSettings, path: targetPath },
      );
      setDirectoryNodesByPath((prev) => ({ ...prev, [listing.path]: listing.entries }));
    } catch (error) {
      setDirectoryError(error instanceof Error ? error.message : String(error));
    } finally {
      setDirectoryLoadingPaths((prev) => {
        const next = { ...prev };
        delete next[targetPath];
        return next;
      });
    }
  }, [projectPathForSettings]);

  const handleToggleDirectory = useCallback((entry: ProjectDirectoryEntry) => {
    if (entry.kind !== "directory") return;

    setExpandedDirectoryPaths((prev) => {
      const next = new Set(prev);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });

    if (!directoryNodesByPath[entry.path] && !directoryLoadingPaths[entry.path]) {
      void loadProjectDirectory(entry.path);
    }
  }, [directoryLoadingPaths, directoryNodesByPath, loadProjectDirectory]);

  useEffect(() => {
    if (!activityTraceSessionId) return;
    if (currentStream?.isStreaming) return;
    refetchSessionActivityTrace(true).catch(() => {});
  }, [activityTraceSessionId, currentStream?.isStreaming, refetchSessionActivityTrace]);

  useEffect(() => {
    if (!projectPathForSettings) {
      setDirectoryNodesByPath({});
      setExpandedDirectoryPaths(new Set());
      setSelectedDirectoryPath(null);
      setDirectoryError(null);
      return;
    }

    setDirectoryNodesByPath({});
    setExpandedDirectoryPaths(new Set([projectPathForSettings]));
    setSelectedDirectoryPath(projectPathForSettings);
    setDirectoryError(null);
    void loadProjectDirectory(projectPathForSettings);
  }, [projectPathForSettings, loadProjectDirectory]);

  // Auto-clear optimistic sessions once real session appears in backend list
  useEffect(() => {
    if (sessions && optimisticSessions.length > 0) {
      setOptimisticSessions(prev => prev.filter((opt) => !sessions.some(
        (session) => streamStore.resolveSessionKey(session.id) === streamStore.resolveSessionKey(opt.id),
      )));
    }
  }, [sessions]);

  useEffect(() => {
    if (!showMessageSearchControls) {
      setMessageSearchStatus({ current: 0, total: 0 });
    }
  }, [showMessageSearchControls]);

  // Clear session state when project changes
  useEffect(() => {
    setSelectedSession(null);
    selectedSessionRef.current = null;
    setSessionMessages([]);
    setOptimisticSessions([]);
    sessionMessagesCacheRef.current.clear();
    newSessionStreamIdsRef.current.clear();
    clearImageCache();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !activeId) return;
    setSelectedSession(null);
    selectedSessionRef.current = null;
    setSessionMessages([]);
    setOptimisticSessions([]);
    sessionMessagesCacheRef.current.clear();
    newSessionStreamIdsRef.current.clear();
    setListRefreshKey(Date.now());
    refetchNames(true).catch(console.error);
  }, [activeId, projectId, refetchNames]);

  useEffect(() => {
    return () => {
      titleRefreshTimersRef.current.forEach((timer) => clearTimeout(timer));
      titleRefreshTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    onSessionChange?.(selectedSession);
  }, [selectedSession, onSessionChange]);

  useEffect(() => {
    if (!projectId || selectedSession || !currentSessionId || currentSessionId === "new") {
      return;
    }

    const existsInList = (sessions ?? []).some((session) => session.id === currentSessionId);
    const hasLiveState = streamStore.hasState(currentSessionId);

    if (!existsInList && !hasLiveState) {
      if (currentSessionId.startsWith("pending-")) {
        const newestSession = sessions?.[0];
        if (newestSession) {
          handleSelectSessionRef.current(newestSession.id);
        }
      }
      return;
    }

    if (hasLiveState && !existsInList) {
      setSelectedSession(currentSessionId);
      selectedSessionRef.current = currentSessionId;
      setSessionMessages(sessionMessagesCacheRef.current.get(currentSessionId) ?? []);
      return;
    }

    handleSelectSessionRef.current(currentSessionId);
  }, [projectId, currentSessionId, selectedSession, sessions]);

  // Navigate to a specific session (triggered by floating window restore)
  useEffect(() => {
    if (navigateToSession) {
      handleSelectSessionRef.current(navigateToSession);
    }
  }, [navigateToSession]);

  const handleRefresh = async () => {
    const newKey = await onRefresh();
    setListRefreshKey(newKey);
    setAccessRefreshKey(Date.now());
  };

  const accessModeOptions = useMemo(() => ([
    { value: "default", label: t("sessions.accessDefault") },
    { value: "bypassPermissions", label: t("sessions.accessBypass") },
    { value: "plan", label: t("sessions.accessPlan") },
  ]), [t]);

  const accessModeValue = projectSettings?.permissions?.defaultMode || "default";
  const accessModeLabel = accessModeOptions.find((option) => option.value === accessModeValue)?.label ?? t("sessions.accessDefault");
  const providerProfiles = providerModule?.profiles ?? [];
  const activeProviderProfile = useMemo<ProviderProfile | null>(() => {
    if (providerProfiles.length === 0) return null;
    return providerProfiles.find((profile) => profile.id === providerModule?.active_profile_id)
      ?? providerProfiles.find((profile) => profile.active)
      ?? providerProfiles[0]
      ?? null;
  }, [providerModule?.active_profile_id, providerProfiles]);
  const availableModels = useMemo(() => {
    if (!activeProviderProfile) return [];
    return activeProviderProfile.models.length > 0
      ? activeProviderProfile.models
      : (activeProviderProfile.model ? [activeProviderProfile.model] : []);
  }, [activeProviderProfile]);
  const reasoningOptions = useMemo(() => ([
    { value: "low", label: "低" },
    { value: "medium", label: "中" },
    { value: "high", label: "高" },
    { value: "xhigh", label: "超高" },
  ] as const), []);
  const canSwitchModel = runtimeActiveId === "codex" && !!activeProviderProfile && availableModels.length > 0;
  const hasStreamingSessions = streamingSessionIds.length > 0;

  const formatModelOptionLabel = useCallback((model: string) => {
    const providerLabel = activeProviderProfile?.name?.trim() || activeProviderProfile?.provider_id || "未命名供应商";
    const modelLabel = model.trim() || "未设置模型";
    return `${providerLabel} / ${modelLabel}`;
  }, [activeProviderProfile]);

  const handleAccessModeChange = useCallback(async (value: string) => {
    if (!supportsAccessModeSwitch || !projectPathForSettings) return;
    const nextSettings: ProjectSettings = {
      permissions: {
        defaultMode: value === "default" ? null : value,
        allow: projectSettings?.permissions?.allow ?? null,
        deny: projectSettings?.permissions?.deny ?? null,
        approvalPolicy: projectSettings?.permissions?.approvalPolicy ?? null,
        sandboxMode: projectSettings?.permissions?.sandboxMode ?? null,
      },
      hooks: projectSettings?.hooks ?? null,
      env: projectSettings?.env ?? null,
      model: projectSettings?.model ?? null,
    };
    await invokeCommand("save_project_settings_local", { projectPath: projectPathForSettings, settings: nextSettings });
    setAccessRefreshKey(Date.now());
  }, [projectPathForSettings, projectSettings, supportsAccessModeSwitch]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (modelMenuRef.current?.contains(event.target as Node)) return;
      if (reasoningMenuRef.current?.contains(event.target as Node)) return;
      setModelMenuOpen(false);
      setReasoningMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!canSwitchModel) {
      setModelMenuOpen(false);
      setReasoningMenuOpen(false);
    }
  }, [canSwitchModel]);

  useEffect(() => {
    if (hasStreamingSessions) {
      setModelMenuOpen(false);
      setReasoningMenuOpen(false);
    }
  }, [hasStreamingSessions]);

  const handleModelSwitch = useCallback(async (model: string) => {
    if (!canSwitchModel || hasStreamingSessions || modelSwitching || !activeProviderProfile) return;
    if (model === activeProviderProfile.model) {
      setModelMenuOpen(false);
      return;
    }

    setModelSwitching(true);
    setModelMenuOpen(false);

    try {
      const snapshot = await invokeCommand<ProviderModuleSnapshot>(
        lmentorCommands.providers.setProfileModel,
        { id: activeProviderProfile.id, model },
      );
      setProviderModule(snapshot);
      refetchProviderModule(true).catch(console.error);
      const target = snapshot.profiles.find((item) => item.id === snapshot.active_profile_id) ?? activeProviderProfile;
      const modelLabel = target.model?.trim() || "未设置模型";
      setModelSwitchNotice(`已切换到模型“${modelLabel}”，后续消息将使用该模型。`);
      void emit("workspace-data-changed", {
        reason: "provider-switched",
        providerId: target.provider_id,
        profileId: target.id,
        agentId: activeId,
      });
    } catch (error) {
      setModelSwitchNotice(`模型切换失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setModelSwitching(false);
    }
  }, [
    activeId,
    activeProviderProfile,
    canSwitchModel,
    hasStreamingSessions,
    modelSwitching,
    refetchProviderModule,
    setProviderModule,
  ]);

  const handleReasoningSwitch = useCallback(async (reasoningEffort: ProviderProfile["reasoning_effort"]) => {
    if (!canSwitchModel || hasStreamingSessions || modelSwitching || !activeProviderProfile) return;
    if (reasoningEffort === activeProviderProfile.reasoning_effort) {
      setReasoningMenuOpen(false);
      return;
    }

    setModelSwitching(true);
    setReasoningMenuOpen(false);

    try {
      const snapshot = await invokeCommand<ProviderModuleSnapshot>(
        lmentorCommands.providers.setProfileModel,
        {
          id: activeProviderProfile.id,
          model: activeProviderProfile.model,
          reasoning_effort: reasoningEffort,
        },
      );
      setProviderModule(snapshot);
      refetchProviderModule(true).catch(console.error);
      const target = snapshot.profiles.find((item) => item.id === snapshot.active_profile_id) ?? activeProviderProfile;
      const effortLabel = reasoningOptions.find((item) => item.value === target.reasoning_effort)?.label ?? target.reasoning_effort;
      setModelSwitchNotice(`已切换推理等级到“${effortLabel}”，后续消息将按该等级运行。`);
      void emit("workspace-data-changed", {
        reason: "provider-switched",
        providerId: target.provider_id,
        profileId: target.id,
        agentId: activeId,
      });
    } catch (error) {
      setModelSwitchNotice(`推理等级切换失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setModelSwitching(false);
    }
  }, [
    activeId,
    activeProviderProfile,
    canSwitchModel,
    hasStreamingSessions,
    modelSwitching,
    reasoningOptions,
    refetchProviderModule,
    setProviderModule,
  ]);

  useLayoutEffect(() => {
    if (!scrollAction.current || !messageAreaRef.current) return;
    const action = scrollAction.current;
    scrollAction.current = null;
    if (action.type === "bottom") {
      messageAreaRef.current.scrollTop = messageAreaRef.current.scrollHeight;
    } else {
      messageAreaRef.current.scrollTop = action.top;
    }
  }, [sessionMessages]);

  // Track whether user has scrolled away from the bottom
  useEffect(() => {
    const el = messageAreaRef.current;
    if (!el) return;
    const onScroll = () => {
      setIsAwayFromBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [selectedSession]);

  const handleScrollToBottom = useCallback(() => {
    if (messageAreaRef.current) {
      messageAreaRef.current.scrollTo({ top: messageAreaRef.current.scrollHeight, behavior: "smooth" });
    }
  }, []);

  const handleSelectSession = async (sessionId: string) => {
    if (sessionId === selectedSession || !projectId) return;

    if (selectedSession && messageAreaRef.current) {
      scrollMemory.current.set(selectedSession, messageAreaRef.current.scrollTop);
    }
    const isFirstVisit = !visitedSessions.current.has(sessionId);
    setSelectedSession(sessionId);
    selectedSessionRef.current = sessionId;

    // While a session is streaming we keep its message snapshot in
    // `sessionMessagesCacheRef` and *do not* reload from JSONL 鈥?otherwise the
    // user message that the CLI has already flushed to disk would appear twice
    // (once from the JSONL, once from the live `<StreamingMessage>` bubble).
    const cached = sessionMessagesCacheRef.current.get(sessionId);
    const isStreaming = streamStore.isStreaming(sessionId);
    if (cached && (isStreaming || streamStore.hasState(sessionId))) {
      setSessionMessages(cached);
    } else {
      try {
        const messages = await invokeCommand<Message[]>("get_session_messages", {
          sessionId,
          encodedName: projectId,
        });
        sessionMessagesCacheRef.current.set(sessionId, messages);
        setSessionMessages(messages);
      } catch {
        setSessionMessages([]);
      }
    }

    if (isFirstVisit) {
      scrollAction.current = { type: "bottom" };
      visitedSessions.current.add(sessionId);
    } else {
      const saved = scrollMemory.current.get(sessionId);
      scrollAction.current = saved !== undefined
        ? { type: "restore", top: saved }
        : { type: "bottom" };
    }
  };
  handleSelectSessionRef.current = handleSelectSession;

  const handleNewSession = async () => {
    if (!projectId) return;

    setSelectedSession("new");
    selectedSessionRef.current = "new";
    setSessionMessages([]);

    requestAnimationFrame(() => {
      chatInputRef.current?.focus();
    });
  };

  const handleResumeSession = async (sessionId: string) => {
    setLoadingSessionId(sessionId);
    try {
      const existing = await invokeCommand<{ pid: number; project_path: string; started_at: string } | null>(
        "find_session_terminal", { sessionId }
      );
      if (existing) {
        try { await invokeCommand<boolean>("focus_session_terminal", { sessionId }); } catch {}
        setLoadingSessionId(null);
        return;
      }
      const session = sessions?.find(s => s.id === sessionId);
      const cwd = session?.project_path || currentProject?.path;
      if (!cwd) return;
      const pid = await invokeCommand<number>("open_in_terminal", {
        projectPath: cwd,
        resumeSessionId: sessionId,
      });
      await invokeCommand("register_terminal_session", {
        sessionId, pid, projectPath: cwd,
        agentId: activeId,
      });
    } catch (err) {
      console.error("Failed to resume session:", err);
    } finally {
      setLoadingSessionId(null);
    }
  };

  const handleRefreshMessages = useCallback(async () => {
    if (selectedSession && projectId) {
      try {
        const msgs = await invokeCommand<Message[]>("get_session_messages", {
          sessionId: selectedSession,
          encodedName: projectId,
        });
        sessionMessagesCacheRef.current.set(selectedSession, msgs);
        setSessionMessages(msgs);
      } catch (e) {
        console.error(e);
      }
    }
  }, [selectedSession, projectId]);

  const handleFloatSession = useCallback((sessionId: string) => {
    const name = resolveSessionTitle(
      [sessionNames?.[sessionId], sessions?.find((s) => s.id === sessionId)?.display_name],
      t("sessions.newChat"),
    );
    openFloatingSession(sessionId, name, activeId || "", currentProject?.encoded_name || "", activeRoster?.name);
  }, [sessionNames, sessions, activeId, activeRoster, currentProject, t]);

  const scheduleSessionTitleRefresh = useCallback(() => {
    titleRefreshTimersRef.current.forEach((timer) => clearTimeout(timer));
    titleRefreshTimersRef.current = [];
    const delays = [800, 2500, 5000];
    for (const delay of delays) {
      const timer = setTimeout(() => {
        refetchNames(true).catch(console.error);
        refetchSessionsRef.current?.(true).catch(console.error);
      }, delay);
      titleRefreshTimersRef.current.push(timer);
    }
  }, [refetchNames]);

  const handleDeleteSelectedSession = useCallback(async () => {
    const targetId = deleteTarget?.id;
    if (!targetId || targetId === "new") return;

    try {
      await invokeCommand(lmentorCommands.sessions.deleteRecord, { sessionId: targetId });
      streamStore.drop(targetId);
      sessionMessagesCacheRef.current.delete(targetId);
      setOptimisticSessions((prev) => prev.filter((session) => session.id !== targetId));
      if (targetId === selectedSession) {
        setSelectedSession(null);
        selectedSessionRef.current = null;
        setSessionMessages([]);
      }
      newSessionStreamIdsRef.current.delete(targetId);
      setDeleteTarget(null);
      void emit("workspace-data-changed", { reason: "session-deleted", sessionIds: [targetId] });
      void refetchSessions(true).catch(console.error);
      void refetchNames(true).catch(console.error);
    } catch (error) {
      console.error(error);
      setModelSwitchNotice(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, [deleteTarget, refetchNames, refetchSessions, selectedSession]);

  const openDeleteDialog = useCallback((sessionId: string, sessionLabel: string) => {
    setDeleteTarget({ id: sessionId, label: sessionLabel });
  }, []);

  const handleCopyUsageExample = useCallback(async (prompt: string) => {
    try {
      await copyTextToClipboard(prompt);
      setModelSwitchNotice("已复制用例提示词，可以粘贴到输入框后按需修改。");
      chatInputRef.current?.focus();
    } catch (error) {
      console.error(error);
      setModelSwitchNotice(`复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  const handleUseUsageExample = useCallback((prompt: string) => {
    if (!projectId) {
      setModelSwitchNotice("请先选择一个项目，再使用案例提示词。");
      return;
    }
    if (!selectedSession) {
      setSelectedSession("new");
      selectedSessionRef.current = "new";
      setSessionMessages([]);
    }
    setUsageExampleDraft(prompt);
    setModelSwitchNotice("已填入用例提示词，你可以继续修改后发送。");
  }, [projectId, selectedSession]);

  const handleMessageSent = useCallback((sid: string, msg: string) => {
    setModelSwitchNotice(null);
    // Register a new per-session stream entry. The store keys it by the
    // canonical (pending) id and tracks the abortKey so handleAbort works
    // regardless of how the id is later resolved.
    streamStore.start(sid, msg);

    const isNewSessionSend = !selectedSession || selectedSession === "new";
    if (isNewSessionSend) {
      newSessionStreamIdsRef.current.add(sid);
      const newOptSession: Session = {
        id: sid,
        path: currentProject?.path || "",
        messages: [],
        display_name: t("sessions.newChat"),
        started_at: new Date().toISOString(),
        last_active: new Date().toISOString(),
      };
      setOptimisticSessions(prev => [newOptSession, ...prev]);
      setSelectedSession(sid);
      selectedSessionRef.current = sid;
      // Seed the cache for this brand-new session with whatever the user is
      // currently looking at (an empty list for a fresh session).
      sessionMessagesCacheRef.current.set(sid, []);
      setSessionMessages([]);
    } else {
      // Existing session: snapshot the currently displayed messages so we can
      // append the assistant turn on completion without re-reading JSONL.
      sessionMessagesCacheRef.current.set(sid, sessionMessagesRef.current);
    }

    requestAnimationFrame(() => {
      if (messageAreaRef.current) {
        messageAreaRef.current.scrollTop = messageAreaRef.current.scrollHeight;
      }
    });

    void emit("chat-message-sent", { session_id: sid });
  }, [selectedSession, currentProject?.path, t, projectId, activeId]);

  // Stream listener (mount-only). Each chunk is routed into the per-session
  // store entry via streamStore.push, regardless of which session is currently
  // selected 鈥?that's what makes parallel streaming work.
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let cancelled = false;
    listen<AgentStreamChunk[] | AgentStreamChunk>("agent-event", async (event) => {
      const payload = event.payload;
      const chunks = Array.isArray(payload) ? payload : [payload];

      for (const chunk of chunks) {
        // Ignore chunks for agents we're not currently using.
        if (chunk.agent_id !== activeIdRef.current) continue;

        const cid = chunk.session_id;

        // Only push into the store if it knows about this session 鈥?otherwise
        // we'd accidentally create state for a session we never started.
        if (!streamStore.hasState(cid)) continue;

        // Detect resolved session id and register it as an alias before pushing
        // (so subsequent chunks under the real id route to the same entry).
        const realId = extractRealSessionId(chunk.data);
        if (realId && realId !== cid) {
          streamStore.alias(cid, realId);

          // Promote the optimistic session id to the real one in the UI.
          setOptimisticSessions(prev => prev.map(s => s.id === cid ? { ...s, id: realId } : s));
          if (newSessionStreamIdsRef.current.has(cid)) {
            newSessionStreamIdsRef.current.add(realId);
          }
          // Move messages cache entry from pending id to real id (and keep
          // both keys pointing at the same array for safety).
          const cached = sessionMessagesCacheRef.current.get(cid);
          if (cached) sessionMessagesCacheRef.current.set(realId, cached);
          if (selectedSessionRef.current === cid) {
            setSelectedSession(realId);
            selectedSessionRef.current = realId;
            visitedSessions.current.add(realId);
          }

          refetchSessionsRef.current?.(true).catch(console.error);
        }

        streamStore.push(cid, chunk);

        if (chunk.data.kind === "turn_complete") {
          // Build final assistant/user messages from the accumulated state.
          const state = streamStore.getState(cid);
          const finalKey = state?.resolvedId ?? cid;
          const isNewSessionStream =
            newSessionStreamIdsRef.current.has(cid)
            || newSessionStreamIdsRef.current.has(finalKey);
          const newMessages: Message[] = [];
          const assistantContent: ContentBlock[] = [];
          if (state?.content.length) {
            assistantContent.push(...state.content);
          } else {
            if (state?.thinking) assistantContent.push({ type: "thinking", thinking: state.thinking });
            state?.tools.forEach((tool, idx) => {
              assistantContent.push({
                type: "tool_use",
                id: tool.id || `stream-${idx}-${tool.name}`,
                name: tool.name,
                input: tool.input,
              });
              if (tool.output !== undefined) {
                assistantContent.push({
                  type: "tool_result",
                  tool_use_id: tool.id || `stream-${idx}-${tool.name}`,
                  content: tool.output,
                });
              }
            });
            if (state?.text) assistantContent.push({ type: "text", text: state.text });
          }
          if (state?.error) {
            // Append errors as visible text so the user sees them.
            assistantContent.push({ type: "text", text: `错误详情：\n\n\`\`\`\n${state.error}\n\`\`\`` });
          }

          // Resolve the base messages from the cache (preferring real id).
          const baseMessages =
            sessionMessagesCacheRef.current.get(finalKey)
            ?? sessionMessagesCacheRef.current.get(cid)
            ?? [];
          if (state?.pendingUserMessage) {
            const userMessage: Message = {
              role: "user",
              content: [{ type: "text", text: state.pendingUserMessage }],
              timestamp: Date.now(),
            };
            if (!tailHasEquivalentMessage(baseMessages, userMessage)) {
              newMessages.push(userMessage);
            }
          }
          if (assistantContent.length > 0) {
            const enrichedAssistantContent = await attachOphanimArtifactToContent(
              assistantContent,
              currentProjectPathRef.current,
              finalKey,
            );
            const assistantMessage: Message = {
              role: "assistant",
              content: enrichedAssistantContent,
              timestamp: Date.now(),
            };
            if (!tailHasEquivalentMessage(baseMessages, assistantMessage)) {
              newMessages.push(assistantMessage);
            }
          }
          const updated = [...baseMessages, ...newMessages];
          sessionMessagesCacheRef.current.set(finalKey, updated);
          if (cid !== finalKey) sessionMessagesCacheRef.current.set(cid, updated);

          // If the user is currently viewing this session, reflect the update
          // immediately. Otherwise the cache will be used the next time they
          // switch back to this session (without a JSONL reload).
          const viewed = selectedSessionRef.current;
          const scrollEl = messageAreaRef.current;
          const shouldStickToBottom = Boolean(
            scrollEl
            && (viewed === cid || viewed === finalKey)
            && scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 120
          );
          if (viewed === cid || viewed === finalKey) {
            setSessionMessages(updated);
          }

          // Convert the streaming bubble into the formal MessageView row in a
          // single paint. Keeping the completed stream around briefly causes
          // the same reply to be rendered twice, then removed, which looks
          // like a vertical jump at the end of a turn.
          streamStore.drop(cid);
          streamStore.flushNow();

          refetchSessionsRef.current?.(true).catch(console.error);
          refetchNames(true).catch(console.error);

          if (isNewSessionStream) {
            newSessionStreamIdsRef.current.delete(cid);
            newSessionStreamIdsRef.current.delete(finalKey);
            refetchSessionsRef.current?.(true).catch(console.error);
            scheduleSessionTitleRefresh();
          }

          requestAnimationFrame(() => {
            if (shouldStickToBottom && messageAreaRef.current) {
              messageAreaRef.current.scrollTop = messageAreaRef.current.scrollHeight;
            }
            chatInputRef.current?.focus();
          });
        }
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenFn = fn;
      }
    });
    return () => {
      cancelled = true;
      if (unlistenFn) unlistenFn();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive display name for the current session
  const displayName = selectedSession
    ? resolveSessionTitle(
      [
        sessionNames?.[selectedSession],
        sessions?.find((s) => s.id === selectedSession)?.display_name,
        optimisticSessions.find((s) => s.id === selectedSession)?.display_name,
      ],
      t("sessions.newChat"),
    )
    : "";
  const projectDisplayName = currentProjectMeta?.custom_name || currentProject?.name || t("sessions.noProject");
  const projectPath = currentProject?.path ?? "";
  const activeModelLabel = activeProviderProfile?.model?.trim() || "未择模型";
  const activeModelTitle = activeProviderProfile
    ? `${formatModelOptionLabel(activeModelLabel)}${activeProviderProfile.base_url ? `\n${activeProviderProfile.base_url}` : ""}`
    : "暂无可用模型";
  const activeReasoningLabel = reasoningOptions.find((item) => item.value === activeProviderProfile?.reasoning_effort)?.label ?? "中";
  const canSwitchReasoning = runtimeActiveId === "codex" && !!activeProviderProfile?.model?.trim();
  const startComposerFooter = currentProject ? (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/40 bg-muted/45 px-4 py-2.5 text-xs text-muted-foreground">
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--icon-folder)]" />
        <span className="truncate font-medium text-foreground" title={projectDisplayName}>{projectDisplayName}</span>
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5" title={projectPath}>
        <HardDrive className="h-3.5 w-3.5 shrink-0 text-[var(--icon-config)]" />
        <span className="truncate">本地</span>
      </span>
      {canSwitchModel || canSwitchReasoning ? (
        <div className="flex flex-wrap items-center gap-2">
          {canSwitchModel ? (
            <div ref={modelMenuRef} className="relative inline-flex min-w-0 items-center">
              <button
                type="button"
                onClick={() => setModelMenuOpen((open) => !open)}
                disabled={modelSwitching || hasStreamingSessions}
                className={cn(
                  "inline-flex max-w-[18rem] items-center gap-1.5 rounded-full border border-border/50 bg-background/85 px-2.5 py-1 text-left text-xs text-muted-foreground transition-fast hover:bg-accent/45 hover:text-foreground",
                  (modelSwitching || hasStreamingSessions) && "cursor-not-allowed opacity-60",
                )}
                title={hasStreamingSessions ? "有会话正在流转，暂不可改换模型" : activeModelTitle}
              >
                <span className="truncate">
                  模型：<span className="font-medium text-foreground">{activeModelLabel}</span>
                </span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </button>
              {modelMenuOpen && (
                <div className="absolute bottom-[calc(100%+0.45rem)] left-0 z-[80] max-h-72 w-72 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-xl">
                  {availableModels.map((model) => {
                    const isActiveModel = model === activeProviderProfile?.model;
                    return (
                      <button
                        key={model}
                        type="button"
                        onClick={() => void handleModelSwitch(model)}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-fast hover:bg-accent/60"
                        title={formatModelOptionLabel(model)}
                      >
                        <span className="min-w-0 flex-1 truncate">{model}</span>
                        {isActiveModel ? <span className="shrink-0 text-[11px] text-[var(--icon-action)]">今用</span> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
          {canSwitchReasoning ? (
            <div ref={reasoningMenuRef} className="relative inline-flex min-w-0 items-center">
              <button
                type="button"
                onClick={() => setReasoningMenuOpen((open) => !open)}
                disabled={modelSwitching || hasStreamingSessions}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/85 px-2.5 py-1 text-left text-xs text-muted-foreground transition-fast hover:bg-accent/45 hover:text-foreground",
                  (modelSwitching || hasStreamingSessions) && "cursor-not-allowed opacity-60",
                )}
                title={hasStreamingSessions ? "有会话正在流转，暂不可切换思考深度" : `思考深度：${activeReasoningLabel}`}
              >
                <span className="truncate">
                  思考深度：<span className="font-medium text-foreground">{activeReasoningLabel}</span>
                </span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </button>
              {reasoningMenuOpen && (
                <div className="absolute bottom-[calc(100%+0.45rem)] left-0 z-[80] w-40 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-xl">
                  {reasoningOptions.map((option) => {
                    const isActiveReasoning = option.value === (activeProviderProfile?.reasoning_effort ?? "medium");
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => void handleReasoningSwitch(option.value)}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-foreground transition-fast hover:bg-accent/60"
                      >
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        {isActiveReasoning ? <span className="shrink-0 text-[11px] text-[var(--icon-action)]">今用</span> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {projectPath && (
        <span className="min-w-0 flex-1 truncate text-right font-mono text-[0.92em]" title={`${t("sessions.projectPath")}: ${projectPath}`}>
          {projectPath}
        </span>
      )}
    </div>
  ) : null;
  const activeAgentHintFooter = (
    <div className="border-t border-border/35 bg-background/45 px-3 py-2">
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/55 bg-card/90 px-3 py-1.5 text-left text-xs text-muted-foreground shadow-sm transition-fast hover:bg-accent/35 hover:text-foreground"
        title={activeRoster?.role_title || `当前激活 Agent：${displayRosterAgentName(activeRoster?.name)}`}
      >
        <AgentLogo agentId={activeRoster?.id || ""} size={16} />
        <span className="truncate">
          当前激活 Agent：<span className="font-medium text-foreground">{displayRosterAgentName(activeRoster?.name)}</span>
        </span>
      </button>
    </div>
  );
  const composerFooter = (
    <>
      {startComposerFooter}
      {activeAgentHintFooter}
    </>
  );
  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <div
        className={cn(
          "chat-sidebar flex flex-col shrink-0",
          sidebarCollapsed ? "w-14" : "w-60"
        )}
      >
        {/* Expanded sidebar */}
        <div className={cn("flex flex-col", sidebarCollapsed && "hidden")} style={{ background: "var(--color-layer-1)" }}>
          {/* Project card */}
          {currentProject ? (
            <div className="flex items-center gap-2 px-3 h-10 border-b border-border/20">
              <FolderOpen className="h-5 w-5 shrink-0 ml-1 text-[var(--icon-folder)]" />
              <span className="truncate text-sm font-semibold text-foreground flex-1 min-w-0 leading-none pt-[1px]" title={projectDisplayName}>{projectDisplayName}</span>
              <button
                onClick={onSwitchProject}
                className="shrink-0 px-1.5 h-6 flex items-center gap-0.5 rounded-md text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-fast"
                title={t("sessions.switchProject")}
              >
                <span className="leading-none pt-[1px]">{t("sessions.switchProject")}</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 h-10 border-b border-border/20">
              <FolderOpen className="h-5 w-5 shrink-0 ml-1 text-muted-foreground/40" />
              <span className="text-sm font-semibold text-muted-foreground leading-none pt-[1px] flex-1">{t("sessions.noProject")}</span>
              <button
                onClick={onSwitchProject}
                className="shrink-0 px-1.5 h-6 flex items-center gap-0.5 rounded-md text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-fast"
              >
                <span className="leading-none pt-[1px]">{t("sessions.switchProject")}</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          )}
          {/* Actions */}
          <div className="flex items-center gap-1.5 px-3 h-11 pt-2 pb-1">
            <button
              onClick={projectId ? handleNewSession : onSwitchProject}
              title={projectId ? t("sessions.newSession") : t("sessions.selectProject")}
              className={cn(
                "flex-1 flex items-center gap-2.5 h-8 pl-2 pr-2 rounded-lg transition-fast text-sm text-foreground",
                "hover:bg-accent"
              )}
            >
              <SquarePen className="h-3.5 w-3.5 shrink-0 text-[var(--icon-action)]" />
              <span className="truncate leading-none pt-[1px]">{t("sessions.newChat")}</span>
            </button>
            <button
              onClick={handleRefresh}
              title={t("sessions.refresh")}
              className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg hover:bg-accent/50 transition-fast text-muted-foreground hover:text-foreground"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg hover:bg-accent/50 transition-fast text-muted-foreground hover:text-foreground"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Search */}
          <div className="px-3 h-10 pb-2">
            <div className="relative h-8">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--icon-search)]" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("sessions.searchAll")}
                className="h-full pl-8 pr-7 !text-sm !leading-none shadow-none rounded-lg border-border/40 truncate"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-fast"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              {showMessageSearchControls && (
                <div className="absolute left-[calc(100%+0.42rem)] top-1/2 z-30 flex h-[2.55rem] -translate-y-1/2 overflow-hidden rounded-[12px] border border-border/50 bg-background/95 shadow-[0_0.45rem_1.25rem_rgba(0,0,0,0.16)] backdrop-blur">
                  <span className="flex min-w-[2.85rem] items-center justify-center px-[0.65rem] text-[0.7rem] font-medium tabular-nums text-muted-foreground leading-none">
                    {messageSearchLabel}
                  </span>
                  <div className="flex h-full w-[1.55rem] flex-col border-l border-border/40">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={messageSearchTotal === 0}
                      onClick={() => requestMessageSearchNavigation(-1)}
                      title={t("sessions.previousMatch")}
                      className="h-1/2 w-full rounded-none px-0 hover:bg-accent/70 disabled:opacity-30"
                    >
                      <ChevronUp className="size-[0.85rem]" strokeWidth={3} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={messageSearchTotal === 0}
                      onClick={() => requestMessageSearchNavigation(1)}
                      title={t("sessions.nextMatch")}
                      className="h-1/2 w-full rounded-none border-t border-border/30 px-0 hover:bg-accent/70 disabled:opacity-30"
                    >
                      <ChevronDown className="size-[0.85rem]" strokeWidth={3} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Collapsed sidebar header */}
        <div className={cn("flex flex-col", !sidebarCollapsed && "hidden")} style={{ background: "var(--color-layer-1)" }}>
          {/* Row 1: Project icon */}
          <div className="flex items-center justify-center h-10 border-b border-border/20">
            <button
              onClick={onSwitchProject}
              className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-accent/50 transition-fast"
              title={currentProject?.name ?? t("sessions.noProject")}
            >
              <FolderOpen className="h-4 w-4 text-[var(--icon-folder)]" />
            </button>
          </div>
          {/* Row 2: Expand button */}
          <div className="flex items-center justify-center h-11 pt-2 pb-1">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-accent/50 transition-fast text-muted-foreground hover:text-foreground"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
          {/* Row 3: New chat */}
          <div className="flex items-center justify-center h-10 pb-2">
            <button
              onClick={projectId ? handleNewSession : onSwitchProject}
              title={projectId ? t("sessions.newSession") : t("sessions.selectProject")}
              className={cn(
                "h-8 w-8 flex items-center justify-center rounded-lg transition-fast",
                "hover:bg-accent"
              )}
            >
              <SquarePen className="h-4 w-4 text-[var(--icon-action)]" />
            </button>
          </div>
        </div>

        {/* Session list: expanded */}
        <div className={cn("flex-1 overflow-y-auto", sidebarCollapsed && "hidden")}>
          {displaySessions.map((session) => {
            const isActive = session.id === selectedSession;
            const isSessionStreaming = streamingSessionIds.includes(session.id);
            const name = resolveSessionTitle(
              [sessionNames?.[session.id], session.display_name],
              t("sessions.newChat"),
            );
            const timeStr = session.last_active
              ? formatRelativeTime(session.last_active)
              : session.started_at
                ? formatRelativeTime(session.started_at)
                : null;
            const searchHit = searchResults.find((r: SessionSearchResult) => r.sessionId === session.id);
            return (
              <ContextMenu key={session.id}>
                <ContextMenuTrigger asChild>
                  <div
                    className={cn(
                      "flex items-start gap-1 border-b border-border/10 pl-3 pr-2 py-2 text-xs transition-fast",
                      isActive
                        ? "bg-primary/10 text-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectSession(session.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-3 w-full">
                        <MessageSquare className="h-3 w-3 shrink-0 text-[var(--icon-message)]" />
                        <span className="truncate flex-1 text-left min-w-0 leading-none pt-[1px]">{name}</span>
                        {searchHit ? (
                          <span className="shrink-0 rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-[9px] font-medium leading-none">
                            {searchHit.matchCount}
                          </span>
                        ) : timeStr ? (
                          <span className={cn(
                            "text-[0.65em] shrink-0 tabular-nums",
                            isActive ? "text-accent-foreground/40" : "text-muted-foreground/40"
                          )}>{timeStr}</span>
                        ) : null}
                      </div>
                      {searchHit && searchHit.previewText ? (
                        <div className="mt-1.5 pl-6 w-full text-left">
                          <p className="text-[10px] text-muted-foreground/70 line-clamp-2 leading-tight break-all">
                            {searchHit.previewText}
                          </p>
                        </div>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openDeleteDialog(session.id, name);
                      }}
                      disabled={isSessionStreaming}
                      title={isSessionStreaming ? "\u5f53\u524d\u4f1a\u8bdd\u6b63\u5728\u8fd0\u884c\uff0c\u6682\u65f6\u4e0d\u80fd\u5220\u9664" : "\u5220\u9664\u4f1a\u8bdd"}
                      className={cn(
                        "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-fast",
                        isSessionStreaming
                          ? "cursor-not-allowed text-muted-foreground/35"
                          : "text-muted-foreground/65 hover:bg-accent/60 hover:text-destructive",
                      )}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => handleFloatSession(session.id)}>
                    <PictureInPicture2 className="h-3.5 w-3.5 mr-2" />
                    {t("sessions.float")}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleResumeSession(session.id)}>
                    <TerminalIcon className="h-3.5 w-3.5 mr-2" />
                    {t("sessions.openTerminal")}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => { handleSelectSession(session.id); setRenameOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5 mr-2" />
                    {t("sessions.rename")}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleRefreshMessages()}>
                    <RotateCw className="h-3.5 w-3.5 mr-2" />
                    {t("sessions.refresh")}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem disabled={isSessionStreaming} onClick={() => openDeleteDialog(session.id, name)}>
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    {"\u5220\u9664\u4f1a\u8bdd"}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>

        {/* Collapsed: empty body */}
        <div className={cn("flex-1", !sidebarCollapsed && "hidden")} />
      </div>

      <div
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-border/60 bg-muted/25 transition-all",
          examplesSidebarCollapsed ? "w-12" : "w-72 xl:w-80",
        )}
      >
        {examplesSidebarCollapsed ? (
          <div className="flex h-full flex-col items-center gap-3 py-3">
            <button
              type="button"
              onClick={() => setExamplesSidebarCollapsed(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-fast hover:bg-accent/60 hover:text-foreground"
              title="展开使用案例"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <span className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground" style={{ writingMode: "vertical-rl" }}>
              使用案例
            </span>
          </div>
        ) : (
          <>
            <div className="flex h-12 items-center justify-between gap-2 border-b border-border/35 px-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">您可以这样问</p>
                <p className="truncate text-[11px] text-muted-foreground">点击任意一行，直接填入输入框</p>
              </div>
              <button
                type="button"
                onClick={() => setExamplesSidebarCollapsed(true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-fast hover:bg-accent/60 hover:text-foreground"
                title="收起使用案例"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
              <div className="space-y-2">
                {usageExampleGroups.map((group) => (
                  <section key={group.title} className="overflow-hidden rounded-2xl border border-border/55 bg-card/90 shadow-sm">
                    <div className={cn("relative overflow-hidden border-b border-border/35 px-3 py-2", group.accentClass)}>
                      <div className="pointer-events-none absolute -right-8 -top-10 h-16 w-16 rounded-full bg-background/25 blur-2xl" />
                      <div className="relative">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{group.kicker}</p>
                        <div className="mt-0.5 flex items-start justify-between gap-2">
                          <h3 className="min-w-0 text-sm font-semibold leading-tight text-foreground">{group.title}</h3>
                          <span className="shrink-0 rounded-full border border-border/50 bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                            {group.items.length} 条
                          </span>
                        </div>
                        {group.skills?.length ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {group.skills.map((skill) => (
                              <span key={`${group.title}-${skill}`} className="rounded-full border border-primary/20 bg-primary/8 px-1.5 py-0.5 text-[9px] text-primary">
                                {formatSkillDisplayName(skill)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-1 p-1">
                      {group.items.map((item, itemIndex) => {
                        const promptLine = item.alternatePrompt
                          ? `“${item.prompt}” / “${item.alternatePrompt}”`
                          : `“${item.prompt}”`;
                        return (
                          <div key={`${group.title}-${item.title}`} className="group/usage-row relative">
                            <button
                              type="button"
                              onClick={() => handleUseUsageExample(item.prompt)}
                              className="w-full rounded-xl border border-transparent bg-background/55 px-2 py-1.5 pr-8 text-left transition-fast hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                              title="填入输入框"
                            >
                              <div className="flex items-start gap-2">
                                <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                                  {String(itemIndex + 1).padStart(2, "0")}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1">
                                    <p className="text-[11px] font-semibold leading-4 text-foreground">{item.title}</p>
                                    {item.mode ? (
                                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-medium text-primary">
                                        {item.mode}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-0.5 text-[11px] leading-4 text-foreground/90">{promptLine}</p>
                                </div>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCopyUsageExample(item.prompt)}
                              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-fast hover:bg-accent/70 hover:text-foreground focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 group-hover/usage-row:opacity-100"
                              title="复制这条提问"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 min-w-0 flex">
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          {!projectId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
                <MessageSquare className="h-7 w-7 text-[var(--icon-message)]" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">{t("sessions.noProject")}</span>
                <button
                  onClick={onSwitchProject}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-primary hover:bg-primary/10 transition-fast font-medium"
                >
                  <span className="leading-none pt-[1px]">{t("sessions.switchProject")}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : showStartComposer ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10">
              <div className="flex w-full max-w-[var(--message-content-max-width)] min-w-0 flex-col items-center">
                <div className="-translate-y-8 mb-10 w-full max-w-4xl px-2 text-center sm:-translate-y-10">
                  <h1 className="mx-auto max-w-3xl text-balance text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[2.1rem]">
                    {startupQuote || t("chat.startPrompt", { project: projectDisplayName })}
                  </h1>
                </div>
                <ChatInput
                  ref={chatInputRef}
                  sessionId={null}
                  projectPath={currentProject?.path ?? null}
                  currentAgentId={activeId}
                  onMessageSent={handleMessageSent}
                  notice={modelSwitchNotice}
                  allowFiles={true}
                  containerClassName="max-w-full px-0 pb-0 pt-0"
                  panelClassName="rounded-[22px] border-border/70 bg-card/98 shadow-[0_18px_48px_rgba(0,0,0,0.10)]"
                  contextFooter={composerFooter}
                  accessModeLabel={accessModeLabel}
                  accessModeTitle={supportsAccessModeSwitch ? t("sessions.accessMode") : t("sessions.accessModeReadOnly")}
                  accessModeReadOnly={!supportsAccessModeSwitch}
                  accessModeOptions={accessModeOptions}
                  accessModeValue={accessModeValue}
                  onAccessModeChange={handleAccessModeChange}
                  draftMessage={usageExampleDraft}
                  onDraftMessageConsumed={() => setUsageExampleDraft(null)}
                />
              </div>
            </div>
          ) : (
            <>
              <ObservabilityStatusBar
                model={activeRoster?.name || activeRuntime?.display_name}
                turns={sessionMessages.length}
                fileCount={fileToolCount}
              />
              {selectedSession && selectedSession !== "new" ? (
                <div className="flex items-center justify-between px-5 h-[44px] border-b border-border/30" style={{ background: "var(--color-layer-1)" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sm truncate">{displayName}</span>
                    <span className="text-[11px] text-muted-foreground/50 font-mono shrink-0">{selectedSession.slice(0, 8)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleFloatSession(selectedSession)}
                      title={t("sessions.float")}
                    >
                      <PictureInPicture2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={handleRefreshMessages}
                      title={t("sessions.refresh")}
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleResumeSession(selectedSession)}
                      disabled={loadingSessionId === selectedSession}
                      title={t("sessions.openTerminal")}
                    >
                      <TerminalIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => openDeleteDialog(selectedSession, displayName || "\u672a\u547d\u540d\u4f1a\u8bdd")}
                      disabled={Boolean(currentStream?.isStreaming)}
                      title={currentStream?.isStreaming ? "\u5f53\u524d\u4f1a\u8bdd\u6b63\u5728\u8fd0\u884c\uff0c\u6682\u65f6\u4e0d\u80fd\u5220\u9664" : "\u5220\u9664\u4f1a\u8bdd"}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => setRenameOpen(true)} title={t("sessions.rename")}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="px-5 h-[44px] flex items-center border-b border-border/30" style={{ background: "var(--color-layer-1)" }}>
                  <span className="font-medium text-sm text-muted-foreground">{t("sessions.newChat")}</span>
                </div>
              )}
              <div ref={messageAreaRef} className="flex-1 min-h-0 overflow-y-auto">
                {selectedSession && selectedSession !== "new" && (
                  <MessageView
                    messages={sessionMessages}
                    searchQuery={searchQuery}
                    searchNavigation={messageSearchNavigation}
                    onSearchStatusChange={handleMessageSearchStatusChange}
                    flat
                    scrollContainerRef={messageAreaRef}
                  />
                )}
                {currentStream && selectedSession && selectedSession !== "new" && (
                  <StreamingMessage
                    key={selectedSession}
                    sessionId={selectedSession}
                    isComplete={!currentStream.isStreaming}
                    scrollContainerRef={messageAreaRef}
                  />
                )}
              </div>
            </>
          )}
          {projectId && !showStartComposer && (
            <div className="relative">
              {isAwayFromBottom && (
                <button
                  onClick={handleScrollToBottom}
                  className="absolute -top-10 left-1/2 -translate-x-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border/40 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:bg-accent hover:text-foreground hover:border-border/60 hover:shadow-md opacity-60 hover:opacity-100"
                  title={t("sessions.scrollToBottom")}
                >
                  <ChevronDown className="h-4 w-4" strokeWidth={2.5} />
                </button>
              )}
              <ChatInput
                ref={chatInputRef}
                sessionId={selectedSession === "new" ? null : selectedSession}
                projectPath={currentProject?.path ?? null}
                currentAgentId={activeId}
                onMessageSent={handleMessageSent}
                notice={modelSwitchNotice}
                allowFiles={true}
                contextFooter={composerFooter}
                accessModeLabel={accessModeLabel}
                accessModeTitle={supportsAccessModeSwitch ? t("sessions.accessMode") : t("sessions.accessModeReadOnly")}
                accessModeReadOnly={!supportsAccessModeSwitch}
                accessModeOptions={accessModeOptions}
                accessModeValue={accessModeValue}
                onAccessModeChange={handleAccessModeChange}
                draftMessage={usageExampleDraft}
                onDraftMessageConsumed={() => setUsageExampleDraft(null)}
              />
            </div>
          )}
        </div>

        {projectId ? (
          <div
            className={cn(
              "border-l border-border/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] backdrop-blur-sm",
              inspectorCollapsed ? "w-14" : "w-[22rem] max-w-[42vw]",
            )}
          >
            {!inspectorCollapsed ? (
              <div className="flex h-full flex-col">
                <div className="border-b border-border/40 px-3 py-3">
                  <div className="flex items-start gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Folder className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{"\u5de5\u4f5c\u4fa7\u680f"}</p>
                          <p className="truncate text-[11px] text-muted-foreground" title={projectPath}>
                            {projectDisplayName}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setInspectorCollapsed(true)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-fast hover:bg-accent/55 hover:text-foreground"
                          title={"\u6536\u8d77\u5de5\u4f5c\u4fa7\u680f"}
                        >
                          <PanelRightClose className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground/80" title={projectPath}>
                        {projectPath}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl bg-muted/55 p-1">
                    <button
                      type="button"
                      onClick={() => setInspectorTab("actions")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-fast",
                        inspectorTab === "actions" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      {"\u9879\u76ee\u52a8\u4f5c"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setInspectorTab("directory")}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-fast",
                        inspectorTab === "directory" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      {"\u9879\u76ee\u76ee\u5f55"}
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                  {inspectorTab === "actions" ? (
                    selectedSession && selectedSession !== "new" ? (
                      actionRounds.length > 0 ? (
                        <div className="space-y-3">
                          {sessionActivityTraceError ? (
                            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-sm text-amber-700">
                              {"\u5386\u53f2\u52a8\u4f5c\u8ffd\u8e2a\u8bfb\u53d6\u5931\u8d25\uff0c\u5f53\u524d\u5df2\u56de\u9000\u5230\u6d88\u606f\u6d41\u8bc6\u522b\uff1a"}{sessionActivityTraceError}
                            </div>
                          ) : null}
                          {actionRounds.map((round) => (
                            <div key={`round-${round.turnNumber}`} className="rounded-2xl border border-border/50 bg-card/80 p-3 shadow-sm">
                              <div className="flex items-center justify-between gap-2">
                                <div className="inline-flex items-center gap-2">
                                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                    {"\u7b2c"} {round.turnNumber} {"\u8f6e"}
                                  </span>
                                  {round.isStreaming ? (
                                    <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                                      {"\u8fdb\u884c\u4e2d"}
                                    </span>
                                  ) : null}
                                </div>
                                <span className="text-[11px] text-muted-foreground">
                                  {round.tools.length} {"\u4e2a\u5de5\u5177"}
                                </span>
                              </div>
                              <p className="mt-2 text-sm text-foreground/90">{round.userPreview}</p>
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {round.skills.length > 0 ? round.skills.map((skill) => (
                                  <span key={`${round.turnNumber}-${skill}`} className="rounded-full border border-primary/20 bg-primary/8 px-2 py-1 text-[11px] text-primary">
                                    {formatSkillDisplayName(skill)}
                                  </span>
                                )) : (
                                  <span className="rounded-full border border-dashed border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
                                    {"\u672a\u8bc6\u522b\u5230\u72ec\u7acb skill \u8bb0\u5f55"}
                                  </span>
                                )}
                                {round.workflow ? (
                                  <span className="rounded-full border border-sky-500/20 bg-sky-500/8 px-2 py-1 text-[11px] text-sky-700">
                                    Workflow: {round.workflow}
                                  </span>
                                ) : null}
                                {round.stage ? (
                                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/8 px-2 py-1 text-[11px] text-emerald-700">
                                    Stage: {round.stage}
                                  </span>
                                ) : null}
                              </div>
                              {round.notes.length > 0 ? (
                                <div className="mt-2 space-y-1 rounded-xl border border-border/40 bg-background/45 px-2.5 py-2">
                                  {round.notes.map((note, noteIndex) => (
                                    <p key={`${round.turnNumber}-note-${noteIndex}`} className="text-[12px] leading-5 text-muted-foreground">
                                      {note}
                                    </p>
                                  ))}
                                </div>
                              ) : null}
                              <div className="mt-3 space-y-2">
                                {round.tools.length > 0 ? <ActionRoundToolList tools={round.tools} /> : (
                                  <div className="rounded-xl border border-dashed border-border/60 px-3 py-2 text-sm text-muted-foreground">
                                    {"\u672c\u8f6e\u6ca1\u6709\u8bb0\u5f55\u5230\u5de5\u5177\u8c03\u7528"}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-full min-h-40 items-center justify-center rounded-2xl border border-dashed border-border/60 px-6 text-center text-sm text-muted-foreground">
                          {"\u5f53\u524d\u4f1a\u8bdd\u8fd8\u6ca1\u6709\u5f62\u6210\u53ef\u5f52\u6863\u7684\u52a8\u4f5c\u8f6e\u6b21\u3002"}
                        </div>
                      )
                    ) : (
                      <div className="flex h-full min-h-40 items-center justify-center rounded-2xl border border-dashed border-border/60 px-6 text-center text-sm text-muted-foreground">
                        {"\u9009\u62e9\u4e00\u4e2a\u4f1a\u8bdd\u540e\uff0c\u8fd9\u91cc\u4f1a\u6309\u8f6e\u6b21\u5c55\u793a Codex \u8c03\u7528\u8fc7\u7684 skill \u548c\u5de5\u5177\u3002"}
                      </div>
                    )
                  ) : (
                    <div className="flex h-full flex-col">
                      <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-border/50 bg-card/80 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{"\u9879\u76ee\u76ee\u5f55"}</p>
                          <p className="truncate text-[11px] text-muted-foreground" title={projectPath}>
                            {"\u53cc\u51fb\u6587\u4ef6\u53ef\u5728\u5e94\u7528\u5185\u9884\u89c8"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => projectPathForSettings && void loadProjectDirectory(projectPathForSettings)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-fast hover:bg-accent/55 hover:text-foreground"
                          title={"\u5237\u65b0\u76ee\u5f55"}
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {directoryError ? (
                        <div className="mb-3 rounded-2xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm text-red-600">
                          {directoryError}
                        </div>
                      ) : null}

                      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border/50 bg-card/75 p-2">
                        {projectPathForSettings ? (
                          <DirectoryTree
                            rootPath={projectPathForSettings}
                            nodesByPath={directoryNodesByPath}
                            expandedPaths={expandedDirectoryPaths}
                            loadingPaths={directoryLoadingPaths}
                            selectedPath={selectedDirectoryPath}
                            onToggle={handleToggleDirectory}
                            onSelect={setSelectedDirectoryPath}
                            onOpenFile={(path) => openViewer({ kind: "file", path })}
                          />
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center gap-3 px-2 py-3">
                <button
                  type="button"
                  onClick={() => setInspectorCollapsed(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-fast hover:bg-primary/15"
                  title={"\u5c55\u5f00\u5de5\u4f5c\u4fa7\u680f"}
                >
                  <PanelRightOpen className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInspectorTab("actions");
                    setInspectorCollapsed(false);
                  }}
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-xl transition-fast",
                    inspectorTab === "actions" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/55 hover:text-foreground",
                  )}
                  title={"\u9879\u76ee\u52a8\u4f5c"}
                >
                  <Wrench className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInspectorTab("directory");
                    setInspectorCollapsed(false);
                  }}
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-xl transition-fast",
                    inspectorTab === "directory" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/55 hover:text-foreground",
                  )}
                  title={"\u9879\u76ee\u76ee\u5f55"}
                >
                  <FolderOpen className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <RenameSessionDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        sessionId={selectedSession ?? ""}
        currentName={displayName}
        onRenamed={refetchNames}
      />
      <DeleteSessionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={"\u5220\u9664\u4f1a\u8bdd"}
        sessionLabel={deleteTarget?.label || "\u672a\u547d\u540d\u4f1a\u8bdd"}
        onConfirm={handleDeleteSelectedSession}
      />
    </div>
  );
}
