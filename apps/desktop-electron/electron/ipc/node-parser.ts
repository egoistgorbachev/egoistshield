/**
 * Node Parser — оркестратор.
 *
 * Этот файл раньше содержал 1197 строк. Теперь он разделён на 4 модуля:
 *   parsers/parser-utils.ts  — утилиты (base64, buildNode, dedupe)
 *   parsers/uri-parsers.ts   — URI-парсеры (VLESS, VMess, Trojan, SS, ...)
 *   parsers/clash-parser.ts  — Clash YAML парсер
 *   parsers/json-parser.ts   — JSON конфиг парсеры (Xray, sing-box)
 *
 * Публичный API переэкспортируется ниже для совместимости.
 */
import log from "electron-log";
import type { VpnNode } from "./contracts";
import { parseNodesFromClashYaml } from "./parsers/clash-parser";
import { parseNodesFromJson } from "./parsers/json-parser";
import { dedupeNodes, extractKnownUris, isSubscriptionUrl, tryDecodeSubscriptionBlock } from "./parsers/parser-utils";
import { parseNodeUriDetailed } from "./parsers/uri-parsers";

// Реэкспорт публичного API
export { isLikelyUnsupportedPlaceholderText, isSubscriptionUrl } from "./parsers/parser-utils";
export { parseNodeUri } from "./parsers/uri-parsers";

/**
 * Пытается декодировать весь payload как один base64-блок (стандарт v2rayN подписок).
 * Если декодированный текст содержит VPN URI — возвращает список URI.
 */
function tryDecodeFullPayloadAsBase64(payload: string): string[] {
  const trimmed = payload.trim();
  if (trimmed.length < 16) return [];

  // Удаляем newlines и пробелы из base64 — серверы подписок иногда вставляют переносы
  const cleaned = trimmed.replace(/[\r\n\s]+/g, "");

  // Проверяем, похоже ли на base64
  if (!/^[A-Za-z0-9+/=_-]+$/.test(cleaned)) return [];

  try {
    // Нормализуем URL-safe base64
    const normalized = cleaned.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const decoded = Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");

    // Проверяем, содержит ли декодированный текст хотя бы один VPN URI
    const uris = extractKnownUris(decoded);
    if (uris.length > 0) {
      log.info(`[node-parser] Full base64 decode: found ${uris.length} URIs`);
      return uris;
    }
  } catch {
    // Не base64 — нормально, пробуем другие способы
  }

  return [];
}

export function parseNodesFromText(payload: string): { nodes: VpnNode[]; issues: string[] } {
  const lines = payload
    .split(/\r?\n/g)
    .map((item) => item.trim())
    .filter(Boolean);

  const nodes: VpnNode[] = [];
  const issues: string[] = [];

  // ── Шаг 0: Попытка декодировать весь payload как base64 (v2rayN формат) ──
  const base64Uris = tryDecodeFullPayloadAsBase64(payload);
  if (base64Uris.length > 0) {
    for (const uri of base64Uris) {
      const detailed = parseNodeUriDetailed(uri);
      if (detailed.node) {
        nodes.push(detailed.node);
      } else if (detailed.issue) {
        issues.push(detailed.issue);
      }
    }

    // Если нашли ноды из base64 — возвращаем сразу, не нужно парсить дальше
    if (nodes.length > 0) {
      log.info(`[node-parser] Parsed ${nodes.length} nodes from full base64 payload`);
      return { nodes: dedupeNodes(nodes), issues };
    }
  }

  // ── Шаг 1: Clash YAML ──
  const yamlResult = parseNodesFromClashYaml(payload);
  if (yamlResult.matched) {
    nodes.push(...yamlResult.nodes);
    issues.push(...yamlResult.issues);
  }

  // ── Шаг 2: JSON (Xray, sing-box) ──
  const jsonResult = parseNodesFromJson(payload);
  if (jsonResult.matched) {
    nodes.push(...jsonResult.nodes);
    issues.push(...jsonResult.issues);
  }

  // ── Шаг 3: Прямой URI scan ──
  const useDirectUriScan = !yamlResult.matched && !jsonResult.matched;
  const directUris = useDirectUriScan ? extractKnownUris(payload) : [];
  const candidates = directUris.length > 0 ? directUris : [...lines];

  if (directUris.length > 0) {
    for (const line of lines) {
      if (/(vless|vmess|trojan|ss|socks5?|https?|hy2|hysteria2|tuic|wireguard|wg):\/\//i.test(line)) {
        continue;
      }
      if (isSubscriptionUrl(line)) {
        issues.push(`Найдена ссылка подписки: ${line.slice(0, 120)}`);
      } else {
        issues.push(`Пропущена неподдерживаемая строка: ${line.slice(0, 120)}`);
      }
    }
  }

  // ── Шаг 4: Построчный парсинг ──
  for (const line of candidates) {
    const detailed = parseNodeUriDetailed(line);
    if (detailed.node) {
      nodes.push(detailed.node);
      continue;
    }

    if (detailed.issue) {
      issues.push(detailed.issue);
      continue;
    }

    const decodedCandidates = tryDecodeSubscriptionBlock(line);
    if (decodedCandidates.length > 0) {
      for (const decoded of decodedCandidates) {
        const decodedDetailed = parseNodeUriDetailed(decoded);
        if (decodedDetailed.node) {
          nodes.push(decodedDetailed.node);
        } else if (decodedDetailed.issue) {
          issues.push(decodedDetailed.issue);
        } else {
          issues.push(`Ошибка в строке подписки: ${decoded.slice(0, 120)}`);
        }
      }
      continue;
    }

    if (isSubscriptionUrl(line)) {
      issues.push(`Найдена ссылка подписки: ${line.slice(0, 120)}`);
      continue;
    }

    if (!yamlResult.matched && !jsonResult.matched && lines.length <= 25) {
      issues.push(`Пропущена неподдерживаемая строка: ${line.slice(0, 120)}`);
    }
  }

  log.info(`[node-parser] Final result: ${nodes.length} nodes, ${issues.length} issues`);
  return { nodes: dedupeNodes(nodes), issues };
}
