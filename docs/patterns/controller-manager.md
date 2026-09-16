# The Controller/Manager pattern

**This isn't a package, and it isn't multi-org/multi-tenant specific.** It's a description of how
to compose `scope-manager`'s `ScopeManager<T>` when a system needs to manage multiple independent,
long-lived instances of something — a "Controller" per instance, and a "Manager" that owns the
registry of Controllers. A single-user app juggling several open documents, several game rooms, or
several plugin instances needs exactly the same shape as a multi-tenant SaaS app juggling
per-organization state. Scope is whatever the consumer says it is.

## The core insight: Manager is not a new primitive

A "Manager" is a `ScopeManager<Controller>` (or `LruScopeManager<Controller>` when you also need a
capacity bound). That's it — there is no separate `Manager` class in `scope-manager` because there
doesn't need to be one:

```ts
import { ScopeManager, LruScopeManager } from 'scope-manager'

class MemoListController {
  constructor(private readonly scopeId: string) {}
  // ...owns one list's fetch/cache/subscription state...
  destroy() {
    /* abort in-flight requests, unsubscribe */
  }
}

const memoListManager = new ScopeManager<MemoListController>({
  createScope: (scopeId) => new MemoListController(scopeId),
  disposeScope: (controller) => controller.destroy(),
})

// consumer code just asks for "the controller for this scope" — creation/reuse is not its problem
memoListManager.getOrCreate(currentWorkspaceId).load()
```

Nesting one more layer gives you a two-level Manager — e.g. an outer scope keyed by tenant, an
inner one keyed by resource — but neither layer is a different kind of thing:

```ts
const tenantManagers = new ScopeManager<ScopeManager<MemoListController>>({
  createScope: () =>
    new LruScopeManager<MemoListController>({
      maxSize: 20,
      createScope: (resourceId) => new MemoListController(resourceId),
      disposeScope: (controller) => controller.destroy(),
    }),
  disposeScope: (inner) => inner.destroyAll(),
})

tenantManagers.getOrCreate(tenantId).getOrCreate(resourceId).load()
```

## Why the outer scope has to be in the key, not a separate `reset()` call

A common intermediate design has a Manager that's a plain global registry keyed by a bare resource
id, with a `reset()` method called on tenant switch. This looks correct and passes casual testing,
but has a real gap: anything created in the window between "tenant switch started" and "reset()
actually ran" is still keyed by the bare id, and collides with the next tenant's identically-keyed
resource. Folding the tenant id into the key itself (`ScopeManager` keyed by
`buildScopedKey(tenantId, resourceId)`, or the nested-registry shape above) makes different
tenants' entries structurally different map entries — correctness doesn't depend on `reset()`
running at the right time relative to everything else.

## Capacity tuning is not a substitute for correct reuse logic

If you find yourself repeatedly changing an `LruScopeManager`'s `maxSize` up and down to make a
symptom go away, that's usually a sign the "when do we reuse vs. create a new Controller" decision
elsewhere in the code is wrong, not that the number is wrong. Fix the reuse logic first; a small
capacity should stop being a problem once it does.

## Shared mutable state across concurrent operations

Two operations on the same Controller that share one `AbortController` (e.g. a full re-init vs. a
silent background refresh) can end up with the wrong one "winning" the race for who gets to clear
a loading flag. A monotonic sequence number (see `RefreshGuard` in `scope-manager`) that lets a
resolved-but-stale response be discarded is usually safer than aborting the in-flight request
outright, especially when multiple callers may legitimately be racing on purpose.

## Mutex checks must exclude the checker itself

A Controller registering itself into a shared occupancy slot, then immediately checking "is this
slot free," will see its own just-set claim and incorrectly conclude the slot is taken — unless the
check explicitly excludes its own holder id. See `OccupancyGate.isClaimed(key, excludingHolderId)`
in `scope-manager`.

## Enumerate every real exit path before writing teardown guards

Teardown logic has to run on *every* real exit path — explicit sign-out, a forced server-side
disconnect, an expired credential, a parent orchestrator's reset — not just "the one exit function
you thought of first." Write down the full list of exit paths before writing the guard, not after
the first bug report.

## The two failure directions

A Controller/Manager codebase rots in one of two directions: many uncoordinated ad-hoc singletons
each reinventing scope isolation slightly differently (the actual, repeated failure mode this
pattern was extracted from), or one Manager slowly absorbing responsibilities that belong to a
narrower Controller. The fix for both is the same: keep Controllers narrow, and let exactly one
Manager own the registry.
