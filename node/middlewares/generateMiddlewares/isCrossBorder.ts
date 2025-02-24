import { getStoreBindings } from '../../utils'

export async function isCrossBorder(
  ctx: Context | EventContext,
  next: () => Promise<void>
) {
  const {
    clients: { tenant },
    state,
  } = ctx

  const storefrontsBindings = await getStoreBindings(tenant)
  state.isCrossBorder = storefrontsBindings?.length > 1

  await next()
}
