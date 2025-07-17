import { Binding } from '@vtex/api'
import * as cheerio from 'cheerio'
import RouteParser from 'route-parser'

import { SITEMAP_URL } from '../utils'
import { SitemapEntry } from './generateMiddlewares/utils'

const getBinding = (bindingId: string, bindings: Binding[]) =>
  bindings.find(binding => binding.id === bindingId)

export const URLEntry = (
  ctx: Context,
  route: Route,
  lastUpdated: string
): string => {
  const { state: {
    binding,
    bindingAddress,
    forwardedHost,
    rootPath,
    matchingBindings,
  },
  } = ctx
  const querystring = bindingAddress
    ? `?__bindingAddress=${bindingAddress}`
    : ''
  const loc = `https://${forwardedHost}${rootPath}${route.path}${querystring}`
  const localization = route.alternates && route.alternates.length > 1
    ? route.alternates.map(
      ({ bindingId, path }) => {
        const alternateBinding = getBinding(bindingId, matchingBindings)
        if (bindingId === binding.id || !alternateBinding) {
            return ''
          }
          const { canonicalBaseAddress, defaultLocale: locale } = alternateBinding
          const href = querystring
            ? `https://${forwardedHost}${path}?__bindingAddress=${canonicalBaseAddress}`
            : `https://${canonicalBaseAddress}${path}`
          return `<xhtml:link rel="alternate" hreflang="${locale}" href="${href}"/>`
        }
       )
      .join('\n')
    : ''
  let entry = `
      <loc>${loc}</loc>
      ${localization}
      <lastmod>${lastUpdated}</lastmod>
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

  try {
    ctx.body = await catalog.getSitemap(forwardedHost, forwardedPath)
    ctx.status = 200
  } catch (error) {
    logger.error(`Error fetching catalog sitemap: ${error}`)
    ctx.status = 500
    ctx.body = 'Internal Server Error'
  }
}
