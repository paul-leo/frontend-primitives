# scope-context-vue

Vue bindings for [`scope-context`](../scope-context): `provideScope()`/`<ScopeProvider>` thread
a `ScopeContext` through the component tree without prop-drilling, apply its theme as CSS
custom properties by default, and expose `useScope()` plus per-axis composables.

```ts
import { ScopeManager } from 'scope-manager'
import { createScopeContext, type ScopeContext } from 'scope-context'
import { ScopeProvider, useScope, useScopedRequest } from 'scope-context-vue'

const scopes = new ScopeManager<ScopeContext>({
  createScope: (id) => createScopeContext(id),
  disposeScope: (ctx) => ctx.destroy(),
})
```

```vue
<template>
  <ScopeProvider :value="scopes.getOrCreate('org-a')"><OrgPanel /></ScopeProvider>
  <ScopeProvider :value="scopes.getOrCreate('org-b')"><OrgPanel /></ScopeProvider>
</template>
```

Inside `OrgPanel`'s `setup()`:

```ts
import { useScope, useScopedRequest } from 'scope-context-vue'

const scope = useScope()
const request = useScopedRequest()
```

Prefer calling `provideScope(ctx)` directly inside your own `setup()` over the `<ScopeProvider>`
component when you don't want the theme wrapper element at all (rather than setting
`applyTheme={false}` on the component). The DI key (`SCOPE_CONTEXT_KEY`) is a `Symbol`, not a
string — the same "identity should be structural, not a string someone could collide with"
principle as `scope-manager`'s `buildScopedKey`.

MIT licensed.
