import { memo, useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useRosterAgent } from "./RosterAgentContext";
import { AgentLogo } from "./AgentLogo";
import { cn } from "@/lib/utils";

interface AgentSwitcherProps {
  children?: React.ReactNode;
  menuPlacement?: "bottom" | "top";
}

function displayAgentName(name: string | null | undefined, fallback = "未题名道身") {
  const normalized = String(name || "").trim();
  return normalized || fallback;
}

export const AgentSwitcher = memo(function AgentSwitcher({ children, menuPlacement = "bottom" }: AgentSwitcherProps) {
  const { agents, activeId, active, setActive, loading } = useRosterAgent();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handler);
    }
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!active && !loading) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "relative flex h-7 items-center gap-1.5 rounded-md px-2 transition-fast hover:bg-accent/30",
          open && "bg-accent/30",
        )}
        title={active?.role_title || displayAgentName(active?.name, "道身")}
        aria-label={displayAgentName(active?.name, "道身")}
      >
        <AgentLogo agentId={active?.id || ""} size={18} />
        <span className="max-w-[10rem] truncate text-xs font-medium">
          {active ? displayAgentName(active.name) : (loading ? "道身点验中..." : "未择道身")}
        </span>
        {children}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            "absolute left-0 z-50 w-72 rounded-lg border border-border bg-popover p-2 shadow-lg",
            menuPlacement === "top" ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          <div className="rounded-md bg-accent/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <AgentLogo agentId={active?.id || ""} size={18} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{active ? displayAgentName(active.name) : "未择道身"}</span>
              {active ? <span className="text-[11px] text-muted-foreground">当前执事</span> : null}
            </div>
            {active?.role_title ? (
              <div className="mt-1 pl-6 text-[11px] text-muted-foreground">
                {active.role_title}
              </div>
            ) : null}
          </div>

          <div className="mt-3 border-t border-border/40 pt-2">
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => {
                  void setActive(agent.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-2 py-2 text-sm transition-fast hover:bg-accent/40",
                  agent.id === activeId && "bg-accent/25",
                )}
              >
                <AgentLogo agentId={agent.id} size={16} className="mt-0.5" />
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">{displayAgentName(agent.name)}</span>
                    {agent.id === activeId ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{agent.role_title || "尚未册封位格"}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
