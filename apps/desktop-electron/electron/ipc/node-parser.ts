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
import type { VpnNode } from "./contracts";
import {
  extractKnownUris,
  tryDecodeSubscriptionBlock,
  isSubscriptionUrl,
  dedupeNodes,
} from "./parsers/parser-utils";
import { parseNodeUriDetailed } from "./parsers/uri-parsers";
import { parseNodesFromClashYaml } from "./parsers/clash-parser";
import { parseNodesFromJson } from "./parsers/json-parser";

// Реэкспорт публичного API
export { isLikelyUnsupportedPlaceholderText, isSubscriptionUrl } from "./parsers/parser-utils";
export { parseNodeUri } from "./parsers/uri-parsers";

export function parseNodesFromText(payload: string): { nodes: VpnNode[]; issues: string[] } {
  const lines = payload
    .split(/\r?\n/g)
    .map((item) => item.trim())
    .filter(Boolean);

  const nodes: VpnNode[] = [];
  const issues: string[] = [];

  const yamlResult = parseNodesFromClashYaml(payload);
  if (yamlResult.matched) {
    nodes.push(...yamlResult.nodes);
    issues.push(...yamlResult.issues);
  }

  const jsonResult = parseNodesFromJson(payload);
  if (jsonResult.matched) {
    nodes.push(...jsonResult.nodes);
    issues.push(...jsonResult.issues);
  }

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

  return { nodes: dedupeNodes(nodes), issues };
}
