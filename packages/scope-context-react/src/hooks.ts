import { useContext, useEffect, useState } from 'react'
import type { ScopeCacheAdapter, ScopeCommsAdapter, ScopeContext, ScopeRequestAdapter, ScopeStorageAdapter, ScopeTheme } from 'scope-context'
import { ScopeReactContext } from './context'

export function useScopeOrNull<M = unknown>(): ScopeContext<M> | null {
  return useContext(ScopeReactContext) as ScopeContext<M> | null
}

export function useScope<M = unknown>(): ScopeContext<M> {
  const scope = useScopeOrNull<M>()
  if (!scope) throw new Error('useScope() was called outside a <ScopeProvider>')
  return scope
}

export function useScopedStorage(): ScopeStorageAdapter {
  return useScope().storage
}

export function useScopedCache(): ScopeCacheAdapter {
  return useScope().cache
}

export function useScopedRequest(): ScopeRequestAdapter {
  return useScope().request
}

export function useScopedComms(): ScopeCommsAdapter {
  return useScope().comms
}

export function useScopedMemory<M = unknown>(): M {
  return useScope<M>().memory
}

export function useScopedTheme(): ScopeTheme {
  const scope = useScope()
  const [theme, setTheme] = useState<ScopeTheme>(() => scope.theme.getTheme())

  useEffect(() => {
    setTheme(scope.theme.getTheme())
    return scope.theme.subscribe(setTheme)
  }, [scope.theme])

  return theme
}
