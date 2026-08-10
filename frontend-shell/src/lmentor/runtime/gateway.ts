const PREF_KEYS = {
  theme: "lmentor-theme",
  fontBase: "lmentor-font-base",
  fontProse: "lmentor-font-prose",
  language: "lmentor-lang",
};

const GATEWAY_COMMANDS = new Set([
  "load_theme",
  "save_theme",
  "load_font_sizes",
  "save_font_sizes",
  "save_language",
  "open_url",
]);

function readStorage(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

function bridgeUnavailable(command: string): never {
  throw new Error(`Lmentor bridge \u5f53\u524d\u4e0d\u53ef\u7528\uff0c\u65e0\u6cd5\u6267\u884c\u547d\u4ee4\uff1a${command}`);
}

export function canInvokeGateway(command: string): boolean {
  return GATEWAY_COMMANDS.has(command);
}

export async function invokeGateway<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  switch (command) {
    case "load_theme":
      return readStorage(PREF_KEYS.theme, "dark") as T;
    case "save_theme":
      writeStorage(PREF_KEYS.theme, String(args.theme ?? "dark"));
      return undefined as T;
    case "load_font_sizes":
      return [readStorage(PREF_KEYS.fontBase, "s"), readStorage(PREF_KEYS.fontProse, "s")] as T;
    case "save_font_sizes":
      writeStorage(PREF_KEYS.fontBase, String(args.fontSizeBase ?? "s"));
      writeStorage(PREF_KEYS.fontProse, String(args.fontSizeProse ?? args.fontSizeBase ?? "s"));
      return undefined as T;
    case "save_language":
      writeStorage(PREF_KEYS.language, "zh");
      return undefined as T;
    case "open_url": {
      const url = String(args.url ?? "");
      if (typeof window !== "undefined" && url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      return undefined as T;
    }
    default:
      bridgeUnavailable(command);
  }
}

