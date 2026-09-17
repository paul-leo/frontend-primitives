import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it, vi } from 'vitest'
import { createDexieStorageAdapter } from './dexie-storage-adapter'

describe('createDexieStorageAdapter', () => {
  it('different scopeIds produce different Dexie database names and instances', () => {
    const a = createDexieStorageAdapter({ dbNamePrefix: 'names-test' })('org-a')
    const b = createDexieStorageAdapter({ dbNamePrefix: 'names-test' })('org-b')
    expect(a.client.name).not.toBe(b.client.name)
    expect(a.client).not.toBe(b.client)
  })

  it('get returns null for a missing key', async () => {
    const storage = createDexieStorageAdapter({ dbNamePrefix: 'missing-key-test' })('org-1')
    expect(await storage.get('missing')).toBeNull()
  })

  it('set/get/delete/clear round-trip through IndexedDB', async () => {
    const storage = createDexieStorageAdapter({ dbNamePrefix: 'roundtrip-test' })('org-1')

    await storage.set('token', 'abc')
    expect(await storage.get('token')).toBe('abc')

    await storage.delete('token')
    expect(await storage.get('token')).toBeNull()

    await storage.set('a', '1')
    await storage.clear()
    expect(await storage.get('a')).toBeNull()
  })

  it('two scopes do not share rows even with the same key', async () => {
    const a = createDexieStorageAdapter({ dbNamePrefix: 'isolation-test' })('org-a')
    const b = createDexieStorageAdapter({ dbNamePrefix: 'isolation-test' })('org-b')

    await a.set('token', 'a-token')
    expect(await b.get('token')).toBeNull()
  })

  it('calls onVersionChange and closes the connection when another connection upgrades the schema', async () => {
    const onVersionChange = vi.fn()
    const storage = createDexieStorageAdapter({ dbNamePrefix: 'version-change-test', onVersionChange })('org-1')
    await storage.set('a', '1') // forces the connection open

    const other = new Dexie(storage.client.name)
    other.version(2).stores({ kv: 'key, extra' })
    await other.open()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(onVersionChange).toHaveBeenCalled()
    other.close()
  })

  it('dispose() closes the connection without throwing', () => {
    const storage = createDexieStorageAdapter({ dbNamePrefix: 'dispose-test' })('org-1')
    expect(() => storage.dispose?.()).not.toThrow()
  })
})
