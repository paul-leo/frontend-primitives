import type { InjectionKey } from 'vue'
import type { ScopeContext } from 'scope-context'

/** A Symbol DI key — same "identity should be structural, not a string someone could collide
 *  with" thesis as scope-manager's buildScopedKey, applied to Vue's provide/inject. */
export const SCOPE_CONTEXT_KEY: InjectionKey<ScopeContext<unknown>> = Symbol('scope-context')
