import { defineComponent, h, onUnmounted, type PropType, ref } from 'vue'
import type { ScopeContext, ScopeTheme } from 'scope-context'
import { provideScope } from './provide-scope'

export const ScopeProvider = defineComponent({
  name: 'ScopeProvider',
  props: {
    value: { type: Object as PropType<ScopeContext<unknown>>, required: true },
    /** Default true: wraps the default slot in a div carrying theme.tokens as inline CSS
     *  custom properties and theme.className. Set to false to skip the wrapper element. */
    applyTheme: { type: Boolean, default: true },
  },
  setup(props, { slots }) {
    provideScope(props.value)

    const theme = ref<ScopeTheme>(props.value.theme.getTheme())
    const unsubscribe = props.value.theme.subscribe((next) => {
      theme.value = next
    })
    onUnmounted(unsubscribe)

    return () => {
      const children = slots.default?.()
      if (!props.applyTheme) return children

      return h(
        'div',
        { 'data-scope-id': props.value.scopeId, class: theme.value.className, style: theme.value.tokens },
        children,
      )
    }
  },
})
