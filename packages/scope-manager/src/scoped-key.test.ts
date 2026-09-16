import { describe, expect, it } from 'vitest'
import { buildScopedKey } from './scoped-key'

describe('buildScopedKey', () => {
  it('produces the same string for the same inputs', () => {
    expect(buildScopedKey('org-1', 'memo', 42)).toBe(buildScopedKey('org-1', 'memo', 42))
  })

  it('produces different strings for different scopes', () => {
    expect(buildScopedKey('org-1', 'memo', 42)).not.toBe(buildScopedKey('org-2', 'memo', 42))
  })

  it('produces different strings for different parts', () => {
    expect(buildScopedKey('org-1', 'memo', 42)).not.toBe(buildScopedKey('org-1', 'memo', 43))
  })
})
