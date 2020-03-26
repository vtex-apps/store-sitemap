import { prop, toString } from "ramda"

const TEN_MINUTES_S = 10 * 60

export async function robots(ctx: Context) {
  const { vtex: { account, production, platform }, clients, state: { bindingId } } = ctx
  let data = ''
  if (platform === 'gocommerce') {
    data = await clients.robotsGC.fromLegacy(account)
  } else if (bindingId) {

    const robotsConfigs =
      await clients.apps.getAppFile(`${account}.robots-settings@0.x`, 'dist/vtex.store-sitemap/bindings.json', true)
      .then(prop('data'))
      .then(toString)
      .then(JSON.parse)
      .catch(_ => null)
    
    if (robotsConfigs) {
      const robotForBinding = robotsConfigs[bindingId]
      if (!robotForBinding) {
        throw Error('No robot config specified for current binding')
      }
      data = robotForBinding
    }
  } else {
    data = await clients.robots.fromLegacy(account)
  }

  ctx.set('Content-Type', 'text/plain')
  ctx.body = data
  ctx.status = 200
  ctx.set('cache-control', production ? `public, max-age=${TEN_MINUTES_S}` : 'no-cache')
}
