import { describe, expect, it } from "vitest";
import {
  createWindowsDnsScript,
  parseDnsServers,
  resetSystemDnsServers,
  setSystemDnsServers
} from "../electron/ipc/system-dns";
import { splitDnsServersByFamily } from "../shared/system-dns";

describe("system DNS helpers", () => {
  it("парсит, дедуплицирует и нормализует список DNS серверов", () => {
    // Arrange
    const rawInput = "1.1.1.1, 1.0.0.1\n8.8.8.8 1.1.1.1";

    // Act
    const servers = parseDnsServers(rawInput);

    // Assert
    expect(servers).toEqual(["1.1.1.1", "1.0.0.1", "8.8.8.8"]);
  });

  it("отклоняет некорректный DNS адрес", () => {
    // Arrange
    const rawInput = "1.1.1.1, not-an-ip";

    // Act
    const parse = () => parseDnsServers(rawInput);

    // Assert
    expect(parse).toThrow(
      "Некорректный DNS-адрес: not-an-ip. Для системного DNS Windows поддерживаются IP-адреса, host:port или URL с IP-хостом."
    );
  });

  it("нормализует IP:port и URL с IP-хостом", () => {
    // Arrange
    const rawInput = "1.1.1.1:53 https://8.8.8.8/dns-query [2606:4700:4700::1111]:853";

    // Act
    const servers = parseDnsServers(rawInput);

    // Assert
    expect(servers).toEqual(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]);
  });

  it("разделяет DNS-серверы по адресным семействам", () => {
    // Arrange
    const servers = ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"];

    // Act
    const result = splitDnsServersByFamily(servers);

    // Assert
    expect(result).toEqual({
      servers,
      ipv4Servers: ["1.1.1.1", "8.8.8.8"],
      ipv6Servers: ["2606:4700:4700::1111"]
    });
  });

  it("строит Windows-скрипт с fallback на netsh и верификацией", () => {
    // Arrange
    const families = splitDnsServersByFamily(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]);

    // Act
    const script = createWindowsDnsScript({
      reset: false,
      servers: families
    });

    // Assert
    expect(script).toContain("Get-NetRoute -DestinationPrefix '0.0.0.0/0'");
    expect(script).toContain("Get-NetIPInterface");
    expect(script).toContain("Set-DnsClientServerAddress -InterfaceIndex $ifaceIndex -ServerAddresses $dnsServers");
    expect(script).toContain("netsh interface ipv4 set dnsservers");
    expect(script).toContain("netsh interface ipv6 set dnsservers");
    expect(script).toContain("Get-DnsClientServerAddress -InterfaceIndex $verifyIndices");
  });

  it("строит reset-скрипт с возвратом DNS в DHCP", () => {
    // Arrange
    const emptyFamilies = splitDnsServersByFamily([]);

    // Act
    const script = createWindowsDnsScript({
      reset: true,
      servers: emptyFamilies
    });

    // Assert
    expect(script).toContain("Set-DnsClientServerAddress -InterfaceIndex $ifaceIndex -ResetServerAddresses");
    expect(script).toContain("netsh interface ipv4 set dnsservers name=$InterfaceIndex source=dhcp");
    expect(script).toContain("netsh interface ipv6 set dnsservers name=$InterfaceIndex source=dhcp");
  });

  it("mock-применение DNS возвращает успешный результат без изменения системы", async () => {
    // Arrange
    const rawInput = "9.9.9.9; 149.112.112.112";

    // Act
    const result = await setSystemDnsServers(rawInput, true);

    // Assert
    expect(result).toEqual({
      ok: true,
      message: "DNS обновлён: 9.9.9.9, 149.112.112.112",
      servers: ["9.9.9.9", "149.112.112.112"],
      mocked: true
    });
  });

  it("mock-сброс DNS возвращает систему к стандартному состоянию", async () => {
    // Arrange
    const expectedMessage = "Системный DNS возвращён к настройкам по умолчанию.";

    // Act
    const result = await resetSystemDnsServers(true);

    // Assert
    expect(result).toEqual({
      ok: true,
      message: expectedMessage,
      servers: [],
      mocked: true
    });
  });
});
