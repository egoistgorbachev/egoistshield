/**
 * Barrel-файл парсеров — реэкспорт для удобства.
 */
export { parseNodeUriDetailed, parseNodeUri } from "./uri-parsers";
export { parseClashProxy, parseNodesFromClashYaml } from "./clash-parser";
export { parseXrayOutbound, parseSingBoxOutbound, parseNodesFromJson } from "./json-parser";
export {
    isLikelyUnsupportedPlaceholderText,
    isSubscriptionUrl,
    dedupeNodes,
    extractKnownUris,
    tryDecodeSubscriptionBlock,
} from "./parser-utils";
