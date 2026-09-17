import { describe, expect, it, vi } from 'vitest'
import { createStaticThemeAdapter } from './default-theme-adapter'

describe('createStaticThemeAdapter', () => {
  it('defaults to an empty theme when no initial theme is given', () => {
    const theme = createStaticThemeAdapter()('org-1')
    expect(theme.getTheme()).toEqual({ tokens: {} })
  })

  it('getTheme returns the initial theme when provided', () => {
    const theme = createStaticThemeAdapter({ tokens: { '--scope-primary': 'blue' } })('org-1')
    expect(theme.getTheme()).toEqual({ tokens: { '--scope-primary': 'blue' } })
  })

  it('setTheme updates getTheme and notifies subscribers', () => {
    const theme = createStaticThemeAdapter()('org-1')
    const handler = vi.fn()
    theme.subscribe(handler)

    theme.setTheme({ tokens: { '--scope-primary': 'red' } })

    expect(theme.getTheme()).toEqual({ tokens: { '--scope-primary': 'red' } })
    expect(handler).toHaveBeenCalledWith({ tokens: { '--scope-primary': 'red' } })
  })

  it('unsubscribe stops further notifications', () => {
    const theme = createStaticThemeAdapter()('org-1')
    const handler = vi.fn()
    const unsubscribe = theme.subscribe(handler)
    unsubscribe()

    theme.setTheme({ tokens: {} })

    expect(handler).not.toHaveBeenCalled()
  })
})
