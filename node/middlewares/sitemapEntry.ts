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
    state: {
      forwardedPath,
      bucket,
    },
    clients: { vbase },
  } = ctx

  const sitemapRoute = new RouteParser(SITEMAP_URL)
  const sitemapParams = sitemapRoute.match(forwardedPath)
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
    ctx.vtex.logger.error('Sitemap entry not found')
    return
  }
  const { routes, lastUpdated } = maybeRoutesInfo as SitemapEntry
  const entryXML = routes.map((route: Route) => URLEntry(ctx, route, lastUpdated))

  $('urlset').append(entryXML.join('\n'))

  ctx.body = $.xml()
  next()
}
