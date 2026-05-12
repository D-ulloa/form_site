import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

export interface AgentData {
  agent_user_id: string;
  agent_name: string;
  agent_email: string;
}

interface AgentContextValue {
  agent: AgentData | null;
  isConfigured: boolean;
  setAgent: (data: AgentData) => void;
  clearAgent: () => void;
}

const STORAGE_KEY = 'form_site_agent';

function loadFromStorage(): AgentData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AgentData;
    if (parsed.agent_user_id && parsed.agent_name && parsed.agent_email) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agent, setAgentState] = useState<AgentData | null>(loadFromStorage);

  const setAgent = useCallback((data: AgentData) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setAgentState(data);
  }, []);

  const clearAgent = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAgentState(null);
  }, []);

  return (
    <AgentContext.Provider
      value={{ agent, isConfigured: agent !== null, setAgent, clearAgent }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgent must be used within AgentProvider');
  return ctx;
}
