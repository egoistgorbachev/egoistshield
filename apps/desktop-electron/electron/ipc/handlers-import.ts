/**
 * Import/Subscription IPC Handlers — import:text, import:file,
 * subscription:refresh-one, subscription:refresh-all,
 * subscription:rename, node:rename
 */
import { promises as fs } from "node:fs";
import { ipcMain } from "electron";
import type { ImportResult, VpnNode } from "./contracts";
import { resolveImportPayload } from "./import-resolver";
import type { IpcContext } from "./ipc-context";
import {
  ImportFileInputSchema,
  ImportTextInputSchema,
  RenameNodeInputSchema,
  RenameSubscriptionInputSchema,
  SubscriptionUrlInputSchema
} from "./ipc-schemas";
import { parseNodesFromText } from "./node-parser";
import { getSubscriptionUserAgent, readUrlText, uniqueNodes } from "./subscription-utils";

// ── Helper: merge imported nodes + subscriptions into state ──
function mergeImportResults(
  current: ReturnType<import("./state-store").StateStore["get"]>,
  nodes: VpnNode[],
  issues: string[],
  subscriptions: Array<{ url: string; name?: string | null; userinfo?: Record<string, number> | null }>
): { next: ReturnType<import("./state-store").StateStore["get"]>; result: ImportResult } {
  const newSubs = [...current.subscriptions];

  const subIdByUrl = new Map<string, string>();
  for (const sub of subscriptions) {
    const idx = newSubs.findIndex((s) => s.url === sub.url);
    const subItem = {
      id: crypto.randomUUID(),
      url: sub.url,
      name: sub.name || null,
      enabled: true,
      lastUpdated: new Date().toISOString(),
      upload: sub.userinfo?.upload,
      download: sub.userinfo?.download,
      total: sub.userinfo?.total,
      expire: sub.userinfo?.expire
    };
    if (idx >= 0) {
      const existingSub = newSubs[idx];
      const existingId = existingSub?.id ?? subItem.id;
      newSubs[idx] = { ...existingSub, ...subItem, id: existingId };
      subIdByUrl.set(sub.url, existingId);
    } else {
      newSubs.push(subItem);
      subIdByUrl.set(sub.url, subItem.id);
    }
  }

  const firstSubscription = subscriptions[0];
  const defaultSubId =
    subscriptions.length === 1 && firstSubscription ? subIdByUrl.get(firstSubscription.url) : undefined;
  const taggedNodes = nodes.map((n) => ({
    ...n,
    subscriptionId: n.subscriptionId || defaultSubId
  }));

  const addedNodes = uniqueNodes(current.nodes, taggedNodes);

  const next = {
    ...current,
    nodes: [...current.nodes, ...addedNodes],
    subscriptions: newSubs,
    activeNodeId: current.activeNodeId ?? addedNodes[0]?.id ?? null
  };

  return { next, result: { added: addedNodes.length, subscriptionsAdded: subscriptions.length, issues } };
}

export function registerImportHandlers({ stateStore }: IpcContext): void {
  ipcMain.handle("import:text", async (_event, rawPayload: unknown) => {
    const payload = ImportTextInputSchema.parse(rawPayload);
    const current = stateStore.get();
    const profile = getSubscriptionUserAgent(current.settings);
    const { nodes, issues, subscriptions } = await resolveImportPayload(payload, (url) => readUrlText(url, profile));
    const { next, result } = mergeImportResults(current, nodes, issues, subscriptions);
    await stateStore.set(next);
    return result;
  });

  ipcMain.handle("import:file", async (_event, rawPath: unknown) => {
    const filePath = ImportFileInputSchema.parse(rawPath);
    const current = stateStore.get();
    const profile = getSubscriptionUserAgent(current.settings);
    const content = await fs.readFile(filePath, "utf8");
    const { nodes, issues, subscriptions } = await resolveImportPayload(content, (url) => readUrlText(url, profile));
    const { next, result } = mergeImportResults(current, nodes, issues, subscriptions);
    await stateStore.set(next);
    return result;
  });

  ipcMain.handle("subscription:refresh-one", async (_event, rawUrl: unknown) => {
    const url = SubscriptionUrlInputSchema.parse(rawUrl);
    const current = stateStore.get();
    const profile = getSubscriptionUserAgent(current.settings);
    const response = await readUrlText(url, profile);
    const { nodes, issues } = parseNodesFromText(response.text);

    const subItem = current.subscriptions.find((s) => s.url === url);
    const subId = subItem?.id;

    const otherNodes = subId ? current.nodes.filter((n) => n.subscriptionId !== subId) : current.nodes;
    const taggedNodes = nodes.map((n) => ({ ...n, subscriptionId: subId }));
    const freshNodes = [...otherNodes, ...taggedNodes];

    const next = {
      ...current,
      nodes: freshNodes,
      activeNodeId:
        current.activeNodeId && freshNodes.some((n) => n.id === current.activeNodeId)
          ? current.activeNodeId
          : (freshNodes[0]?.id ?? null),
      subscriptions: current.subscriptions.map((item) =>
        item.url === url
          ? {
              ...item,
              name: response.name || item.name || null,
              lastUpdated: new Date().toISOString(),
              upload: response.userinfo?.upload ?? item.upload,
              download: response.userinfo?.download ?? item.download,
              total: response.userinfo?.total ?? item.total,
              expire: response.userinfo?.expire ?? item.expire
            }
          : item
      )
    };
    await stateStore.set(next);
    const result: ImportResult = { added: taggedNodes.length, subscriptionsAdded: 0, issues };
    return result;
  });

  ipcMain.handle("subscription:refresh-all", async () => {
    const current = stateStore.get();
    const profile = getSubscriptionUserAgent(current.settings);
    let totalAdded = 0;
    const issues: string[] = [];
    const refreshedSubs = new Map<string, { userinfo: Record<string, number> | null; nodes: VpnNode[] }>();

    const enabledSubs = current.subscriptions.filter((item) => item.enabled);
    const results = await Promise.allSettled(
      enabledSubs.map(async (sub) => {
        const response = await readUrlText(sub.url, profile);
        const parsed = parseNodesFromText(response.text);
        return { subId: sub.id, url: sub.url, nodes: parsed.nodes, issues: parsed.issues, userinfo: response.userinfo };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { subId, url, nodes: parsedNodes, issues: parsedIssues, userinfo } = result.value;
        const taggedNodes = parsedNodes.map((n) => ({ ...n, subscriptionId: subId }));
        refreshedSubs.set(url, { userinfo, nodes: taggedNodes });
        totalAdded += taggedNodes.length;
        issues.push(...parsedIssues.map((issue) => `[${url}] ${issue}`));
      } else {
        issues.push(`Не удалось обновить подписку: ${String(result.reason)}`);
      }
    }

    const refreshedSubIds = new Set(enabledSubs.filter((s) => refreshedSubs.has(s.url)).map((s) => s.id));
    let freshNodes = current.nodes.filter((n) => !n.subscriptionId || !refreshedSubIds.has(n.subscriptionId));
    for (const { nodes: taggedNodes } of refreshedSubs.values()) {
      freshNodes = [...freshNodes, ...taggedNodes];
    }

    const nowIso = new Date().toISOString();
    const next = {
      ...current,
      nodes: freshNodes,
      activeNodeId:
        current.activeNodeId && freshNodes.some((n) => n.id === current.activeNodeId)
          ? current.activeNodeId
          : (freshNodes[0]?.id ?? null),
      subscriptions: current.subscriptions.map((item) => {
        const data = refreshedSubs.get(item.url);
        if (data) {
          return {
            ...item,
            lastUpdated: nowIso,
            upload: data.userinfo?.upload ?? item.upload,
            download: data.userinfo?.download ?? item.download,
            total: data.userinfo?.total ?? item.total,
            expire: data.userinfo?.expire ?? item.expire
          };
        }
        return item;
      })
    };
    await stateStore.set(next);
    const result: ImportResult = { added: totalAdded, subscriptionsAdded: 0, issues };
    return result;
  });

  // Rename Subscription
  ipcMain.handle("subscription:rename", async (_event, rawUrl: unknown, rawName: unknown) => {
    const { url, newName } = RenameSubscriptionInputSchema.parse({ url: rawUrl, newName: rawName });
    const current = stateStore.get();
    const next = {
      ...current,
      subscriptions: current.subscriptions.map((s) => (s.url === url ? { ...s, name: newName } : s))
    };
    await stateStore.set(next);
    return true;
  });

  // Rename Node
  ipcMain.handle("node:rename", async (_event, rawId: unknown, rawName: unknown) => {
    const { id, newName } = RenameNodeInputSchema.parse({ id: rawId, newName: rawName });
    const current = stateStore.get();
    const next = {
      ...current,
      nodes: current.nodes.map((n) => (n.id === id ? { ...n, name: newName } : n))
    };
    await stateStore.set(next);
    return true;
  });
}
