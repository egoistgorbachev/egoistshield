/// <reference path="../types/electron.d.ts" />
import type { EgoistAPI } from "../types/electron";

/**
 * Типобезопасный доступ к egoistAPI.
 * Возвращает null если API недоступно (dev-режим без Electron).
 */
export function getAPI(): EgoistAPI | null {
  return window.egoistAPI ?? null;
}

/**
 * Проверка доступности egoistAPI.
 */
export function hasAPI(): boolean {
  return !!window.egoistAPI;
}
