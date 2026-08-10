import { canInvokeGateway, invokeGateway } from "../runtime/gateway";

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:4318";
const BRIDGE_RETRY_MS = 5000;
const BRIDGE_REQUEST_TIMEOUT_MS = 15000;

type BridgeState = "unknown" | "available" | "unavailable";

let bridgeState: BridgeState = "unknown";
let lastBridgeFailureAt = 0;

interface BridgeInvokeResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
  fallback?: boolean;
  noFallback?: boolean;
}

interface BridgeDebugInfo {
  bridgeUrl: string;
  command: string;
  timestamp: string;
  httpStatus?: number;
  httpStatusText?: string;
  responseText?: string;
}

type BridgeInvokeError = Error & {
  fallback?: boolean;
  noFallback?: boolean;
  bridgeDebug?: BridgeDebugInfo;
};

declare global {
  interface Window {
    __LMENTOR_RUNTIME__?: {
      bridgeUrl?: string;
    };
  }
}

export function getBridgeBaseUrl(): string {
  const runtimeValue = window.__LMENTOR_RUNTIME__?.bridgeUrl;
  if (typeof runtimeValue === "string" && runtimeValue.trim()) {
    return runtimeValue.trim();
  }
  const value = import.meta.env.VITE_LMENTOR_BRIDGE_URL;
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_BRIDGE_URL;
}

function shouldSkipBridgeProbe(command: string): boolean {
  if (!canInvokeGateway(command)) return false;
  return bridgeState === "unavailable" && Date.now() - lastBridgeFailureAt < BRIDGE_RETRY_MS;
}

async function invokeBridge<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRIDGE_REQUEST_TIMEOUT_MS);
  const bridgeUrl = `${getBridgeBaseUrl()}/api/invoke`;

  try {
    const response = await fetch(bridgeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, args: args ?? {} }),
      signal: controller.signal,
    });

    let payload: BridgeInvokeResponse<T> | null = null;
    let responseText = "";
    try {
      responseText = await response.text();
      payload = responseText ? (JSON.parse(responseText) as BridgeInvokeResponse<T>) : null;
    } catch {
      payload = null;
    }

    if (!response.ok || !payload?.ok) {
      const parts = [
        `bridge 调用失败：${command}`,
        `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
      ];
      if (payload?.error) {
        parts.push(`错误：${payload.error}`);
      } else if (responseText.trim()) {
        parts.push(`响应：${responseText.trim().slice(0, 800)}`);
      }
      const error = new Error(parts.join(" | ")) as BridgeInvokeError;
      error.fallback = payload?.fallback;
      error.noFallback = payload?.noFallback;
      error.bridgeDebug = {
        bridgeUrl,
        command,
        timestamp: new Date().toISOString(),
        httpStatus: response.status,
        httpStatusText: response.statusText,
        responseText: responseText.slice(0, 4000),
      };
      throw error;
    }

    bridgeState = "available";
    return payload.result as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      const timeoutError = new Error(`调用 bridge 超时：${command}（${BRIDGE_REQUEST_TIMEOUT_MS}ms）`) as BridgeInvokeError;
      timeoutError.bridgeDebug = {
        bridgeUrl,
        command,
        timestamp: new Date().toISOString(),
      };
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!shouldSkipBridgeProbe(command)) {
    try {
      return await invokeBridge<T>(command, args);
    } catch (error) {
      const typed = error as Error & { fallback?: boolean; noFallback?: boolean };
      if (typed.noFallback) {
        throw error;
      }
      if (typed.fallback) {
        return invokeGateway<T>(command, args);
      }
      if (!canInvokeGateway(command)) {
        throw error;
      }
      bridgeState = "unavailable";
      lastBridgeFailureAt = Date.now();
    }
  }

  return invokeGateway<T>(command, args);
}

