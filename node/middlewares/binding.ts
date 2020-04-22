import { BindingResolver } from '../resources/bindings'

export async function binding(ctx: Context, next: () => Promise<any>) {
  const bindingResolver = new BindingResolver()
  ctx.state.binding = await bindingResolver.discover(ctx)
  await next()
}
