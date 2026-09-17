import { inject, onUnmounted, ref, type Ref } from 'vue'
import type {
  ScopeCacheAdapter,
  ScopeCommsAdapter,
  ScopeContext,
  ScopeRequestAdapter,
  ScopeStorageAdapter,
  ScopeTheme,
} from 'scope-context'
import { SCOPE_CONTEXT_KEY } from './context'

export function useScopeOrNull<M = unknown>(): ScopeContext<M> | null {
  return (inject(SCOPE_CONTEXT_KEY, null) as ScopeContext<M> | null) ?? null
}

export function useScope<M = unknown>(): ScopeContext<M> {
  const scope = useScopeOrNull<M>()
  if (!scope) throw new Error('useScope() was called outside a component tree with provideScope()')
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

export function useScopedTheme(): Ref<ScopeTheme> {
  const scope = useScope()
  const theme = ref<ScopeTheme>(scope.theme.getTheme()) as Ref<ScopeTheme>
  const unsubscribe = scope.theme.subscribe((next) => {
    theme.value = next
  })
  onUnmounted(unsubscribe)
  return theme
}
