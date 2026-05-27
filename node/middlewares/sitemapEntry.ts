import { Binding } from '@vtex/api'
import * as cheerio from 'cheerio'
import RouteParser from 'route-parser'

import { SITEMAP_URL } from '../utils'
import { SitemapEntry } from './generateMiddlewares/utils'

const getBinding = (bindingId: string, bindings: Binding[]) =>
  bindings.find(binding => binding.id === bindingId)

// Default binding identification: prefer the first store-targeted binding, fall
// back to the first binding in the matching list. This is the same convention
// used by `resources/bindings.ts` (the "first store binding" fallback path).
const getDefaultMatchingBinding = (
  matchingBindings: Binding[]
): Binding | undefined =>
  matchingBindings.find(b => b.targetProduct === 'vtex-storefront') ??
  matchingBindings[0]

interface LocaleHrefArgs {
  alternate: AlternateRoute
  alternateBinding: Binding
  bindingAddress?: string
  currentBindingId: string
  forwardedHost: string
  rootPath: string
}

const buildLocaleHref = ({
  alternate,
  alternateBinding,
  bindingAddress,
  currentBindingId,
  forwardedHost,
  rootPath,
}: LocaleHrefArgs): string => {
  if (alternate.bindingId === currentBindingId) {
    const querystring = bindingAddress
      ? `?__bindingAddress=${bindingAddress}`
      : ''
    return `https://${forwardedHost}${rootPath}${alternate.path}${querystring}`
  }
  if (bindingAddress) {
    return `https://${forwardedHost}${alternate.path}?__bindingAddress=${alternateBinding.canonicalBaseAddress}`
  }
  return `https://${alternateBinding.canonicalBaseAddress}${alternate.path}`
}

const buildLocalization = (
  ctx: Context,
  route: Route
): string => {
  const {
    state: {
      binding,
      bindingAddress,
      forwardedHost,
      rootPath,
      matchingBindings,
    },
  } = ctx

  // Single-binding store → emit no alternates (behavior preserved).
  if (!matchingBindings || matchingBindings.length <= 1) {
    return ''
  }
  if (!route.alternates || route.alternates.length === 0) {
    return ''
  }

  const lines: string[] = []
  for (const alternate of route.alternates) {
    const alternateBinding = getBinding(alternate.bindingId, matchingBindings)
    if (!alternateBinding) {
      continue
    }
    const href = buildLocaleHref({
      alternate,
      alternateBinding,
      bindingAddress,
      currentBindingId: binding.id,
      forwardedHost,
      rootPath,
    })
    const locale = alternateBinding.defaultLocale
    lines.push(
      `<xhtml:link rel="alternate" hreflang="${locale}" href="${href}"/>`
    )
  }

  const defaultBinding = getDefaultMatchingBinding(matchingBindings)
  if (defaultBinding) {
    const defaultAlternate =
      route.alternates.find(a => a.bindingId === defaultBinding.id) ??
      ({ bindingId: defaultBinding.id, path: route.path } as AlternateRoute)
    const defaultHref = buildLocaleHref({
      alternate: defaultAlternate,
      alternateBinding: defaultBinding,
      bindingAddress,
      currentBindingId: binding.id,
      forwardedHost,
      rootPath,
    })
    lines.push(
      `<xhtml:link rel="alternate" hreflang="x-default" href="${defaultHref}"/>`
    )
  }

  return lines.join('\n')
}

export const URLEntry = (
  ctx: Context,
  route: Route,
  lastUpdated: string
): string => {
  const {
    state: { bindingAddress, forwardedHost, rootPath },
  } = ctx
  const querystring = bindingAddress
    ? `?__bindingAddress=${bindingAddress}`
    : ''
  const loc = `https://${forwardedHost}${rootPath}${route.path}${querystring}`
  const localization = buildLocalization(ctx, route)
  const lastmodValue = route.lastmod || lastUpdated
  const changefreqTag = route.changefreq
    ? `<changefreq>${route.changefreq}</changefreq>`
    : ''
  const priorityTag =
    typeof route.priority === 'number'
      ? `<priority>${route.priority.toFixed(1)}</priority>`
      : ''
  let entry = `
      <loc>${loc}</loc>
      ${localization}
      <lastmod>${lastmodValue}</lastmod>
      ${changefreqTag}
      ${priorityTag}
    `
  if (route.imagePath && route.imageTitle) {
    // add image metainfo
    entry = `
    <image:image>
      <image:loc>${route.imagePath}</image:loc>
      <image:title>${route.imageTitle}</image:title>
    </image:image>
    ${entry}`
  }
  return `<url>${entry}</url>`
}

export async function sitemapEntry(ctx: Context, next: () => Promise<void>) {
  const {
    state: { isCrossBorder },
  } = ctx

  if (!isCrossBorder) {
    await catalogSitemapEntry(ctx)
  } else {
    await legacySitemapEntry(ctx)
    next()
  }
}

async function legacySitemapEntry(ctx: Context) {
  const {
    clients: { vbase },
    state: { forwardedPath, bucket },
    vtex: { logger },
  } = ctx

  const sitemapRoute = new RouteParser(SITEMAP_URL)
  const sitemapParams = sitemapRoute.match(forwardedPath)

  logger.info({
    message: 'Fetching legacy sitemap entry',
    payload: {
      forwardedPath,
      bucket,
    },
  })

  if (!sitemapParams) {
    ctx.status = 404
    ctx.body = `Sitemap not found the URL must be: ${SITEMAP_URL}`
    throw new Error(`URL differs from the expected, ${forwardedPath}`)
  }

  const { path } = sitemapParams

  const $: any = cheerio.load(
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    {
      xmlMode: true,
    }
  )

  const fileName = path.split('.')[0]
  const maybeRoutesInfo = await vbase.getJSON<SitemapEntry>(
    bucket,
    fileName,
    true
  )

  if (!maybeRoutesInfo) {
    ctx.status = 404
    ctx.body = 'Sitemap entry not found'
    ctx.vtex.logger.error({
      message: 'Sitemap entry not found',
      payload: {
        bucket,
        fileName,
      },
    })

    return
  }

  const { routes, lastUpdated } = maybeRoutesInfo as SitemapEntry
  const entryXML = routes.map((route: Route) =>
    URLEntry(ctx, route, lastUpdated)
  )

  $('urlset').append(entryXML.join('\n'))

  ctx.body = $.xml()
}

async function catalogSitemapEntry(ctx: Context) {
  const {
    clients: { catalog },
    headers: { 'x-forwarded-host': forwardedHost },
    state: { forwardedPath },
    vtex: { logger },
  } = ctx

  logger.info({
    message: 'Fetching catalog sitemap entry',
    payload: {
      forwardedHost,
      forwardedPath,
    },
  })

  ctx.body = await catalog.getSitemap(forwardedHost, forwardedPath)
  ctx.status = 200
}
