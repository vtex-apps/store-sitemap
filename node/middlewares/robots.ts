import { Apps } from '@vtex/api'

import { notFound } from '../utils'

const TEN_MINUTES_S = 10 * 60

interface RobotsFile {
  robots: Record<string, string>
}

const SITEMAP_BUILD_FILE = 'dist/vtex.store-sitemap/build.json'

// Multiline, case-insensitive — matches "Sitemap:" anywhere in the file at the
// start of a (possibly indented) line. Mirrors how robots.txt parsers detect
// the directive.
const SITEMAP_DIRECTIVE_REGEX = /^\s*Sitemap\s*:/im

/**
 * Idempotently inject a `Sitemap:` directive into a robots.txt body.
 *
 * - Returns the body unchanged when a `Sitemap:` line is already present
 *   (case-insensitive, leading-whitespace-tolerant — Decision 6 of the spec).
 * - When the body is empty/undefined, returns a single-line file containing
 *   the directive.
 * - Otherwise appends the directive after a blank line, preserving content.
 *
 * Pure helper — exported for unit testing (US-4 acceptance criteria).
 */
export const ensureSitemapDirective = (
  robotsBody: string | undefined,
  sitemapUrl: string
): string => {
  if (!robotsBody) {
    return `Sitemap: ${sitemapUrl}\n`
  }
  if (SITEMAP_DIRECTIVE_REGEX.test(robotsBody)) {
    return robotsBody
  }
  const trimmed = robotsBody.replace(/\s+$/, '')
  return `${trimmed}\n\nSitemap: ${sitemapUrl}\n`
}

const getRobotForBinding = async (
  bindingId: string,
  account: string,
  apps: Apps
) => {
  const appId = `${account}.robots@0.x`

  try {
    await apps.getApp(appId)
  } catch (err) {
    notFound(undefined)(err)
  }

  const buildFile = await apps.getAppJSON<Partial<RobotsFile> | null>(
    appId,
    SITEMAP_BUILD_FILE,
    true
  )

  return buildFile?.robots?.[bindingId]
}

export async function robots(ctx: Context) {
  const {
    vtex: { account, production, platform },
    state: { binding },
  } = ctx

  let data: string | undefined

  const { clients } = ctx
  const robotsDataSource =
    platform === 'gocommerce' ? clients.robotsGC : clients.robots

  if (binding?.id) {
    data = await getRobotForBinding(binding.id, account, clients.apps)
  }
  if (!data || !binding?.id) {
    data = await robotsDataSource.fromLegacy(account)
  }

  // Decision 6 of the spec: guarantee a `Sitemap:` directive is present so
  // crawlers can always discover the sitemap. Idempotent — never duplicates an
  // existing directive added manually by the merchant.
  const forwardedHost = ctx.get('x-forwarded-host')
  if (forwardedHost) {
    data = ensureSitemapDirective(data, `https://${forwardedHost}/sitemap.xml`)
  }

  ctx.set('Content-Type', 'text/plain')
  ctx.body = data
  ctx.status = 200
  ctx.set(
    'cache-control',
    production ? `public, max-age=${TEN_MINUTES_S}` : 'no-cache'
  )
}
