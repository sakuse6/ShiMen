import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { type AgentStatus, CapabilitySet } from "./types";
import { invokeLmentor, lmentorCommands, type LmentorCommandSpec } from "@/lmentor/api";

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

interface AgentContextValue {
  agents: AgentStatus[];
  activeId: string | null;
  active: AgentStatus | null;
  capabilities: CapabilitySet | null;
  setActive: (id: string) => Promise<void>;
  refreshHealth: () => Promise<void>;
  installHint: (id: string) => string | null;
}

export const AgentContext = createContext<AgentContextValue>(null!);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [list, active] = await Promise.all([
        safeInvoke<AgentStatus[]>(lmentorCommands.agents.list),
        safeInvoke<string>(lmentorCommands.agents.active),
      ]);
      if (list) setAgents(list);
      if (active) setActiveId(active);
      await safeInvoke(lmentorCommands.agents.refreshHealth);
      const refreshed = await safeInvoke<AgentStatus[]>(lmentorCommands.agents.list);
      if (refreshed) setAgents(refreshed);
    })();
  }, []);

  const setActive = useCallback(async (id: string) => {
    await safeInvoke(lmentorCommands.agents.setActive, { id });
    setActiveId(id);
  }, []);

  const refreshHealth = useCallback(async () => {
    await safeInvoke(lmentorCommands.agents.refreshHealth);
    const list = await safeInvoke<AgentStatus[]>(lmentorCommands.agents.list);
    if (list) setAgents(list);
  }, []);

  const active = useMemo(
    () => agents.find((a) => a.id === activeId) ?? null,
    [agents, activeId],
  );

  const capabilities = useMemo(
    () => (active ? new CapabilitySet(active.capabilities) : null),
    [active],
  );

  const installHint = useCallback(
    (id: string) => agents.find((a) => a.id === id)?.install_hint ?? null,
    [agents],
  );

  return (
    <AgentContext.Provider
      value={{
        agents,
        activeId,
        active,
        capabilities,
        setActive,
        refreshHealth,
        installHint,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export const useAgent = () => useContext(AgentContext);
