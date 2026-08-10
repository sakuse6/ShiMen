type EventHandler<T = unknown> = (event: { payload: T }) => void | Promise<void>;

class LmentorEventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  async emit<T>(eventName: string, payload: T): Promise<void> {
    const listeners = Array.from(this.handlers.get(eventName) ?? []);
    await Promise.all(listeners.map((listener) => Promise.resolve(listener({ payload }))));
  }

  listen<T>(eventName: string, handler: EventHandler<T>): () => void {
    const set = this.handlers.get(eventName) ?? new Set<EventHandler>();
    set.add(handler as EventHandler);
    this.handlers.set(eventName, set);
    return () => {
      const current = this.handlers.get(eventName);
      if (!current) return;
      current.delete(handler as EventHandler);
      if (current.size === 0) {
        this.handlers.delete(eventName);
      }
    };
  }
}

export const lmentorEventBus = new LmentorEventBus();
