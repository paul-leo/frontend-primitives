import type { ScopeCacheKey } from './types'

export function normalizeCacheKey(key: ScopeCacheKey): unknown[] {
  return Array.isArray(key) ? [...key] : [key]
}

export function serializeCacheKey(key: ScopeCacheKey): string {
  return JSON.stringify(normalizeCacheKey(key))
}

/** True when `prefix` is a leading, element-wise match of `candidate`. */
export function isKeyPrefixMatch(candidate: unknown[], prefix: unknown[]): boolean {
  if (prefix.length > candidate.length) return false
  return prefix.every((part, i) => JSON.stringify(part) === JSON.stringify(candidate[i]))
}
