import { useEffect, useState, useCallback } from "react";
import { invokeCommand } from "@/hooks/use-invoke";
import { AgentLogo, RuntimeLogo, useAgent } from "@/agents";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ChevronDown,
  ArrowUpCircle,
  Info,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentStatus } from "@/agents/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EnvData {
  node_installed: boolean;
  node_version: string | null;
  npm_installed: boolean;
  npm_version: string | null;
  python_installed: boolean;
  python_version: string | null;
}

interface CheckItem {
  id: string;
  name: string;
  desc: string;
  installed: boolean;
  version: string | null;
  icon: React.ReactNode;
  iconClassName?: string;
  updateCommand?: string;
  downloadUrl?: string;
  npmPackage?: string;
}

interface LatestVersion {
  id: string;
  latest_version: string | null;
  error: string | null;
}

function VersionBadge({ version }: { version: string | null }) {
  if (!version) return null;
  const v = version.startsWith("v") ? version : `v${version}`;
  return (
    <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
      {v}
    </span>
  );
}

function UpdateBadge({ latest }: { latest: string }) {
  return (
    <span className="text-xs font-mono text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded flex items-center gap-1">
      <ArrowUpCircle className="h-3 w-3" />
      v{latest}
    </span>
  );
}

function StatusIndicator({
  installed,
  hasUpdate,
  labelNormal,
  labelNotInstalled,
}: {
  installed: boolean;
  hasUpdate: boolean;
  labelNormal: string;
  labelNotInstalled: string;
}) {
  if (!installed) {
    return (
      <div className="flex items-center gap-1 text-destructive shrink-0 min-w-[60px] justify-end">
        <XCircle className="h-4 w-4" />
        <span className="text-xs font-medium">{labelNotInstalled}</span>
      </div>
    );
  }
  if (hasUpdate) {
    return (
      <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 shrink-0 min-w-[60px] justify-end">
        <ArrowUpCircle className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-[var(--icon-success)] shrink-0 min-w-[60px] justify-end">
      <CheckCircle2 className="h-4 w-4" />
      <span className="text-xs font-medium">{labelNormal}</span>
    </div>
  );
}

export function EnvCheckPage({ onComplete }: { onComplete?: () => void }) {
  const { t } = useTranslation();
  const [env, setEnv] = useState<EnvData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { agents, refreshHealth } = useAgent();
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [expandedAgents, setExpandedAgents] = useState(false);
  const [checking, setChecking] = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [latestVersions, setLatestVersions] = useState<Map<string, string>>(
    new Map()
  );

  const loadEnvironment = useCallback(
    async (withRetry = true) => {
      setLoadError(null);

      const attempts = withRetry ? 4 : 1;
      let lastError: unknown = null;

      for (let index = 0; index < attempts; index += 1) {
        try {
          const result = await invokeCommand<EnvData>("check_environment");
          setEnv(result);
          setLoadError(null);
          return result;
        } catch (error) {
          lastError = error;
          if (index < attempts - 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 1200));
          }
        }
      }

      const message =
        lastError instanceof Error ? lastError.message : "环境检查失败";
      console.error(lastError);
      setLoadError(message);
      return null;
    },
    []
  );

  useEffect(() => {
    void loadEnvironment(true);
  }, [loadEnvironment]);

  const runtimeItems: CheckItem[] = env
    ? [
        {
          id: "node",
          name: t("env.nodeTitle"),
          desc: t("env.nodeDesc"),
          installed: env.node_installed,
          version: env.node_version,
          icon: <RuntimeLogo runtimeId="node" size={18} />,
          iconClassName: "bg-transparent",
          downloadUrl: "https://nodejs.org/",
          npmPackage: "node",
        },
        {
          id: "npm",
          name: t("env.npmTitle"),
          desc: t("env.npmDesc"),
          installed: env.npm_installed,
          version: env.npm_version,
          icon: <RuntimeLogo runtimeId="npm" size={18} />,
          iconClassName: "bg-transparent",
          updateCommand: "npm install -g npm@latest",
          npmPackage: "npm",
        },
        {
          id: "python",
          name: t("env.pythonTitle"),
          desc: t("env.pythonDesc"),
          installed: env.python_installed,
          version: env.python_version,
          icon: <RuntimeLogo runtimeId="python" size={18} />,
          iconClassName: "bg-transparent",
          downloadUrl: "https://www.python.org/downloads/",
          npmPackage: "python",
        },
      ]
    : [];

  const agentItems: CheckItem[] = agents.map((agent) => ({
    id: `agent-${agent.id}`,
    name: agent.display_name,
    desc: agent.install_hint
      ? agent.install_hint.replace("npm install -g ", "")
      : "",
    installed: agent.health.installed,
    version: agent.health.version,
    icon: <AgentLogo agentId={agent.id} size={18} />,
    iconClassName: "bg-transparent",
    updateCommand: agent.install_hint || undefined,
    npmPackage: agent.install_hint
      ?.replace("npm install -g ", "")
      ?.trim(),
  }));

  const hasUpdate = useCallback(
    (item: CheckItem): boolean => {
      if (!item.installed || !item.version || !latestVersions.has(item.id))
        return false;
      const latest = latestVersions.get(item.id)!;
      const current = item.version.replace(/^v/, "");
      return latest !== current;
    },
    [latestVersions]
  );

  const openUrl = (url: string) => {
    invokeCommand("open_url", { url }).catch(console.error);
  };

  const handleInstall = async (item: CheckItem) => {
    if (!item.updateCommand) return;
    setInstallingId(item.id);
    try {
      await invokeCommand("install_agent_command", {
        command: item.updateCommand,
      });
      if (item.id.startsWith("agent-")) {
        await refreshHealth();
      } else {
        await loadEnvironment(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setInstallingId(null);
    }
  };

  const handleRefresh = async () => {
    setChecking(true);
    try {
      await loadEnvironment(false);
      await refreshHealth();

      const packages: [string, string][] = [];
      const currentAgents = await invokeCommand<AgentStatus[]>(
        "agent_list_statuses"
      );

      for (const item of [...runtimeItems, ...agentItems]) {
        if (item.npmPackage) {
          packages.push([item.id, item.npmPackage]);
        }
      }
      for (const agent of currentAgents || []) {
        if (agent.install_hint) {
          const pkg = agent.install_hint
            .replace("npm install -g ", "")
            .trim();
          if (pkg) {
            const id = `agent-${agent.id}`;
            if (!packages.some((p) => p[0] === id)) {
              packages.push([id, pkg]);
            }
          }
        }
      }

      if (packages.length > 0) {
        const results = await invokeCommand<LatestVersion[]>(
          "check_available_updates",
          { packages }
        );
        if (results) {
          const map = new Map<string, string>();
          for (const r of results) {
            if (r.latest_version) {
              map.set(r.id, r.latest_version);
            }
          }
          setLatestVersions(map);
        }
      }
    } finally {
      setChecking(false);
    }
  };

  if (!env) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-sm text-muted-foreground">
          {loadError ? `环境检查暂时失败：${loadError}` : t("env.checking")}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => void loadEnvironment(true)} disabled={checking}>
            <RefreshCw className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            重新检查
          </Button>
          {onComplete ? (
            <Button onClick={onComplete}>
              直接进入
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const visibleAgents = expandedAgents ? agentItems : agentItems.slice(0, 3);

  const rowLabels = {
    labelInstall: t("env.install"),
    labelUpdateBtn: t("env.updateLabel"),
    labelDownload: t("env.download"),
    labelNormal: t("env.normal"),
    labelNotInstalled: t("env.notInstalled"),
  };

  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">{t("env.title")}</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDisclaimerOpen(true)}
            className="text-muted-foreground"
          >
            <Info className="h-4 w-4 mr-1" />
            免责声明
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={checking}
            className="text-muted-foreground"
          >
            <RefreshCw
              className={`h-4 w-4 mr-1 ${checking ? "animate-spin" : ""}`}
            />
            {checking ? t("env.checkingUpdate") : t("env.checkUpdate")}
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground mb-5 text-sm">{t("env.desc")}</p>

      <div className="space-y-5 flex-1">
        {/* Runtime section */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {t("env.runtimeTitle")}
          </h2>
          <div className="space-y-2">
            {runtimeItems.map((item) => {
              const downloadUrl = item.downloadUrl;
              return (
                <CheckItemRow
                  key={item.id}
                  item={item}
                  installing={installingId === item.id}
                  onInstall={() => handleInstall(item)}
                  onDownload={downloadUrl ? () => openUrl(downloadUrl) : undefined}
                  hasUpdate={hasUpdate(item)}
                  latestVersion={latestVersions.get(item.id)}
                  {...rowLabels}
                />
              );
            })}
          </div>
        </div>

        {/* Agent CLI section */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {t("env.agentsTitle")}
          </h2>
          <div className="space-y-2">
            {visibleAgents.map((item) => {
              const downloadUrl = item.downloadUrl;
              return (
                <CheckItemRow
                  key={item.id}
                  item={item}
                  installing={installingId === item.id}
                  onInstall={() => handleInstall(item)}
                  onDownload={downloadUrl ? () => openUrl(downloadUrl) : undefined}
                  hasUpdate={hasUpdate(item)}
                  latestVersion={latestVersions.get(item.id)}
                  {...rowLabels}
                />
              );
            })}
            {agentItems.length > 3 && !expandedAgents && (
              <button
                onClick={() => setExpandedAgents(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto pt-1"
              >
                <ChevronDown className="h-3 w-3" />
                {t("env.selectModule")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bottom action */}
      <div className="mt-6 shrink-0">
        {onComplete && (
          <Button className="w-full" size="lg" onClick={onComplete}>
            {t("env.enterWorkspace")}
          </Button>
        )}
      </div>

      <Dialog open={disclaimerOpen} onOpenChange={setDisclaimerOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>师门 ShiMen 1.0.0 使用免责声明</DialogTitle>
            <DialogDescription>
              请在使用本软件及其连接的第三方服务前阅读以下说明。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-6 text-foreground/90">
            <p>
              本软件按“现状”和“可用”基础提供。本软件会依据本地运行环境、您自行配置的模型、接口、插件及数据执行任务；功能可用性、输出内容与执行结果可能受设备、网络、第三方服务和输入数据影响。
            </p>
            <p>
              人工智能生成的文字、代码、图像、分析、建议及文件仅供辅助参考，不构成医疗、法律、财务、工程、安全、科研结论或其他专业意见，也不构成任何承诺、保证或验收依据。使用者应结合实际情况独立审查、验证并作出决策。
            </p>
            <p>
              使用者应确保其输入、上传、处理或导出的数据具有合法来源、必要授权及适当的隐私与保密保护；请勿在未获授权的情况下处理个人信息、商业秘密、受限数据或他人受版权保护的内容。对重要文件、配置和数据执行覆盖、删除、移动或自动化操作前，请自行完成备份与复核。
            </p>
            <p>
              您连接或使用的模型供应商、API、开源组件、插件及在线服务由相应权利人独立提供，并适用其自身的服务条款、隐私政策、计费规则、内容政策及可用性限制。由第三方服务产生的费用、限制、中断、数据处理或结果问题，应依照相应第三方规则处理。
            </p>
            <p>
              在适用法律允许的最大范围内，开发者不保证本软件持续可用、无错误、无中断、完全安全、兼容所有环境，或不会发生数据丢失；对于因使用或无法使用本软件、第三方服务或生成内容而导致的间接损失、附带损失、数据损失或业务损失，不承担责任。
            </p>
            <p>
              本声明不排除或限制任何依法不得排除或限制的消费者权利及其他法定权利。继续使用本软件即表示您已阅读并理解上述说明。
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setDisclaimerOpen(false)}>我已知悉</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CheckItemRow({
  item,
  installing,
  onInstall,
  onDownload,
  hasUpdate,
  latestVersion,
  labelInstall,
  labelUpdateBtn,
  labelDownload,
  labelNormal,
  labelNotInstalled,
}: {
  item: CheckItem;
  installing: boolean;
  onInstall: () => void;
  onDownload?: () => void;
  hasUpdate: boolean;
  latestVersion?: string;
  labelInstall: string;
  labelUpdateBtn: string;
  labelDownload: string;
  labelNormal: string;
  labelNotInstalled: string;
}) {
  const showUpdateBtn = item.installed && hasUpdate && item.updateCommand;
  const showDownloadUpdateBtn =
    item.installed && hasUpdate && !item.updateCommand && onDownload;
  const showInstallBtn = !item.installed && item.updateCommand;
  const showDownloadBtn = !item.installed && !item.updateCommand && onDownload;

  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg bg-card transition-colors">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
          item.iconClassName ?? (
            item.installed
              ? hasUpdate
                ? "text-amber-600 dark:text-amber-400"
                : "text-[var(--icon-success)]"
              : "text-muted-foreground"
          )
        }`}
      >
        {item.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{item.name}</span>
          <VersionBadge version={item.version} />
          {hasUpdate && latestVersion && (
            <UpdateBadge latest={latestVersion} />
          )}
        </div>
        {item.desc && (
          <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
        )}
      </div>

      <StatusIndicator
        installed={item.installed}
        hasUpdate={hasUpdate}
        labelNormal={labelNormal}
        labelNotInstalled={labelNotInstalled}
      />

      {(showUpdateBtn ||
        showDownloadUpdateBtn ||
        showInstallBtn ||
        showDownloadBtn) && (
        <div className="shrink-0">
          {installing ? (
            <Button size="sm" variant="outline" disabled>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            </Button>
          ) : showUpdateBtn ? (
            <Button size="sm" variant="outline" onClick={onInstall}>
              {labelUpdateBtn}
            </Button>
          ) : showDownloadUpdateBtn ? (
            <Button size="sm" variant="outline" onClick={onDownload!}>
              {labelUpdateBtn}
            </Button>
          ) : showInstallBtn ? (
            <Button size="sm" variant="outline" onClick={onInstall}>
              {labelInstall}
            </Button>
          ) : showDownloadBtn ? (
            <Button size="sm" variant="outline" onClick={onDownload!}>
              {labelDownload}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
