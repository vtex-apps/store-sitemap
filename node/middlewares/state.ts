
export async function prepareState(ctx: Context, next: () => Promise<any>) {
  ctx.state = {
    platform: ctx.vtex.platform || 'vtex',
  }

  await next()
}
