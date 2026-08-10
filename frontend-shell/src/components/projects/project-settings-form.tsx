import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInvoke, invokeCommand } from "@/hooks/use-invoke";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Save } from "lucide-react";
import type { ProjectSettings } from "@/types";
import { SectionHelp } from "@/components/config/section-help";

const MODEL_OPTIONS = [
  { value: "", labelKey: "common.default" },
  { value: "claude-sonnet-4-6", labelKey: "config.modelSonnet46" },
  { value: "claude-opus-4-7", labelKey: "config.modelOpus47" },
  { value: "claude-haiku-4-5-20251001", labelKey: "config.modelHaiku45" },
];

const MODE_OPTIONS = [
  { value: "default", labelKey: "config.modeDefault" },
  { value: "bypassPermissions", labelKey: "config.modeBypass" },
  { value: "plan", labelKey: "config.modePlan" },
];

interface ProjectSettingsFormProps {
  projectPath: string;
}

export function ProjectSettingsForm({ projectPath }: ProjectSettingsFormProps) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<"shared" | "local">("shared");
  const [saving, setSaving] = useState(false);
  const [newAllow, setNewAllow] = useState("");
  const [newDeny, setNewDeny] = useState("");
  const [newEnvKey, setNewEnvKey] = useState("");

  const loadCmd = target === "shared" ? "load_project_settings" : "load_project_settings_local";
  const saveCmd = target === "shared" ? "save_project_settings" : "save_project_settings_local";

  const { data: loadedSettings, loading, error, refetch } = useInvoke<ProjectSettings>(loadCmd, { projectPath });
  const [editedSettings, setEditedSettings] = useState<ProjectSettings | null>(null);

  const settings = editedSettings ?? loadedSettings ?? { permissions: null, hooks: null, env: null, model: null };
  const hasChanges = loadedSettings ? JSON.stringify(settings) !== JSON.stringify(loadedSettings) : false;

  const update = (patch: Partial<ProjectSettings>) => {
    setEditedSettings({ ...settings, ...patch });
  };

  const updatePermissions = (patch: Partial<ProjectSettings["permissions"]>) => {
    update({
      permissions: {
        defaultMode: settings.permissions?.defaultMode ?? null,
        allow: settings.permissions?.allow ?? null,
        deny: settings.permissions?.deny ?? null,
        ...patch,
      },
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await invokeCommand(saveCmd, { projectPath, settings });
      setEditedSettings(null);
      refetch();
    } catch (err) {
      console.error("Failed to save project settings:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">{t("common.loading", "加载中...")}</div>;
  }

  if (error) {
    return <div className="p-4 text-sm text-destructive">{String(error)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* File target toggle */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={target === "shared" ? "default" : "outline"}
          onClick={() => { setTarget("shared"); setEditedSettings(null); }}
        >
          {t("projectConfig.sharedSettings")}
        </Button>
        <Button
          size="sm"
          variant={target === "local" ? "default" : "outline"}
          onClick={() => { setTarget("local"); setEditedSettings(null); }}
        >
          {t("projectConfig.localSettings")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {target === "shared" ? t("projectConfig.sharedDesc") : t("projectConfig.localDesc")}
      </p>

      {/* Model */}
      <div>
        <span className="text-sm font-medium inline-flex items-center gap-1">{t("config.model")}<SectionHelp content={t("projectConfig.fieldMapModel")} /></span>
        <select
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={settings.model ?? ""}
          onChange={(e) => update({ model: e.target.value || null })}
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
          ))}
        </select>
      </div>

      {/* Default Mode */}
      <div>
        <span className="text-sm font-medium inline-flex items-center gap-1">{t("projectConfig.defaultMode")}<SectionHelp content={t("projectConfig.fieldMapMode")} /></span>
        <select
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={settings.permissions?.defaultMode ?? ""}
          onChange={(e) => updatePermissions({ defaultMode: e.target.value || null })}
        >
          <option value="">{t("common.default")}</option>
          {MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
          ))}
        </select>
      </div>

      {/* Allow List */}
      <div>
        <span className="text-sm font-medium inline-flex items-center gap-1">{t("projectConfig.allowList")}<SectionHelp content={t("projectConfig.fieldMapAllow")} /></span>
        <div className="mt-1 space-y-1">
          {(settings.permissions?.allow ?? []).map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-2 py-1 text-xs">{item}</code>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => {
                  const list = [...(settings.permissions?.allow ?? [])];
                  list.splice(i, 1);
                  updatePermissions({ allow: list.length ? list : null });
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              className="h-8 text-xs"
              placeholder={t("projectConfig.patternPlaceholder")}
              value={newAllow}
              onChange={(e) => setNewAllow(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newAllow.trim()) {
                  updatePermissions({ allow: [...(settings.permissions?.allow ?? []), newAllow.trim()] });
                  setNewAllow("");
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              disabled={!newAllow.trim()}
              onClick={() => {
                if (newAllow.trim()) {
                  updatePermissions({ allow: [...(settings.permissions?.allow ?? []), newAllow.trim()] });
                  setNewAllow("");
                }
              }}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Deny List */}
      <div>
        <span className="text-sm font-medium inline-flex items-center gap-1">{t("projectConfig.denyList")}<SectionHelp content={t("projectConfig.fieldMapDeny")} /></span>
        <div className="mt-1 space-y-1">
          {(settings.permissions?.deny ?? []).map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-2 py-1 text-xs">{item}</code>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => {
                  const list = [...(settings.permissions?.deny ?? [])];
                  list.splice(i, 1);
                  updatePermissions({ deny: list.length ? list : null });
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              className="h-8 text-xs"
              placeholder={t("projectConfig.patternPlaceholder")}
              value={newDeny}
              onChange={(e) => setNewDeny(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newDeny.trim()) {
                  updatePermissions({ deny: [...(settings.permissions?.deny ?? []), newDeny.trim()] });
                  setNewDeny("");
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              disabled={!newDeny.trim()}
              onClick={() => {
                if (newDeny.trim()) {
                  updatePermissions({ deny: [...(settings.permissions?.deny ?? []), newDeny.trim()] });
                  setNewDeny("");
                }
              }}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Hooks (read-only view) */}
      <div>
        <span className="text-sm font-medium inline-flex items-center gap-1">{t("projectConfig.hooks")}<SectionHelp content={t("projectConfig.fieldMapHooks")} /></span>
        {settings.hooks && Object.keys(settings.hooks).length > 0 ? (
          <div className="mt-1 space-y-2">
            {Object.entries(settings.hooks).map(([event, entries]) => (
              <div key={event} className="rounded border p-2">
                <p className="text-xs font-medium text-muted-foreground">{event}</p>
                {entries.map((entry, i) => (
                  <div key={i} className="mt-1 space-y-1">
                    {entry.matcher && <p className="text-xs text-muted-foreground">{t("projectConfig.matcher")}: {entry.matcher}</p>}
                    {entry.hooks.map((hook, j) => (
                      <div key={j} className="flex items-start gap-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{hook.type}</code>
                        <code className="flex-1 break-all text-xs">{hook.command}</code>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 shrink-0"
                          onClick={() => {
                            const hooks = { ...settings.hooks! };
                            const list = [...(hooks[event] ?? [])];
                            list.splice(i, 1);
                            if (list.length === 0) {
                              delete hooks[event];
                            } else {
                              hooks[event] = list;
                            }
                            update({ hooks: Object.keys(hooks).length ? hooks : null });
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">{t("projectConfig.noHooks")}</p>
        )}
      </div>

      {/* Environment Variables */}
      <div>
        <span className="text-sm font-medium inline-flex items-center gap-1">{t("config.envVars")}<SectionHelp content={t("projectConfig.fieldMapEnv")} /></span>
        <div className="mt-1 space-y-1">
          {Object.entries(settings.env ?? {}).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <code className="shrink-0 rounded bg-muted px-2 py-1 text-xs">{key}</code>
              <Input
                className="h-7 flex-1 text-xs"
                value={val}
                onChange={(e) => {
                  const env = { ...settings.env! };
                  env[key] = e.target.value;
                  update({ env });
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => {
                  const env = { ...settings.env! };
                  delete env[key];
                  update({ env: Object.keys(env).length ? env : null });
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              className="h-8 text-xs"
              placeholder={t("config.key")}
              value={newEnvKey}
              onChange={(e) => setNewEnvKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newEnvKey.trim()) {
                  update({ env: { ...settings.env, [newEnvKey.trim()]: "" } });
                  setNewEnvKey("");
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              disabled={!newEnvKey.trim()}
              onClick={() => {
                if (newEnvKey.trim()) {
                  update({ env: { ...settings.env, [newEnvKey.trim()]: "" } });
                  setNewEnvKey("");
                }
              }}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Save button */}
      <Button className="w-full" onClick={handleSave} disabled={!hasChanges || saving}>
        <Save className="mr-2 h-4 w-4" />
        {saving ? t("common.saving") : t("common.save")}
      </Button>
    </div>
  );
}
