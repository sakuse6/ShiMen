import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Package, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { invokeCommand } from "@/hooks/use-invoke";
import type { AgentStatus } from "./types";

interface InstallAgentDialogProps {
  agent: AgentStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled: () => void;
}

export function InstallAgentDialog({ agent, open, onOpenChange, onInstalled }: InstallAgentDialogProps) {
  const [nodeExists, setNodeExists] = useState<boolean | null>(null);
  const [nativePkgExists, setNativePkgExists] = useState<boolean | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open || !agent) return;
    setSuccess(false);
    setError(null);
    setInstalling(null);

    invokeCommand<boolean>("check_prerequisite", { command: "node" }).then(setNodeExists);
    const pkg = agent.id === "claude-code" ? "winget" : "choco";
    invokeCommand<boolean>("check_prerequisite", { command: pkg }).then(setNativePkgExists);
  }, [open, agent]);

  if (!agent) return null;

  async function handleInstall(method: "npm" | "native") {
    if (!agent) return;
    const command = method === "npm" ? agent.install_hint : agent.native_install_command;
    if (!command) return;

    setInstalling(method);
    setError(null);
    try {
      await invokeCommand("install_agent_command", { command });
      setSuccess(true);
      setTimeout(() => {
        onInstalled();
        onOpenChange(false);
      }, 1500);
    } catch (err) {
      setError(String(err));
    } finally {
      setInstalling(null);
    }
  }

  const nativePkgName = agent.id === "claude-code" ? "winget" : "choco";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            安装 {agent.display_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-6">
          {success ? (
            <div className="flex flex-col items-center justify-center space-y-3 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 animate-in zoom-in text-[var(--icon-success)]" />
              <div className="space-y-1">
                <p className="text-lg font-medium">安装成功</p>
                <p className="text-sm text-muted-foreground">正在刷新状态...</p>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4 transition-colors hover:bg-accent/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="rounded-md bg-red-500/10 p-1.5 text-red-500">
                        <Package className="h-4 w-4" />
                      </div>
                      <span className="font-medium">通过 NPM 安装</span>
                    </div>
                    {nodeExists === false ? (
                      <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600">
                        <AlertTriangle className="h-3 w-3" />
                        需要 Node.js
                      </span>
                    ) : null}
                  </div>
                  <code className="block break-all rounded border bg-muted p-2 text-[11px] font-mono text-muted-foreground">
                    {agent.install_hint}
                  </code>
                  <Button
                    className="w-full"
                    variant={nodeExists ? "default" : "outline"}
                    disabled={Boolean(installing) || nodeExists === false}
                    onClick={() => void handleInstall("npm")}
                  >
                    {installing === "npm" ? <Loader2 className="h-4 w-4 animate-spin" /> : "立即安装"}
                  </Button>
                </div>

                {agent.native_install_command ? (
                  <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4 transition-colors hover:bg-accent/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="rounded-md bg-blue-500/10 p-1.5 text-blue-500">
                          <Terminal className="h-4 w-4" />
                        </div>
                        <span className="font-medium">通过 {nativePkgName} 安装</span>
                      </div>
                      {nativePkgExists === false ? (
                        <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600">
                          <AlertTriangle className="h-3 w-3" />
                          需要 {nativePkgName}
                        </span>
                      ) : null}
                    </div>
                    <code className="block break-all rounded border bg-muted p-2 text-[11px] font-mono text-muted-foreground">
                      {agent.native_install_command}
                    </code>
                    <Button
                      className="w-full"
                      variant={nativePkgExists ? "default" : "outline"}
                      disabled={Boolean(installing) || nativePkgExists === false}
                      onClick={() => void handleInstall("native")}
                    >
                      {installing === "native" ? <Loader2 className="h-4 w-4 animate-spin" /> : "立即安装"}
                    </Button>
                  </div>
                ) : null}
              </div>

              {error ? (
                <div className="max-h-32 overflow-y-auto break-all rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs font-mono text-destructive whitespace-pre-wrap">
                  {error}
                </div>
              ) : null}
            </>
          )}
        </div>

        {!success ? (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={Boolean(installing)}>
              取消
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
