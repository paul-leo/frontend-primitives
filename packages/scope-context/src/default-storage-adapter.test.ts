import { describe, expect, it } from 'vitest'
import { createInMemoryStorageAdapter } from './default-storage-adapter'

describe('createInMemoryStorageAdapter', () => {
  it('get returns null for a missing key', async () => {
    const storage = createInMemoryStorageAdapter()('org-1')
    expect(await storage.get('missing')).toBeNull()
  })

  it('set/get round-trips a value', async () => {
    const storage = createInMemoryStorageAdapter()('org-1')
    await storage.set('token', 'abc')
    expect(await storage.get('token')).toBe('abc')
  })

  it('delete removes a key', async () => {
    const storage = createInMemoryStorageAdapter()('org-1')
    await storage.set('token', 'abc')
    await storage.delete('token')
    expect(await storage.get('token')).toBeNull()
  })

  it('clear removes everything', async () => {
    const storage = createInMemoryStorageAdapter()('org-1')
    await storage.set('a', '1')
    await storage.set('b', '2')
    await storage.clear()
    expect(await storage.get('a')).toBeNull()
    expect(await storage.get('b')).toBeNull()
  })

  it('two independently-created adapters do not share state', async () => {
    const a = createInMemoryStorageAdapter()('org-1')
    const b = createInMemoryStorageAdapter()('org-2')
    await a.set('token', 'a-token')
    expect(await b.get('token')).toBeNull()
  })
})
