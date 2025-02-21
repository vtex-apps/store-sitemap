export async function isCrossBorder(ctx: Context | EventContext, next: () => Promise<void>) {
  const {
    clients: { tenant },
    state,
  } = ctx

  const { bindings } = await tenant.info()
  const storefrontsBindings = bindings.filter(({targetProduct}) => targetProduct !== 'vtex-admin')

  state.isCrossBorder = storefrontsBindings?.length > 1

  await next();
}
