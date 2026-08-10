import { getBridgeBaseUrl } from "./core";

export interface OpenDialogOptions {
  multiple?: boolean;
  directory?: boolean;
}

interface BridgeDialogResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const tauriWindow = window as typeof window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__);
}

async function openViaTauri(
  options?: OpenDialogOptions,
): Promise<string | string[] | null> {
  const mod = await import("@tauri-apps/plugin-dialog");
  return mod.open(options);
}

async function openViaBridge(
  options?: OpenDialogOptions,
): Promise<string | string[] | null> {
  const route = options?.directory ? "open_directory_dialog" : "open_file_dialog";
  const response = await fetch(`${getBridgeBaseUrl()}/api/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      command: route,
      args: {
        multiple: Boolean(options?.multiple),
      },
    }),
  });

  let payload: BridgeDialogResponse<string | string[] | null> | null = null;
  try {
    payload = (await response.json()) as BridgeDialogResponse<string | string[] | null>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "\u539f\u751f\u9009\u62e9\u5668\u8c03\u7528\u5931\u8d25\u3002");
  }

  return payload.result ?? null;
}

export async function open(
  options?: OpenDialogOptions,
): Promise<string | string[] | null> {
  if (!isTauriRuntime()) {
    return openViaBridge(options);
  }

  try {
    return await openViaTauri(options);
  } catch (tauriError) {
    try {
      return await openViaBridge(options);
    } catch (bridgeError) {
      const tauriText = tauriError instanceof Error ? tauriError.message : String(tauriError);
      const bridgeText = bridgeError instanceof Error ? bridgeError.message : String(bridgeError);
      throw new Error(`\u65e0\u6cd5\u6253\u5f00\u7cfb\u7edf\u9009\u62e9\u5668\u3002Tauri: ${tauriText}\uff1bBridge: ${bridgeText}`);
    }
  }
}
