import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { resolveSessionTitle } from "@/lib/session-title";
import { MessageSquare, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Session, SessionSearchResult } from "@/types";

interface SessionListProps {
  sessions: Session[];
  sessionNames: Record<string, string>;
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
  searchQuery?: string;
  searchResults?: SessionSearchResult[];
  onResumeSession?: (sessionId: string, projectPath: string) => void;
  loadingSessionId?: string | null;
}

export function SessionList({ sessions, sessionNames, selectedId, onSelect, searchQuery, searchResults, onResumeSession, loadingSessionId }: SessionListProps) {
  const { t } = useTranslation();

  const filteredSessions = useMemo(() => {
    if (!searchQuery || !searchResults) return sessions;
    const ids = new Set(searchResults.map(r => r.sessionId));
    return sessions.filter(s => ids.has(s.id));
  }, [sessions, searchQuery, searchResults]);

  const resultMap = useMemo(() => {
    if (!searchResults) return new Map<string, SessionSearchResult>();
    return new Map(searchResults.map(r => [r.sessionId, r]));
  }, [searchResults]);

  return (
    <div className="space-y-1">
      {filteredSessions.map((session) => {
        const displayName = resolveSessionTitle([sessionNames[session.id], session.display_name], "\u65b0\u5bf9\u8bdd");
        const hasCustomName = displayName !== "\u65b0\u5bf9\u8bdd";
        const result = resultMap.get(session.id);

        return (
          <div key={session.id} className="group relative">
            <button
              onClick={() => onSelect(session.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                selectedId === session.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              )}
            >
              <div className="grid grid-cols-[1.25rem_1fr] gap-x-2 min-w-0">
                <MessageSquare className="h-3.5 w-3.5 mt-1 text-muted-foreground" />
                <div className="min-w-0 text-left">
                  <div className={cn("truncate text-left", hasCustomName && "font-medium")}>
                    {displayName}
                    {hasCustomName && (
                      <span className="ml-2 text-xs text-muted-foreground font-normal">{session.id.slice(0, 8)}</span>
                    )}
                  </div>
                  {session.last_active && (
                    <div className="text-[11px] text-muted-foreground/70 leading-tight text-left">
                      {new Date(session.last_active).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {result ? (
                  <span className="text-xs text-blue-600 font-medium">
                    {result.matchCount} {t("sessions.matches")}
                  </span>
                ) : (
                  <span className="text-xs">{t("sessions.msgCount", { count: session.messages.length })}</span>
                )}
                {onResumeSession && (
                  loadingSessionId === session.id ? (
                    <span
                      className="inline-flex items-center justify-center p-0.5"
                      title={t("sessions.resuming")}
                    >
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    </span>
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-accent/70 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onResumeSession(session.id, session.path);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          onResumeSession(session.id, session.path);
                        }
                      }}
                    >
                      <Terminal className="h-3.5 w-3.5" />
                    </span>
                  )
                )}
              </div>
            </button>
            {result && result.previewText && (
              <div className="text-xs text-muted-foreground truncate px-3 pb-1.5 pl-9">
                {result.previewText}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
