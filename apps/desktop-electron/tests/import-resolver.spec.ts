import { describe, expect, it } from "vitest";
import { resolveImportPayload } from "../electron/ipc/import-resolver";

describe("import-resolver", () => {
  it("загружает подписку по URL и парсит узлы", async () => {
    const payload = "https://example.com/subscription";
    const vless = "vless://11111111-1111-1111-1111-111111111111@1.2.3.4:443?security=tls#AutoSub";

    const result = await resolveImportPayload(payload, async (url) => {
      expect(url).toBe(payload);
      return { text: vless, userinfo: null };
    });

    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0]?.protocol).toBe("vless");
    expect(result.issues.length).toBe(0);
  });

  it("возвращает предупреждение при недоступной подписке", async () => {
    const payload = "https://down.example/sub";
    const result = await resolveImportPayload(payload, async () => {
      throw new Error("HTTP 403");
    });

    expect(result.nodes.length).toBe(0);
    expect(result.issues.length).toBe(1);
    expect(result.issues[0]).toContain("Не удалось загрузить подписку");
  });

  it("парсит JSON-подписку из URL", async () => {
    const payload = "https://example.com/sub.json";
    const responseJson = JSON.stringify({
      outbounds: [
        {
          type: "hysteria2",
          server: "6.6.6.6",
          server_port: 443,
          password: "secret",
          tls: { enabled: true, server_name: "example.com" }
        }
      ]
    });

    const result = await resolveImportPayload(payload, async () => ({ text: responseJson, userinfo: null }));
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0]?.protocol).toBe("hysteria2");
  });

  it("обрабатывает несколько ссылок подписок в одном импорте", async () => {
    const payload = ["https://example.com/sub-a", "https://example.com/sub-b"].join("\n");
    const result = await resolveImportPayload(payload, async (url) => {
      if (url.endsWith("sub-a")) {
        return { text: "trojan://password@7.7.7.7:443#A", userinfo: null };
      }
      return { text: "vless://11111111-1111-1111-1111-111111111111@8.8.8.8:443?security=tls#B", userinfo: null };
    });

    expect(result.nodes.length).toBe(2);
    expect(result.issues.length).toBe(0);
  });
});
