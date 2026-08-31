import { CmsPage } from '../clients/cmsBuilder'
import {
  isEligibleCmsPath,
} from './cmsEligibility'
import {
  DEFAULT_HCMS_CONTENT_TYPES,
  DEFAULT_HCMS_PROJECT_ID,
  Settings,
} from '../middlewares/settings'

/**
 * A Headless CMS page is eligible for the sitemap when it is published, has a
 * public `seo.slug`, is not the homepage (`/` is framework-owned), is not
 * opted out via canonical, and does not match the merchant's
 * `disableRoutesTerm`.
 */
export const isEligibleHcmsPage = (
  page: CmsPage,
  disableRoutesTerm: string
): boolean => {
  if (page.status !== 'published') {
    return false
  }
  const slug = page.settings?.seo?.slug
  if (!slug || slug === '/') {
    return false
  }
  return isEligibleCmsPath({
    canonical: page.settings?.seo?.canonical,
    disableRoutesTerm,
    slug,
  })
}

const resolveProjectId = (settings: Partial<Settings> | undefined): string =>
  settings?.hcmsProjectId?.trim() || DEFAULT_HCMS_PROJECT_ID

const resolveContentTypes = (
  settings: Partial<Settings> | undefined
): string[] =>
  settings?.hcmsContentTypes && settings.hcmsContentTypes.length > 0
    ? settings.hcmsContentTypes
    : DEFAULT_HCMS_CONTENT_TYPES

export const fetchEligibleHcmsSlugs = async (
  ctx: Context | EventContext
): Promise<string[]> => {
  const {
    clients: { cmsBuilder },
    state: { settings },
  } = ctx

  const disableRoutesTerm = settings?.disableRoutesTerm || ''
  const projectId = resolveProjectId(settings)
  const contentTypes = resolveContentTypes(settings)

  const slugs = new Set<string>()
  for (const contentType of contentTypes) {
    // eslint-disable-next-line no-await-in-loop
    const pages = await cmsBuilder.listAllPages(projectId, contentType)
    for (const cmsPage of pages) {
      if (!isEligibleHcmsPage(cmsPage, disableRoutesTerm)) {
        continue
      }
      const slug = cmsPage.settings?.seo?.slug
      if (slug) {
        slugs.add(slug)
      }
    }
  }
  return Array.from(slugs)
}
