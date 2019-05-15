import * as cheerio from 'cheerio'
import {forEach, map, values} from 'ramda'
import {RoutesDataSource} from '../resources/RoutesDataSource'
import {getCurrentDate, notFound} from '../resources/utils'

export const userSitemap = async (ctx: Context) => {
  const routes = new RoutesDataSource(ctx.vtex, {timeout: 2000})
  const userRoutes = await routes.getUserRoutes().catch(notFound(null))
  const forwardedHost = ctx.get('x-forwarded-host')
  const $ = cheerio.load('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', {
    decodeEntities: false,
    xmlMode: true,
  })

  if (userRoutes && userRoutes['vtex.admin-pages']) {
    const xmlUserRoutes = map((route: any) => route.path.includes('?')
      ? null
      : `<url>
          <loc>https://${forwardedHost}${route.path}</loc>
          <lastmod>${getCurrentDate()}</lastmod>
          <changefreq>weekly</changefreq>
          <priority>0.4</priority>
        </url>`,
      values(userRoutes['vtex.admin-pages'])
    )
    forEach((userRoute: string | null) => userRoute && $('urlset').append(userRoute), xmlUserRoutes)
  }

  ctx.set('Content-Type', 'text/xml')
  ctx.body = $.xml()
}
