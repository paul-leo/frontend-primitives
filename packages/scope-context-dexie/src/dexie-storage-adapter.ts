import Dexie from 'dexie'
import { buildScopedKey } from 'scope-manager'
import type { ScopeStorageAdapter } from 'scope-context'

export interface DexieStorageAdapterOptions {
  dbNamePrefix?: string
  tableName?: string
  onBlocked?: (dbName: string) => void
  onVersionChange?: (dbName: string) => void
}

const DEFAULT_PREFIX = 'scope-context'
const DEFAULT_TABLE = 'kv'

interface Row {
  key: string
  value: string
}

/** One independent Dexie database per scope (not a shared database with a scope-id column) — a
 *  bug that forgets to filter by scope fails CLOSED (can't see another scope's database at all)
 *  instead of failing open. */
export function createDexieStorageAdapter(
  options: DexieStorageAdapterOptions = {},
): (scopeId: string) => ScopeStorageAdapter<Dexie> {
  const prefix = options.dbNamePrefix ?? DEFAULT_PREFIX
  const tableName = options.tableName ?? DEFAULT_TABLE

  return (scopeId) => {
    const dbName = buildScopedKey(prefix, scopeId)
    const db = new Dexie(dbName)
    db.version(1).stores({ [tableName]: 'key' })

    db.on('blocked', () => options.onBlocked?.(dbName))
    db.on('versionchange', () => {
      // Cooperative close so another connection's schema upgrade can proceed. This adapter
      // deliberately does not keep its own cached "is it open" promise anywhere else — Dexie's
      // internal open state is the only one that needs invalidating, and close() does that.
      // A second, hand-rolled open-promise cache layered on top is exactly what produced the
      // documented regression in docs/recipes/persistent-storage-with-dexie.md (reads silently
      // returning stale/empty results after a cooperative close nobody told the cache about).
      db.close()
      options.onVersionChange?.(dbName)
    })

    const table = () => db.table<Row, string>(tableName)

    return {
      client: db,
      async get(key) {
        const row = await table().get(key)
        return row?.value ?? null
      },
      async set(key, value) {
        await table().put({ key, value })
      },
      async delete(key) {
        await table().delete(key)
      },
      async clear() {
        await table().clear()
      },
      dispose() {
        db.close()
      },
    }
  }
}
