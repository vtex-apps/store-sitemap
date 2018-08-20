import {getRobotsTxt} from '../resources/site'

export const robots = async (ctx: ColossusContext) => {
  const {data} = await getRobotsTxt(ctx)
  ctx.set('Content-Type', 'text/plain')
  ctx.body = data
  ctx.status = 200
}
