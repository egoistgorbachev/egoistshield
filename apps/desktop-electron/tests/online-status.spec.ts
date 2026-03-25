// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Тесты для online/offline event-модели,
 * используемой хуком useOnlineStatus.
 *
 * Среда: jsdom (для window, navigator.onLine)
 */

describe("useOnlineStatus", () => {
  let listeners: Map<string, Set<() => void>>;

  const getListenerSet = (event: string): Set<() => void> => {
    const existingListeners = listeners.get(event);
    if (existingListeners) {
      return existingListeners;
    }

    const nextListeners = new Set<() => void>();
    listeners.set(event, nextListeners);
    return nextListeners;
  };

  beforeEach(() => {
    listeners = new Map();

    vi.spyOn(window, "addEventListener").mockImplementation(((
      event: string,
      handler: EventListenerOrEventListenerObject
    ) => {
      getListenerSet(event).add(handler as () => void);
    }) as typeof window.addEventListener);

    vi.spyOn(window, "removeEventListener").mockImplementation(((
      event: string,
      handler: EventListenerOrEventListenerObject
    ) => {
      listeners.get(event)?.delete(handler as () => void);
    }) as typeof window.removeEventListener);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("navigator.onLine возвращает boolean", () => {
    expect(typeof navigator.onLine).toBe("boolean");
  });

  it("subscribe регистрирует online и offline listeners", () => {
    const callback = vi.fn();
    window.addEventListener("online", callback);
    window.addEventListener("offline", callback);

    expect(listeners.has("online")).toBe(true);
    expect(listeners.has("offline")).toBe(true);
  });

  it("events online/offline триггерят callbacks", () => {
    const callback = vi.fn();

    window.addEventListener("online", callback);
    window.addEventListener("offline", callback);

    // Триггерим online
    for (const listener of listeners.get("online") ?? []) {
      listener();
    }
    expect(callback).toHaveBeenCalledTimes(1);

    // Триггерим offline
    for (const listener of listeners.get("offline") ?? []) {
      listener();
    }
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("removeEventListener очищает callbacks", () => {
    const callback = vi.fn();

    window.addEventListener("online", callback);
    expect(listeners.get("online")?.has(callback)).toBe(true);

    window.removeEventListener("online", callback);
    expect(listeners.get("online")?.has(callback)).toBe(false);
  });

  it("subscribe и unsubscribe корректно работают", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    window.addEventListener("online", cb1);
    window.addEventListener("offline", cb2);

    expect(listeners.get("online")?.size).toBe(1);
    expect(listeners.get("offline")?.size).toBe(1);

    window.removeEventListener("online", cb1);
    window.removeEventListener("offline", cb2);

    expect(listeners.get("online")?.size).toBe(0);
    expect(listeners.get("offline")?.size).toBe(0);
  });
});
