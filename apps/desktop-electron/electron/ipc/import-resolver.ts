import type { VpnNode } from "./contracts";
import { isSubscriptionUrl, parseNodesFromText } from "./node-parser";

type ParsedImport = {
  nodes: VpnNode[];
  issues: string[];
};

export type UrlTextReader = (url: string) => Promise<{ text: string, userinfo: Record<string, number> | null, name: string | null }>;

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

function isSubscriptionHintIssue(issue: string): boolean {
  return issue.startsWith("Найдена ссылка подписки");
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

export async function resolveImportPayload(payload: string, readUrlText: UrlTextReader): Promise<ParsedImport & { subscriptions: { url: string, name: string | null, userinfo: Record<string, number> | null }[] }> {
  const parsed = parseNodesFromText(payload);
  const urls = extractSubscriptionUrls(payload);
  if (urls.length === 0) {
    return { ...parsed, subscriptions: [] };
  }

  const nodes = [...parsed.nodes];
  const issues = parsed.issues.filter((issue) => !isSubscriptionHintIssue(issue));
  const subscriptions: { url: string, name: string | null, userinfo: Record<string, number> | null }[] = [];

  for (const url of urls) {
    try {
      const response = await readUrlText(url);
      const subParsed = parseNodesFromText(response.text);
      nodes.push(...subParsed.nodes);
      subscriptions.push({ url, name: response.name || null, userinfo: response.userinfo });
      for (const issue of subParsed.issues) {
        issues.push(withSourcePrefix(url, issue));
      }
    } catch (error) {
      issues.push(withSourcePrefix(url, `Не удалось загрузить подписку: ${toErrorMessage(error)}`));
    }
  }

  return { nodes, issues, subscriptions };
}
