/// <reference path="../types/electron.d.ts" />

/**
 * Типобезопасный доступ к egoistAPI.
 * Возвращает null если API недоступно (dev-режим без Electron).
 */
export function getAPI() {
    return window.egoistAPI ?? null;
}

/**
 * Проверка доступности egoistAPI.
 */
export function hasAPI(): boolean {
    return !!window.egoistAPI;
}
