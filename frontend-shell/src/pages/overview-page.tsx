import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAgent } from "@/agents/AgentContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { invokeCommand, useInvoke } from "@/hooks/use-invoke";
import { lmentorCommands } from "@/lmentor/api";
import { listen } from "@/lmentor/platform/event";
import type { OverviewModuleSnapshot } from "@/types";

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string | null }) {
  return (
    <Card className="gap-0 rounded-2xl border-border/60 bg-card/80 py-4 shadow-sm">
      <CardHeader className="px-4 pb-2">
        <CardDescription className="text-[11px] uppercase tracking-[0.18em]">{label}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function OverviewPage() {
  const { refreshHealth } = useAgent();
  const { data, loading, error, refetch } = useInvoke<OverviewModuleSnapshot>(lmentorCommands.overview.module);
  const [restarting, setRestarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen("workspace-data-changed", async () => {
      if (cancelled) return;
      await refetch(true);
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    }).catch(console.error);

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [refetch]);

  async function handleRestartCli() {
    setRestarting(true);
    setActionError(null);
    try {
      await invokeCommand(lmentorCommands.agents.restartCodex);
      await Promise.all([
        refreshHealth(),
        refetch(true),
      ]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setRestarting(false);
    }
  }

  if (loading || restarting) {
    return <div className="p-6 text-sm text-muted-foreground">正在加载概况...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-destructive">概况模块加载失败：{error}</div>;
  }

  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">暂时没有可用的概况数据。</div>;
  }

  const runtime = data.codex_runtime;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">概况</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            这里展示 Lmentor 作为统一接口层的整体状态，前端保持当前壳层样式，CLI 能力通过 bridge 接入。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleRestartCli()}
            disabled={!data.codex_runtime?.installed}
          >
            <RefreshCw className="h-4 w-4" />
            重启隔离运行环境
          </Button>
          <Badge variant={data.shell_ready ? "default" : "destructive"}>
            {data.shell_ready ? "接口层已就绪" : "接口层待修复"}
          </Badge>
        </div>
      </div>

      {actionError ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          重启 CLI 失败：{actionError}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="当前供应商" value={data.current_provider || "未设置"} />
        <MetricCard label="供应商数量" value={data.provider_count} />
        <MetricCard label="会话数量" value={data.session_count} />
        <MetricCard label="工具与插件" value={data.tool_count} hint={`已启用 ${data.enhancement_enabled_count} 项增强`} />
      </div>

      {runtime ? (
        <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">隔离智能体运行环境</CardTitle>
            <CardDescription>Lmentor 当前使用的独立智能体运行环境。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm lg:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">运行模式</p>
              <p className="mt-1 text-foreground">
                {runtime.kind || "unknown"} · {runtime.version || "unknown"} · {runtime.platform || "unknown"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {runtime.isolated ? "已与本机默认环境隔离" : "当前仍指向本机默认环境"}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">状态</p>
              <p className="mt-1 text-foreground">{runtime.installed ? "CLI 已就绪" : "CLI 不可用"}</p>
              {runtime.error ? <p className="mt-1 text-xs text-destructive">{runtime.error}</p> : null}
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">项目 CLI</p>
              <p className="mt-1 text-foreground">{runtime.using_project_runtime ? "已使用项目根目录 CDXAgent" : "未使用项目根目录运行环境"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {runtime.project_binary_exists ? "项目 codex.exe 已确认存在" : "项目 codex.exe 未确认"}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Skill 同步</p>
              <p className="mt-1 text-foreground">{runtime.skill_sync?.active_skill_count ?? 0} 个可用技能</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {runtime.skill_sync?.synced_at ? `最近同步：${new Date(runtime.skill_sync.synced_at).toLocaleString("zh-CN")}` : "等待首次同步"}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-3 lg:col-span-2">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">codex.exe</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground" title={runtime.binary_path}>
                {runtime.binary_path_display || runtime.binary_path}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-3 lg:col-span-2">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">CODEX_HOME</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground" title={runtime.home_dir}>
                {runtime.home_dir_display || runtime.home_dir}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-3 lg:col-span-2">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">项目运行环境根目录</p>
              <p className="mt-1 break-all font-mono text-xs text-foreground" title={runtime.project_runtime_root || runtime.runtime_dir || ""}>
                {runtime.project_runtime_root_display || runtime.runtime_dir_display || runtime.project_runtime_root || runtime.runtime_dir}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {runtime ? (
        <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">运行日志</CardTitle>
            <CardDescription>确认隔离环境、项目根目录运行环境与实时 Skill 同步状态。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-2 lg:grid-cols-2">
              {(runtime.diagnostic_log ?? []).map((line, index) => (
                <div key={`runtime-log-${index}`} className="rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs text-foreground">
                  {line}
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/35 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Skill 根目录</p>
              <div className="mt-3 grid gap-2">
                {(runtime.skill_sync?.roots ?? []).map((root) => (
                  <div key={root.path} className="grid gap-2 rounded-xl border border-border/50 bg-card/60 px-3 py-2 text-xs md:grid-cols-[180px_90px_minmax(0,1fr)]">
                    <span className="font-medium text-foreground">{root.label}</span>
                    <span
                      className={root.exists ? "text-[var(--icon-success)]" : "text-muted-foreground"}
                      title={root.exists ? `扫描 ${root.raw_skill_count ?? root.skill_count + root.system_skill_count} 个，去重 ${root.duplicate_skill_count ?? 0} 个` : undefined}
                    >
                      {root.exists ? `${root.unique_skill_count ?? root.skill_count + root.system_skill_count} 个 skill` : "未发现"}
                    </span>
                    <span className="break-all font-mono text-muted-foreground" title={root.path}>{root.path_display || root.path}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">层级关系</CardTitle>
            <CardDescription>统一前端壳层、运行时 bridge 与服务能力边界。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">前端层</p>
              <p className="mt-1 text-foreground">{data.ui_provider}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">运行时层</p>
              <p className="mt-1 text-foreground">{data.runtime_provider}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">控制层</p>
              <p className="mt-1 text-foreground">{data.control_plane}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">接口边界</p>
              <p className="mt-1 text-foreground">{data.interface_boundary}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">同步状态</CardTitle>
            <CardDescription>观察供应商、会话、工具与增强能力当前是否已经打通。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">最近同步</p>
              <p className="mt-1 text-foreground">{data.sync_message || "当前没有新的同步提示。"}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">增强已启用</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{data.enhancement_enabled_count}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">接口状态</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{data.shell_ready ? "稳定" : "待修复"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
