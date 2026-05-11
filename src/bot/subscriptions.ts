export type Symbol = "BTCUSDT" | "ETHUSDT";
export type SnapMode = "single" | "both";

export interface Subscription {
  symbols: Symbol[];
  mode: SnapMode;
  intervalMs: number;
  timer: ReturnType<typeof setInterval>;
  count: number;
  startedAt: Date;
}

const active = new Map<number | string, Subscription>();

export function hasSubscription(chatId: number | string): boolean {
  return active.has(chatId);
}

export function getSubscription(chatId: number | string): Subscription | undefined {
  return active.get(chatId);
}

export function addSubscription(
  chatId: number | string,
  symbols: Symbol[],
  mode: SnapMode,
  intervalMs: number,
  timer: ReturnType<typeof setInterval>
): void {
  active.set(chatId, { symbols, mode, intervalMs, timer, count: 0, startedAt: new Date() });
}

export function removeSubscription(chatId: number | string): Subscription | undefined {
  const sub = active.get(chatId);
  if (!sub) return undefined;
  clearInterval(sub.timer);
  active.delete(chatId);
  return sub;
}
