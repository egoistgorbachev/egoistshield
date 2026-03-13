/**
 * Kill Switch — блокировка всего исходящего трафика через Windows Firewall
 * при разрыве VPN-соединения. Требует прав администратора.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const RULE_PREFIX = "EgoistShield-KS";

export class KillSwitch {
  private active = false;

  /**
   * Включить Kill Switch: блокировать весь трафик кроме localhost и runtime
   */
  async enable(_proxyPort: number, runtimePath: string): Promise<void> {
    if (process.platform !== "win32") return;
    if (this.active) return;

    try {
      // 1. Блокировать весь исходящий трафик
      await execFileAsync("netsh", [
        "advfirewall",
        "firewall",
        "add",
        "rule",
        `name=${RULE_PREFIX}-Block`,
        "dir=out",
        "action=block",
        "enable=yes",
        "profile=any",
        "localip=any",
        "remoteip=any"
      ]);

      // 2. Разрешить localhost (для прокси)
      await execFileAsync("netsh", [
        "advfirewall",
        "firewall",
        "add",
        "rule",
        `name=${RULE_PREFIX}-AllowLoopback`,
        "dir=out",
        "action=allow",
        "enable=yes",
        "remoteip=127.0.0.0/8"
      ]);

      // 3. Разрешить runtime-процессу (xray/sing-box) выходить наружу
      await execFileAsync("netsh", [
        "advfirewall",
        "firewall",
        "add",
        "rule",
        `name=${RULE_PREFIX}-AllowRuntime`,
        "dir=out",
        "action=allow",
        "enable=yes",
        `program=${runtimePath}`
      ]);

      // 4. Разрешить DNS (UDP 53) ТОЛЬКО к доверенным серверам
      // ⚠️ Без ограничения remoteaddress = DNS leak мимо VPN
      const trustedDns = "1.1.1.1,8.8.8.8,8.8.4.4,1.0.0.1";
      await execFileAsync("netsh", [
        "advfirewall",
        "firewall",
        "add",
        "rule",
        `name=${RULE_PREFIX}-AllowDNS`,
        "dir=out",
        "action=allow",
        "enable=yes",
        "protocol=udp",
        "remoteport=53",
        `remoteip=${trustedDns}`
      ]);

      // 5. Разрешить DHCP
      await execFileAsync("netsh", [
        "advfirewall",
        "firewall",
        "add",
        "rule",
        `name=${RULE_PREFIX}-AllowDHCP`,
        "dir=out",
        "action=allow",
        "enable=yes",
        "protocol=udp",
        "localport=68",
        "remoteport=67"
      ]);

      this.active = true;
    } catch (err: unknown) {
      // Откат при частичном создании правил
      await this.disable().catch(() => {});
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Kill Switch enable failed: ${msg}`);
    }
  }

  /**
   * Выключить Kill Switch: удалить все правила firewall
   */
  async disable(): Promise<void> {
    if (process.platform !== "win32") return;

    const ruleNames = [
      `${RULE_PREFIX}-Block`,
      `${RULE_PREFIX}-AllowLoopback`,
      `${RULE_PREFIX}-AllowRuntime`,
      `${RULE_PREFIX}-AllowDNS`,
      `${RULE_PREFIX}-AllowDHCP`
    ];

    for (const name of ruleNames) {
      try {
        await execFileAsync("netsh", ["advfirewall", "firewall", "delete", "rule", `name=${name}`]);
      } catch {
        // Правило могло не существовать — это нормально
      }
    }

    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }
}
