export class WebviewWindow {
  readonly label: string;
  private readonly url: string;

  constructor(label: string, options: { url: string }) {
    this.label = label;
    this.url = options.url;
    if (typeof window !== "undefined") {
      window.open(this.url, this.label, "width=320,height=120");
    }
  }

  async setFocus(): Promise<void> {
    return;
  }

  once(_eventName: string, _handler: () => void): void {
    return;
  }

  async close(): Promise<void> {
    return;
  }
}
