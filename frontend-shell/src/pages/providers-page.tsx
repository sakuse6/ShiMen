import { useEffect, useMemo, useState } from "react";
import { Cable, Copy, RefreshCw, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { invokeCommand, useInvoke } from "@/hooks/use-invoke";
import { lmentorCommands } from "@/lmentor/api";
import { emit, listen } from "@/lmentor/platform/event";
import { cn } from "@/lib/utils";
import type {
  ProviderModelsFetchResult,
  ProviderModuleSnapshot,
  ProviderProfile,
  ProviderProfileInput,
  ProviderSyncTarget,
} from "@/types";

interface ProvidersPageProps {
  guideApiDialogOpen?: boolean;
}

const protocolOptions: ProviderProfileInput["protocol"][] = ["responses", "chat_completions", "custom"];
const modeOptions: ProviderProfileInput["mode"][] = ["official", "mixed_api", "pure_api", "aggregate"];
const reasoningOptions: Array<{ value: ProviderProfileInput["reasoning_effort"]; label: string }> = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "超高" },
];

const API_ACQUISITION_LINKS = {
  official: [
    { label: "LinkBus / 推荐国际模型入口", href: "https://www.linkbus.net/register?aff=2Gn4" },
    { label: "灵石 / GPT 与 OpenAI", href: "https://api.lingshi.chat/register?aff=GSNj" },
    { label: "Infinity / GPT 与 OpenAI", href: "http://192.69.93.161:8080/register?aff=T2MN7K8VMFHR" },
    { label: "JuAPI / 国际模型入口", href: "https://cdn.juaiapi.com/register?invite_code=qLUM" },
  ],
  domestic: [
    { label: "七牛云", href: "https://s.qiniu.com/jEBVVz" },
    { label: "AIOnly", href: "https://maas.aiionly.com/login/6951720986" },
    { label: "硅基流动", href: "https://cloud.siliconflow.cn/i/iaY91bIJ" },
  ],
};

function emptyProfile(): ProviderProfileInput {
  return {
    name: "",
    provider_id: "",
    base_url: "",
    model: "",
    models: [],
    reasoning_effort: "high",
    protocol: "responses",
    mode: "mixed_api",
    api_key: "",
    config_contents: "",
    auth_contents: "",
    notes: "",
    source: "Lmentor",
  };
}

function toInput(profile?: ProviderProfile | null): ProviderProfileInput {
  if (!profile) return emptyProfile();
  return {
    id: profile.id,
    name: profile.name,
    provider_id: profile.provider_id,
    base_url: profile.base_url,
    model: profile.model,
    models: [...profile.models],
    reasoning_effort: profile.reasoning_effort,
    protocol: profile.protocol,
    mode: profile.mode,
    api_key: "",
    config_contents: profile.config_contents,
    auth_contents: profile.auth_contents,
    notes: profile.notes,
    source: profile.source,
  };
}

function syncTargetLabel(target: ProviderSyncTarget) {
  if (target.is_current_provider) return "当前";
  if (target.is_saved) return "已保存";
  if (target.is_manual) return "历史来源";
  return "待处理";
}

function normalizeDraft(input: ProviderProfileInput): ProviderProfileInput {
  const models = sanitizeModelIds(input.models);
  const model = input.model.trim() || models[0] || "";
  return {
    ...input,
    name: input.name.trim(),
    provider_id: input.provider_id.trim(),
    base_url: input.base_url.trim(),
    model,
    models,
    source: input.source.trim() || "Lmentor",
    notes: input.notes.trim(),
  };
}

function sanitizeModelIds(models: string[]) {
  return Array.from(
    new Set(
      models
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => /^[A-Za-z0-9._:/-]+$/.test(item)),
    ),
  );
}

function filterModelIds(models: string[], keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return models;
  return models.filter((item) => item.toLowerCase().includes(normalizedKeyword));
}

function toggleArrayValue(items: string[], value: string) {
  return items.includes(value)
    ? items.filter((item) => item !== value)
    : [...items, value];
}

function normalizeProviderLookupKey(value: string) {
  return String(value || "").trim().toLowerCase();
}

function findProfileByProviderKey(profiles: ProviderProfile[], providerKey: string) {
  const normalized = normalizeProviderLookupKey(providerKey);
  if (!normalized) return null;
  return profiles.find((item) =>
    normalizeProviderLookupKey(item.provider_id) === normalized
    || normalizeProviderLookupKey(item.name) === normalized
    || normalizeProviderLookupKey(item.id) === normalized
  ) ?? null;
}

function isAggregateProfile(input: ProviderProfileInput) {
  return input.mode === "aggregate";
}

function isRecommendedProvider(profile: ProviderProfile | ProviderProfileInput | null | undefined) {
  const providerId = String(profile?.provider_id || "").trim().toLowerCase();
  const name = String(profile?.name || "").trim().toLowerCase();
  return providerId === "linkbus" || name === "linkbus";
}

function findSavedProfile(snapshot: ProviderModuleSnapshot, input: ProviderProfileInput) {
  return (
    snapshot.profiles.find((item) => item.id === input.id)
    ?? findProfileByProviderKey(snapshot.profiles, input.provider_id)
    ?? findProfileByProviderKey(snapshot.profiles, input.name)
    ?? snapshot.profiles.find((item) => item.id === snapshot.active_profile_id)
    ?? snapshot.profiles[0]
    ?? null
  );
}

function hasCredential(profile: ProviderProfileInput) {
  return Boolean(profile.api_key.trim() || profile.auth_contents.trim());
}

function shouldAutoFetchModelsOnPersist(profile: ProviderProfileInput) {
  return Boolean(
    profile.base_url
    && hasCredential(profile)
    && !isAggregateProfile(profile)
    && profile.models.length === 0,
  );
}

function formatProviderError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const extracted = raw.includes("错误：") ? raw.split("错误：").pop()?.trim() || raw : raw;
  if (/HTTP 401/i.test(extracted)) {
    return "上游鉴权失败（HTTP 401），请检查当前供应商的 API Key 是否正确。";
  }
  if (/HTTP 403/i.test(extracted)) {
    return "上游拒绝访问（HTTP 403），请检查账号权限或接口白名单。";
  }
  return extracted;
}

export function ProvidersPage({ guideApiDialogOpen = false }: ProvidersPageProps) {
  const { data, loading, refetch } = useInvoke<ProviderModuleSnapshot>(lmentorCommands.providers.module);
  const [apiGuideOpen, setApiGuideOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProviderProfileInput>(emptyProfile());
  const [draftMode, setDraftMode] = useState<"profile" | "custom">("profile");
  const [saving, setSaving] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [candidateModels, setCandidateModels] = useState<string[]>([]);
  const [candidateFilter, setCandidateFilter] = useState("");
  const [selectedCandidateModels, setSelectedCandidateModels] = useState<string[]>([]);
  const [candidateSource, setCandidateSource] = useState<string | null>(null);

  useEffect(() => {
    if (guideApiDialogOpen) {
      setApiGuideOpen(true);
    }
  }, [guideApiDialogOpen]);

  useEffect(() => {
    if (!data) return;
    if (draftMode === "custom") return;
    const exists = selectedId ? data.profiles.some((item) => item.id === selectedId) : false;
    const nextId = exists ? selectedId : data.active_profile_id || data.profiles[0]?.id || null;
    setSelectedId(nextId);
    setDraft(toInput(data.profiles.find((item) => item.id === nextId) ?? null));
  }, [data, draftMode, selectedId]);

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

  const selectedProfile = useMemo(
    () => data?.profiles.find((item) => item.id === selectedId) ?? null,
    [data, selectedId],
  );

  const visibleModels = useMemo(
    () => filterModelIds(draft.models, modelFilter),
    [draft.models, modelFilter],
  );

  const visibleCandidateModels = useMemo(
    () => filterModelIds(candidateModels, candidateFilter),
    [candidateModels, candidateFilter],
  );

  useEffect(() => {
    setSelectedModels((prev) => prev.filter((item) => draft.models.includes(item)));
  }, [draft.models]);

  useEffect(() => {
    setSelectedCandidateModels((prev) => prev.filter((item) => candidateModels.includes(item)));
  }, [candidateModels]);

  async function refreshSnapshot() {
    await refetch(true);
  }

  async function fetchModelsForDraft(input: ProviderProfileInput) {
    const result = await invokeCommand<ProviderModelsFetchResult>(lmentorCommands.providers.fetchModels, {
      profile: normalizeDraft(input),
    });
    const nextModels = sanitizeModelIds(result.models);
    return {
      models: nextModels,
      profile: {
        ...normalizeDraft(input),
        models: nextModels,
        model: nextModels.includes(input.model.trim()) ? input.model.trim() : (input.model.trim() || nextModels[0] || ""),
      },
      result,
    };
  }

  async function saveProfileInput(input: ProviderProfileInput) {
    const normalized = normalizeDraft(input);
    const snapshot = await invokeCommand<ProviderModuleSnapshot>(lmentorCommands.providers.saveProfile, {
      profile: normalized,
    });
    const saved = findSavedProfile(snapshot, normalized);
    return { snapshot, saved, normalized };
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      let working = normalizeDraft(draft);
      let fetchNote = "";

      if (shouldAutoFetchModelsOnPersist(working)) {
        try {
          const fetched = await fetchModelsForDraft(working);
          working = fetched.profile;
          fetchNote = `已自动获取 ${working.models.length} 个模型。`;
        } catch (error) {
          fetchNote = `配置已保存，但自动获取模型失败：${formatProviderError(error)}`;
        }
      }

      const { snapshot, saved } = await saveProfileInput(working);
      setDraftMode("profile");
      setSelectedId(saved?.id ?? null);
      setDraft(toInput(saved));
      await refreshSnapshot();
      void emit("workspace-data-changed", {
        reason: "provider-updated",
        providerId: snapshot.active_profile_id || saved?.provider_id || null,
      });
      setMessage(fetchNote || "供应商配置已保存。");
    } catch (error) {
      setMessage(`保存失败：${formatProviderError(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedProfile) return;
    setSaving(true);
    setMessage(null);
    try {
      await invokeCommand<void>(lmentorCommands.providers.deleteProfile, { id: selectedProfile.id });
      setSelectedId(null);
      setDraft(emptyProfile());
      await refreshSnapshot();
      void emit("workspace-data-changed", {
        reason: "provider-updated",
        providerId: null,
      });
      setMessage("供应商配置项已删除。");
    } catch (error) {
      setMessage(`删除失败：${formatProviderError(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate() {
    setSaving(true);
    setMessage(null);
    try {
      let working = normalizeDraft(draft);
      if (shouldAutoFetchModelsOnPersist(working)) {
        try {
          const fetched = await fetchModelsForDraft(working);
          working = fetched.profile;
        } catch {
          // Keep activation flowing even if the upstream model probe is unavailable.
        }
      }

      const { saved } = await saveProfileInput(working);
      if (!saved) {
        throw new Error("未找到可启用的供应商配置。");
      }
      const activated = await invokeCommand<ProviderModuleSnapshot>(lmentorCommands.providers.activateProfile, { id: saved.id });
      const migrated = await invokeCommand<ProviderModuleSnapshot>(lmentorCommands.providers.syncSessions, {
        id: activated.active_profile_id || saved.id,
      });
      const latest = migrated.profiles.find((item) => item.id === migrated.active_profile_id) ?? saved;
      setDraftMode("profile");
      setSelectedId(migrated.active_profile_id || latest.id);
      setDraft(toInput(latest));
      await refreshSnapshot();
      void emit("workspace-data-changed", {
        reason: "provider-updated",
        providerId: latest.provider_id,
      });
      setMessage(migrated.sync_message || `已启用“${latest.name}”，并完成聊天记录迁移。`);
    } catch (error) {
      setMessage(`启用失败：${formatProviderError(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSync(targetId?: string) {
    setSaving(true);
    setMessage(null);
    try {
      const snapshot = await invokeCommand<ProviderModuleSnapshot>(lmentorCommands.providers.syncSessions, {
        id: targetId ?? selectedProfile?.id ?? null,
      });
      await refreshSnapshot();
      void emit("workspace-data-changed", {
        reason: "provider-updated",
        providerId: snapshot.active_profile_id || selectedProfile?.provider_id || null,
      });
      setMessage(snapshot.sync_message || "供应商同步已完成。");
    } catch (error) {
      setMessage(`同步失败：${formatProviderError(error)}`);
    } finally {
      setSaving(false);
    }
  }

  function loadCandidateModels(models: string[], fetchedFrom: string, providerName: string) {
    setCandidateModels(models);
    setCandidateFilter("");
    setSelectedCandidateModels([]);
    setCandidateSource(fetchedFrom);
    setMessage(`已从 ${providerName} 获取 ${models.length} 个候选模型，请先筛选后再加入模型列表。来源：${fetchedFrom}`);
  }

  function appendModelsToDraft(models: string[]) {
    setDraft((prev) => {
      const nextModels = sanitizeModelIds([...prev.models, ...models]);
      return {
        ...prev,
        models: nextModels,
        model: nextModels.includes(prev.model) ? prev.model : (prev.model || nextModels[0] || ""),
      };
    });
  }

  async function handleFetchModels() {
    setFetchingModels(true);
    setMessage(null);
    try {
      const fetched = await fetchModelsForDraft(draft);
      if (isAggregateProfile(draft)) {
        loadCandidateModels(fetched.models, fetched.result.fetched_from, draft.name || draft.provider_id || "当前聚合平台");
        return;
      }
      setDraft(fetched.profile);
      setMessage(`已从上游获取 ${fetched.profile.models.length} 个模型。来源：${fetched.result.fetched_from}`);
    } catch (error) {
      setMessage(`获取模型失败：${formatProviderError(error)}`);
    } finally {
      setFetchingModels(false);
    }
  }

  function handleRemoveModel(model: string) {
    setDraft((prev) => {
      const models = prev.models.filter((item) => item !== model);
      return {
        ...prev,
        models,
        model: prev.model === model ? (models[0] || "") : prev.model,
      };
    });
    setSelectedModels((prev) => prev.filter((item) => item !== model));
  }

  function handleToggleModelSelection(model: string) {
    setSelectedModels((prev) => toggleArrayValue(prev, model));
  }

  function handleToggleCandidateSelection(model: string) {
    setSelectedCandidateModels((prev) => toggleArrayValue(prev, model));
  }

  function handleAddSelectedCandidates() {
    if (selectedCandidateModels.length === 0) return;
    appendModelsToDraft(selectedCandidateModels);
    setSelectedCandidateModels([]);
    setMessage(`已加入 ${selectedCandidateModels.length} 个模型到当前列表。`);
  }

  function handleRemoveSelectedModels() {
    if (selectedModels.length === 0) return;
    setDraft((prev) => {
      const nextModels = prev.models.filter((item) => !selectedModels.includes(item));
      return {
        ...prev,
        models: nextModels,
        model: selectedModels.includes(prev.model) ? (nextModels[0] || "") : prev.model,
      };
    });
    setSelectedModels([]);
    setMessage(`已移除 ${selectedModels.length} 个模型。`);
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label}已复制到剪贴板。`);
    } catch (error) {
      setMessage(`复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (loading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">正在加载供应商模块...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <Dialog open={apiGuideOpen} onOpenChange={setApiGuideOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>获取 API</DialogTitle>
          </DialogHeader>

          <div className="space-y-4" data-guide-id="provider-api-dialog">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
              在对应网站中获取 API 后，填入对应的供应商模块中即可。
            </div>

            <div className="rounded-2xl border border-amber-300/25 bg-amber-500/5 px-4 py-3 text-sm text-foreground">
              <p className="font-medium">LinkBus 推荐获取流程</p>
              <ol className="mt-2 space-y-2 text-muted-foreground">
                <li>1. 打开 LinkBus 站点，根据页面指引完成账号注册。</li>
                <li>2. 注册登录后，点击网页左侧导航栏进入“令牌管理”页面。</li>
                <li>3. 新建令牌，令牌分组推荐选择 `default`。</li>
                <li>4. 生成后完整复制密钥文本，并妥善备份到本地备忘录或密码管理器。</li>
              </ol>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/60">
              <div className="grid grid-cols-[1fr_2fr] bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
                <div>国际模型</div>
                <div>链接</div>
              </div>
              <div className="divide-y divide-border/60">
                {API_ACQUISITION_LINKS.official.map((item) => (
                  <div key={item.href} className="grid grid-cols-[1fr_2fr] items-center px-4 py-3 text-sm">
                    <div className="font-medium text-foreground">{item.label}</div>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm text-muted-foreground transition-fast hover:text-foreground"
                    >
                      {item.href}
                    </a>
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/60">
              <div className="grid grid-cols-[1fr_2fr] bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
                <div>国产模型聚合平台</div>
                <div>链接</div>
              </div>
              <div className="divide-y divide-border/60">
                {API_ACQUISITION_LINKS.domestic.map((item) => (
                  <div key={item.href} className="grid grid-cols-[1fr_2fr] items-center px-4 py-3 text-sm">
                    <div className="font-medium text-foreground">{item.label}</div>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm text-muted-foreground transition-fast hover:text-foreground"
                    >
                      {item.href}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">供应商管理</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            左侧直接读取隔离环境 `config.toml` 中的 `model_providers` 段，并以这些真实配置项作为唯一索引。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">当前：{data.current_provider || "未设置"}</Badge>
          <Button variant="outline" size="sm" onClick={() => void handleSync(data.active_profile_id)} disabled={saving}>
            <RefreshCw className="h-4 w-4" />
            同步会话
          </Button>
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-border/60 bg-card/80 px-4 py-3 text-sm text-foreground shadow-sm">
          {message}
        </div>
      ) : null}

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm" data-guide-id="provider-index-panel">
          <CardHeader>
            <CardTitle className="text-base">供应商索引</CardTitle>
            <CardDescription>这里展示当前隔离环境中真实存在的 `model_providers` 项。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.profiles.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">
                当前尚未读取到可用的 `model_providers` 配置项。
              </div>
            ) : (
              data.profiles.map((profile) => {
                const active = profile.id === data.active_profile_id;
                const selected = selectedId === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    data-guide-id={isRecommendedProvider(profile) ? "provider-linkbus-card" : undefined}
                    onClick={() => {
                      setDraftMode("profile");
                      setSelectedId(profile.id);
                      setDraft(toInput(profile));
                      setCandidateModels([]);
                      setSelectedCandidateModels([]);
                      setCandidateSource(null);
                      setMessage(null);
                    }}
                    className={cn(
                      "w-full rounded-2xl border px-3 py-3 text-left transition-fast",
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-border/60 bg-background/40 hover:bg-accent/30",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{profile.name || "未命名供应商"}</p>
                          {isRecommendedProvider(profile) ? (
                            <Badge className="shrink-0 bg-amber-500/90 text-white hover:bg-amber-500">推荐</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {profile.provider_id || "未填写 provider_id"} · {profile.base_url || "未填写 Base URL"}
                        </p>
                      </div>
                      {active ? <Badge>当前</Badge> : <Badge variant="outline">{profile.mode}</Badge>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{profile.protocol}</span>
                      <span>{profile.model || "未设置模型"}</span>
                      <span>模型 {profile.models.length}</span>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="hidden rounded-2xl border-border/60 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">供应商列表</CardTitle>
            <CardDescription>{data.profiles.length} 个档案，可直接切换、编辑与同步。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.profiles.map((profile) => {
              const active = profile.id === data.active_profile_id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => {
                    setDraftMode("profile");
                    setSelectedId(profile.id);
                    setDraft(toInput(profile));
                    setMessage(null);
                  }}
                  className={cn(
                    "w-full rounded-2xl border px-4 py-3 text-left transition-fast",
                    selectedId === profile.id
                      ? "border-primary bg-primary/5"
                      : "border-border/60 bg-background/40 hover:bg-accent/30",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{profile.name || "未命名供应商"}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{profile.provider_id || "未填写 provider_id"}</p>
                    </div>
                    {active ? <Badge>当前</Badge> : <Badge variant="outline">{profile.mode}</Badge>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{profile.protocol}</span>
                    <span>{profile.model || "未设置模型"}</span>
                    <span>推理：{reasoningOptions.find((item) => item.value === profile.reasoning_effort)?.label ?? profile.reasoning_effort}</span>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Cable className="h-4 w-4" />
                  {selectedProfile ? "供应商详情" : "供应商详情"}
                </CardTitle>
                <CardDescription>
                  这里直接编辑当前 `config.toml` 中对应的 `model_providers` 配置段；保存后会写回隔离环境并同步会话映射。
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setApiGuideOpen(true)}
                className="shrink-0"
                data-guide-id="provider-api-button"
              >
                获取 API
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
                <p className="font-medium">推荐操作</p>
                <p className="mt-1 text-muted-foreground">
                  先从左侧选择真实供应商配置项；填写或更新 API Key 后保存，系统会尝试获取模型，并把会话映射同步到当前配置。
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2 text-sm md:col-span-2">
                  <span className="text-muted-foreground">API Key</span>
                  <Input
                    type="password"
                    placeholder={selectedProfile?.api_key_masked || "sk-..."}
                    data-guide-id="provider-api-key-input"
                    value={draft.api_key}
                    onChange={(e) => setDraft((prev) => ({ ...prev, api_key: e.target.value }))}
                  />
                </label>

                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">名称</span>
                  <Input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} />
                </label>

                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">Provider ID</span>
                  <Input value={draft.provider_id} onChange={(e) => setDraft((prev) => ({ ...prev, provider_id: e.target.value }))} />
                </label>

                <label className="space-y-2 text-sm md:col-span-2">
                  <span className="text-muted-foreground">Base URL</span>
                  <Input value={draft.base_url} onChange={(e) => setDraft((prev) => ({ ...prev, base_url: e.target.value }))} />
                </label>

                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">协议</span>
                  <select
                    value={draft.protocol}
                    onChange={(e) => setDraft((prev) => ({ ...prev, protocol: e.target.value as ProviderProfileInput["protocol"] }))}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none"
                  >
                    {protocolOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">模式</span>
                  <select
                    value={draft.mode}
                    onChange={(e) => setDraft((prev) => ({ ...prev, mode: e.target.value as ProviderProfileInput["mode"] }))}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none"
                  >
                    {modeOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">推理等级</span>
                  <select
                    value={draft.reasoning_effort}
                    onChange={(e) => setDraft((prev) => ({ ...prev, reasoning_effort: e.target.value as ProviderProfileInput["reasoning_effort"] }))}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none"
                  >
                    {reasoningOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">来源</span>
                  <Input value={draft.source} onChange={(e) => setDraft((prev) => ({ ...prev, source: e.target.value }))} />
                </label>
              </div>

              <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">模型列表</p>
                    <p className="mt-1 text-xs text-muted-foreground">保存时会尝试自动拉取；你也可以手动重新获取一次。</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleFetchModels()}
                    disabled={fetchingModels}
                    data-guide-id="provider-fetch-models-button"
                  >
                    <RefreshCw className={cn("h-4 w-4", fetchingModels && "animate-spin")} />
                    从上游获取模型
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">默认模型</span>
                    <select
                      value={draft.model}
                      onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none"
                    >
                      <option value="">{draft.models.length > 0 ? "请选择模型" : "暂无模型，请先获取"}</option>
                      {draft.models.map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </label>
                  <div className="space-y-2 text-sm">
                    <span className="text-muted-foreground">已收录数量</span>
                    <div className="flex h-9 items-center rounded-md border border-input bg-transparent px-3 text-sm text-foreground">
                      {draft.models.length}
                    </div>
                  </div>
                </div>

                {candidateModels.length > 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">候选模型池</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {candidateSource ? `来源：${candidateSource}` : "请先筛选，再把需要的模型加入列表。"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedCandidateModels(visibleCandidateModels)}
                          disabled={visibleCandidateModels.length === 0}
                        >
                          全选可见
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleAddSelectedCandidates}
                          disabled={selectedCandidateModels.length === 0}
                        >
                          加入选中项
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCandidateModels([]);
                            setSelectedCandidateModels([]);
                            setCandidateFilter("");
                            setCandidateSource(null);
                          }}
                        >
                          清空候选池
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem]">
                      <label className="space-y-2 text-sm">
                        <span className="text-muted-foreground">筛选候选模型</span>
                        <Input
                          value={candidateFilter}
                          onChange={(e) => setCandidateFilter(e.target.value)}
                          placeholder="输入模型名关键字"
                        />
                      </label>
                      <div className="space-y-2 text-sm">
                        <span className="text-muted-foreground">当前选中</span>
                        <div className="flex h-9 items-center rounded-md border border-input bg-transparent px-3 text-sm text-foreground">
                          {selectedCandidateModels.length}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
                      {visibleCandidateModels.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">
                          当前筛选条件下没有可加入的模型。
                        </div>
                      ) : (
                        visibleCandidateModels.map((model) => {
                          const checked = selectedCandidateModels.includes(model);
                          return (
                            <button
                              key={model}
                              type="button"
                              onClick={() => handleToggleCandidateSelection(model)}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-fast",
                                checked
                                  ? "border-primary bg-primary/10"
                                  : "border-border/60 bg-card/70 hover:bg-accent/30",
                              )}
                            >
                              <span className={cn(
                                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]",
                                checked ? "border-primary bg-primary text-primary-foreground" : "border-border/70",
                              )}>
                                {checked ? "✓" : ""}
                              </span>
                              <span className="truncate text-sm text-foreground">{model}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <label className="space-y-2 text-sm">
                    <span className="text-muted-foreground">筛选已添加模型</span>
                    <Input
                      value={modelFilter}
                      onChange={(e) => setModelFilter(e.target.value)}
                      placeholder="输入关键字过滤当前列表"
                    />
                  </label>
                  <div className="flex flex-wrap items-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedModels(visibleModels)}
                      disabled={visibleModels.length === 0}
                    >
                      选中可见项
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={handleRemoveSelectedModels}
                      disabled={selectedModels.length === 0}
                      data-guide-id="provider-delete-models-button"
                    >
                      删除选中
                    </Button>
                  </div>
                </div>

                <div className="mt-4 space-y-2" data-guide-id="provider-model-list">
                  {visibleModels.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">
                      还没有模型目录，先获取一次或者直接保存后自动拉取。
                    </div>
                  ) : (
                    visibleModels.map((model) => (
                      <div key={model} className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleToggleModelSelection(model)}
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]",
                            selectedModels.includes(model) ? "border-primary bg-primary text-primary-foreground" : "border-border/70",
                          )}
                          title={selectedModels.includes(model) ? "取消选中" : "选中模型"}
                        >
                          {selectedModels.includes(model) ? "✓" : ""}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, model }))}
                          className="min-w-0 flex-1 text-left text-sm text-foreground"
                          title={model}
                        >
                          <span className="truncate">{model}</span>
                        </button>
                        {draft.model === model ? <Badge variant="outline">默认</Badge> : null}
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => handleRemoveModel(model)} title="删除模型">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {selectedProfile?.api_key_masked ? (
                <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-3 text-sm text-muted-foreground">
                  当前已保存的密钥掩码：<span className="font-mono text-foreground">{selectedProfile.api_key_masked}</span>
                </div>
              ) : null}

              <label className="space-y-2 text-sm">
                <span className="text-muted-foreground">备注</span>
                <textarea
                  value={draft.notes}
                  onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                  className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none"
                />
              </label>

              <div className="grid gap-4 xl:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">配置快照</span>
                  <textarea
                    value={draft.config_contents}
                    onChange={(e) => setDraft((prev) => ({ ...prev, config_contents: e.target.value }))}
                    className="min-h-56 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs focus-visible:border-ring focus-visible:outline-none"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyText(draft.config_contents, "配置快照")} disabled={!draft.config_contents}>
                    <Copy className="h-4 w-4" />
                    复制配置
                  </Button>
                </label>

                <label className="space-y-2 text-sm">
                  <span className="text-muted-foreground">认证快照</span>
                  <textarea
                    value={draft.auth_contents}
                    onChange={(e) => setDraft((prev) => ({ ...prev, auth_contents: e.target.value }))}
                    className="min-h-56 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs focus-visible:border-ring focus-visible:outline-none"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyText(draft.auth_contents, "认证快照")} disabled={!draft.auth_contents}>
                    <Copy className="h-4 w-4" />
                    复制认证
                  </Button>
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void handleSave()}
                  disabled={saving || !draft.name.trim() || !draft.provider_id.trim()}
                  data-guide-id="provider-save-button"
                >
                  <Save className="h-4 w-4" />
                  保存配置
                </Button>
                <Button variant="outline" onClick={() => void handleActivate()} disabled={saving || !draft.name.trim() || !draft.provider_id.trim()}>
                  启用并迁移会话
                </Button>
                <Button variant="outline" onClick={() => void handleSync(selectedProfile?.id)} disabled={saving || !selectedProfile}>
                  <RefreshCw className="h-4 w-4" />
                  仅同步会话映射
                </Button>
                <Button variant="destructive" onClick={() => void handleDelete()} disabled={saving || !selectedProfile}>
                  <Trash2 className="h-4 w-4" />
                  删除配置项
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">同步目标</CardTitle>
              <CardDescription>这里展示当前真实供应商配置项；你可以把所有会话统一迁移到任一配置源。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {data.sync_targets.map((target) => (
                <div key={target.id} className="rounded-2xl border border-border/60 bg-background/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{target.id}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{target.sources.join(" / ")}</p>
                    </div>
                    <Badge variant={target.is_current_provider ? "default" : "outline"}>
                      {syncTargetLabel(target)}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => void handleSync(target.id)}
                    disabled={saving}
                  >
                    迁移到此供应商
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
