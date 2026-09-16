/**
 * Builds a cache/dedup/storage key with scope as the leading segment, so scope is
 * structurally part of the key rather than an implicit convention callers have to
 * remember to apply. Same inputs always produce the same string; different scopes
 * always produce different strings.
 */
export function buildScopedKey(scope: string, ...parts: (string | number)[]): string {
  return [scope, ...parts].map(String).join(':')
}
