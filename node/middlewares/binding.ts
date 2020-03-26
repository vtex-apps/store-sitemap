import { BindingResolver } from '../resources/bindings'

export async function binding(ctx: Context, next: () => Promise<any) {
  const bindingResolver = new BindingResolver()
  ctx.state.bindingId = await bindingResolver.discoverId(ctx)
  await next()
}
