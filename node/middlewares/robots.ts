import { Apps, Logger } from "@vtex/api"

const TEN_MINUTES_S = 10 * 60

interface RobotsFile {
  robots: Record<string, string>
}

const SITEMAP_BUILD_FILE = 'dist/vtex.store-sitemap/build.json'

const getAppRobot = (apps: Apps, deps: Record<string, string[]>, logger: Logger) => async (appName: string) => {
  const robots = await apps.getAppJSON(appName, SITEMAP_BUILD_FILE, true)
  if (robots && !deps[appName].includes('vtex.store-sitemap@1.x')) {
    logger.warn({ message: `App ${appName} exports robots config, but does not depend on vtex.store-sitemap@1.x` })
  }
  return robots as Partial<RobotsFile> | null
}

const getRobots = async (apps: Apps, logger: Logger) => {
  const deps = await apps.getDependencies()
  const depList = Object.keys(deps).filter(key => !key.startsWith('infra:'))
  const buildFiles = await Promise.all(depList.map(getAppRobot(apps, deps, logger)))
  const withRobots = buildFiles.filter(file => file?.robots) as RobotsFile[]
  return withRobots.map(data => data.robots)
}

export async function robots(ctx: Context) {
  const { vtex: { account, production, platform }, clients, state: { bindingId } } = ctx
  let data = ''
  const robotsDataSource = platform === 'gocommerce' ? clients.robotsGC : clients.robots
  if (bindingId) {
    const robotsList = await getRobots(clients.apps, clients.logger)
    const robotData = robotsList.find(robotConfig => robotConfig[bindingId])
    if (robotData) {
      data = robotData[bindingId]
    }
  }
  if (!data || !bindingId) {
    data = await robotsDataSource.fromLegacy(account)
  }

  ctx.set('Content-Type', 'text/plain')
  ctx.body = data
  ctx.status = 200
  ctx.set('cache-control', production ? `public, max-age=${TEN_MINUTES_S}` : 'no-cache')
}
