import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRolloutCoordinator, type RolloutOptions } from './rollout-machine'

function buildOptions(overrides: Partial<RolloutOptions> = {}): RolloutOptions {
  return {
    fetchManifest: vi.fn(async () => ({ resourceIds: ['app.abc123.js', 'app.abc123.css'] })),
    getCurrentResourceIds: vi.fn(() => ['app.old111.js', 'app.old111.css']),
    warmResources: vi.fn(async () => {}),
    verifyResourcesLanded: vi.fn(async () => true),
    fetchPointerBypassCache: vi.fn(async () => ({ referencedResourceIds: ['app.abc123.js', 'app.abc123.css'] })),
    promote: vi.fn(async () => ({ ok: true })),
    timeouts: { checkMs: 1000, warmMs: 1000, consumerCheckMs: 1000, consumerTotalMs: 5000 },
    ...overrides,
  }
}

describe('runAtomicRollout', () => {
  it('commits only when every phase succeeds in order', async () => {
    const coordinator = createRolloutCoordinator()
    const options = buildOptions()

    const result = await coordinator.runAtomicRollout('target-1', options)

    expect(result).toEqual({ committed: true })
    expect(options.warmResources).toHaveBeenCalled()
    expect(options.verifyResourcesLanded).toHaveBeenCalled()
    expect(options.promote).toHaveBeenCalled()
  })

  it('stops at warm and never calls verify/promote if warming fails', async () => {
    const options = buildOptions({ warmResources: vi.fn(async () => { throw new Error('network down') }) })
    const coordinator = createRolloutCoordinator()

    const result = await coordinator.runAtomicRollout('target-1', options)

    expect(result.committed).toBe(false)
    expect(result.failedPhase).toBe('warm')
    expect(options.verifyResourcesLanded).not.toHaveBeenCalled()
    expect(options.promote).not.toHaveBeenCalled()
  })

  it('never calls promote when verifyResourcesLanded returns false', async () => {
    const options = buildOptions({ verifyResourcesLanded: vi.fn(async () => false) })
    const coordinator = createRolloutCoordinator()

    const result = await coordinator.runAtomicRollout('target-1', options)

    expect(result).toEqual({ committed: false, failedPhase: 'verify', reason: 'resources-not-landed' })
    expect(options.promote).not.toHaveBeenCalled()
  })

  it('aborts before promote when the bypass-cache pointer does not match the warmed manifest', async () => {
    const options = buildOptions({
      fetchPointerBypassCache: vi.fn(async () => ({ referencedResourceIds: ['app.OLD111.js', 'app.OLD111.css'] })),
    })
    const coordinator = createRolloutCoordinator()

    const result = await coordinator.runAtomicRollout('target-1', options)

    expect(result.committed).toBe(false)
    expect(result.failedPhase).toBe('promote')
    expect(result.reason).toBe('pointer-resource-mismatch')
    expect(options.promote).not.toHaveBeenCalled()
  })

  it('reports the promote phase failure reason when promote rejects', async () => {
    const options = buildOptions({ promote: vi.fn(async () => ({ ok: false, reason: 'server-rejected' })) })
    const coordinator = createRolloutCoordinator()

    const result = await coordinator.runAtomicRollout('target-1', options)

    expect(result).toEqual({ committed: false, failedPhase: 'promote', reason: 'server-rejected' })
  })
})

describe('checkForRollout — fail-open behavior', () => {
  it('reports hasUpdate: true when the manifest is unreachable', async () => {
    const options = buildOptions({ fetchManifest: vi.fn(async () => { throw new Error('offline') }) })
    const coordinator = createRolloutCoordinator()

    const result = await coordinator.checkForRollout('target-1', options)

    expect(result).toEqual({ hasUpdate: true, reason: 'manifest-unreachable' })
  })

  it('reports hasUpdate: true when the manifest is malformed', async () => {
    const options = buildOptions({ fetchManifest: vi.fn(async () => ({ resourceIds: [] })) })
    const coordinator = createRolloutCoordinator()

    const result = await coordinator.checkForRollout('target-1', options)

    expect(result).toEqual({ hasUpdate: true, reason: 'manifest-malformed' })
  })

  it('reports hasUpdate: false when the manifest matches current resource ids', async () => {
    const options = buildOptions({
      fetchManifest: vi.fn(async () => ({ resourceIds: ['app.same.js'] })),
      getCurrentResourceIds: vi.fn(() => ['app.same.js']),
    })
    const coordinator = createRolloutCoordinator()

    const result = await coordinator.checkForRollout('target-1', options)

    expect(result).toEqual({ hasUpdate: false, reason: 'up-to-date' })
  })
})

describe('checkForRollout — timeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fails open when fetchManifest never resolves within checkMs', async () => {
    const options = buildOptions({
      fetchManifest: () => new Promise(() => {}),
      timeouts: { checkMs: 1000, warmMs: 1000, consumerCheckMs: 1000, consumerTotalMs: 5000 },
    })
    const coordinator = createRolloutCoordinator()

    const resultPromise = coordinator.checkForRollout('target-1', options)
    await vi.advanceTimersByTimeAsync(1000)

    expect(await resultPromise).toEqual({ hasUpdate: true, reason: 'manifest-unreachable' })
  })
})

describe('checkForRollout — per-target dedup', () => {
  it('two concurrent calls for the same targetId share a single fetchManifest call', async () => {
    let resolveManifest: (value: { resourceIds: string[] }) => void = () => {}
    const fetchManifest = vi.fn(
      () =>
        new Promise<{ resourceIds: string[] }>((resolve) => {
          resolveManifest = resolve
        }),
    )
    const options = buildOptions({ fetchManifest })
    const coordinator = createRolloutCoordinator()

    const first = coordinator.checkForRollout('target-1', options)
    const second = coordinator.checkForRollout('target-1', options)

    expect(fetchManifest).toHaveBeenCalledTimes(1)
    resolveManifest({ resourceIds: ['app.abc123.js'] })

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(firstResult).toBe(secondResult)
  })

  it('different targetIds never dedupe against each other', async () => {
    const fetchManifest = vi.fn(async () => ({ resourceIds: ['app.abc123.js'] }))
    const options = buildOptions({ fetchManifest })
    const coordinator = createRolloutCoordinator()

    await Promise.all([
      coordinator.checkForRollout('target-1', options),
      coordinator.checkForRollout('target-2', options),
    ])

    expect(fetchManifest).toHaveBeenCalledTimes(2)
  })

  it('a later, non-overlapping call for the same targetId triggers a fresh fetchManifest', async () => {
    const fetchManifest = vi.fn(async () => ({ resourceIds: ['app.abc123.js'] }))
    const options = buildOptions({ fetchManifest })
    const coordinator = createRolloutCoordinator()

    await coordinator.checkForRollout('target-1', options)
    await coordinator.checkForRollout('target-1', options)

    expect(fetchManifest).toHaveBeenCalledTimes(2)
  })
})
