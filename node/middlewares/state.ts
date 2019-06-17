
export async function prepareState(ctx: Context, next: () => Promise<any>) {

  ctx.state = {
    platform: ctx.headers['x-vtex-platform'] || 'vtex',
  }

  await next()
}
