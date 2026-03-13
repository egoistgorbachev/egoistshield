import type { VpnNode } from "./contracts";
import { isSubscriptionUrl, parseNodesFromText } from "./node-parser";
import log from "electron-log";

type ParsedImport = {
  nodes: VpnNode[];
  issues: string[];
};

export type UrlTextReader = (
  url: string
) => Promise<{ text: string; userinfo: Record<string, number> | null; name: string | null }>;

function extractSubscriptionUrls(payload: string): string[] {
  const unique = new Set<string>();
  const lines = payload
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (isSubscriptionUrl(line)) {
      unique.add(line);
    }
  }

  return [...unique];
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function withSourcePrefix(source: string, issue: string): string {
  return `[${source}] ${issue}`;
}

export async function resolveImportPayload(
  payload: string,
  readUrlText: UrlTextReader
): Promise<
  ParsedImport & { subscriptions: { url: string; name: string | null; userinfo: Record<string, number> | null }[] }
> {
  // Step 1: Parse the raw payload for direct VPN URIs
  const parsed = parseNodesFromText(payload);
  const urls = extractSubscriptionUrls(payload);

  log.info(`[import-resolver] Direct parse: ${parsed.nodes.length} nodes, ${urls.length} subscription URLs found`);

  if (urls.length === 0) {
    return { ...parsed, subscriptions: [] };
  }

  const nodes = [...parsed.nodes];
  const issues = parsed.issues.filter((issue) => !issue.startsWith("Найдена ссылка подписки"));
  const subscriptions: { url: string; name: string | null; userinfo: Record<string, number> | null }[] = [];

  // Step 2: Fetch each subscription URL and parse
  for (const url of urls) {
    try {
      log.info(`[import-resolver] Fetching subscription: ${url}`);
      const response = await readUrlText(url);
      log.info(`[import-resolver] Subscription response received: ${response.text.length} bytes, name="${response.name}"`);

      const subParsed = parseNodesFromText(response.text);
      log.info(`[import-resolver] Parsed ${subParsed.nodes.length} nodes from subscription, ${subParsed.issues.length} issues`);

      nodes.push(...subParsed.nodes);

      // ALWAYS save the subscription — even with 0 nodes the user needs to see it
      subscriptions.push({ url, name: response.name || null, userinfo: response.userinfo });

      for (const issue of subParsed.issues) {
        issues.push(withSourcePrefix(url, issue));
      }
    } catch (error) {
      log.error(`[import-resolver] Failed to fetch subscription ${url}:`, toErrorMessage(error));
      // STILL save the subscription as a record — so user can retry later
      subscriptions.push({ url, name: null, userinfo: null });
      issues.push(withSourcePrefix(url, `Не удалось загрузить подписку: ${toErrorMessage(error)}`));
    }
  }

  return { nodes, issues, subscriptions };
}
