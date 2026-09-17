import { describe, expect, it, vi } from 'vitest'
import { createInMemoryCacheAdapter } from './default-cache-adapter'
import { createFetchRequestAdapter } from './default-request-adapter'

describe('createFetchRequestAdapter', () => {
  it('query() caches the result of the fetcher', async () => {
    const cache = createInMemoryCacheAdapter()('org-1')
    const request = createFetchRequestAdapter()('org-1', cache)
    const fetcher = vi.fn(async () => 'value')

    const first = await request.query('key', fetcher)
    const second = await request.query('key', fetcher)

    expect(first).toBe('value')
    expect(second).toBe('value')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('query() dedupes concurrent calls for the same key', async () => {
    const cache = createInMemoryCacheAdapter()('org-1')
    const request = createFetchRequestAdapter()('org-1', cache)
    let resolveFetch: (value: string) => void = () => {}
    const fetcher = vi.fn(() => new Promise<string>((resolve) => (resolveFetch = resolve)))

    const first = request.query('key', fetcher)
    const second = request.query('key', fetcher)
    resolveFetch('value')

    expect(await Promise.all([first, second])).toEqual(['value', 'value'])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('fetch() calls the injected baseFetch, bypassing the cache entirely', async () => {
    const cache = createInMemoryCacheAdapter()('org-1')
    const baseFetch = vi.fn(async () => new Response('ok'))
    const request = createFetchRequestAdapter({ baseFetch: baseFetch as unknown as typeof fetch })('org-1', cache)

    await request.fetch('https://example.com')

    expect(baseFetch).toHaveBeenCalledWith('https://example.com', undefined)
    expect(cache.get('https://example.com')).toBeUndefined()
  })
})
