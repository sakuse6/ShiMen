const isBrowser = typeof window !== "undefined";

class BrowserWindowHandle {
  async isMaximized(): Promise<boolean> {
    return false;
  }

  async minimize(): Promise<void> {
    return;
  }

  async toggleMaximize(): Promise<void> {
    return;
  }

  async close(): Promise<void> {
    return;
  }

  async setFocus(): Promise<void> {
    if (isBrowser) {
      window.focus();
    }
  }

  async startDragging(): Promise<void> {
    return;
  }

  async destroy(): Promise<void> {
    if (isBrowser && window.location.search.includes("floating=")) {
      window.close();
    }
  }

  async isFullscreen(): Promise<boolean> {
    return false;
  }

  async outerPosition(): Promise<{ x: number; y: number }> {
    return { x: 0, y: 0 };
  }

  async outerSize(): Promise<{ width: number; height: number }> {
    return {
      width: isBrowser ? window.innerWidth : 1280,
      height: isBrowser ? window.innerHeight : 800,
    };
  }

  async onResized(handler: () => void | Promise<void>): Promise<() => void> {
    if (!isBrowser) return () => {};
    const listener = () => {
      void handler();
    };
    window.addEventListener("resize", listener);
    return () => window.removeEventListener("resize", listener);
  }
}

const currentWindow = new BrowserWindowHandle();

export function getCurrentWindow(): BrowserWindowHandle {
  return currentWindow;
}
