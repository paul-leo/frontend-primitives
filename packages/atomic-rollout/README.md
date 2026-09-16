# atomic-rollout

A loader-agnostic `check → warm → verify → promote` protocol for atomically rolling out a new
version of a set of related resources — a remote micro-frontend entry, a Module Federation
container, a native app update bundle — so a consumer never ends up running a mix of old and new
resources.

This is not tied to Service Workers, qiankun, Module Federation, or wujie — it sits as a
middleware layer between "fetch the entry pointer" and "actually execute it," regardless of which
loader you use. The problem it solves is a documented, unsolved gap across the whole
micro-frontend ecosystem: qiankun's `import-html-entry` has a known `embedHTMLCache` issue with no
built-in fix, Module Federation has ["The Module Federation Cache Invalidation
Nightmare"](https://github.com/module-federation), and wujie's docs don't address it at all.

```ts
import { createRolloutCoordinator, createPrefetchQueue } from 'atomic-rollout'

const coordinator = createRolloutCoordinator()

const { hasUpdate } = await coordinator.checkForRollout('memo3-editor', options)
if (hasUpdate) {
  const result = await coordinator.runAtomicRollout('memo3-editor', options)
  if (!result.committed) reportRolloutFailure(result.failedPhase, result.reason)
}
```

`options` supplies `fetchManifest`, `getCurrentResourceIds`, `warmResources`,
`verifyResourcesLanded`, `fetchPointerBypassCache`, `promote`, and per-phase `timeouts` — see
[`src/rollout-machine.ts`](./src/rollout-machine.ts) for the full shape. Every phase is
independently testable against your own loader's implementation of those callbacks.

Background prefetching should go through `createPrefetchQueue(maxConcurrent)` rather than its own
ad-hoc concurrency limit — prefetch work should never win a bandwidth race against foreground
requests.

MIT licensed.
