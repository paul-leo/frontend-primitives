export type ScopeCacheKey = string | readonly unknown[]

/**
 * Every adapter interface follows the same shape: a small portable surface (works the same
 * regardless of which implementation is behind it) plus a typed `client` escape hatch to the
 * real underlying object, for callers who need its full native API instead of the
 * lowest-common-denominator surface.
 */
export interface ScopeStorageAdapter<TClient = unknown> {
  readonly client: TClient
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
  dispose?(): void | Promise<void>
}

export interface ScopeCacheAdapter<TClient = unknown> {
  readonly client: TClient
  get<T>(key: ScopeCacheKey): T | undefined
  set<T>(key: ScopeCacheKey, value: T): void
  /** exact: false (default) also invalidates any key whose array form starts with this prefix. */
  invalidate(key: ScopeCacheKey, options?: { exact?: boolean }): void
  clear(): void
  dispose?(): void | Promise<void>
}

export interface ScopeRequestAdapter {
  /** Raw, uncached network call — mutations, uploads, anything that should never be memoized. */
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  /**
   * Cached/deduped read. This is the ONLY method that ever touches a cache, and it does so
   * through the `cache` reference the adapter was constructed with — never by re-deriving
   * scope identity from a string. That's what makes "this scope's requests can only ever
   * land in this scope's cache" true by construction, not by convention.
   */
  query<T>(key: ScopeCacheKey, fetcher: (signal: AbortSignal) => Promise<T>): Promise<T>
  dispose?(): void | Promise<void>
}

export interface ScopeCommsAdapter<TClient = unknown> {
  readonly client: TClient
  emit(event: string, payload: unknown): void
  on(event: string, handler: (payload: unknown) => void): () => void
  dispose?(): void | Promise<void>
}

export type ScopeThemeTokens = Record<string, string>

export interface ScopeTheme {
  /** CSS custom property values, e.g. { '--scope-primary': '#1a73e8' }. */
  tokens: ScopeThemeTokens
  /** Optional class name for consumers using class-based theme switching. */
  className?: string
}

export interface ScopeThemeAdapter {
  getTheme(): ScopeTheme
  /** Runtime theme swap — a rebrand, or a light/dark toggle scoped to this scope only. */
  setTheme(theme: ScopeTheme): void
  subscribe(handler: (theme: ScopeTheme) => void): () => void
  dispose?(): void | Promise<void>
}

export interface ScopeContext<M = undefined> {
  readonly scopeId: string
  readonly storage: ScopeStorageAdapter
  readonly cache: ScopeCacheAdapter
  readonly request: ScopeRequestAdapter
  readonly comms: ScopeCommsAdapter
  readonly theme: ScopeThemeAdapter
  readonly memory: M
  /** Fans out to every adapter's dispose(). Safe to pass directly as a ScopeManager disposeScope callback. */
  destroy(): Promise<void>
}

export interface ScopeContextOptions<M = undefined> {
  createStorage?: (scopeId: string) => ScopeStorageAdapter
  createCache?: (scopeId: string) => ScopeCacheAdapter
  /**
   * Always receives the RESOLVED cache — the default if createCache was omitted, or the
   * custom one if supplied. There is no code path in which createRequest can see a cache
   * belonging to any scopeId other than the one it was called with.
   */
  createRequest?: (scopeId: string, cache: ScopeCacheAdapter) => ScopeRequestAdapter
  createComms?: (scopeId: string) => ScopeCommsAdapter
  createTheme?: (scopeId: string) => ScopeThemeAdapter
  createMemory?: (scopeId: string) => M
}
