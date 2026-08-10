import { useEffect, useMemo, useState } from "react";
import { Bot, Check, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { invokeCommand, useInvoke } from "@/hooks/use-invoke";
import { lmentorCommands } from "@/lmentor/api";
import { emit } from "@/lmentor/platform/event";
import { cn } from "@/lib/utils";
import type { AgentMemoryEntry, RosterAgentProfile, RosterModuleSnapshot, SkillLibraryEntry } from "@/types";

type RosterSkillEntry = Pick<SkillLibraryEntry, "id" | "name" | "title" | "description">;

function cloneRosterProfile(profile: RosterAgentProfile | null | undefined): RosterAgentProfile | null {
  if (!profile) return null;
  return {
    ...profile,
    enabled_skill_ids: [...profile.enabled_skill_ids],
  };
}

function skillLabel(skill: RosterSkillEntry) {
  return skill.title?.trim() || skill.name;
}

function displayAgentName(name: string | null | undefined, fallback = "未命名智能体") {
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

function buildNewMemoryDraft(agentId: string | null) {
  return {
    id: "",
    title: "",
    content: "",
    shared: true,
    visible_to: agentId ? [agentId] : [],
    hidden_for: [] as string[],
    enabled: true,
  };
}

function cloneMemoryDraft(entry: AgentMemoryEntry | null | undefined, fallbackAgentId: string | null) {
  if (!entry) {
    return buildNewMemoryDraft(fallbackAgentId);
  }
  return {
    id: entry.id,
    title: entry.title,
    content: entry.content,
    shared: entry.shared,
    visible_to: [...entry.visible_to],
    hidden_for: [...entry.hidden_for],
    enabled: entry.enabled,
  };
}

function describeMemoryScope(entry: AgentMemoryEntry, agents: RosterAgentProfile[]) {
  if (entry.shared) {
    return "全体共享";
  }
  const owners = agents
    .filter((agent) => entry.visible_to.includes(agent.id))
    .map((agent) => displayAgentName(agent.name));
  return owners.length > 0 ? `仅 ${owners.join("、")} 可见` : "未指定可见对象";
}

const workflowFoundationLines = [
  "各智能体仅在既定角色边界内开展工作，不得混同角色定位，也不得代替其他智能体发言。",
  "当任务与其他智能体的职责范围更为匹配时，应先提出切换建议，并提供结构化交接摘要。",
  "交接摘要至少应包括：任务目标、已知事实、既有判断、未决问题与建议的下一步行动。",
  "若当前智能体已具备独立完成任务的条件，应直接完成工作，不因多智能体并行而转移责任。",
];

export function RosterPage() {
  const { data, loading, error, refetch } = useInvoke<RosterModuleSnapshot>(lmentorCommands.agents.rosterModule);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RosterAgentProfile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [skillLibrary, setSkillLibrary] = useState<SkillLibraryEntry[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [lineageDraft, setLineageDraft] = useState("");
  const [userNameDraft, setUserNameDraft] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [skillListDialogOpen, setSkillListDialogOpen] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState(() => buildNewMemoryDraft(null));

  useEffect(() => {
    if (!data) return;
    const nextId = selectedId && data.agents.some((agent) => agent.id === selectedId)
      ? selectedId
      : data.active_agent_id || data.agents[0]?.id || null;
    setSelectedId(nextId);
    setDraft(cloneRosterProfile(data.agents.find((agent) => agent.id === nextId) ?? null));
    setMemoryDraft((prev) => (prev.id ? prev : buildNewMemoryDraft(nextId)));
    setLineageDraft(data.lineage_name || "");
    setUserNameDraft(data.user_name || "");
  }, [data, selectedId]);

  useEffect(() => {
    let cancelled = false;

    const loadSkills = async () => {
      setSkillsLoading(true);
      try {
        const result = await invokeCommand<SkillLibraryEntry[]>(lmentorCommands.tools.skillLibrary);
        if (!cancelled) {
          setSkillLibrary(result || []);
        }
      } catch {
        if (!cancelled) {
          setSkillLibrary([]);
        }
      } finally {
        if (!cancelled) {
          setSkillsLoading(false);
        }
      }
    };

    void loadSkills();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedAgent = useMemo(
    () => data?.agents.find((agent) => agent.id === selectedId) ?? null,
    [data, selectedId],
  );

  const enabledSkillCount = draft?.enabled_skill_ids.length ?? 0;
  const enabledSkills = useMemo<RosterSkillEntry[]>(() => {
    const libraryByName = new Map(skillLibrary.map((skill) => [skill.name, skill]));
    return (draft?.enabled_skill_ids ?? []).map((skillId) => (
      libraryByName.get(skillId) ?? {
        id: `enabled:${skillId}`,
        name: skillId,
        title: skillId,
        description: "已启用；暂未读取到该能力的说明。",
      }
    ));
  }, [draft?.enabled_skill_ids, skillLibrary]);
  const visibleEnabledSkills = enabledSkills.slice(0, 8);
  const hasMoreEnabledSkills = enabledSkills.length > visibleEnabledSkills.length;
  const memoryCount = data?.memories.length ?? 0;

  async function handleSaveMemory() {
    const targetAgentId = selectedId || draft?.id || null;
    const nextTitle = memoryDraft.title.trim();
    const nextContent = memoryDraft.content.trim();
    if (!targetAgentId) return;
    if (!nextTitle || !nextContent) {
      setMessage("请完整填写记忆标题与记忆内容。");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const entry = {
        id: memoryDraft.id || `memory-${Date.now()}`,
        title: nextTitle,
        content: nextContent,
        shared: memoryDraft.shared,
        visible_to: memoryDraft.shared ? [] : [targetAgentId],
        hidden_for: memoryDraft.shared ? memoryDraft.hidden_for.filter((id) => id !== targetAgentId) : [],
        enabled: memoryDraft.enabled,
      };
      const snapshot = await invokeCommand<RosterModuleSnapshot>(lmentorCommands.agents.saveMemoryEntry, { entry });
      void emit("workspace-data-changed", { reason: "roster-memory-updated", agentId: targetAgentId });
      await refetch(true);
      setMemoryDraft(buildNewMemoryDraft(targetAgentId));
      setMessage(`记忆条目“${nextTitle}”已保存。`);
      return snapshot;
    } catch (saveError) {
      setMessage(`记忆收录失败：${saveError instanceof Error ? saveError.message : String(saveError)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMemory(id: string) {
    setSaving(true);
    setMessage(null);
    try {
      await invokeCommand<RosterModuleSnapshot>(lmentorCommands.agents.deleteMemoryEntry, { id });
      void emit("workspace-data-changed", { reason: "roster-memory-updated", agentId: selectedId || draft?.id || null });
      await refetch(true);
      if (memoryDraft.id === id) {
        setMemoryDraft(buildNewMemoryDraft(selectedId || draft?.id || null));
      }
      setMessage("记忆条目已删除。");
    } catch (deleteError) {
      setMessage(`删除失败：${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleMemoryShared(id: string) {
    setSaving(true);
    setMessage(null);
    try {
      await invokeCommand<RosterModuleSnapshot>(lmentorCommands.agents.toggleMemoryShared, {
        id,
        agent_id: selectedId || draft?.id || null,
      });
      void emit("workspace-data-changed", { reason: "roster-memory-updated", agentId: selectedId || draft?.id || null });
      await refetch(true);
      if (memoryDraft.id === id) {
        setMemoryDraft((prev) => ({ ...prev, shared: !prev.shared }));
      }
    } catch (toggleError) {
      setMessage(`共享状态更新失败：${toggleError instanceof Error ? toggleError.message : String(toggleError)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleMemoryEnabled(id: string) {
    setSaving(true);
    setMessage(null);
    try {
      await invokeCommand<RosterModuleSnapshot>(lmentorCommands.agents.toggleMemoryEnabled, { id });
      void emit("workspace-data-changed", { reason: "roster-memory-updated", agentId: selectedId || draft?.id || null });
      await refetch(true);
    } catch (toggleError) {
      setMessage(`启用状态更新失败：${toggleError instanceof Error ? toggleError.message : String(toggleError)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleMemoryHidden(id: string, agentId: string) {
    setSaving(true);
    setMessage(null);
    try {
      await invokeCommand<RosterModuleSnapshot>(lmentorCommands.agents.toggleMemoryVisibility, {
        id,
        agent_id: agentId,
        mode: "hidden_for",
      });
      void emit("workspace-data-changed", { reason: "roster-memory-updated", agentId });
      await refetch(true);
      if (memoryDraft.id === id) {
        setMemoryDraft((prev) => ({
          ...prev,
          hidden_for: prev.hidden_for.includes(agentId)
            ? prev.hidden_for.filter((item) => item !== agentId)
            : [...prev.hidden_for, agentId],
        }));
      }
    } catch (toggleError) {
      setMessage(`可见性标记更新失败：${toggleError instanceof Error ? toggleError.message : String(toggleError)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveIdentity() {
    const nextLineageName = lineageDraft.trim() || "师门";
    const nextUserName = userNameDraft.trim() || "用户";
    if (!nextLineageName || !nextUserName) {
      setMessage("请先填写用户名与师门名称。");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const snapshot = await invokeCommand<RosterModuleSnapshot>(lmentorCommands.agents.saveRosterIdentity, {
        lineage_name: nextLineageName,
        user_name: nextUserName,
      });
      void emit("workspace-data-changed", { reason: "roster-identity-updated" });
      await refetch(true);
      setLineageDraft(snapshot.lineage_name || nextLineageName);
      setUserNameDraft(snapshot.user_name || nextUserName);
      setMessage(`用户“${nextUserName}”与师门“${nextLineageName}”的信息已更新。`);
    } catch (saveError) {
      setMessage(`落册失败：${saveError instanceof Error ? saveError.message : String(saveError)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSetActive(id: string) {
    setSaving(true);
    setMessage(null);
    try {
      await invokeCommand(lmentorCommands.agents.setRosterActive, { id });
      void emit("workspace-data-changed", { reason: "roster-updated", agentId: id });
      await refetch(true);
      setSelectedId(id);
      setMessage("当前启用的智能体已更新。");
    } catch (activateError) {
      setMessage(`切换失败：${activateError instanceof Error ? activateError.message : String(activateError)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAgent() {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const snapshot = await invokeCommand<RosterModuleSnapshot>(lmentorCommands.agents.deleteRosterAgent, { id: draft.id });
      const nextSelectedId = snapshot.active_agent_id || snapshot.agents[0]?.id || null;
      void emit("workspace-data-changed", { reason: "roster-updated", agentId: nextSelectedId });
      await refetch(true);
      setSelectedId(nextSelectedId);
      setDraft(cloneRosterProfile(snapshot.agents.find((agent) => agent.id === nextSelectedId) ?? null));
      setDeleteDialogOpen(false);
      setMessage(`智能体“${displayAgentName(selectedAgent?.name)}”已删除。`);
    } catch (deleteError) {
      setMessage(`除名失败：${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">名册信息加载中...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-destructive">名册模块加载失败：{error}</div>;
  }

  if (!data || !draft) {
    return <div className="p-6 text-sm text-muted-foreground">当前尚无可用的名册记录。</div>;
  }

  return (
    <>
      <div className="grid h-full grid-cols-[300px_minmax(0,1fr)] gap-6 p-6">
        <Card className="overflow-hidden border-border/60">
          <CardHeader className="border-b border-border/50 pb-4">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-xl">名册</CardTitle>
                  <CardDescription>在此维护师门名称、用户名以及可切换的智能体配置。</CardDescription>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
                <div className="grid gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">用户名</label>
                    <Input
                      value={userNameDraft}
                      onChange={(event) => setUserNameDraft(event.target.value)}
                      placeholder="例如：云舟"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">师门名称</label>
                    <Input
                      value={lineageDraft}
                      onChange={(event) => setLineageDraft(event.target.value)}
                      placeholder="例如：师门"
                    />
                  </div>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>当前用户：{displayUserName(data.user_name)}</p>
                  <p>当前师门：{displayLineageName(data.lineage_name)}</p>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => void handleSaveIdentity()} disabled={saving}>
                    保存信息
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 p-4">
            {data.agents.map((agent) => {
              const active = data.active_agent_id === agent.id;
              const selected = selectedId === agent.id;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(agent.id);
                    setDraft(cloneRosterProfile(agent));
                  }}
                  className={cn(
                    "w-full rounded-2xl border px-4 py-3 text-left transition-fast",
                    selected
                      ? "border-primary/50 bg-accent/50"
                      : "border-border/50 bg-background hover:border-border hover:bg-accent/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate font-medium text-foreground">{displayAgentName(agent.name)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {agent.role_title || "尚未设定角色定位"}
                      </p>
                    </div>
                    {active ? <Badge>当前启用</Badge> : null}
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/60">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-xl">{displayAgentName(draft.name)}</CardTitle>
                  {selectedAgent?.builtin ? <Badge variant="outline">内置智能体</Badge> : null}
                  {data.active_agent_id === draft.id ? <Badge variant="secondary">当前启用</Badge> : null}
                </div>
                <CardDescription>在此配置该智能体的角色定位、职责范围、表达风格、行为约束与优先使用的能力集合。</CardDescription>
              </div>

              <div className="flex items-center gap-2">
                {!selectedAgent?.builtin ? (
                  <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(true)} disabled={saving}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    删除
                  </Button>
                ) : null}
                {data.active_agent_id === draft.id ? (
                  <Badge variant="secondary" className="gap-1">
                    <Check className="h-3.5 w-3.5" />
                    当前启用
                  </Badge>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => void handleSetActive(draft.id)} disabled={saving}>
                    设为当前智能体
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">智能体名称</label>
                  <Input
                    value={draft.name}
                    onChange={(event) => setDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                    placeholder="留空时显示为未命名智能体"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">角色定位</label>
                  <Input
                    value={draft.role_title}
                    onChange={(event) => setDraft((prev) => (prev ? { ...prev, role_title: event.target.value } : prev))}
                    placeholder="例如：学术导师、文献分析顾问"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">职责说明</label>
                <textarea
                  value={draft.summary}
                  onChange={(event) => setDraft((prev) => (prev ? { ...prev, summary: event.target.value } : prev))}
                  className="min-h-24 w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-fast focus:border-primary/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">表达风格</label>
                <textarea
                  value={draft.tone}
                  onChange={(event) => setDraft((prev) => (prev ? { ...prev, tone: event.target.value } : prev))}
                  className="min-h-24 w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-fast focus:border-primary/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">行为约束</label>
                <textarea
                  value={draft.custom_instructions}
                  onChange={(event) => setDraft((prev) => (prev ? { ...prev, custom_instructions: event.target.value } : prev))}
                  className="min-h-44 w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-fast focus:border-primary/50"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-4 w-4 text-primary" />
                可使神通
              </CardTitle>
              <CardDescription>这些 skill 会被写入当前智能体的优先调用范围，并随会话提示一并注入隔离运行环境。</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>已激活能力 {enabledSkillCount} 项</span>
                <span>·</span>
                <span>{skillsLoading ? "正在加载能力列表" : `当前可用 ${skillLibrary.length} 项 skill`}</span>
              </div>

              {skillsLoading ? (
                <p className="text-sm text-muted-foreground">正在读取能力列表...</p>
              ) : enabledSkills.length === 0 ? (
                <p className="text-sm text-muted-foreground">当前智能体尚未激活任何能力。</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visibleEnabledSkills.map((skill) => (
                    <div
                      key={skill.id}
                      className="rounded-2xl border border-primary/50 bg-primary/10 px-3 py-3"
                      title={skill.description}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{skillLabel(skill)}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {skill.description || "暂无能力说明"}
                          </p>
                        </div>
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      </div>
                    </div>
                  ))}
                  {hasMoreEnabledSkills ? (
                    <button
                      type="button"
                      onClick={() => setSkillListDialogOpen(true)}
                      className="rounded-2xl border border-dashed border-primary/50 bg-primary/5 px-3 py-3 text-sm font-medium text-primary transition-fast hover:bg-primary/10"
                    >
                      （展开）
                    </button>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">共享记忆</CardTitle>
              <CardDescription>记忆条目可设置为全体共享，也可仅对当前智能体可见；如需设置“某智能体不知”，可在条目下方切换可见性。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">记忆标题</label>
                    <Input
                      value={memoryDraft.title}
                      onChange={(event) => setMemoryDraft((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="例如：长期研究方向"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">共享设置</label>
                    <div className="flex h-10 items-center justify-between rounded-xl border border-border/60 bg-background px-3">
                      <span className="text-sm text-muted-foreground">{memoryDraft.shared ? "全体共享" : `仅 ${displayAgentName(draft.name)} 可见`}</span>
                      <Switch
                        checked={memoryDraft.shared}
                        onCheckedChange={(checked) => setMemoryDraft((prev) => ({ ...prev, shared: Boolean(checked) }))}
                        size="sm"
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <label className="text-sm font-medium text-foreground">记忆内容</label>
                  <textarea
                    value={memoryDraft.content}
                    onChange={(event) => setMemoryDraft((prev) => ({ ...prev, content: event.target.value }))}
                    placeholder="写下应长期记住的背景、偏好、约束或约定。"
                    className="min-h-28 w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none transition-fast focus:border-primary/50"
                  />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>当前共有 {memoryCount} 条记忆</span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setMemoryDraft(buildNewMemoryDraft(selectedId || draft.id))}
                      disabled={saving}
                    >
                      清空草稿
                    </Button>
                    <Button type="button" size="sm" onClick={() => void handleSaveMemory()} disabled={saving}>
                      {memoryDraft.id ? "更新记忆" : "收入记忆"}
                    </Button>
                  </div>
                </div>
              </div>

              {data.memories.length === 0 ? (
                <p className="text-sm text-muted-foreground">当前尚无记忆条目。</p>
              ) : (
                <div className="space-y-3">
                  {data.memories.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-border/60 bg-background px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-foreground">{entry.title || "未命名记忆"}</p>
                            <Badge variant="outline">{describeMemoryScope(entry, data.agents)}</Badge>
                            {entry.enabled ? <Badge variant="secondary">已启用</Badge> : <Badge variant="outline">已停用</Badge>}
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{entry.content}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setMemoryDraft(cloneMemoryDraft(entry, selectedId || draft.id))}
                            disabled={saving}
                          >
                            编辑
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleToggleMemoryShared(entry.id)}
                            disabled={saving}
                          >
                            {entry.shared ? "设为私有" : "设为共享"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleToggleMemoryEnabled(entry.id)}
                            disabled={saving}
                          >
                            {entry.enabled ? "停用" : "启用"}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => void handleDeleteMemory(entry.id)}
                            disabled={saving}
                          >
                            删除
                          </Button>
                        </div>
                      </div>

                      {entry.shared ? (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs text-muted-foreground">“某智能体不知”标记</p>
                          <div className="flex flex-wrap gap-2">
                            {data.agents.map((agent) => {
                              const hidden = entry.hidden_for.includes(agent.id);
                              return (
                                <Button
                                  key={`${entry.id}-${agent.id}`}
                                  type="button"
                                  size="sm"
                                  variant={hidden ? "secondary" : "outline"}
                                  onClick={() => void handleToggleMemoryHidden(entry.id, agent.id)}
                                  disabled={saving}
                                >
                                  {displayAgentName(agent.name)}{hidden ? "不知" : "可知"}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">协作规范</CardTitle>
              <CardDescription>这些规范会作为名册层的基础规则写入运行时提示，以确保多智能体并行时的角色边界和协作秩序。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {workflowFoundationLines.map((line) => (
                <p key={line}>· {line}</p>
              ))}
            </CardContent>
          </Card>

          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </div>
      </div>

      <Dialog open={skillListDialogOpen} onOpenChange={setSkillListDialogOpen}>
        <DialogContent className="max-h-[78vh] max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{displayAgentName(draft.name)}已激活的能力</DialogTitle>
            <DialogDescription>共 {enabledSkills.length} 项，仅展示该智能体当前已激活的 Skill。</DialogDescription>
          </DialogHeader>
          <div className="max-h-[56vh] space-y-2 overflow-y-auto pr-1">
            {enabledSkills.map((skill) => (
              <div key={skill.id} className="rounded-xl border border-border/60 bg-background px-3 py-3">
                <p className="text-sm font-semibold text-foreground">{skillLabel(skill)}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{skill.description || "暂无能力说明"}</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setSkillListDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              删除后，该智能体的角色定位、能力选择与行为约束将一并移除，且无法自动恢复。
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            <p>确认删除该智能体吗？</p>
            <p className="mt-1 break-all">智能体：{displayAgentName(selectedAgent?.name)}</p>
            <p className="mt-1 break-all">师门：{displayLineageName(data.lineage_name)}</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteAgent()} disabled={saving}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
