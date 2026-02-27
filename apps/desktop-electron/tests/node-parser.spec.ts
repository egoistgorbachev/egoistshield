import { describe, expect, it } from "vitest";
import { isLikelyUnsupportedPlaceholderText, parseNodeUri, parseNodesFromText } from "../electron/ipc/node-parser";

describe("node-parser", () => {
  it("парсит VLESS URI", () => {
    const uri =
      "vless://11111111-1111-1111-1111-111111111111@1.2.3.4:443?security=reality&sni=www.google.com&pbk=testkey&fp=chrome&type=tcp#VLESS-Reality-AMS";
    const node = parseNodeUri(uri);
    expect(node).not.toBeNull();
    expect(node?.protocol).toBe("vless");
    expect(node?.server).toBe("1.2.3.4");
    expect(node?.port).toBe(443);
  });

  it("парсит VMESS URI", () => {
    const json = JSON.stringify({
      v: "2",
      ps: "VMESS-DE",
      add: "10.10.10.10",
      port: "443",
      id: "11111111-1111-1111-1111-111111111111",
      aid: "0",
      net: "tcp"
    });
    const uri = `vmess://${Buffer.from(json, "utf8").toString("base64")}`;
    const node = parseNodeUri(uri);
    expect(node).not.toBeNull();
    expect(node?.protocol).toBe("vmess");
    expect(node?.name).toBe("VMESS-DE");
  });

  it("разбирает многострочный вход и отбрасывает мусор", () => {
    const input = `
vless://11111111-1111-1111-1111-111111111111@1.1.1.1:443?security=tls#One
invalid-line
trojan://password@2.2.2.2:443#Two
`.trim();
    const result = parseNodesFromText(input);
    expect(result.nodes.length).toBe(2);
    expect(result.issues.length).toBe(1);
  });

  it("разбирает base64-подписку со списком URI", () => {
    const raw = [
      "vless://11111111-1111-1111-1111-111111111111@1.1.1.1:443?security=tls#one",
      "trojan://secret@2.2.2.2:443#two"
    ].join("\n");
    const encoded = Buffer.from(raw, "utf8").toString("base64");
    const result = parseNodesFromText(encoded);
    expect(result.nodes.length).toBe(2);
    expect(result.issues.length).toBe(0);
  });

  it("парсит Clash YAML подписку", () => {
    const yaml = `
proxies:
  - name: Clash-VLESS
    type: vless
    server: 1.2.3.4
    port: 443
    uuid: 11111111-1111-1111-1111-111111111111
    tls: true
    servername: www.google.com
`;

    const result = parseNodesFromText(yaml);
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0]?.protocol).toBe("vless");
    expect(result.issues.length).toBe(0);
  });

  it("отсеивает App not supported заглушки", () => {
    const encoded = Buffer.from(
      "vless://11111111-1111-1111-1111-111111111111@0.0.0.0:1?security=&type=tcp#App%20not%20supported",
      "utf8"
    ).toString("base64");

    const result = parseNodesFromText(encoded);
    expect(result.nodes.length).toBe(0);
    expect(result.issues.some((item) => item.includes("заглушку"))).toBe(true);
    expect(isLikelyUnsupportedPlaceholderText(encoded)).toBe(true);
  });

  it("парсит SOCKS и HTTP proxy URI", () => {
    const input = [
      "socks://user:pass@10.10.10.10:1080#SOCKS-Proxy",
      "http://proxy:secret@20.20.20.20:3128#HTTP-Proxy"
    ].join("\n");
    const result = parseNodesFromText(input);
    expect(result.nodes.length).toBe(2);
    expect(result.nodes[0]?.protocol).toBe("socks");
    expect(result.nodes[1]?.protocol).toBe("http");
  });

  it("парсит hy2/tuic/wireguard URI", () => {
    const input = [
      "hy2://secret@example.com:443?sni=example.com#HY2",
      "tuic://11111111-1111-1111-1111-111111111111:pass@example.com:443#TUIC",
      "wireguard://private_key@example.com:51820?publickey=peer_pub_key&address=10.7.0.2/32#WG"
    ].join("\n");
    const result = parseNodesFromText(input);
    expect(result.nodes.length).toBe(3);
    expect(result.nodes.some((item) => item.protocol === "hysteria2")).toBe(true);
    expect(result.nodes.some((item) => item.protocol === "tuic")).toBe(true);
    expect(result.nodes.some((item) => item.protocol === "wireguard")).toBe(true);
  });

  it("парсит Xray JSON config с outbounds", () => {
    const config = {
      outbounds: [
        {
          tag: "proxy-main",
          protocol: "vless",
          settings: {
            vnext: [
              {
                address: "3.3.3.3",
                port: 443,
                users: [{ id: "11111111-1111-1111-1111-111111111111", flow: "xtls-rprx-vision" }]
              }
            ]
          },
          streamSettings: {
            network: "tcp",
            security: "tls",
            tlsSettings: { serverName: "example.com", fingerprint: "chrome" }
          }
        },
        { tag: "direct", protocol: "freedom" }
      ]
    };

    const result = parseNodesFromText(JSON.stringify(config));
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0]?.protocol).toBe("vless");
    expect(result.issues.some((item) => item.includes("неподдерживаемый"))).toBe(false);
  });

  it("парсит sing-box JSON config с outbounds", () => {
    const config = {
      outbounds: [
        {
          tag: "tuic-main",
          type: "tuic",
          server: "4.4.4.4",
          server_port: 443,
          uuid: "11111111-1111-1111-1111-111111111111",
          password: "secret",
          tls: { enabled: true, server_name: "example.com" }
        },
        { tag: "direct", type: "direct" }
      ]
    };

    const result = parseNodesFromText(JSON.stringify(config));
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0]?.protocol).toBe("tuic");
  });

  it("парсит JSON с proxies (clash-формат)", () => {
    const config = {
      proxies: [
        {
          name: "SS-json",
          type: "ss",
          server: "5.5.5.5",
          port: 8388,
          cipher: "aes-128-gcm",
          password: "pwd"
        }
      ]
    };

    const result = parseNodesFromText(JSON.stringify(config));
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0]?.protocol).toBe("shadowsocks");
  });
});
