import { describe, expect, it } from 'vitest'
import { isKeyPrefixMatch, normalizeCacheKey, serializeCacheKey } from './cache-key'

describe('normalizeCacheKey', () => {
  it('wraps a flat string key in an array', () => {
    expect(normalizeCacheKey('memo-list')).toEqual(['memo-list'])
  })

  it('leaves an array key as an array (copied, not the same reference)', () => {
    const key = ['memo-list', 'org-1']
    expect(normalizeCacheKey(key)).toEqual(key)
    expect(normalizeCacheKey(key)).not.toBe(key)
  })
})

describe('serializeCacheKey', () => {
  it('produces the same string for equal keys', () => {
    expect(serializeCacheKey(['memo-list', 'org-1'])).toBe(serializeCacheKey(['memo-list', 'org-1']))
  })

  it('produces different strings for different keys', () => {
    expect(serializeCacheKey(['memo-list', 'org-1'])).not.toBe(serializeCacheKey(['memo-list', 'org-2']))
  })
})

describe('isKeyPrefixMatch', () => {
  it('matches when prefix is a leading subsequence of candidate', () => {
    expect(isKeyPrefixMatch(['memo-list', 'org-1', 'ws-1'], ['memo-list', 'org-1'])).toBe(true)
  })

  it('does not match when prefix diverges', () => {
    expect(isKeyPrefixMatch(['memo-list', 'org-2'], ['memo-list', 'org-1'])).toBe(false)
  })

  it('does not match when prefix is longer than candidate', () => {
    expect(isKeyPrefixMatch(['memo-list'], ['memo-list', 'org-1'])).toBe(false)
  })
})
