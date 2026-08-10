import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { invokeCommand, useInvoke } from "@/hooks/use-invoke";
import { lmentorCommands } from "@/lmentor/api";
import type { EnhancementsModuleSnapshot, EnhancementsSettings } from "@/types";

function renderSwitchRow(
  label: string,
  description: string,
  checked: boolean,
  onCheckedChange: (checked: boolean) => void,
) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/40 px-4 py-3">
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      <span className="space-y-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export function EnhancementsPage() {
  const { data, loading, refetch } = useInvoke<EnhancementsModuleSnapshot>(lmentorCommands.enhancements.module);
  const [settings, setSettings] = useState<EnhancementsSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setSettings(data.settings);
  }, [data]);

  const enabledCount = useMemo(() => {
    if (!settings) return 0;
    return Object.values(settings).filter((value) => value === true).length;
  }, [settings]);

  function setField<K extends keyof EnhancementsSettings>(key: K, value: EnhancementsSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      await invokeCommand(lmentorCommands.enhancements.saveSettings, { settings });
      await refetch(true);
      setMessage("增强设置已保存。");
    } catch (error) {
      setMessage(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data || !settings) {
    return <div className="p-6 text-sm text-muted-foreground">正在加载增强模块...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">运行环境增强</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            这里把运行环境增强能力收口为 Lmentor 的统一设置面板，部分开关会同步回写到真实运行环境配置。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{settings.enhancements_enabled ? "总开关已开启" : "总开关已关闭"}</Badge>
          <Badge variant="outline">已启用 {enabledCount} 项</Badge>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            <Save className="h-4 w-4" />
            保存设置
          </Button>
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-border/60 bg-card/80 px-4 py-3 text-sm text-foreground shadow-sm">
          {message}
        </div>
      ) : null}

      <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">总开关</CardTitle>
          <CardDescription>关闭后保留模块入口，但不再向运行时注入对应增强行为。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {renderSwitchRow("启用增强总开关", "统一控制会话删除、导出、项目迁移、插件相关与守护类增强。", settings.enhancements_enabled, (value) => setField("enhancements_enabled", value))}
          {renderSwitchRow("Windows Computer Use Guard", "保留高风险自动化场景的守护入口。", settings.computer_use_guard_enabled, (value) => setField("computer_use_guard_enabled", value))}
          {renderSwitchRow("强制中文界面", "尽量让注入能力与界面语言保持中文。", settings.force_chinese_locale, (value) => setField("force_chinese_locale", value))}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">功能开关</CardTitle>
            <CardDescription>会话、插件、项目与工作区相关的增强项。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {renderSwitchRow("插件市场解锁", "联动真实插件市场状态。", settings.plugin_marketplace_unlock, (value) => setField("plugin_marketplace_unlock", value))}
            {renderSwitchRow("插件列表自动展开", "减少插件列表折叠带来的重复点击。", settings.plugin_auto_expand, (value) => setField("plugin_auto_expand", value))}
            {renderSwitchRow("会话删除", "允许在会话管理中执行真实删除操作。", settings.session_delete, (value) => setField("session_delete", value))}
            {renderSwitchRow("Markdown 导出", "允许从会话管理中导出 Markdown。", settings.markdown_export, (value) => setField("markdown_export", value))}
            {renderSwitchRow("项目迁移", "保留项目迁移与归属修复能力位。", settings.project_move, (value) => setField("project_move", value))}
            {renderSwitchRow("会话视图增强", "增强对话阅读体验与信息密度。", settings.conversation_view, (value) => setField("conversation_view", value))}
            {renderSwitchRow("滚动位置恢复", "切换会话后保留阅读位置。", settings.thread_scroll_restore, (value) => setField("thread_scroll_restore", value))}
            {renderSwitchRow("Thread ID 标识", "显示会话标识以便定位历史记录。", settings.thread_id_badge, (value) => setField("thread_id_badge", value))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">高级能力</CardTitle>
            <CardDescription>远程项目、Goals、Stepwise 与图像叠层等增强入口。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {renderSwitchRow("Zed 远程项目", "保留远程工作区打开入口。", settings.zed_remote_open, (value) => setField("zed_remote_open", value))}
            {renderSwitchRow("远程项目注册", "自动管理远程项目注册信息。", settings.zed_remote_project_registry_enabled, (value) => setField("zed_remote_project_registry_enabled", value))}
            {renderSwitchRow("同步到 Zed 设置", "将远程项目结果写回 Zed 配置。", settings.zed_remote_sync_to_settings, (value) => setField("zed_remote_sync_to_settings", value))}
            {renderSwitchRow("Upstream Worktree", "保留上游 worktree 创建能力位。", settings.upstream_worktree_create, (value) => setField("upstream_worktree_create", value))}
            {renderSwitchRow("Service Tier 控制", "暴露运行时服务档位相关设置。", settings.service_tier_controls, (value) => setField("service_tier_controls", value))}
            {renderSwitchRow("Goals", "联动真实 Goals 开关。", settings.goals_enabled, (value) => setField("goals_enabled", value))}
            {renderSwitchRow("Stepwise", "启用链式调教入口。", settings.stepwise_enabled, (value) => setField("stepwise_enabled", value))}
            {renderSwitchRow("Stepwise 直接发送", "跳过中间确认，直接发送到 Stepwise。", settings.stepwise_direct_send, (value) => setField("stepwise_direct_send", value))}
            {renderSwitchRow("图像叠层", "保留图像引导与叠层能力入口。", settings.image_overlay_enabled, (value) => setField("image_overlay_enabled", value))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Stepwise 参数</CardTitle>
            <CardDescription>用于外部调教服务的连接与限流设置。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">Base URL</span>
              <Input value={settings.stepwise_base_url} onChange={(e) => setField("stepwise_base_url", e.target.value)} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">API Key 环境变量</span>
              <Input value={settings.stepwise_api_key_env} onChange={(e) => setField("stepwise_api_key_env", e.target.value)} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">模型</span>
              <Input value={settings.stepwise_model} onChange={(e) => setField("stepwise_model", e.target.value)} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">最大条目数</span>
              <Input type="number" value={settings.stepwise_max_items} onChange={(e) => setField("stepwise_max_items", Number(e.target.value || 0))} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">最大输入字符</span>
              <Input type="number" value={settings.stepwise_max_input_chars} onChange={(e) => setField("stepwise_max_input_chars", Number(e.target.value || 0))} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">最大输出 Tokens</span>
              <Input type="number" value={settings.stepwise_max_output_tokens} onChange={(e) => setField("stepwise_max_output_tokens", Number(e.target.value || 0))} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">超时毫秒</span>
              <Input type="number" value={settings.stepwise_timeout_ms} onChange={(e) => setField("stepwise_timeout_ms", Number(e.target.value || 0))} />
            </label>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">图像叠层参数</CardTitle>
            <CardDescription>用于后续图像增强与视觉引导能力。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm md:col-span-2">
              <span className="text-muted-foreground">叠层路径</span>
              <Input value={settings.image_overlay_path} onChange={(e) => setField("image_overlay_path", e.target.value)} />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">透明度</span>
              <Input type="number" value={settings.image_overlay_opacity} onChange={(e) => setField("image_overlay_opacity", Number(e.target.value || 0))} />
            </label>
            <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-3 text-sm text-muted-foreground">
              当前共分为 {data.groups.length} 个增强分组，下方摘要用于说明能力拆分方向。
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        {data.groups.map((group) => (
          <Card key={group.id} className="rounded-2xl border-border/60 bg-card/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">{group.title}</CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {group.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-border/60 bg-background/40 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.owner}</p>
                    </div>
                    <Badge variant={item.status === "ready" ? "default" : "outline"}>
                      {item.status === "ready" ? "可用" : "规划中"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{item.notes}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
