import { BindingResolver } from '../resources/bindings'

export async function binding(ctx: Context, next: () => Promise<any>) {
  const bindingResolver = new BindingResolver()
  ctx.state.bindingId = await bindingResolver.discoverId(ctx)
  console.log('teste ctx.state.bindingId: ', ctx.state.bindingId)
  await next()
}
