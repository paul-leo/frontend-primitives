import { ScopeManager } from 'scope-manager'

export type RolloutPhase = 'check' | 'warm' | 'verify' | 'promote' | 'commit'

export interface ResourceManifest {
  /** Content-addressed resource identities (e.g. contenthash filenames) — never a version number field. */
  resourceIds: string[]
}

export interface RolloutTimeouts {
  checkMs: number
  warmMs: number
  /** Paired budget for whatever is consuming this rollout downstream. Not enforced here — this
   *  field exists so callers are forced to consciously set it alongside checkMs/warmMs, and should
   *  be shorter than the consumer's own timeout so the host fails first. */
  consumerCheckMs: number
  consumerTotalMs: number
}

export interface RolloutOptions {
  fetchManifest: () => Promise<ResourceManifest>
  getCurrentResourceIds: () => string[]
  warmResources: (manifest: ResourceManifest) => Promise<void>
  /** Re-read the real storage — a resolved warmResources() promise is not proof anything actually landed. */
  verifyResourcesLanded: (manifest: ResourceManifest) => Promise<boolean>
  /** Must bypass any cache — this is the "did the real world move while we were warming?" check. */
  fetchPointerBypassCache: () => Promise<{ referencedResourceIds: string[] }>
  promote: (manifest: ResourceManifest) => Promise<{ ok: boolean; reason?: string }>
  timeouts: RolloutTimeouts
}

export type RolloutCheckReason =
  | 'confirmed-stale'
  | 'up-to-date'
  | 'manifest-unreachable'
  | 'manifest-malformed'

export interface RolloutCheckResult {
  hasUpdate: boolean
  reason: RolloutCheckReason
}

export interface RolloutRunResult {
  committed: boolean
  failedPhase?: RolloutPhase
  reason?: string
}

export interface RolloutCoordinator {
  /** Concurrent calls for the same targetId share a single in-flight fetchManifest. */
  checkForRollout(targetId: string, options: RolloutOptions): Promise<RolloutCheckResult>
  runAtomicRollout(targetId: string, options: RolloutOptions): Promise<RolloutRunResult>
  /** Stop tracking a target (e.g. its consumer was unmounted). Does not cancel an in-flight run. */
  forget(targetId: string): void
}

interface TargetState {
  inFlightCheck?: Promise<RolloutCheckResult>
}

/**
 * Each independent rollout target (a remote micro-frontend, a deploy slot, a content-addressed
 * bundle) gets its own tracked state, keyed by targetId — so N independent targets never block
 * or dedupe against each other, and a caller can explicitly stop tracking one without touching
 * the rest.
 */
export function createRolloutCoordinator(): RolloutCoordinator {
  const targets = new ScopeManager<TargetState>({ createScope: () => ({}) })

  return {
    checkForRollout(targetId, options) {
      const state = targets.getOrCreate(targetId)
      if (state.inFlightCheck) return state.inFlightCheck
      const promise = performCheck(options).finally(() => {
        state.inFlightCheck = undefined
      })
      state.inFlightCheck = promise
      return promise
    },
    runAtomicRollout(_targetId, options) {
      return performRollout(options)
    },
    forget(targetId) {
      targets.destroy(targetId)
    },
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('rollout step timed out')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

function sameResourceIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((id, i) => id === sortedB[i])
}

function isWellFormedManifest(manifest: ResourceManifest | undefined | null): manifest is ResourceManifest {
  return !!manifest && Array.isArray(manifest.resourceIds) && manifest.resourceIds.length > 0
}

async function performCheck(options: RolloutOptions): Promise<RolloutCheckResult> {
  let manifest: ResourceManifest
  try {
    manifest = await withTimeout(options.fetchManifest(), options.timeouts.checkMs)
  } catch {
    // Fail-open: an unreachable/timed-out manifest must never be reported as "you're up to date" —
    // that would strand a session that genuinely needs the update in a broken/read-only state.
    return { hasUpdate: true, reason: 'manifest-unreachable' }
  }

  if (!isWellFormedManifest(manifest)) {
    return { hasUpdate: true, reason: 'manifest-malformed' }
  }

  const current = options.getCurrentResourceIds()
  if (sameResourceIds(manifest.resourceIds, current)) {
    return { hasUpdate: false, reason: 'up-to-date' }
  }
  return { hasUpdate: true, reason: 'confirmed-stale' }
}

async function performRollout(options: RolloutOptions): Promise<RolloutRunResult> {
  let manifest: ResourceManifest
  try {
    manifest = await withTimeout(options.fetchManifest(), options.timeouts.checkMs)
  } catch {
    return { committed: false, failedPhase: 'check', reason: 'manifest-unreachable' }
  }
  if (!isWellFormedManifest(manifest)) {
    return { committed: false, failedPhase: 'check', reason: 'manifest-malformed' }
  }

  try {
    await withTimeout(options.warmResources(manifest), options.timeouts.warmMs)
  } catch {
    return { committed: false, failedPhase: 'warm', reason: 'warm-failed-or-timed-out' }
  }

  const landed = await options.verifyResourcesLanded(manifest)
  if (!landed) {
    return { committed: false, failedPhase: 'verify', reason: 'resources-not-landed' }
  }

  let pointer: { referencedResourceIds: string[] }
  try {
    pointer = await options.fetchPointerBypassCache()
  } catch {
    return { committed: false, failedPhase: 'promote', reason: 'pointer-unreachable' }
  }
  if (!sameResourceIds(pointer.referencedResourceIds, manifest.resourceIds)) {
    // The entry pointer we're about to promote to must reference exactly the batch we just
    // warmed and verified — otherwise we'd atomically commit to a pointer/resource mismatch.
    return { committed: false, failedPhase: 'promote', reason: 'pointer-resource-mismatch' }
  }

  const promoted = await options.promote(manifest)
  if (!promoted.ok) {
    return { committed: false, failedPhase: 'promote', reason: promoted.reason ?? 'promote-rejected' }
  }

  return { committed: true }
}
