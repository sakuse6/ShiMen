import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@/lmentor/platform/core";
import type { LmentorCommandSpec } from "./contracts";
import { resolveLmentorRoute } from "./contracts";

interface UseInvokeResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: (silent?: boolean) => Promise<T>;
  setData: (data: T | null) => void;
}

export async function invokeLmentor<T>(
  command: string | LmentorCommandSpec<any>,
  args?: Record<string, unknown>,
): Promise<T> {
  const route = resolveLmentorRoute(command);
  if (!route) {
    throw new Error("Lmentor 调用了空接口路由，请检查前端命令映射。");
  }

  return invoke<T>(route, args);
}

export function useLmentorQuery<T>(
  command: string | LmentorCommandSpec<any>,
  args?: Record<string, unknown>,
  refreshKey?: number | string,
): UseInvokeResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const nextRequestIdRef = useRef(0);
  const appliedRequestIdRef = useRef(0);
  const pendingForegroundCountRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyIfFreshEnough = useCallback((requestId: number, apply: () => void) => {
    if (!mountedRef.current) return;
    if (requestId < appliedRequestIdRef.current) return;
    appliedRequestIdRef.current = requestId;
    apply();
  }, []);

  const finishForegroundRequest = useCallback((isForeground: boolean) => {
    if (!isForeground) return;
    pendingForegroundCountRef.current = Math.max(0, pendingForegroundCountRef.current - 1);
    if (mountedRef.current) {
      setLoading(pendingForegroundCountRef.current > 0);
    }
  }, []);

  const fetch = useCallback((silent?: boolean): Promise<T> => {
    const requestId = ++nextRequestIdRef.current;
    const isForeground = !silent;
    if (isForeground) {
      pendingForegroundCountRef.current += 1;
      setLoading(true);
    }
    setError(null);

    if (typeof command === "string" && !command.trim()) {
      applyIfFreshEnough(requestId, () => setData(null));
      finishForegroundRequest(isForeground);
      return Promise.resolve(null as unknown as T);
    }

    const route = resolveLmentorRoute(command);
    if (!route) {
      applyIfFreshEnough(requestId, () => setData(null));
      finishForegroundRequest(isForeground);
      return Promise.resolve(null as unknown as T);
    }

    return invoke<T>(route, args)
      .then((result) => {
        applyIfFreshEnough(requestId, () => setData(result));
        finishForegroundRequest(isForeground);
        return result;
      })
      .catch((err) => {
        applyIfFreshEnough(requestId, () => setError(String(err)));
        finishForegroundRequest(isForeground);
        throw err;
      });
  }, [applyIfFreshEnough, command, finishForegroundRequest, JSON.stringify(args)]);

  useEffect(() => {
    fetch().catch((err) => {
      if (import.meta.env.DEV) console.warn("[useLmentorQuery] fetch failed:", err);
    });
  }, [fetch, refreshKey]);

  return { data, loading, error, refetch: fetch, setData };
}
