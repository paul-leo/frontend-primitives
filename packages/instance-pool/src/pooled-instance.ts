export type PooledInstanceState = 'idle' | 'claimed' | 'destroyed'

/**
 * A consumer-implemented handle around a single pooled resource (an iframe, a worker,
 * an independent JS runtime, a connection). InstancePool orchestrates *when* these
 * methods are called; it never reaches into the resource itself.
 */
export interface PooledInstance<Props> {
  readonly state: PooledInstanceState
  readonly sessionKey: string
  /** Force-push new props into the running instance. Must not rely on reactive tracking picking this up. */
  claim(props: Props): void
  /** Reset the instance back to its idle placeholder state. Must not tear the resource down. */
  release(): void
  /** Actually tear the underlying resource down. Called at most once. */
  destroy(): void
}
