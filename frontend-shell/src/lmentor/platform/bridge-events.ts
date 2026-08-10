import { lmentorEventBus } from "./event-bus";
import { getBridgeBaseUrl } from "./core";

let started = false;
let source: EventSource | null = null;

export function startBridgeEvents(): void {
  if (started || typeof window === "undefined" || typeof EventSource === "undefined") {
    return;
  }
  started = true;

  try {
    source = new EventSource(`${getBridgeBaseUrl()}/api/events`);
    source.onopen = () => {
      void lmentorEventBus.emit("workspace-data-changed", { reason: "bridge-connected" });
    };
    source.onmessage = (event) => {
      if (!event.data) return;

      try {
        const payload = JSON.parse(event.data);
        void lmentorEventBus.emit("agent-event", payload);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn("[bridge-events] failed to parse event payload:", error);
        }
      }
    };
    source.onerror = () => {
      if (import.meta.env.DEV) {
        console.warn("[bridge-events] connection unavailable, runtime will fall back when needed.");
      }
    };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[bridge-events] failed to start:", error);
    }
  }
}

export function stopBridgeEvents(): void {
  source?.close();
  source = null;
  started = false;
}
