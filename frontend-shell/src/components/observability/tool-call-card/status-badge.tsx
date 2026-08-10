import { memo } from "react";
import { cn } from "@/lib/utils";
import type { ToolStatus } from "./types";
import { Clock, Loader2, Check, AlertTriangle, Ban } from "lucide-react";

const statusConfig: Record<ToolStatus, { icon: typeof Clock; color: string; label: string; animate?: boolean }> = {
  pending: { icon: Clock, color: "var(--tool-pending)", label: "等待中" },
  running: { icon: Loader2, color: "var(--tool-running)", label: "运行中", animate: true },
  success: { icon: Check, color: "var(--tool-success)", label: "已完成" },
  error: { icon: AlertTriangle, color: "var(--tool-error)", label: "异常" },
  aborted: { icon: Ban, color: "var(--tool-aborted)", label: "已中止" },
};

export const StatusBadge = memo(function StatusBadge({ status }: { status: ToolStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-1.5 py-0.5 text-[0.73em] font-semibold" style={{ color: config.color }}>
      <Icon
        className={cn("w-[1em] h-[1em]", config.animate ? "animate-spin" : "")}
      />
      {config.label}
    </span>
  );
});
