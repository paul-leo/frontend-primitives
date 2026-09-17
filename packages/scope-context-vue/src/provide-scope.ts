import { provide } from 'vue'
import type { ScopeContext } from 'scope-context'
import { SCOPE_CONTEXT_KEY } from './context'

/** Call inside setup(). */
export function provideScope<M>(context: ScopeContext<M>): void {
  provide(SCOPE_CONTEXT_KEY, context as ScopeContext<unknown>)
}
