export interface EnvironmentSnapshot {
  node_installed: boolean;
  node_version: string | null;
  npm_installed: boolean;
  npm_version: string | null;
  python_installed: boolean;
  python_version: string | null;
}

export interface ChatSessionResponse {
  agent_id: string;
  session_id: string;
  process_id: number;
}
