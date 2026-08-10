import { invokeLmentor, useLmentorQuery } from "@/lmentor/api";
import type { LmentorCommandSpec } from "@/lmentor/api";

interface UseInvokeResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: (silent?: boolean) => Promise<T>;
  setData: (data: T | null) => void;
}

export function useInvoke<T>(
  command: string | LmentorCommandSpec<any>,
  args?: Record<string, unknown>,
  refreshKey?: number | string,
): UseInvokeResult<T> {
  return useLmentorQuery(command, args, refreshKey);
}

export async function invokeCommand<T>(
  command: string | LmentorCommandSpec<any>,
  args?: Record<string, unknown>,
): Promise<T> {
  return invokeLmentor(command, args);
}
