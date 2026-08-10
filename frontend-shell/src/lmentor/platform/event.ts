import { lmentorEventBus } from "./event-bus";

export async function emit<T>(eventName: string, payload: T): Promise<void> {
  await lmentorEventBus.emit(eventName, payload);
}

export async function listen<T>(
  eventName: string,
  handler: (event: { payload: T }) => void | Promise<void>,
): Promise<() => void> {
  return lmentorEventBus.listen(eventName, handler);
}
