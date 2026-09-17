import { type CSSProperties, type ReactNode, useEffect, useState } from 'react'
import type { ScopeContext, ScopeTheme } from 'scope-context'
import { ScopeReactContext } from './context'

export interface ScopeProviderProps<M> {
  value: ScopeContext<M>
  children: ReactNode
  /**
   * Default true: wraps children in a div carrying theme.tokens as inline CSS custom
   * properties and theme.className. Set to false to skip the wrapper element entirely (e.g.
   * a strict CSS Grid/Flexbox layout that can't tolerate an extra DOM node) and apply
   * useScopedTheme()'s tokens yourself, wherever you choose.
   */
  applyTheme?: boolean
}

export function ScopeProvider<M>({ value, children, applyTheme = true }: ScopeProviderProps<M>): JSX.Element {
  const [theme, setTheme] = useState<ScopeTheme>(() => value.theme.getTheme())

  useEffect(() => {
    setTheme(value.theme.getTheme())
    return value.theme.subscribe(setTheme)
  }, [value.theme])

  const provided = (
    <ScopeReactContext.Provider value={value as ScopeContext<unknown>}>{children}</ScopeReactContext.Provider>
  )

  if (!applyTheme) return provided

  return (
    <div data-scope-id={value.scopeId} className={theme.className} style={theme.tokens as CSSProperties}>
      {provided}
    </div>
  )
}
