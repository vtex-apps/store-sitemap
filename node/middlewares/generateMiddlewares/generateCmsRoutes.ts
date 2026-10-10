import { getDefaultStoreBinding } from '../../resources/bindings'
import { fetchEligibleHcmsSlugs } from '../../services/hcmsRoutes'
import { resolveActiveCmsSource } from '../../services/cmsSources'
import {
  CMS_ROUTES_MAX_BYTES_PER_FILE,
  CMS_ROUTES_MAX_URLS_PER_FILE,
  CMS_ROUTES_PREFIX,
} from '../../utils'
import { CMS_ROUTES_INDEX, saveRoutesChunks } from './utils'

export const CMS_ROUTES_DEFAULT_CHANGEFREQ: ChangeFreq = 'weekly'
export const CMS_ROUTES_DEFAULT_PRIORITY = 0.5

const toRoute = (slug: string, bindingId: string): Route => ({
  alternates: [{ bindingId, path: slug }],
  changefreq: CMS_ROUTES_DEFAULT_CHANGEFREQ,
  id: `hcms:${slug}`,
  path: slug,
  priority: CMS_ROUTES_DEFAULT_PRIORITY,
  source: 'hcms',
})

const saveBindingChunks = (
  ctx: Context | EventContext,
  bindingId: string,
  routes: Route[]
) =>
  saveRoutesChunks(
    ctx,
    bindingId,
    routes,
    CMS_ROUTES_PREFIX,
    CMS_ROUTES_PREFIX,
    CMS_ROUTES_INDEX,
    CMS_ROUTES_MAX_URLS_PER_FILE,
    CMS_ROUTES_MAX_BYTES_PER_FILE
  )

export async function generateCmsRoutes(
  ctx: Context | EventContext,
  next?: () => Promise<void>
) {
  const {
    state: { settings },
    vtex: { logger },
  } = ctx

  if (!settings?.enableCmsRoutes) {
    logger.info({
      message: 'CMS routes generation skipped: enableCmsRoutes is off',
      type: 'cms-routes-generation-skipped',
    })
    if (next) {
      await next()
    }
    return
  }

  if (resolveActiveCmsSource(settings) !== 'hcms') {
    logger.info({
      message: 'CMS routes generation skipped: source is not active',
      type: 'cms-routes-generation-skipped',
    })
    if (next) {
      await next()
    }
    return
  }

  const startTime = Date.now()
  logger.info({
    message: 'CMS routes generation started',
    type: 'cms-routes-generation-started',
  })

  try {
    const slugs = await fetchEligibleHcmsSlugs(ctx)
    const bindingId = await getDefaultStoreBinding(ctx as Context)
    const routes = slugs.map(slug => toRoute(slug, bindingId))

    const totalFiles = await saveBindingChunks(ctx, bindingId, routes)

    logger.info({
      message: 'CMS routes generation complete',
      type: 'cms-routes-generation-complete',
      durationMs: Date.now() - startTime,
      bindings: 1,
      totalFiles,
      totalRoutes: routes.length,
    })
  } catch (error) {
    logger.error({
      error,
      message: 'CMS routes generation failed',
      type: 'cms-routes-generation-error',
    })
    throw error
  } finally {
    if (next) {
      await next()
    }
  }
}
