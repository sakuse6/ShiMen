import "@/i18n";
import { lazy, Suspense } from "react";
import { useInvoke, invokeCommand } from "@/hooks/use-invoke";
import { useTranslation } from "react-i18next";
// @ts-ignore
import { Copy, Minus, Pin, PinOff, Settings, Square, Sun, Palette, Moon, Type, X, Bot } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@/lmentor/platform/event";
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { useTheme, type Theme, ThemeProvider } from "@/hooks/use-theme";
import { useFontSize, type FontLevel } from "@/hooks/use-font-size";
import { AgentProvider, AgentLogo, RosterAgentProvider, useAgent, useRosterAgent } from "@/agents";
import { BeginnerGuideOverlay, type BeginnerGuideStep } from "@/components/onboarding/beginner-guide";
import { FileViewerProvider } from "@/components/file-viewer";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EnvCheckPage } from "@/pages/env-check-page";
import { emit } from "@/lmentor/platform/event";
import type { ManageTab, OverviewModuleSnapshot, Page, Project, ProjectMeta } from "@/types";

const ChatPage = lazy(() => import("@/pages/chat-page").then((m) => ({ default: m.ChatPage })));
const ManagePage = lazy(() => import("@/pages/manage-page").then((m) => ({ default: m.ManagePage })));

const themeConfig: Record<Theme, { icon: typeof Sun; label: string }> = {
  light: { icon: Sun, label: "浅色" },
  colorful: { icon: Palette, label: "彩色" },
  dark: { icon: Moon, label: "深色" },
};

const themeOrder: Theme[] = ["light", "colorful", "dark"];
const appWindow = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window ? getCurrentWindow() : null;
const APP_LOGO_SRC = "/app-logo.png";
const BEGINNER_GUIDE_STORAGE_KEY = "lmentor-beginner-guide-completed";

const fontLevels: { id: FontLevel; labelKey: string }[] = [
  { id: "s", labelKey: "fontSize.small" },
  { id: "m", labelKey: "fontSize.medium" },
  { id: "l", labelKey: "fontSize.large" },
  { id: "xl", labelKey: "fontSize.xlarge" },
];

interface AppGuideStep extends BeginnerGuideStep {
  page: Page;
  manageTab?: ManageTab;
  targetId?: string;
  openProviderApiDialog?: boolean;
}

const BEGINNER_GUIDE_STEPS: AppGuideStep[] = [
  {
    id: "chat-home",
    page: "chat",
    title: "从当前界面开始",
    description: "这里是日常对话与研究入口，真正开始使用前，我们先完成一次供应商配置。",
    details: [
      "当前页负责发起提问、进入项目与承接后续全部会话。",
      "第一次使用时，建议先进入管理页，把 API 与模型准备好。",
      "完成配置后，再回到这里开始真正的提问与研究流程。",
    ],
    note: "整套流程建议只做一次；后续通常只需更换 API Key 或补充模型列表。",
  },
  {
    id: "open-manage",
    page: "chat",
    targetId: "title-manage-button",
    title: "进入管理",
    description: "先从顶栏进入管理页，供应商、名册、项目与工具相关设置都从这里处理。",
    details: [
      "点击顶栏中的“管理”按钮。",
      "进入后，左侧会看到多个管理分区。",
      "本轮引导只聚焦供应商配置，不会改动其它模块。",
    ],
  },
  {
    id: "open-providers",
    page: "manage",
    manageTab: "providers",
    targetId: "manage-providers-tab",
    title: "打开供应商管理",
    description: "供应商页会直接读取隔离环境中的真实 `model_providers` 配置项。",
    details: [
      "点击左侧“供应商”页签。",
      "后续所有保存动作，都会落到隔离环境的 `CDXAgent/config.toml`。",
      "这意味着配置不会误写到本机全局运行环境里。",
    ],
  },
  {
    id: "select-linkbus",
    page: "manage",
    manageTab: "providers",
    targetId: "provider-linkbus-card",
    title: "选择推荐供应商 LinkBus",
    description: "对新手来说，LinkBus 作为国际模型入口更容易上手，因此这里把它作为推荐路径。",
    details: [
      "在左侧供应商索引中找到带“推荐”标记的 LinkBus。",
      "点击它，让右侧详情区切换到 LinkBus 对应配置。",
      "确认 Base URL、默认模型与模型列表都准备在这一路径下维护。",
    ],
    note: "如果你之后想切到别的供应商，也建议先按这一套流程跑通一次。",
  },
  {
    id: "open-api-guide",
    page: "manage",
    manageTab: "providers",
    targetId: "provider-api-button",
    title: "打开 API 获取说明",
    description: "供应商详情右上角提供了统一的“获取 API”入口，方便新手按站点指引完成准备。",
    details: [
      "点击“获取 API”按钮。",
      "弹窗里已经整理好国际模型与国产聚合平台的常用链接。",
      "本轮推荐继续沿用 LinkBus 路线。",
    ],
  },
  {
    id: "read-linkbus-guide",
    page: "manage",
    manageTab: "providers",
    targetId: "provider-api-dialog",
    openProviderApiDialog: true,
    title: "按 LinkBus 流程获取密钥",
    description: "这里会聚焦到弹窗内容。你只需要按 LinkBus 的站点流程拿到完整 API Key。",
    details: [
      "打开站点，根据页面指引完成账号注册。",
      "注册登录后，点击网页左侧导航栏进入“令牌管理”页面。",
      "新建令牌，令牌分组推荐选择 `default`。",
      "生成后完整复制密钥文本，并妥善保存到本地备忘录或密码管理器。",
    ],
    note: "只要拿到完整密钥文本，后面就能回到本页继续配置。",
  },
  {
    id: "fill-api-key",
    page: "manage",
    manageTab: "providers",
    targetId: "provider-api-key-input",
    title: "填写 API Key",
    description: "回到供应商详情后，把刚才复制的密钥填入 API Key 输入框。",
    details: [
      "只需要填写 API Key，本页其它结构字段通常已经准备好了。",
      "如果密钥更新了，直接覆盖旧值即可。",
      "填完后先不要急着保存，下一步先获取一次上游模型列表。",
    ],
  },
  {
    id: "fetch-models",
    page: "manage",
    manageTab: "providers",
    targetId: "provider-fetch-models-button",
    title: "获取上游模型",
    description: "填写好 API Key 后，先点一次“从上游获取模型”，让程序把当前可用模型拉回来。",
    details: [
      "点击“从上游获取模型”。",
      "如果当前供应商返回的模型很多，系统会先进入候选模型筛选，再加入正式列表。",
      "只有拿到模型列表后，默认模型与精简列表设置才有意义。",
    ],
  },
  {
    id: "trim-models",
    page: "manage",
    manageTab: "providers",
    targetId: "provider-model-list",
    title: "精简模型列表",
    description: "模型拉取完成后，建议先做一次清理，只保留你真正需要的模型。",
    details: [
      "建议优先只保留 `gpt-5.4-mini`、`gpt-5.6-terra`、`gpt-5.6-sol` 三个模型。",
      "先在列表里选中不需要的模型，再使用删除操作精简目录。",
      "这样后续切换模型会更清爽，也能减少误选。",
    ],
    note: "如果当前列表里已有很多历史模型，先删除多余项再保存会更稳妥。",
  },
  {
    id: "delete-models",
    page: "manage",
    manageTab: "providers",
    targetId: "provider-delete-models-button",
    title: "删除不需要的模型",
    description: "确认筛选结果后，使用删除按钮清理多余模型，保留核心三项即可。",
    details: [
      "建议只留 `gpt-5.4-mini`、`gpt-5.6-terra`、`gpt-5.6-sol`。",
      "如果某个模型未来需要再加，可以重新从上游获取后再加入。",
      "删完后顺手检查一下默认模型是否仍指向你想用的那一个。",
    ],
  },
  {
    id: "save-provider",
    page: "manage",
    manageTab: "providers",
    targetId: "provider-save-button",
    title: "保存配置并开始使用",
    description: "最后一步就是保存配置。保存后，这套供应商信息就会写入隔离环境并可立即投入使用。",
    details: [
      "点击“保存配置”。",
      "保存后，程序会把对应 `model_providers` 段写回 `CDXAgent/config.toml`。",
      "完成后返回对话页，就可以直接开始使用了。",
    ],
    note: "如果你后面还要启用别的供应商，流程基本相同：选择供应商、填 API、拉模型、精简、保存。",
  },
];

function displayAgentName(name: string | null | undefined, fallback = "未命名 Agent") {
  const normalized = String(name || "").trim();
  return normalized || fallback;
}

function displayLineageName(name: string | null | undefined, fallback = "师门") {
  const normalized = String(name || "").trim();
  return normalized || fallback;
}

function displayUserName(name: string | null | undefined, fallback = "用户") {
  const normalized = String(name || "").trim();
  return normalized || fallback;
}

function FontSizeRow({
  label,
  value,
  onChange,
  t,
}: {
  label: string;
  value: FontLevel;
  onChange: (v: FontLevel) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground w-14 shrink-0">{label}</span>
      <div className="flex gap-1">
        {fontLevels.map(({ id, labelKey }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] transition-fast",
              value === id
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

function LoadingOverlay({ label }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 rounded-full border-2 border-muted-foreground/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
          <img src={APP_LOGO_SRC} alt="" className="absolute inset-2 h-10 w-10 rounded-lg object-cover" />
        </div>
        {label && (
          <div className="rounded-full border border-border/60 bg-card/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
            {label}
          </div>
        )}
      </div>
    </div>
  );
}

function RuntimeStatusStrip({ overview }: { overview: OverviewModuleSnapshot | null }) {
  const runtime = overview?.codex_runtime;
  if (!runtime) return null;

  return (
    <div className="flex min-h-9 items-center gap-2 border-b border-border/35 bg-card/85 px-3 text-xs text-muted-foreground shadow-sm">
      <span className={cn(
        "shrink-0 rounded-full border px-2 py-1 font-medium",
        runtime.using_project_runtime
          ? "border-[var(--icon-success)]/30 bg-[var(--icon-success)]/10 text-[var(--icon-success)]"
          : "border-destructive/30 bg-destructive/5 text-destructive",
      )}>
        {runtime.using_project_runtime ? "项目 CDXAgent 已启用" : "未使用项目运行环境"}
      </span>
      <span className={cn(
        "shrink-0 rounded-full border px-2 py-1 font-medium",
        runtime.isolated
          ? "border-[var(--icon-success)]/30 bg-[var(--icon-success)]/10 text-[var(--icon-success)]"
          : "border-destructive/30 bg-destructive/5 text-destructive",
      )}>
        {runtime.isolated ? "CODEX_HOME 已隔离" : "CODEX_HOME 未隔离"}
      </span>
      <span className="shrink-0 rounded-full border border-border/60 bg-background/70 px-2 py-1 text-foreground">
        Skills {runtime.skill_sync?.active_skill_count ?? 0}
      </span>
      <span className="shrink-0 text-[11px]">
        {runtime.skill_sync?.synced_at ? `同步 ${new Date(runtime.skill_sync.synced_at).toLocaleTimeString("zh-CN")}` : "等待同步"}
      </span>
    </div>
  );
}

function TitleBar({
  currentPage,
  onNavigate,
  disabled,
  onRosterAgentClick,
}: {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  disabled?: boolean;
  onRosterAgentClick?: (agentId: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const {
    agents: rosterAgents,
    active: activeRosterAgent,
    activeId: activeRosterId,
    lineageName,
    setActive: setActiveRosterAgent,
  } = useRosterAgent();
  const [pinned, setPinned] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  // @ts-ignore
  const [maximized, setMaximized] = useState(false);
  const { theme, setTheme } = useTheme();
  const logo = APP_LOGO_SRC;
  const { fontSizeBase, fontSizeProse, setFontSizeBase, setFontSizeProse } = useFontSize();
  const fontRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invokeCommand<boolean>("load_always_on_top").then(setPinned).catch(console.error);
    appWindow?.isMaximized().then(setMaximized).catch((e) => {
      if (import.meta.env.DEV) console.warn("IPC failed:", e);
    });
  }, []);

  useEffect(() => {
    if (!appWindow) return;

    let unlisten: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;

    appWindow.onResized(() => {
      if (timer != null) return;
      timer = setTimeout(async () => {
        timer = null;
        const isNowMaximized = await appWindow.isMaximized();
        setMaximized((prev) => (prev === isNowMaximized ? prev : isNowMaximized));
      }, 200);
    }).then((fn) => {
      unlisten = fn;
    }).catch((e) => {
      if (import.meta.env.DEV) console.warn("IPC failed:", e);
    });

    return () => {
      unlisten?.();
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!fontOpen) return;

    const handler = (e: MouseEvent) => {
      if (fontOpen && fontRef.current && !fontRef.current.contains(e.target as Node)) {
        setFontOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [fontOpen]);

  const handleToggle = async () => {
    try {
      const newValue = await invokeCommand<boolean>("toggle_always_on_top");
      setPinned(newValue);
    } catch (e) {
      console.error(e);
    }
  };

  // @ts-ignore
  const minimizeWindow = () => {
    appWindow?.minimize().catch(console.error);
  };

  const toggleMaximizeWindow = async () => {
    if (!appWindow) return;

    try {
      await appWindow.toggleMaximize();
      setMaximized(await appWindow.isMaximized());
    } catch (e) {
      console.error(e);
    }
  };

  // @ts-ignore
  const closeWindow = () => {
    appWindow?.close().catch(console.error);
  };

  const cycleTheme = () => {
    const idx = themeOrder.indexOf(theme);
    setTheme(themeOrder[(idx + 1) % themeOrder.length]);
  };

  const { icon: ThemeIcon, label: themeLabel } = themeConfig[theme];

  return (
    <div
      className="flex h-11 items-center border-b border-border/30 pl-3 select-none"
      style={{ background: "var(--color-layer-0)", WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="mr-1 flex h-full w-8 shrink-0 items-center justify-start" onDoubleClick={toggleMaximizeWindow}>
        <img src={logo} alt="" draggable={false} className="pointer-events-none h-6 w-6 rounded-md shadow-sm" />
      </div>

      <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button
          onClick={disabled ? undefined : () => onNavigate(currentPage === "chat" ? "manage" : "chat")}
          data-guide-id="title-manage-button"
          className={cn(
            "h-7 px-3 rounded-md flex items-center gap-1.5 text-xs transition-fast",
            disabled && "pointer-events-none opacity-50",
            currentPage === "manage"
              ? "bg-accent/80 text-accent-foreground font-medium shadow-sm"
              : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
          )}
        >
          <Settings className="h-3.5 w-3.5 text-[var(--icon-config)]" />
          <span>{t("nav.config")}</span>
        </button>

        <button
          onClick={cycleTheme}
          className="h-7 px-3 rounded-md flex items-center gap-1.5 text-xs transition-fast text-muted-foreground hover:bg-accent/30 hover:text-foreground"
          title={themeLabel}
        >
          <ThemeIcon className="h-3.5 w-3.5 text-[var(--icon-theme)]" />
          <span>{themeLabel}</span>
        </button>

        <div className="relative" ref={fontRef}>
          <button
            onClick={() => setFontOpen(!fontOpen)}
            className={cn(
              "h-7 px-3 rounded-md flex items-center gap-1.5 text-xs transition-fast text-muted-foreground hover:bg-accent/30 hover:text-foreground",
              fontOpen && "bg-accent/30 text-foreground",
            )}
            title={t("fontSize.title")}
          >
            <Type className="h-3.5 w-3.5 text-[var(--icon-theme)]" />
            <span>{t("fontSize.title")}</span>
          </button>
          {fontOpen && (
            <div className="absolute left-0 top-full mt-1 w-64 rounded-lg border border-border bg-card shadow-lg z-50 p-3 space-y-2">
              <FontSizeRow label={t("fontSize.ui")} value={fontSizeBase} onChange={setFontSizeBase} t={t} />
              <FontSizeRow label={t("fontSize.prose")} value={fontSizeProse} onChange={setFontSizeProse} t={t} />
            </div>
          )}
        </div>

        <button
          onClick={handleToggle}
          className={cn(
            "h-7 px-3 rounded-md flex items-center gap-1.5 text-xs transition-fast",
            pinned ? "text-primary" : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
          )}
          title={pinned ? "取消置顶" : "置顶窗口"}
        >
          {pinned ? <PinOff className="h-3.5 w-3.5 text-[var(--icon-pin)]" /> : <Pin className="h-3.5 w-3.5 text-[var(--icon-pin)]" />}
          <span>{pinned ? t("about.unpin") : t("about.pin")}</span>
        </button>

        <div className="ml-1 mr-2 flex max-w-[34rem] items-center gap-1 overflow-x-auto rounded-full border border-border/30 bg-accent/20 px-1 py-0.5">
          <span className="shrink-0 rounded-full border border-border/40 bg-background/70 px-2 py-1 text-[11px] font-medium text-foreground">
            {displayLineageName(lineageName)}
          </span>
          {rosterAgents.map((agent) => {
            const isActive = agent.id === activeRosterId;
            return (
              <button
                key={agent.id}
                type="button"
                title={agent.role_title || displayAgentName(agent.name)}
                aria-label={displayAgentName(agent.name)}
                onClick={() => {
                  if (onRosterAgentClick) {
                    void onRosterAgentClick(agent.id);
                    return;
                  }
                  void setActiveRosterAgent(agent.id);
                }}
                className={cn(
                  "relative flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs transition-fast",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                )}
              >
                <AgentLogo agentId={agent.id} size={14} />
                <span className="max-w-[7rem] truncate font-medium">{displayAgentName(agent.name)}</span>
              </button>
            );
          })}
          {rosterAgents.length === 0 ? (
            <button
              type="button"
              title={displayAgentName(activeRosterAgent?.name, "Agent")}
              aria-label={displayAgentName(activeRosterAgent?.name, "Agent")}
              className="relative flex h-7 cursor-default items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground"
            >
              <Bot className="h-3.5 w-3.5 text-[var(--icon-theme)]" />
              {displayAgentName(activeRosterAgent?.name, "Agent")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-w-8 flex-1 self-stretch" onDoubleClick={toggleMaximizeWindow} />

      <div className="ml-2 flex h-full items-stretch" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
      </div>
    </div>
  );
}

function AppContent() {
  const { activeId: runtimeActiveId } = useAgent();
  const { setActive: setRosterActive, lineageName, userName, saveIdentity, loading: rosterLoading } = useRosterAgent();
  const [currentPage, setCurrentPage] = useState<Page>("chat");
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [activeSessionByProject, setActiveSessionByProject] = useState<Record<string, string | null>>({});
  const [initialProjectRestored, setInitialProjectRestored] = useState(false);
  const [lineageDraft, setLineageDraft] = useState("");
  const [userNameDraft, setUserNameDraft] = useState("");
  const [identitySaving, setIdentitySaving] = useState(false);
  const [startupWelcomeOpen, setStartupWelcomeOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStepIndex, setGuideStepIndex] = useState(0);
  const [guideTargetRect, setGuideTargetRect] = useState<DOMRect | null>(null);
  const [guideForcedManageTab, setGuideForcedManageTab] = useState<ManageTab | null>(null);
  const { data: projects, loading: projectsLoading, refetch: refetchProjects } = useInvoke<Project[]>("scan_projects");
  const { data: sessionNames, loading: namesLoading, refetch: refetchNames } = useInvoke<Record<string, string>>("get_session_names");
  const { data: projectMetas, refetch: refetchProjectMetas } = useInvoke<Record<string, ProjectMeta>>("load_project_metas");
  const { data: overviewModule, refetch: refetchOverviewModule } = useInvoke<OverviewModuleSnapshot>("load_overview_module", undefined, runtimeActiveId ?? undefined);
  const activeRefreshReadyRef = useRef(false);
  const startupWelcomeShownRef = useRef(false);
  const startupWelcomeTimerRef = useRef<number | null>(null);
  const guideDismissedThisRunRef = useRef(false);
  // Capture the initial identity state once. Navigation must not make an
  // already configured installation eligible for the automatic guide.
  const firstRunGuideEligibleRef = useRef<boolean | null>(null);

  const loading = projectsLoading || namesLoading;
  // Only block the whole shell during initial bootstrap. Project/session list
  // loading should stay local to the chat page so a slow session query cannot
  // freeze the entire app behind the startup overlay.
  const bootstrapLoading = loading || !initialProjectRestored;
  const blockingLoading = bootstrapLoading;
  const identityRequired = !rosterLoading && (!userName.trim() || !lineageName.trim());
  const activeGuideStep = guideOpen ? BEGINNER_GUIDE_STEPS[guideStepIndex] ?? null : null;

  useEffect(() => {
    setLineageDraft(lineageName);
  }, [lineageName]);

  useEffect(() => {
    setUserNameDraft(userName);
  }, [userName]);

  useEffect(() => {
    if (rosterLoading || firstRunGuideEligibleRef.current !== null) return;
    firstRunGuideEligibleRef.current = !userName.trim() || !lineageName.trim();
  }, [lineageName, rosterLoading, userName]);

  useEffect(() => {
    document.title = "师门 ShiMen（The Mentorship Guild）";
  }, []);

  useEffect(() => {
    return () => {
      if (startupWelcomeTimerRef.current !== null) {
        window.clearTimeout(startupWelcomeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (rosterLoading || startupWelcomeShownRef.current) return;
    startupWelcomeShownRef.current = true;

    if (!userName.trim() || !lineageName.trim()) {
      setStartupWelcomeOpen(false);
      return;
    }

    setStartupWelcomeOpen(true);
    if (startupWelcomeTimerRef.current !== null) {
      window.clearTimeout(startupWelcomeTimerRef.current);
    }
    startupWelcomeTimerRef.current = window.setTimeout(() => {
      setStartupWelcomeOpen(false);
      startupWelcomeTimerRef.current = null;
    }, 3000);
  }, [lineageName, rosterLoading, userName]);

  const handleGuideClose = useCallback(() => {
    localStorage.setItem(BEGINNER_GUIDE_STORAGE_KEY, "1");
    guideDismissedThisRunRef.current = true;
    setGuideOpen(false);
    setGuideTargetRect(null);
    setGuideForcedManageTab(null);
  }, []);

  const handleGuideBack = useCallback(() => {
    setGuideStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleGuideNext = useCallback(() => {
    setGuideStepIndex((prev) => Math.min(BEGINNER_GUIDE_STEPS.length - 1, prev + 1));
  }, []);

  const handleGuideComplete = useCallback(() => {
    localStorage.setItem(BEGINNER_GUIDE_STORAGE_KEY, "1");
    guideDismissedThisRunRef.current = true;
    setGuideOpen(false);
    setGuideTargetRect(null);
    setGuideForcedManageTab(null);
    setCurrentPage("chat");
  }, []);

  const handleGuideReopen = useCallback(() => {
    guideDismissedThisRunRef.current = false;
    setGuideStepIndex(0);
    setGuideTargetRect(null);
    setGuideForcedManageTab(null);
    setCurrentPage("chat");
    setGuideOpen(true);
  }, []);

  useEffect(() => {
    if (bootstrapLoading || identityRequired || guideOpen || guideDismissedThisRunRef.current) return;
    if (firstRunGuideEligibleRef.current !== true) return;
    if (localStorage.getItem(BEGINNER_GUIDE_STORAGE_KEY) === "1") return;
    setGuideStepIndex(0);
    setGuideOpen(true);
    setCurrentPage("chat");
    setGuideForcedManageTab(null);
  }, [bootstrapLoading, guideOpen, identityRequired]);

  useEffect(() => {
    if (!activeGuideStep) {
      setGuideForcedManageTab(null);
      setGuideTargetRect(null);
      return;
    }

    if (currentPage !== activeGuideStep.page) {
      setCurrentPage(activeGuideStep.page);
    }
    setGuideForcedManageTab(activeGuideStep.manageTab ?? null);
  }, [activeGuideStep, currentPage]);

  useEffect(() => {
    if (!guideOpen || !activeGuideStep?.targetId) {
      if (!activeGuideStep?.targetId) {
        setGuideTargetRect(null);
      }
      return;
    }

    let cancelled = false;
    let hasScrolled = false;

    const updateTarget = () => {
      if (cancelled) return;
      const target = document.querySelector(`[data-guide-id="${activeGuideStep.targetId}"]`) as HTMLElement | null;
      if (!target) {
        setGuideTargetRect(null);
        return;
      }

      if (!hasScrolled) {
        target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        hasScrolled = true;
      }

      const rect = target.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setGuideTargetRect(rect);
      } else {
        setGuideTargetRect(null);
      }
    };

    const intervalId = window.setInterval(updateTarget, 250);
    const initialTimeout = window.setTimeout(updateTarget, 80);
    const handleViewportChange = () => updateTarget();

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    updateTarget();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(initialTimeout);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [activeGuideStep, guideOpen]);

  useEffect(() => {
    if (!projects || initialProjectRestored) return;
    let cancelled = false;

    invokeCommand<string | null>("load_last_project")
      .then((lastEncoded) => {
        if (cancelled) return;
        if (lastEncoded) {
          const found = projects.find((p) => p.encoded_name === lastEncoded);
          if (found) {
            setCurrentProject(found);
          }
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setInitialProjectRestored(true);
      });

    return () => {
      cancelled = true;
    };
  }, [projects, initialProjectRestored]);

  useEffect(() => {
    if (initialProjectRestored || projectsLoading) return;
    if (projects === null) {
      setInitialProjectRestored(true);
    }
  }, [initialProjectRestored, projectsLoading, projects]);

  const refreshWorkspace = useCallback(async (silent = false): Promise<number> => {
    const newProjects = await refetchProjects(silent);
    setCurrentProject((prev) => {
      if (!prev) return null;
      return newProjects.find((p) => p.encoded_name === prev.encoded_name) ?? null;
    });
    await refetchNames(true);
    await refetchProjectMetas(true);
    return Date.now();
  }, [refetchProjects, refetchNames, refetchProjectMetas]);

  const handleRefresh = useCallback(async (): Promise<number> => {
    return refreshWorkspace(false);
  }, [refreshWorkspace]);

  const handleEnterProject = useCallback(async (project: Project) => {
    refetchProjectMetas(true).catch(console.error);
    setCurrentProject(project);
    invokeCommand("save_last_project", { encodedName: project.encoded_name }).catch(console.error);
    setCurrentPage("chat");
  }, [refetchProjectMetas]);

  const [manageNavKey, setManageNavKey] = useState(0);
  const [projectCreatorRequestKey, setProjectCreatorRequestKey] = useState(0);

  const handleSwitchProject = useCallback(() => {
    setManageNavKey((k) => k + 1);
    setCurrentPage("manage");
  }, []);

  const handleTopBarAgentClick = useCallback(async (agentId: string) => {
    await setRosterActive(agentId);

    if (!currentProject?.encoded_name) {
      setManageNavKey((k) => k + 1);
      setProjectCreatorRequestKey((k) => k + 1);
      setCurrentPage("manage");
      return;
    }

    setNavigateToSession(null);
    setActiveSessionByProject((prev) => ({
      ...prev,
      [currentProject.encoded_name]: "new",
    }));
    setCurrentPage("chat");
  }, [currentProject, setRosterActive]);

  const handleSessionChange = useCallback((sessionId: string | null) => {
    if (!currentProject?.encoded_name) return;
    setActiveSessionByProject((prev) => {
      const encodedName = currentProject.encoded_name;
      if ((prev[encodedName] ?? null) === sessionId) {
        return prev;
      }
      return {
        ...prev,
        [encodedName]: sessionId,
      };
    });
  }, [currentProject]);

  useEffect(() => {
    if (!runtimeActiveId) return;
    const silent = !activeRefreshReadyRef.current;
    activeRefreshReadyRef.current = true;

    refetchProjects(silent)
      .then((newProjects) => {
        setCurrentProject((prev) => {
          if (!prev) return null;
          return newProjects.find((p) => p.encoded_name === prev.encoded_name) ?? null;
        });
      })
      .catch(console.error);

    refetchNames(true).catch(console.error);
    refetchProjectMetas(true).catch(console.error);
    refetchOverviewModule(true).catch(console.error);
  }, [runtimeActiveId, refetchOverviewModule, refetchProjects, refetchNames, refetchProjectMetas]);

  const currentProjectMeta = currentProject ? projectMetas?.[currentProject.encoded_name] : undefined;
  const currentSessionId = currentProject ? (activeSessionByProject[currentProject.encoded_name] ?? null) : null;
  const [navigateToSession, setNavigateToSession] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen<{ sessionId: string; agentId: string; projectEncoded: string }>("floating-restore", async (event) => {
      if (cancelled) return;
      const { sessionId, agentId, projectEncoded } = event.payload;

      if (agentId) {
        await setRosterActive(agentId);
      }

      if (projectEncoded) {
        const targetProject = projects?.find((p) => p.encoded_name === projectEncoded);
        if (targetProject) {
          setCurrentProject(targetProject);
          invokeCommand("save_last_project", { encodedName: projectEncoded }).catch(console.error);
        }
      }

      setCurrentPage("chat");
      setTimeout(() => setNavigateToSession(sessionId), 100);
      setTimeout(() => setNavigateToSession(null), 500);
      getCurrentWindow().setFocus().catch((e) => {
        if (import.meta.env.DEV) console.warn("IPC failed:", e);
      });
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [projects, setRosterActive]);

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen<{ reason: string }>("workspace-data-changed", async () => {
      if (cancelled) return;
      try {
        await refreshWorkspace(true);
        await refetchOverviewModule(true);
      } catch (error) {
        console.error(error);
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    }).catch(console.error);

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [refetchOverviewModule, refreshWorkspace]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      refetchOverviewModule(true).catch(console.error);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [refetchOverviewModule]);

  const handleSaveIdentity = useCallback(async () => {
    const nextLineageName = lineageDraft.trim() || "师门";
    const nextUserName = userNameDraft.trim() || "用户";
    setIdentitySaving(true);
    try {
      await saveIdentity({ lineageName: nextLineageName, userName: nextUserName });
      void emit("workspace-data-changed", { reason: "roster-identity-updated" });
    } catch (error) {
      console.error(error);
    } finally {
      setIdentitySaving(false);
    }
  }, [lineageDraft, saveIdentity, userNameDraft]);

  const dismissStartupWelcome = useCallback(() => {
    if (startupWelcomeTimerRef.current !== null) {
      window.clearTimeout(startupWelcomeTimerRef.current);
      startupWelcomeTimerRef.current = null;
    }
    setStartupWelcomeOpen(false);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background relative">
      <TitleBar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        disabled={blockingLoading}
        onRosterAgentClick={handleTopBarAgentClick}
      />
      {currentPage === "chat" ? <RuntimeStatusStrip overview={overviewModule} /> : null}
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<LoadingOverlay />}>
          {currentPage === "chat" ? (
            <ChatPage
              currentProject={currentProject}
              currentProjectMeta={currentProjectMeta}
              onRefresh={handleRefresh}
              sessionNames={sessionNames}
              refetchNames={refetchNames}
              onSwitchProject={handleSwitchProject}
              currentSessionId={currentSessionId}
              onSessionChange={handleSessionChange}
              navigateToSession={navigateToSession}
            />
          ) : (
            <ManagePage
              onBack={() => setCurrentPage("chat")}
              onEnterProject={handleEnterProject}
              onReopenGuide={handleGuideReopen}
              navigateToProjects={manageNavKey}
              openProjectCreatorKey={projectCreatorRequestKey}
              forcedTab={guideForcedManageTab}
              providersGuideApiDialogOpen={Boolean(activeGuideStep?.openProviderApiDialog)}
            />
          )}
        </Suspense>
      </div>
      <div className="h-6 flex items-center justify-between px-4 text-[10px] text-muted-foreground/50 border-t border-border/30">
        <span>项目数：{projects?.length ?? 0}</span>
        <span aria-label="应用版本">©内蒙古犇牛科技有限公司 版本1.0.1</span>
      </div>
      {blockingLoading && <LoadingOverlay />}
      <BeginnerGuideOverlay
        open={guideOpen && !blockingLoading && !identityRequired}
        stepIndex={guideStepIndex}
        steps={BEGINNER_GUIDE_STEPS}
        targetRect={guideTargetRect}
        onClose={handleGuideClose}
        onBack={handleGuideBack}
        onNext={handleGuideNext}
        onComplete={handleGuideComplete}
      />
      {startupWelcomeOpen ? (
        <div className="pointer-events-none fixed inset-x-0 top-14 z-[96] flex justify-center px-4">
          <div className="pointer-events-auto relative w-full max-w-xl overflow-hidden rounded-2xl border border-primary/25 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.18),transparent_42%),linear-gradient(180deg,rgba(30,25,20,0.98),rgba(18,16,14,0.98))] px-5 py-4 text-foreground shadow-[0_24px_70px_rgba(0,0,0,0.35)] animate-in fade-in-0 slide-in-from-top-3 duration-500">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -left-8 top-2 h-24 w-24 rounded-full bg-primary/12 blur-2xl animate-pulse" />
              <div className="absolute right-0 top-0 h-20 w-20 rounded-full bg-amber-100/10 blur-2xl animate-pulse [animation-delay:0.7s]" />
            </div>
            <button
              type="button"
              onClick={dismissStartupWelcome}
              className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/40 bg-background/10 text-muted-foreground transition-fast hover:bg-background/20 hover:text-foreground"
              aria-label="关闭迎门提示"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="relative">
              <div className="mb-2 h-px w-24 bg-gradient-to-r from-transparent via-primary/80 to-transparent" />
              <p className="text-[11px] uppercase tracking-[0.28em] text-primary/80">山门启迎</p>
              <p className="mt-2 text-base font-semibold tracking-[0.08em] text-foreground">
                {`${displayUserName(userName, "道友")}阁下，欢迎来到${displayLineageName(lineageName, "师门 ShiMen（The Mentorship Guild）")}`}
              </p>
              <p className="mt-1 text-sm leading-6 text-foreground/75">
                愿阁下此番入门，所思皆有脉络，所行皆得回响。
              </p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-primary/10">
                <div className="h-full w-full origin-left animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-primary/80 via-amber-200/80 to-primary/30" />
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <Dialog open={identityRequired} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-lg overflow-hidden border-primary/20 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.14),transparent_42%),linear-gradient(180deg,rgba(28,24,20,0.98),rgba(20,18,16,0.98))] text-foreground shadow-[0_30px_90px_rgba(0,0,0,0.35)]"
          showCloseButton={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-10 top-8 h-28 w-28 rounded-full bg-primary/10 blur-2xl animate-pulse" />
            <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-amber-100/10 blur-2xl animate-pulse [animation-delay:0.8s]" />
            <div className="absolute bottom-0 left-1/2 h-20 w-48 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl animate-pulse [animation-delay:1.3s]" />
          </div>
          <DialogHeader>
            <div className="mx-auto mb-2 h-px w-24 bg-gradient-to-r from-transparent via-primary/80 to-transparent" />
            <DialogTitle className="text-center text-2xl tracking-[0.18em]">立卷留名</DialogTitle>
            <DialogDescription>
              <span className="block text-center text-sm leading-7 text-foreground/80">
                {`${displayUserName(userNameDraft || userName, "道友")}阁下，欢迎来到${displayLineageName(lineageDraft || lineageName, "师门 ShiMen（The Mentorship Guild）")}`}
              </span>
              <span className="mt-2 block text-center text-xs tracking-[0.2em] text-muted-foreground/80">
                既入此门，便请留下名号与门匾
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/90">阁下名号</label>
              <Input
                autoFocus
                value={userNameDraft}
                onChange={(event) => setUserNameDraft(event.target.value)}
                placeholder="例如：云舟"
                className="border-primary/20 bg-background/70"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/90">师门名号</label>
              <Input
                value={lineageDraft}
                onChange={(event) => setLineageDraft(event.target.value)}
                placeholder="例如：师门 ShiMen（The Mentorship Guild）"
                className="border-primary/20 bg-background/70"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !identitySaving) {
                    event.preventDefault();
                    void handleSaveIdentity();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => void handleSaveIdentity()}
              disabled={identitySaving}
              className="min-w-28 bg-primary text-primary-foreground shadow-[0_10px_30px_rgba(212,175,55,0.18)]"
            >
              {identitySaving ? "题录中..." : "落名入门"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AppContentWrapper() {
  const [envChecked, setEnvChecked] = useState(!!localStorage.getItem("jishu-hub-env-checked"));

  if (!envChecked) {
    return (
      <div className="flex flex-col h-screen w-screen bg-background text-foreground relative">
        <TitleBar currentPage="chat" onNavigate={() => {}} disabled />
        <div className="flex-1 overflow-hidden bg-background">
          <EnvCheckPage
            onComplete={() => {
              localStorage.setItem("jishu-hub-env-checked", "1");
              setEnvChecked(true);
            }}
          />
        </div>
      </div>
    );
  }

  return <AppContent />;
}

function App() {
  return (
    <ThemeProvider>
      <AgentProvider>
        <RosterAgentProvider>
          <FileViewerProvider>
            <ErrorBoundary>
              <AppContentWrapper />
            </ErrorBoundary>
          </FileViewerProvider>
        </RosterAgentProvider>
      </AgentProvider>
    </ThemeProvider>
  );
}

export default App;
