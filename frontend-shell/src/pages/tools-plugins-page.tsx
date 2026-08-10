import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  ToggleLeft,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { invokeCommand, useInvoke } from "@/hooks/use-invoke";
import { lmentorCommands } from "@/lmentor/api";
import { open } from "@/lmentor/platform/plugin-dialog";
import { formatSkillPurposeText } from "@/lib/skill-display";
import { cn } from "@/lib/utils";
import type {
  ContextEntryInput,
  ContextEntryKind,
  ContextEntryRecord,
  CodexRuntimeImportKind,
  CodexRuntimeImportPreview,
  CodexRuntimeImportResult,
  CodexRuntimeImportSourcesSnapshot,
  SkillLibraryEntry,
  SkillImportCheck,
  SkillImportResult,
  SkillImportValidation,
  ToolsPluginsModuleSnapshot,
} from "@/types";

const groupMeta: Record<ContextEntryKind, { title: string; description: string }> = {
  mcp: { title: "MCP 服务", description: "桥接底层能力服务，例如 Node REPL、Browser、文档工具等。" },
  skill: { title: "技能", description: "用于组织工作流能力与场景增强。" },
  plugin: { title: "插件", description: "用于补齐运行时与前端壳层之间的能力入口。" },
};

const codexImportKindLabels: Record<CodexRuntimeImportKind, string> = {
  sessions: "聊天记录",
  skills: "Skills",
  mcp: "MCP",
  plugins: "Plugins",
  config: "非敏感配置",
};

const defaultCodexImportKinds: CodexRuntimeImportKind[] = ["sessions", "skills", "mcp", "plugins", "config"];

function skillSourceLabel(skill: SkillLibraryEntry) {
  const location = `${skill.directory || skill.path}`.replace(/\\/g, "/");
  if (location.includes("/CDXAgent/skills/")) return "隔离技能目录";
  if (location.includes("/CDXAgent/")) return "隔离运行目录";
  if (skill.source === "codex") return "隔离命令行主目录";
  if (skill.source === "agents") return "本机代理技能";
  return "项目或应用根目录";
}

function emptyEntry(kind: ContextEntryKind): ContextEntryInput {
  return {
    kind,
    id: "",
    title: "",
    summary: "",
    enabled: true,
    body: "{}",
  };
}

function flattenModule(snapshot: ToolsPluginsModuleSnapshot): ContextEntryRecord[] {
  return [...snapshot.mcp_servers, ...snapshot.skills, ...snapshot.plugins];
}

function checkIcon(check: SkillImportCheck) {
  if (check.status === "success") return <CheckCircle2 className="h-4 w-4 text-[var(--icon-success)]" />;
  if (check.status === "warning") return <AlertTriangle className="h-4 w-4 text-[var(--icon-theme)]" />;
  return <AlertTriangle className="h-4 w-4 text-destructive" />;
}

export function ToolsPluginsPage() {
  const { data, loading, refetch } = useInvoke<ToolsPluginsModuleSnapshot>(lmentorCommands.tools.module);
  const [view, setView] = useState<"manage" | "import" | "codex-import">("manage");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContextEntryInput>(emptyEntry("mcp"));
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [skillFilePath, setSkillFilePath] = useState("");
  const [skillValidation, setSkillValidation] = useState<SkillImportValidation | null>(null);
  const [skillImportResult, setSkillImportResult] = useState<SkillImportResult | null>(null);
  const [checkingSkill, setCheckingSkill] = useState(false);
  const [installingSkill, setInstallingSkill] = useState(false);
  const [codexImportSources, setCodexImportSources] = useState<CodexRuntimeImportSourcesSnapshot | null>(null);
  const [codexImportPreview, setCodexImportPreview] = useState<CodexRuntimeImportPreview | null>(null);
  const [codexImportResult, setCodexImportResult] = useState<CodexRuntimeImportResult | null>(null);
  const [codexImportKinds, setCodexImportKinds] = useState<CodexRuntimeImportKind[]>(defaultCodexImportKinds);
  const [loadingCodexImport, setLoadingCodexImport] = useState(false);
  const [executingCodexImport, setExecutingCodexImport] = useState(false);
  const [skillLibrary, setSkillLibrary] = useState<SkillLibraryEntry[]>([]);
  const [skillLibraryLoading, setSkillLibraryLoading] = useState(false);
  const [skillLibraryError, setSkillLibraryError] = useState<string | null>(null);
  const [skillLibraryUpdatedAt, setSkillLibraryUpdatedAt] = useState<string | null>(null);

  const entries = useMemo(() => (data ? flattenModule(data) : []), [data]);

  useEffect(() => {
    if (!data || view !== "manage") return;
    const exists = selectedKey ? entries.some((item) => `${item.kind}:${item.id}` === selectedKey) : false;
    const next = exists ? entries.find((item) => `${item.kind}:${item.id}` === selectedKey) ?? null : entries[0] ?? null;
    setSelectedKey(next ? `${next.kind}:${next.id}` : null);
    setDraft(next ? {
      kind: next.kind,
      id: next.id,
      title: next.title,
      summary: next.summary,
      enabled: next.enabled,
      body: next.body,
    } : emptyEntry("mcp"));
  }, [data, entries, selectedKey, view]);

  useEffect(() => {
    if (view !== "codex-import" || codexImportSources || loadingCodexImport) return;
    void loadCodexImportSources();
  }, [view, codexImportSources, loadingCodexImport]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const loadSkillLibrary = async (showLoading: boolean) => {
      if (inFlight) return;
      inFlight = true;
      if (showLoading) setSkillLibraryLoading(true);
      try {
        const result = await invokeCommand<SkillLibraryEntry[]>(
          lmentorCommands.tools.skillLibrary,
          { projectPath: "" },
        );
        if (!cancelled) {
          setSkillLibrary(result || []);
          setSkillLibraryError(null);
          setSkillLibraryUpdatedAt(new Date().toISOString());
        }
      } catch (error) {
        if (!cancelled) {
          setSkillLibraryError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        inFlight = false;
        if (!cancelled) setSkillLibraryLoading(false);
      }
    };

    void loadSkillLibrary(true);
    const timer = window.setInterval(() => {
      void loadSkillLibrary(false);
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const snapshot = await invokeCommand<ToolsPluginsModuleSnapshot>(lmentorCommands.tools.saveContextEntry, { entry: draft });
      const saved = flattenModule(snapshot).find((item) => item.kind === draft.kind && item.id === draft.id);
      setSelectedKey(saved ? `${saved.kind}:${saved.id}` : null);
      await refetch(true);
      setMessage("工具或插件条目已保存。");
    } catch (error) {
      setMessage(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!draft.id) return;
    setSaving(true);
    setMessage(null);
    try {
      await invokeCommand<void>(lmentorCommands.tools.deleteContextEntry, { kind: draft.kind, id: draft.id });
      setSelectedKey(null);
      setDraft(emptyEntry(draft.kind));
      await refetch(true);
      setMessage("工具或插件条目已删除。");
    } catch (error) {
      setMessage(`删除失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(entry: ContextEntryRecord) {
    setSaving(true);
    setMessage(null);
    try {
      await invokeCommand<void>(lmentorCommands.tools.toggleContextEntry, { kind: entry.kind, id: entry.id });
      await refetch(true);
      setMessage(`已${entry.enabled ? "停用" : "启用"}“${entry.title}”。`);
    } catch (error) {
      setMessage(`切换失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function validateSkillFile(nextPath: string) {
    if (!nextPath.trim()) return null;
    setCheckingSkill(true);
    setSkillImportResult(null);
    try {
      const validation = await invokeCommand<SkillImportValidation>(
        lmentorCommands.tools.validateSkillImport,
        { skillFilePath: nextPath },
      );
      setSkillValidation(validation);
      setMessage(validation.valid ? "Skill 校验通过，可以安装。" : `Skill 校验未通过：${validation.errors[0] || "请查看检查项。"}`);
      return validation;
    } catch (error) {
      setSkillValidation(null);
      setMessage(`Skill 校验失败：${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      setCheckingSkill(false);
    }
  }

  async function handleChooseSkillFile() {
    setMessage(null);
    const selected = await open({ multiple: false, directory: false });
    const nextPath = Array.isArray(selected) ? selected[0] : selected;
    if (!nextPath) return;
    setSkillFilePath(nextPath);
    await validateSkillFile(nextPath);
  }

  async function handleInstallSkill() {
    if (!skillFilePath.trim()) {
      setMessage("请先选择 SKILL.md 文件。");
      return;
    }

    setInstallingSkill(true);
    setMessage(null);
    try {
      const validation = skillValidation?.valid ? skillValidation : await validateSkillFile(skillFilePath);
      if (!validation?.valid) return;

      const result = await invokeCommand<SkillImportResult>(
        lmentorCommands.tools.installSkillFromFile,
        { skillFilePath },
      );
      setSkillImportResult(result);
      setSkillValidation(result.validation);
      await refetch(true);
      setMessage(`Skill“${result.entry.title}”已安装并通过可用性检查。`);
    } catch (error) {
      setMessage(`Skill 安装失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setInstallingSkill(false);
    }
  }

  function toggleCodexImportKind(kind: CodexRuntimeImportKind) {
    setCodexImportKinds((current) => (
      current.includes(kind)
        ? current.filter((item) => item !== kind)
        : [...current, kind]
    ));
    setCodexImportPreview(null);
    setCodexImportResult(null);
  }

  async function loadCodexImportSources() {
    setLoadingCodexImport(true);
    setMessage(null);
    try {
      const sources = await invokeCommand<CodexRuntimeImportSourcesSnapshot>(
        lmentorCommands.tools.codexRuntimeImportSources,
      );
      setCodexImportSources(sources);
      setMessage(sources.isolated ? "已读取本机运行环境与当前隔离环境。" : "已读取本机运行环境；当前环境尚未隔离。");
    } catch (error) {
      setMessage(`读取运行环境来源失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoadingCodexImport(false);
    }
  }

  async function previewCodexImport() {
    if (codexImportKinds.length === 0) {
      setMessage("请至少选择一种要导入的内容。");
      return;
    }

    setLoadingCodexImport(true);
    setMessage(null);
    try {
      const sourceHome = codexImportSources?.system_home;
      const preview = await invokeCommand<CodexRuntimeImportPreview>(
        lmentorCommands.tools.codexRuntimeImportPreview,
        { sourceHome, kinds: codexImportKinds },
      );
      setCodexImportPreview(preview);
      setCodexImportResult(null);
      setMessage(preview.ready_to_apply ? "预览已生成，可以执行导入。" : "预览已生成，但当前没有可执行的导入项。");
    } catch (error) {
      setMessage(`生成运行环境导入预览失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoadingCodexImport(false);
    }
  }

  async function executeCodexImport() {
    if (!codexImportPreview?.ready_to_apply) {
      setMessage("请先生成可执行的导入预览。");
      return;
    }

    const confirmed = window.confirm("将把本机运行环境中的可迁移内容导入到 Lmentor 隔离环境，并在执行前自动备份目标目录。继续吗？");
    if (!confirmed) return;

    setExecutingCodexImport(true);
    setMessage(null);
    try {
      const result = await invokeCommand<CodexRuntimeImportResult>(
        lmentorCommands.tools.codexRuntimeImportExecute,
        { sourceHome: codexImportPreview.source.home, kinds: codexImportKinds },
      );
      setCodexImportResult(result);
      setCodexImportPreview(result.preview);
      await refetch(true);
      setMessage(result.message);
    } catch (error) {
      setMessage(`执行运行环境导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setExecutingCodexImport(false);
    }
  }

  if (loading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">正在加载工具与插件模块...</div>;
  }

  const moduleData = data;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">工具与插件</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            所有工具、技能和插件条目都由 Lmentor 统一读写，真实状态来自隔离运行环境配置。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border/60 bg-background/50 p-1">
            <Button size="sm" variant={view === "manage" ? "secondary" : "ghost"} onClick={() => setView("manage")}>
              <ShieldCheck className="h-4 w-4" />
              条目管理
            </Button>
            <Button size="sm" variant={view === "import" ? "secondary" : "ghost"} onClick={() => setView("import")}>
              <FileUp className="h-4 w-4" />
              导入 Skill
            </Button>
            <Button size="sm" variant={view === "codex-import" ? "secondary" : "ghost"} onClick={() => setView("codex-import")}>
              <FileUp className="h-4 w-4" />
              导入本机运行环境
            </Button>
          </div>
          {view === "manage" ? (
            <Button
              size="sm"
              onClick={() => {
                setSelectedKey(null);
                setDraft(emptyEntry("mcp"));
                setMessage("已切换到新建条目。");
              }}
            >
              <Plus className="h-4 w-4" />
              新建条目
            </Button>
          ) : null}
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-border/60 bg-card/80 px-4 py-3 text-sm text-foreground shadow-sm">
          {message}
        </div>
      ) : null}

      {view === "import" ? renderImportView() : view === "codex-import" ? renderCodexImportView() : renderManageView()}
    </div>
  );

  function renderImportView() {
    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">导入 Skill</CardTitle>
            <CardDescription>选择本地 skill 目录里的 SKILL.md，安装时会导入整个父目录。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                value={skillFilePath}
                onChange={(event) => {
                  setSkillFilePath(event.target.value);
                  setSkillValidation(null);
                  setSkillImportResult(null);
                }}
                placeholder="选择或粘贴 SKILL.md 路径"
                className="font-mono text-xs"
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void handleChooseSkillFile()} disabled={checkingSkill || installingSkill}>
                  <FileUp className="h-4 w-4" />
                  选择文件
                </Button>
                <Button variant="outline" onClick={() => void validateSkillFile(skillFilePath)} disabled={!skillFilePath.trim() || checkingSkill || installingSkill}>
                  {checkingSkill ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  检查
                </Button>
                <Button onClick={() => void handleInstallSkill()} disabled={!skillValidation?.valid || checkingSkill || installingSkill}>
                  {installingSkill ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  安装
                </Button>
              </div>
            </div>

            {skillValidation ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{skillValidation.skill?.title || "未识别 Skill"}</p>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{skillValidation.skill?.source_directory || skillFilePath}</p>
                    </div>
                    <Badge variant={skillValidation.valid ? "default" : "destructive"}>
                      {skillValidation.valid ? "可安装" : "需修复"}
                    </Badge>
                  </div>
                  {skillValidation.codex_instruction ? (
                    <p className="mt-3 rounded-lg border border-border/50 bg-card/70 px-3 py-2 font-mono text-xs text-muted-foreground">
                      {skillValidation.codex_instruction}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  {skillValidation.checks.map((check, index) => (
                    <div
                      key={`${check.label}-${index}`}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm",
                        check.status === "error"
                          ? "border-destructive/35 bg-destructive/5"
                          : "border-border/60 bg-background/35",
                      )}
                    >
                      <span className="mt-0.5 shrink-0">{checkIcon(check)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-foreground">{check.label}</span>
                        <span className="mt-0.5 block break-words text-xs text-muted-foreground">{check.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/30 px-4 py-8 text-center text-sm text-muted-foreground">
                选择一个 SKILL.md 后，会在这里显示完整性和可用性检查。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">安装结果</CardTitle>
            <CardDescription>成功后会出现在聊天输入框的技能选择器里。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {skillImportResult ? (
              <>
                <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-3">
                  <p className="font-semibold text-foreground">{skillImportResult.entry.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{skillImportResult.entry.description || skillImportResult.entry.name}</p>
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p><span className="font-medium text-foreground">名称：</span>{skillImportResult.entry.name}</p>
                  <p><span className="font-medium text-foreground">来源：</span>{skillImportResult.entry.source}</p>
                  <p className="break-words" title={skillImportResult.target_directory}>
                    <span className="font-medium text-foreground">安装目录：</span>{skillImportResult.target_directory_display || skillImportResult.target_directory}
                  </p>
                  <p><span className="font-medium text-foreground">安装时间：</span>{new Date(skillImportResult.installed_at).toLocaleString("zh-CN")}</p>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-border/60 bg-background/35 px-4 py-6 text-sm text-muted-foreground">
                暂无安装记录。
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderCodexImportView() {
    const source = codexImportSources?.sources.find((item) => item.id === "system-codex-home")
      ?? codexImportSources?.sources[0]
      ?? null;
    const targetHome = codexImportPreview?.target.home ?? codexImportSources?.active_home ?? "";
    const importBusy = loadingCodexImport || executingCodexImport;

    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">从本机运行环境导入</CardTitle>
            <CardDescription>
              将本机运行环境的聊天记录、Skills、MCP、插件和非敏感配置迁移到 Lmentor 的隔离环境。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">来源</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{source?.label ?? "本机智能体运行环境"}</p>
                  </div>
                  <Badge variant={source?.available ? "default" : "destructive"}>
                    {source?.available ? "可读取" : "未找到"}
                  </Badge>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  {source?.home ?? codexImportSources?.system_home ?? "尚未读取"}
                </p>
                {source ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>会话 {source.summary.sessions}</span>
                    <span>Skills {source.summary.skills}</span>
                    <span>MCP {source.summary.mcp_servers}</span>
                    <span>插件 {source.summary.plugins}</span>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">目标</p>
                <p className="mt-1 text-sm font-semibold text-foreground">Lmentor 隔离运行环境</p>
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  {targetHome || "尚未读取"}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  执行前会备份目标目录；认证缓存、token、API key 和 sandbox secrets 不会导入。
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/35 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">选择导入内容</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {defaultCodexImportKinds.map((kind) => (
                  <label
                    key={kind}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-fast",
                      codexImportKinds.includes(kind)
                        ? "border-primary bg-primary/5"
                        : "border-border/60 bg-background/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={codexImportKinds.includes(kind)}
                      onChange={() => toggleCodexImportKind(kind)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <span className="text-foreground">{codexImportKindLabels[kind]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void loadCodexImportSources()} disabled={importBusy}>
                {loadingCodexImport ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                读取来源
              </Button>
              <Button variant="outline" onClick={() => void previewCodexImport()} disabled={importBusy || codexImportKinds.length === 0}>
                {loadingCodexImport ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                生成预览
              </Button>
              <Button
                onClick={() => void executeCodexImport()}
                disabled={importBusy || !codexImportPreview?.ready_to_apply}
              >
                {executingCodexImport ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                执行导入
              </Button>
            </div>

            {codexImportPreview ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">导入预览</p>
                  <Badge variant={codexImportPreview.ready_to_apply ? "default" : "outline"}>
                    {codexImportPreview.ready_to_apply ? "可执行" : "不可执行"}
                  </Badge>
                </div>

                <div className="grid gap-2">
                  {codexImportPreview.items.map((item) => (
                    <div
                      key={item.kind}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-sm",
                        item.status === "ready"
                          ? "border-border/60 bg-background/40"
                          : "border-dashed border-border/70 bg-background/25",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">{item.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{item.strategy}</p>
                        </div>
                        <Badge variant={item.status === "ready" ? "default" : "outline"}>
                          {item.status === "ready" ? `${item.count} 项` : "无内容"}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-1 font-mono text-[11px] text-muted-foreground">
                        <p className="break-all">from: {item.source_path}</p>
                        <p className="break-all">to: {item.target_path}</p>
                      </div>
                      {item.warnings.length > 0 ? (
                        <div className="mt-3 space-y-1 text-xs text-[var(--icon-theme)]">
                          {item.warnings.map((warning, index) => (
                            <p key={`${item.kind}-warning-${index}`}>{warning}</p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                {codexImportPreview.notes.length > 0 ? (
                  <div className="rounded-2xl border border-border/60 bg-background/35 px-4 py-3 text-xs text-muted-foreground">
                    {codexImportPreview.notes.map((note, index) => (
                      <p key={`codex-import-note-${index}`}>{note}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-background/30 px-4 py-8 text-center text-sm text-muted-foreground">
                先读取来源并生成预览，这里会列出将要迁移的内容和冲突处理方式。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">导入结果</CardTitle>
            <CardDescription>执行成功后会显示备份位置和本次导入摘要。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {codexImportResult ? (
              <>
                <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-foreground">{codexImportResult.status === "completed" ? "导入完成" : codexImportResult.status}</p>
                    <Badge variant={codexImportResult.status === "completed" ? "default" : "outline"}>
                      {codexImportResult.executed ? "已执行" : "未执行"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{codexImportResult.message}</p>
                </div>

                {codexImportResult.backup ? (
                  <div className="rounded-2xl border border-border/60 bg-background/35 px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">备份目录</p>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{codexImportResult.backup.backup_root}</p>
                    {codexImportResult.backup.entries.length > 0 ? (
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        {codexImportResult.backup.entries.map((entry) => (
                          <p key={`${entry.label}-${entry.path}`} className="break-all">
                            {entry.label}: {entry.path}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {codexImportResult.summary ? (
                  <div className="space-y-2">
                    {Object.entries(codexImportResult.summary).map(([key, value]) => (
                      <div key={key} className="rounded-2xl border border-border/60 bg-background/35 px-4 py-3">
                        <p className="text-sm font-semibold text-foreground">{codexImportKindLabels[key as CodexRuntimeImportKind] ?? key}</p>
                        <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-lg bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">
                          {JSON.stringify(value, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-2xl border border-border/60 bg-background/35 px-4 py-6 text-sm text-muted-foreground">
                暂无导入记录。建议先生成预览，确认来源和目标目录后再执行。
              </div>
            )}

            <div className="rounded-2xl border border-border/60 bg-background/35 px-4 py-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">安全边界</p>
              <p className="mt-2">不会导入 auth.json、cap_sid、.sandbox-secrets，也会跳过 token、secret、password、credential 等敏感配置键。</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderCurrentSkillList() {
    return (
      <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
        <CardHeader className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">当前技能列表</CardTitle>
              <CardDescription>每 1 秒刷新一次，展示当前可被前端和隔离命令行识别的全部技能。</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{skillLibrary.length} 个</Badge>
              <Badge variant={skillLibraryError ? "destructive" : "default"}>
                {skillLibraryLoading ? "读取中" : skillLibraryError ? "刷新失败" : "实时刷新"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>列表会自动跟随隔离技能目录和隔离命令行主目录更新。</span>
            {skillLibraryUpdatedAt ? <span>最近刷新：{new Date(skillLibraryUpdatedAt).toLocaleTimeString("zh-CN")}</span> : null}
          </div>

          {skillLibraryError ? (
            <div className="rounded-xl border border-destructive/35 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {skillLibraryError}
            </div>
          ) : null}

          {skillLibrary.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border/60">
              <div className="grid grid-cols-[minmax(140px,1.1fr)_minmax(220px,1.8fr)_120px_minmax(220px,1.4fr)] gap-3 border-b border-border/50 bg-background/50 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                <span>名字</span>
                <span>作用</span>
                <span>来源</span>
                <span>位置</span>
              </div>
              {skillLibrary.map((skill) => (
                <div
                  key={skill.id}
                  className="grid grid-cols-[minmax(140px,1.1fr)_minmax(220px,1.8fr)_120px_minmax(220px,1.4fr)] gap-3 border-b border-border/35 bg-background/25 px-3 py-2 text-xs last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{skill.title || skill.name}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">{skill.name}</p>
                  </div>
                  <p className="line-clamp-2 text-muted-foreground">
                    {formatSkillPurposeText(skill)}
                  </p>
                  <div className="flex min-w-0 flex-wrap gap-1">
                    <Badge variant={skill.system ? "outline" : "default"}>{skill.system ? "系统" : "用户"}</Badge>
                    <Badge variant="outline">{skillSourceLabel(skill)}</Badge>
                  </div>
                  <p className="truncate font-mono text-[10px] text-muted-foreground" title={skill.directory || skill.path}>
                    {skill.directory_display || skill.path_display || skill.directory || skill.path}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-background/30 px-4 py-4 text-center text-sm text-muted-foreground">
              当前还没有识别到技能。可以把技能目录放到隔离技能目录，或通过“导入技能”安装。
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderManageView() {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            {(["mcp", "skill", "plugin"] as ContextEntryKind[]).map((kind) => {
              const group = kind === "mcp" ? moduleData.mcp_servers : kind === "skill" ? moduleData.skills : moduleData.plugins;
              return (
                <Card key={kind} className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">{groupMeta[kind].title}</CardTitle>
                    <CardDescription>{groupMeta[kind].description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {group.map((entry) => {
                      const key = `${entry.kind}:${entry.id}`;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setSelectedKey(key);
                            setDraft({
                              kind: entry.kind,
                              id: entry.id,
                              title: entry.title,
                              summary: entry.summary,
                              enabled: entry.enabled,
                              body: entry.body,
                            });
                            setMessage(null);
                          }}
                          className={cn(
                            "w-full rounded-2xl border px-4 py-3 text-left transition-fast",
                            selectedKey === key
                              ? "border-primary bg-primary/5"
                              : "border-border/60 bg-background/40 hover:bg-accent/30",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">{entry.title}</p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">{entry.id}</p>
                            </div>
                            <Badge variant={entry.enabled ? "default" : "outline"}>{entry.enabled ? "已启用" : "已停用"}</Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">{entry.summary}</p>
                          <div className="mt-3 flex">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleToggle(entry);
                              }}
                              disabled={saving}
                            >
                              <ToggleLeft className="h-4 w-4" />
                              {entry.enabled ? "停用" : "启用"}
                            </Button>
                          </div>
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{selectedKey ? "条目详情" : "新建条目"}</CardTitle>
            <CardDescription>配置正文请保持为合法 JSON，保存后会回写到 live config。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">类型</span>
                <select
                  value={draft.kind}
                  onChange={(e) => setDraft((prev) => ({ ...prev, kind: e.target.value as ContextEntryKind }))}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none"
                >
                  <option value="mcp">MCP 服务</option>
                  <option value="skill">技能</option>
                  <option value="plugin">插件</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">ID</span>
                <Input value={draft.id} onChange={(e) => setDraft((prev) => ({ ...prev, id: e.target.value }))} />
              </label>
              <label className="space-y-2 text-sm md:col-span-2">
                <span className="text-muted-foreground">标题</span>
                <Input value={draft.title} onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))} />
              </label>
            </div>

            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">摘要</span>
              <Input value={draft.summary} onChange={(e) => setDraft((prev) => ({ ...prev, summary: e.target.value }))} />
            </label>

            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">配置内容（JSON）</span>
              <textarea
                value={draft.body}
                onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))}
                className="min-h-56 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none"
              />
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/40 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-foreground">保存后同时设为启用状态</span>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleSave()} disabled={saving || !draft.id.trim() || !draft.title.trim()}>
                <Save className="h-4 w-4" />
                保存条目
              </Button>
              <Button variant="destructive" onClick={() => void handleDelete()} disabled={saving || !selectedKey}>
                <Trash2 className="h-4 w-4" />
                删除条目
              </Button>
            </div>
          </CardContent>
          </Card>
        </div>

        {renderCurrentSkillList()}
      </div>
    );
  }
}
