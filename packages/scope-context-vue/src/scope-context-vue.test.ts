// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createScopeContext, createStaticThemeAdapter } from 'scope-context'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import { ScopeProvider } from './scope-provider'
import { provideScope } from './provide-scope'
import { useScope, useScopedCache } from './composables'

const Probe = defineComponent({
  setup() {
    const scope = useScope()
    return () => h('div', { 'data-testid': 'probe' }, scope.scopeId)
  },
})

describe('useScope()', () => {
  it('throws a clear error outside any provideScope()', () => {
    expect(() => mount(Probe)).toThrow('useScope() was called outside a component tree with provideScope()')
  })

  it('nested providers: the innermost value wins', () => {
    const outer = createScopeContext('outer')
    const inner = createScopeContext('inner')

    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h(ScopeProvider, { value: outer, applyTheme: false }, () =>
              h(ScopeProvider, { value: inner, applyTheme: false }, () => h(Probe)),
            )
        },
      }),
    )

    expect(wrapper.get('[data-testid="probe"]').text()).toBe('inner')
  })

  it('useScopedCache() returns the same reference as useScope().cache', () => {
    const ctx = createScopeContext('org-a')
    let seenCache: unknown
    let seenScopeCache: unknown
    const CacheProbe = defineComponent({
      setup() {
        seenCache = useScopedCache()
        seenScopeCache = useScope().cache
        return () => null
      },
    })

    mount(defineComponent({ setup: () => () => h(ScopeProvider, { value: ctx, applyTheme: false }, () => h(CacheProbe)) }))

    expect(seenCache).toBe(seenScopeCache)
  })

  it('two independently-mounted trees never see each other\'s injected value', () => {
    const orgA = createScopeContext('org-a')
    const orgB = createScopeContext('org-b')

    const wrapperA = mount(defineComponent({ setup: () => () => h(ScopeProvider, { value: orgA, applyTheme: false }, () => h(Probe)) }))
    const wrapperB = mount(defineComponent({ setup: () => () => h(ScopeProvider, { value: orgB, applyTheme: false }, () => h(Probe)) }))

    expect(wrapperA.get('[data-testid="probe"]').text()).toBe('org-a')
    expect(wrapperB.get('[data-testid="probe"]').text()).toBe('org-b')
  })
})

describe('<ScopeProvider> theming', () => {
  it('applies theme.tokens as CSS custom properties on a wrapper element by default', () => {
    const ctx = createScopeContext('org-a', {
      createTheme: () => createStaticThemeAdapter({ tokens: { '--scope-primary': 'blue' } })('org-a'),
    })

    const wrapper = mount(defineComponent({ setup: () => () => h(ScopeProvider, { value: ctx }, () => h('span', 'content')) }))

    const el = wrapper.get('[data-scope-id="org-a"]').element as HTMLElement
    expect(el.style.getPropertyValue('--scope-primary')).toBe('blue')
  })

  it('two coexisting providers with different themes never clash', () => {
    const orgA = createScopeContext('org-a', {
      createTheme: () => createStaticThemeAdapter({ tokens: { '--scope-primary': 'blue' } })('org-a'),
    })
    const orgB = createScopeContext('org-b', {
      createTheme: () => createStaticThemeAdapter({ tokens: { '--scope-primary': 'red' } })('org-b'),
    })

    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h('div', [
            h(ScopeProvider, { value: orgA }, () => h('span', 'A')),
            h(ScopeProvider, { value: orgB }, () => h('span', 'B')),
          ]),
      }),
    )

    const elA = wrapper.get('[data-scope-id="org-a"]').element as HTMLElement
    const elB = wrapper.get('[data-scope-id="org-b"]').element as HTMLElement
    expect(elA.style.getPropertyValue('--scope-primary')).toBe('blue')
    expect(elB.style.getPropertyValue('--scope-primary')).toBe('red')
  })

  it('applyTheme={false} renders no wrapper element', () => {
    const ctx = createScopeContext('org-a')
    const wrapper = mount(
      defineComponent({
        setup: () => () => h(ScopeProvider, { value: ctx, applyTheme: false }, () => h('span', { 'data-testid': 'direct-child' }, 'content')),
      }),
    )

    expect(wrapper.find('[data-scope-id]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="direct-child"]').exists()).toBe(true)
  })
})

describe('provideScope()', () => {
  it('works as a standalone composable without the ScopeProvider component', () => {
    const ctx = createScopeContext('org-a')
    const Consumer = defineComponent({
      setup() {
        provideScope(ctx)
        return () => h(Probe)
      },
    })

    const wrapper = mount(Consumer)
    expect(wrapper.get('[data-testid="probe"]').text()).toBe('org-a')
  })
})
