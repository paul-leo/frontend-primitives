import type { ScopeTheme, ScopeThemeAdapter } from './types'

const EMPTY_THEME: ScopeTheme = { tokens: {} }

/** Zero-dependency theme adapter holding a static (but runtime-swappable via setTheme) theme. */
export function createStaticThemeAdapter(initial: ScopeTheme = EMPTY_THEME): (scopeId: string) => ScopeThemeAdapter {
  return () => {
    let current = initial
    const listeners = new Set<(theme: ScopeTheme) => void>()

    return {
      getTheme() {
        return current
      },
      setTheme(theme) {
        current = theme
        listeners.forEach((listener) => listener(current))
      },
      subscribe(handler) {
        listeners.add(handler)
        return () => listeners.delete(handler)
      },
    }
  }
}
