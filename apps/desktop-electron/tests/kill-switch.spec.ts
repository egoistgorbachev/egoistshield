import { describe, expect, it, vi, beforeEach } from "vitest";

// Мокаем child_process.execFile чтобы не вызывать реальные netsh команды
vi.mock("node:child_process", () => {
    const mockExecFile = vi.fn(
        (_cmd: string, _args: string[], cb?: Function) => {
            // Имитируем успешное выполнение
            if (typeof cb === "function") cb(null, "", "");
        }
    );
    return {
        execFile: mockExecFile,
    };
});

// Мокаем promisify чтобы вернуть async-обёртку мока
vi.mock("node:util", () => ({
    promisify: (fn: Function) =>
        (...args: any[]) =>
            new Promise<void>((resolve, reject) => {
                fn(...args, (err: any) => {
                    if (err) reject(err);
                    else resolve();
                });
            }),
}));

// Импортируем ПОСЛЕ моков
const { KillSwitch } = await import("../electron/ipc/kill-switch");

describe("KillSwitch", () => {
    let ks: InstanceType<typeof KillSwitch>;

    beforeEach(() => {
        ks = new KillSwitch();
        vi.clearAllMocks();
    });

    it("isActive() по умолчанию false", () => {
        expect(ks.isActive()).toBe(false);
    });

    it("enable() устанавливает active = true", async () => {
        await ks.enable(10809, "/path/to/xray.exe");
        expect(ks.isActive()).toBe(true);
    });

    it("enable() не дублируется при повторном вызове", async () => {
        await ks.enable(10809, "/path/to/xray.exe");
        await ks.enable(10809, "/path/to/xray.exe");
        expect(ks.isActive()).toBe(true);
    });

    it("disable() устанавливает active = false", async () => {
        await ks.enable(10809, "/path/to/xray.exe");
        await ks.disable();
        expect(ks.isActive()).toBe(false);
    });

    it("disable() безопасна при отсутствии правил", async () => {
        await ks.disable();
        expect(ks.isActive()).toBe(false);
    });
});
