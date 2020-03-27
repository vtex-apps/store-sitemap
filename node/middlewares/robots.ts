import { Apps } from "@vtex/api"

const TEN_MINUTES_S = 10 * 60

interface RobotsFile {
  robots: Record<string, string>
}

const SITEMAP_BUILD_FILE = 'dist/vtex.store-sitemap/build.json'

const getRobotForBinding = async (bindingId: string, account: string, apps: Apps) => {
  const buildFile = await apps.getAppJSON<Partial<RobotsFile> | null>(`${account}.robots@0.x`, SITEMAP_BUILD_FILE, true)
  return buildFile?.robots?.[bindingId]
}

export async function robots(ctx: Context) {
  const { vtex: { account, production, platform }, clients, state: { bindingId } } = ctx
  let data: string | undefined = undefined
  const robotsDataSource = platform === 'gocommerce' ? clients.robotsGC : clients.robots
  if (bindingId) {
    data = await getRobotForBinding(bindingId, account, clients.apps)
  }
  if (!data || !bindingId) {
    data = await robotsDataSource.fromLegacy(account)
  }

  ctx.set('Content-Type', 'text/plain')
  ctx.body = data
  ctx.status = 200
  ctx.set('cache-control', production ? `public, max-age=${TEN_MINUTES_S}` : 'no-cache')
}
