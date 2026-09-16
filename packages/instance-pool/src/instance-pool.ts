import { LruScopeManager, type ScopeId } from 'scope-manager'
import { createCooldownScheduler } from './cooldown-scheduler'
import type { PooledInstance } from './pooled-instance'

export interface InstancePoolOptions<Props> {
  /** The genuinely no-op placeholder props an instance sits on while pre-warmed and idle. */
  idleProps: Props
  createInstance: (sessionKey: string) => PooledInstance<Props>
  /** How long a released instance stays around, reusable, before it is actually destroyed. */
  cooldownMs?: number
  /** Once exceeded, the least-recently-touched instance is destroyed to make room. */
  maxPoolSize?: number
  /**
   * Fires exactly once per instance, right after createInstance returns and before the
   * instance is ever claimed. Independent of claim()/release() — use it for per-instance
   * setup that every instance needs regardless of whether/when it gets claimed.
   */
  onInstanceCreated?: (instance: PooledInstance<Props>, sessionKey: string) => void
}

const DEFAULT_COOLDOWN_MS = 30_000
const DEFAULT_MAX_POOL_SIZE = 8

/**
 * A controlled pool for non-component resources. sessionKey is always supplied by the
 * caller (never implicit) so pooling stays keyed to whatever the caller considers a
 * logical session — the pool has no opinion on what a "session" is.
 */
export class InstancePool<Props> {
  private readonly registry: LruScopeManager<PooledInstance<Props>>
  private readonly cooldown = createCooldownScheduler()
  private readonly cooldownMs: number

  constructor(options: InstancePoolOptions<Props>) {
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
    this.registry = new LruScopeManager<PooledInstance<Props>>({
      maxSize: options.maxPoolSize ?? DEFAULT_MAX_POOL_SIZE,
      createScope: (sessionKey: ScopeId) => {
        const instance = options.createInstance(sessionKey)
        options.onInstanceCreated?.(instance, sessionKey)
        return instance
      },
      disposeScope: (instance) => {
        if (instance.state !== 'destroyed') instance.destroy()
      },
    })
  }

  getOrCreate(sessionKey: string): PooledInstance<Props> {
    // Reclaiming before a pending cooldown expires cancels the scheduled teardown.
    this.cooldown.cancel(sessionKey)
    return this.registry.getOrCreate(sessionKey)
  }

  release(sessionKey: string): void {
    const instance = this.registry.get(sessionKey)
    if (instance === undefined || instance.state === 'destroyed') return
    instance.release()
    this.cooldown.schedule(sessionKey, this.cooldownMs, () => this.destroy(sessionKey))
  }

  destroy(sessionKey: string): void {
    this.cooldown.cancel(sessionKey)
    this.registry.destroy(sessionKey)
  }

  destroyAll(): void {
    for (const sessionKey of this.registry.list()) this.cooldown.cancel(sessionKey)
    this.registry.destroyAll()
  }
}
