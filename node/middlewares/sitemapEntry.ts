import * as cheerio from 'cheerio'
import RouteParser from 'route-parser'
import { Internal } from 'vtex.rewriter'

import { SITEMAP_URL } from '../utils'
import { SitemapEntry } from './generateSitemap'

const URLEntry = (
  forwardedHost: string,
  rootPath: string,
  route: Internal,
  lastUpdated: string,
  supportedLocations: string[],
  bindingAddress?: string
): string => {
  const querystring = bindingAddress
    ? `?__bindingAddress=${bindingAddress}`
    : ''
  const loc = `https://${forwardedHost}${rootPath}${route.from}${querystring}`
  const localization = supportedLocations
    .map(
      locale =>
        `<xhtml:link rel="alternate" hreflang="${locale}" href="${loc}${
          querystring ? '&' : '?'
        }cultureInfo=${locale}"/>`
    )
    .join('\n')
  let entry = `
      <loc>${loc}</loc>
      ${localization}
      <lastmod>${lastUpdated}</lastmod>
      <changefreq>daily</changefreq>
      <priority>0.4</priority>
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
      binding,
      bindingAddress,
      forwardedHost,
      forwardedPath,
      bucket,
      rootPath,
    },
    clients: { vbase },
  } = ctx

  if (!binding) {
    throw new Error(`Binding from context not found`)
  }

  const sitemapRoute = new RouteParser(SITEMAP_URL)
  const sitemapParams = sitemapRoute.match(forwardedPath)
  if (!sitemapParams) {
    ctx.status = 404
    ctx.body = `Sitemap not found the URL must be: ${SITEMAP_URL}`
    throw new Error(`URL differs from the expected, ${forwardedPath}`)
  }
  const { path } = sitemapParams

  const $: any = cheerio.load(
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/TR/xhtml11/xhtml11_schema.html">',
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
  routes.forEach((route: Internal) => {
    $('urlset').append(
      URLEntry(
        forwardedHost,
        rootPath,
        route,
        lastUpdated,
        binding.supportedLocales,
        bindingAddress
      )
    )
  })

  ctx.body = $.xml()
  next()
}
