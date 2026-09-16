# instance-pool

A controlled pool for non-component resources — iframes, workers, independent JS runtimes,
connections — that need to be pre-warmed idle, claimed by a session, and cooled down for reuse
instead of torn down immediately.

**If you only need to pool plain framework components**, use Vue's `<KeepAlive :key :max>` or
[`react-activation`](https://www.npmjs.com/package/react-activation) instead — they already solve
that, and do it better than this package would. `instance-pool` is for resources those tools
cannot manage: anything where "keep the instance alive" means more than "don't unmount the DOM
node," such as forcing new state into an already-running independent execution context.

```ts
import { InstancePool } from 'instance-pool'

const pool = new InstancePool({
  idleProps: { active: false }, // a genuinely no-op placeholder state
  createInstance: (sessionKey) => createSandboxedInstance(sessionKey),
  cooldownMs: 30_000,
  maxPoolSize: 8,
  onInstanceCreated: (instance, sessionKey) => attachCommonSetup(instance),
})

const instance = pool.getOrCreate('session-42')
instance.claim({ active: true })
// ...later...
pool.release('session-42') // enters cooldown; a getOrCreate('session-42') within cooldownMs reuses it
```

See the monorepo [README](../../README.md) for how this composes with `scope-manager`.

MIT licensed.
