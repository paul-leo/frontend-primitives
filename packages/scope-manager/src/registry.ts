import type { ScopeId } from './scope-id'

export interface ScopeManagerOptions<T> {
  /** Called at most once per scopeId, only when no live value exists for it yet. */
  createScope: (scopeId: ScopeId) => T
  /** Called exactly once when a scope is torn down, after it has been removed from the registry. */
  disposeScope?: (value: T, scopeId: ScopeId) => void
}

/**
 * A registry that lazily creates, reuses, and tears down one value per scope id.
 *
 * This is the "Manager" half of the Controller/Manager pairing: the manager owns a
 * ScopeManager<Controller> keyed by whatever "scope" means to the caller (a tenant,
 * a session, an open document, a game room — the meaning is entirely consumer-defined).
 */
export class ScopeManager<T> {
  private readonly values = new Map<ScopeId, T>()
  private readonly epochs = new Map<ScopeId, number>()
  private readonly createScope: (scopeId: ScopeId) => T
  private readonly disposeScope?: (value: T, scopeId: ScopeId) => void

  constructor(options: ScopeManagerOptions<T>) {
    this.createScope = options.createScope
    this.disposeScope = options.disposeScope
  }

  getOrCreate(scopeId: ScopeId): T {
    if (this.values.has(scopeId)) return this.values.get(scopeId) as T
    const value = this.createScope(scopeId)
    this.values.set(scopeId, value)
    return value
  }

  get(scopeId: ScopeId): T | undefined {
    return this.values.get(scopeId)
  }

  has(scopeId: ScopeId): boolean {
    return this.values.has(scopeId)
  }

  destroy(scopeId: ScopeId): boolean {
    if (!this.values.has(scopeId)) return false
    const value = this.values.get(scopeId) as T
    this.values.delete(scopeId)
    this.epochs.set(scopeId, this.epoch(scopeId) + 1)
    this.disposeScope?.(value, scopeId)
    return true
  }

  destroyAll(): void {
    for (const scopeId of [...this.values.keys()]) this.destroy(scopeId)
  }

  list(): ScopeId[] {
    return [...this.values.keys()]
  }

  size(): number {
    return this.values.size
  }

  /**
   * Increments each time destroy(scopeId) succeeds and is preserved across rebuilds of
   * the same scopeId. Callers can snapshot this before an async operation and compare it
   * on resume — a mismatch means the scope was torn down (and possibly recreated) while
   * the operation was in flight, so its result should be discarded.
   */
  epoch(scopeId: ScopeId): number {
    return this.epochs.get(scopeId) ?? 0
  }
}
