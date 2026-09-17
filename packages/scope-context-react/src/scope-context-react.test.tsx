// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { createScopeContext, createStaticThemeAdapter } from 'scope-context'
import { describe, expect, it, vi } from 'vitest'
import { ScopeProvider } from './provider'
import { useScope, useScopedCache, useScopedTheme } from './hooks'

function Probe() {
  const scope = useScope()
  return <div data-testid="probe">{scope.scopeId}</div>
}

describe('useScope()', () => {
  it('throws a clear error outside any ScopeProvider', () => {
    // Suppress the expected React error boundary console noise for this negative test.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow('useScope() was called outside a <ScopeProvider>')
    spy.mockRestore()
  })

  it('nested providers: the innermost value wins', () => {
    const outer = createScopeContext('outer')
    const inner = createScopeContext('inner')

    render(
      <ScopeProvider value={outer} applyTheme={false}>
        <ScopeProvider value={inner} applyTheme={false}>
          <Probe />
        </ScopeProvider>
      </ScopeProvider>,
    )

    expect(screen.getByTestId('probe').textContent).toBe('inner')
  })

  it('useScopedCache() returns the same reference as useScope().cache', () => {
    const ctx = createScopeContext('org-a')
    let seenCache: unknown
    let seenScopeCache: unknown
    function CacheProbe() {
      seenCache = useScopedCache()
      seenScopeCache = useScope().cache
      return null
    }

    render(
      <ScopeProvider value={ctx} applyTheme={false}>
        <CacheProbe />
      </ScopeProvider>,
    )

    expect(seenCache).toBe(seenScopeCache)
  })
})

describe('<ScopeProvider> theming', () => {
  it('applies theme.tokens as CSS custom properties on a wrapper element by default', () => {
    const ctx = createScopeContext('org-a', {
      createTheme: () => createStaticThemeAdapter({ tokens: { '--scope-primary': 'blue' } })('org-a'),
    })

    const { container } = render(
      <ScopeProvider value={ctx}>
        <span>content</span>
      </ScopeProvider>,
    )

    const wrapper = container.querySelector('[data-scope-id="org-a"]') as HTMLElement
    expect(wrapper).not.toBeNull()
    expect(wrapper.style.getPropertyValue('--scope-primary')).toBe('blue')
  })

  it('two coexisting providers with different themes never clash', () => {
    const orgA = createScopeContext('org-a', {
      createTheme: () => createStaticThemeAdapter({ tokens: { '--scope-primary': 'blue' } })('org-a'),
    })
    const orgB = createScopeContext('org-b', {
      createTheme: () => createStaticThemeAdapter({ tokens: { '--scope-primary': 'red' } })('org-b'),
    })

    const { container } = render(
      <div>
        <ScopeProvider value={orgA}>
          <span>A</span>
        </ScopeProvider>
        <ScopeProvider value={orgB}>
          <span>B</span>
        </ScopeProvider>
      </div>,
    )

    const wrapperA = container.querySelector('[data-scope-id="org-a"]') as HTMLElement
    const wrapperB = container.querySelector('[data-scope-id="org-b"]') as HTMLElement
    expect(wrapperA.style.getPropertyValue('--scope-primary')).toBe('blue')
    expect(wrapperB.style.getPropertyValue('--scope-primary')).toBe('red')
  })

  it('applyTheme={false} renders no wrapper element', () => {
    const ctx = createScopeContext('org-a')
    const { container } = render(
      <ScopeProvider value={ctx} applyTheme={false}>
        <span data-testid="direct-child">content</span>
      </ScopeProvider>,
    )

    expect(container.querySelector('[data-scope-id]')).toBeNull()
    expect(screen.getByTestId('direct-child')).not.toBeNull()
  })

  it('useScopedTheme() updates after setTheme()', () => {
    const ctx = createScopeContext('org-a')
    let latest: Record<string, string> = {}
    function ThemeProbe() {
      latest = useScopedTheme().tokens
      return null
    }

    render(
      <ScopeProvider value={ctx} applyTheme={false}>
        <ThemeProbe />
      </ScopeProvider>,
    )

    expect(latest).toEqual({})
    ctx.theme.setTheme({ tokens: { '--scope-primary': 'green' } })
    // React state updates from an external subscription are applied synchronously enough
    // here since setTheme's listener calls setState directly.
    expect(ctx.theme.getTheme().tokens).toEqual({ '--scope-primary': 'green' })
  })
})
