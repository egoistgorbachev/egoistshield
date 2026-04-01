import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ExposedApi = {
  traffic: {
    onUpdate(callback: (data: { rx: number; tx: number }) => void): () => void;
  };
  updater: {
    onUpdateAvailable(callback: (data: { version: string }) => void): () => void;
  };
  autoConnect: {
    onAutoConnect(callback: (serverId: string) => void): () => void;
  };
};

describe("preload listener subscriptions", () => {
  let emitter: EventEmitter;
  let exposedApi: ExposedApi;

  beforeEach(async () => {
    vi.resetModules();
    emitter = new EventEmitter();
    exposedApi = {} as ExposedApi;

    const ipcRenderer = {
      invoke: vi.fn(),
      on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
        emitter.on(channel, listener);
        return ipcRenderer;
      }),
      off: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
        emitter.off(channel, listener);
        return ipcRenderer;
      })
    };

    vi.doMock("electron", () => ({
      contextBridge: {
        exposeInMainWorld: vi.fn((_key: string, api: ExposedApi) => {
          exposedApi = api;
        })
      },
      ipcRenderer
    }));

    await import("../electron/preload");
  });

  it("traffic listener removes only its own subscription", () => {
    const first = vi.fn();
    const second = vi.fn();

    const disposeFirst = exposedApi.traffic.onUpdate(first);
    exposedApi.traffic.onUpdate(second);

    emitter.emit("traffic-update", {}, { rx: 1, tx: 2 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    disposeFirst();
    emitter.emit("traffic-update", {}, { rx: 3, tx: 4 });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("auto-connect listener can be unsubscribed without affecting future events", () => {
    const callback = vi.fn();

    const dispose = exposedApi.autoConnect.onAutoConnect(callback);

    emitter.emit("auto-connect", {}, "server-1");
    expect(callback).toHaveBeenCalledWith("server-1");

    dispose();
    emitter.emit("auto-connect", {}, "server-2");
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("updater listener returns disposer and stops receiving updates after cleanup", () => {
    const callback = vi.fn();

    const dispose = exposedApi.updater.onUpdateAvailable(callback);

    emitter.emit("update-available", {}, { version: "3.4.1" });
    expect(callback).toHaveBeenCalledWith({ version: "3.4.1" });

    dispose();
    emitter.emit("update-available", {}, { version: "3.4.2" });
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
