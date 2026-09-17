import { createContext } from 'react'
import type { ScopeContext } from 'scope-context'

export const ScopeReactContext = createContext<ScopeContext<unknown> | null>(null)
