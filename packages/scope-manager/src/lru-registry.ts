import type { ScopeId } from './scope-id'
import { ScopeManager, type ScopeManagerOptions } from './registry'

export interface LruScopeManagerOptions<T> extends ScopeManagerOptions<T> {
  /** Once the registry holds more than maxSize live scopes, the least-recently-touched one is destroyed. */
  maxSize: number
}

/**
 * A ScopeManager with a capacity bound: exceeding maxSize destroys the least-recently-touched
 * scope (a getOrCreate hit counts as a touch, not just creation). This exists because raw
 * "increase the LRU capacity until the symptom goes away" is usually a sign that the caller's
 * "when to reuse vs. when to create" logic is wrong, not a size problem — this class does not
 * fix that judgment for you, it only bounds the blast radius of getting it wrong.
 */
export class LruScopeManager<T> extends ScopeManager<T> {
  private readonly maxSize: number
  private readonly touchOrder = new Map<ScopeId, true>()

  constructor(options: LruScopeManagerOptions<T>) {
    super(options)
    if (options.maxSize <= 0) throw new Error('maxSize must be > 0')
    this.maxSize = options.maxSize
  }

  override getOrCreate(scopeId: ScopeId): T {
    const value = super.getOrCreate(scopeId)
    this.touch(scopeId)
    this.evictIfNeeded(scopeId)
    return value
  }

  override destroy(scopeId: ScopeId): boolean {
    this.touchOrder.delete(scopeId)
    return super.destroy(scopeId)
  }

  private touch(scopeId: ScopeId): void {
    this.touchOrder.delete(scopeId)
    this.touchOrder.set(scopeId, true)
  }

  private evictIfNeeded(justTouchedId: ScopeId): void {
    while (this.size() > this.maxSize) {
      const oldest = this.touchOrder.keys().next().value
      if (oldest === undefined || oldest === justTouchedId) return
      this.destroy(oldest)
    }
  }
}
