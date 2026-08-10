import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@/lmentor/platform/event";
import { invokeLmentor, lmentorCommands, type LmentorCommandSpec } from "@/lmentor/api";
import type { RosterAgentProfile, RosterModuleSnapshot } from "@/types";

async function safeInvoke<T>(
  cmd: string | LmentorCommandSpec<any>,
  args?: Record<string, unknown>,
): Promise<T | null> {
  try {
    return await invokeLmentor<T>(cmd, args);
  } catch {
    return null;
  }
}

interface RosterAgentContextValue {
  lineageName: string;
  userName: string;
  agents: RosterAgentProfile[];
  activeId: string | null;
  active: RosterAgentProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
  saveLineage: (lineageName: string) => Promise<void>;
  saveIdentity: (identity: { lineageName?: string; userName?: string }) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
}

const RosterAgentContext = createContext<RosterAgentContextValue>(null!);

function normalizeSnapshot(snapshot: RosterModuleSnapshot | null) {
  const agents = snapshot?.agents ?? [];
  const lineageName = String(snapshot?.lineage_name || "").trim();
  const userName = String(snapshot?.user_name || "").trim();
  const activeId = snapshot?.active_agent_id || agents[0]?.id || null;
  const active = agents.find((agent) => agent.id === activeId) ?? agents[0] ?? null;
  return { lineageName, userName, agents, activeId, active };
}

export function RosterAgentProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<RosterModuleSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await safeInvoke<RosterModuleSnapshot>(lmentorCommands.agents.rosterModule);
    if (next) {
      setSnapshot(next);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen<{ reason?: string }>("workspace-data-changed", async () => {
      if (cancelled) return;
      await refresh();
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenFn = fn;
      }
    }).catch(() => {});

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [refresh]);

  const setActive = useCallback(async (id: string) => {
    const next = await safeInvoke<RosterModuleSnapshot>(lmentorCommands.agents.setRosterActive, { id });
    if (next) {
      setSnapshot(next);
      return;
    }
    await refresh();
  }, [refresh]);

  const saveLineage = useCallback(async (lineageName: string) => {
    const next = await safeInvoke<RosterModuleSnapshot>(lmentorCommands.agents.saveRosterLineage, { lineage_name: lineageName });
    if (next) {
      setSnapshot(next);
      return;
    }
    await refresh();
  }, [refresh]);

  const saveIdentity = useCallback(async ({ lineageName, userName }: { lineageName?: string; userName?: string }) => {
    const next = await safeInvoke<RosterModuleSnapshot>(lmentorCommands.agents.saveRosterIdentity, {
      lineage_name: lineageName,
      user_name: userName,
    });
    if (next) {
      setSnapshot(next);
      return;
    }
    await refresh();
  }, [refresh]);

  const deleteAgent = useCallback(async (id: string) => {
    const next = await safeInvoke<RosterModuleSnapshot>(lmentorCommands.agents.deleteRosterAgent, { id });
    if (next) {
      setSnapshot(next);
      return;
    }
    await refresh();
  }, [refresh]);

  const value = useMemo(() => {
    const normalized = normalizeSnapshot(snapshot);
    return {
      ...normalized,
      loading,
      refresh,
      setActive,
      saveLineage,
      saveIdentity,
      deleteAgent,
    };
  }, [deleteAgent, loading, refresh, saveIdentity, saveLineage, setActive, snapshot]);

  return (
    <RosterAgentContext.Provider value={value}>
      {children}
    </RosterAgentContext.Provider>
  );
}

export const useRosterAgent = () => useContext(RosterAgentContext);
