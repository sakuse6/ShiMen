import { useEffect, useMemo, useState } from "react";
import { Download, FolderOpen, RefreshCw, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { invokeCommand, useInvoke } from "@/hooks/use-invoke";
import { lmentorCommands } from "@/lmentor/api";
import { emit, listen } from "@/lmentor/platform/event";
import { resolveSessionTitle } from "@/lib/session-title";
import { DeleteSessionDialog } from "@/components/sessions/delete-session-dialog";
import type { Project, SessionManagerSnapshot, SessionMarkdownExport } from "@/types";

interface SessionsPageProps {
  onEnterProject: (project: Project) => void;
}

function formatTime(value: string | null) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function SessionsPage({ onEnterProject }: SessionsPageProps) {
  const { data: projects } = useInvoke<Project[]>(lmentorCommands.projects.list);
  const { data, loading, refetch } = useInvoke<SessionManagerSnapshot>(lmentorCommands.sessions.manager);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [exportData, setExportData] = useState<SessionMarkdownExport | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const [deleteTargetLabel, setDeleteTargetLabel] = useState("");

  const sessions = useMemo(() => {
    const items = data?.sessions ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((session) => (
      resolveSessionTitle([session.title], "\u65b0\u5bf9\u8bdd").toLowerCase().includes(needle)
      || session.project_name.toLowerCase().includes(needle)
      || session.provider_label.toLowerCase().includes(needle)
      || session.id.toLowerCase().includes(needle)
    ));
  }, [data?.sessions, query]);

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen("workspace-data-changed", async () => {
      if (cancelled) return;
      void refetch(true).catch(console.error);
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    }).catch(console.error);

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [refetch]);

  function openDeleteDialog(ids: string[], label: string) {
    setDeleteTargetIds(ids);
    setDeleteTargetLabel(label);
    setDeleteDialogOpen(true);
  }

  async function handleDelete(ids: string[]) {
    if (!ids.length) {
      setMessage("请先选择要删除的会话。");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      for (const sessionId of ids) {
        await invokeCommand(lmentorCommands.sessions.deleteRecord, { sessionId });
      }
      await refetch(true);
      void emit("workspace-data-changed", { reason: "session-deleted", sessionIds: ids });
      setSelectedIds([]);
      setMessage(`已删除 ${ids.length} 个会话。`);
    } catch (error) {
      setMessage(`删除失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    await handleDelete(deleteTargetIds);
    setDeleteDialogOpen(false);
    setDeleteTargetIds([]);
    setDeleteTargetLabel("");
  }

  async function handleExport(sessionId: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await invokeCommand<SessionMarkdownExport>(lmentorCommands.sessions.exportMarkdown, { sessionId });
      setExportData(result);
      setMessage(`已生成导出预览：${result.filename}`);
    } catch (error) {
      setMessage(`导出失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function copyMarkdown() {
    if (!exportData) return;
    try {
      await navigator.clipboard.writeText(exportData.markdown);
      setMessage("Markdown 已复制到剪贴板。");
    } catch (error) {
      setMessage(`复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (loading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">正在加载会话管理模块...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">会话管理</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            列表来自真实线程数据库、会话索引与 rollout 文件；删除、导出与项目跳转都通过 Lmentor 统一接口执行。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">当前供应商：{data.current_provider || "未设置"}</Badge>
          <Badge variant="outline">共 {data.total} 个会话</Badge>
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-border/60 bg-card/80 px-4 py-3 text-sm text-foreground shadow-sm">
          {message}
        </div>
      ) : null}

      <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">筛选与批量操作</CardTitle>
          <CardDescription>会话删除会同步清理真实索引与本地数据库，并保留备份。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索会话标题、项目、供应商或会话 ID"
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setSelectedIds(sessions.map((item) => item.id))} disabled={busy || sessions.length === 0}>
                全选当前列表
              </Button>
              <Button variant="outline" onClick={() => setSelectedIds([])} disabled={busy || selectedIds.length === 0}>
                清空选择
              </Button>
              <Button variant="outline" onClick={() => void refetch()} disabled={busy}>
                <RefreshCw className="h-4 w-4" />
                刷新
              </Button>
              <Button variant="destructive" onClick={() => openDeleteDialog(selectedIds, `已选中 ${selectedIds.length} 个会话`)} disabled={busy || selectedIds.length === 0}>
                <Trash2 className="h-4 w-4" />
                删除所选
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">已选择 {selectedIds.length} / {sessions.length} 个会话</p>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {sessions.map((session) => {
          const project = (projects ?? []).find((item) => item.encoded_name === session.project_encoded_name);
          const checked = selectedIds.includes(session.id);
          const displayTitle = resolveSessionTitle([session.title], "\u65b0\u5bf9\u8bdd");
          return (
            <Card key={session.id} className={`rounded-2xl border-border/60 bg-card/80 py-4 shadow-sm ${checked ? "border-primary/60" : ""}`}>
              <CardContent className="space-y-3 px-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedIds((prev) => (
                          prev.includes(session.id) ? prev.filter((item) => item !== session.id) : [...prev, session.id]
                        ));
                      }}
                      className="mt-1 h-4 w-4 rounded border-border"
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{displayTitle}</p>
                        <Badge variant="outline">{session.provider_label}</Badge>
                        {session.archived ? <Badge variant="secondary">已归档</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{session.project_name}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {project ? (
                      <Button size="sm" variant="outline" onClick={() => onEnterProject(project)}>
                        <FolderOpen className="h-4 w-4" />
                        打开项目
                      </Button>
                    ) : null}
                    {session.can_export ? (
                      <Button size="sm" variant="outline" onClick={() => void handleExport(session.id)} disabled={busy}>
                        <Download className="h-4 w-4" />
                        导出
                      </Button>
                    ) : null}
                    {session.can_delete ? (
                      <Button size="sm" variant="outline" onClick={() => openDeleteDialog([session.id], displayTitle)} disabled={busy}>
                        <Trash2 className="h-4 w-4" />
                        删除
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                  <div>会话 ID：{session.id}</div>
                  <div>消息数：{session.message_count}</div>
                  <div>开始时间：{formatTime(session.started_at)}</div>
                  <div>最后活跃：{formatTime(session.last_active)}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card/80 px-4 py-6 text-sm text-muted-foreground shadow-sm">
            当前筛选条件下没有会话。
          </div>
        ) : null}
      </div>

      <DeleteSessionDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="删除会话"
        sessionLabel={deleteTargetLabel || "未命名会话"}
        confirmationText={deleteTargetIds.length === 1 ? deleteTargetIds[0] : "DELETE"}
        busy={busy}
        onConfirm={confirmDelete}
      />

      <Dialog open={Boolean(exportData)} onOpenChange={(open) => { if (!open) setExportData(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{exportData?.title || "会话导出"}</DialogTitle>
            <DialogDescription>{exportData?.filename || "Markdown 预览"}</DialogDescription>
          </DialogHeader>
          <textarea
            readOnly
            value={exportData?.markdown || ""}
            className="min-h-[420px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => void copyMarkdown()} disabled={!exportData}>
              复制 Markdown
            </Button>
            <Button onClick={() => setExportData(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
