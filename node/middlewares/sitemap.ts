import * as cheerio from 'cheerio'

import { MultipleSitemapGenerationError } from '../errors'
import {
  EXTENDED_INDEX_FILE,
  getBucket,
  hashString,
  SitemapNotFound,
  startSitemapGeneration,
} from '../utils'
import { currentDate, SitemapIndex } from './generateMiddlewares/utils'

const sitemapIndexEntry = (
  forwardedHost: string,
  rootPath: string,
  entry: string,
  lastUpdated: string,
  bindingAddress?: string
) => {
  const querystring = bindingAddress
    ? `?__bindingAddress=${bindingAddress}`
    : ''
  return `<sitemap>
      <loc>https://${forwardedHost}${rootPath}/sitemap/${entry}.xml${querystring}</loc>
      <lastmod>${lastUpdated}</lastmod>
    </sitemap>`
}

const sitemapBindingEntry = (
  host: string,
  lastUpdated: string,
  bindingAddress?: string
) => {
  const querystring = bindingAddress
    ? `?__bindingAddress=${bindingAddress}`
    : ''
  return `<sitemap>
      <loc>https://${host}/sitemap.xml${querystring}</loc>
      <lastmod>${lastUpdated}</lastmod>
    </sitemap>`
}

const sitemapIndex = async (ctx: Context) => {
  const {
    state: {
      enabledIndexFiles,
      forwardedHost,
      binding,
      bucket,
      rootPath,
      bindingAddress,
    },
    clients: { vbase },
  } = ctx

  const $ = cheerio.load(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    {
      xmlMode: true,
    }
  )

  const rawIndexFiles = await Promise.all([
    ...enabledIndexFiles.map(indexFile =>
      vbase.getJSON<SitemapIndex>(bucket, indexFile, true)
    ),
    vbase.getJSON<SitemapIndex>(
      getBucket('', hashString(binding.id)),
      EXTENDED_INDEX_FILE,
      true
    ),
  ])
  console.log(rawIndexFiles)
  const indexFiles = rawIndexFiles.filter(Boolean)
  if (indexFiles.length === 0) {
    throw new SitemapNotFound('Sitemap not found')
  }

  const index = [
    ...new Set(
      indexFiles.reduce(
        (acc, { index: fileIndex }) => acc.concat(fileIndex),
        [] as string[]
      )
    ),
  ]
  const lastUpdated = indexFiles[0].lastUpdated

  const indexXML = index.map(entry =>
    sitemapIndexEntry(
      forwardedHost,
      rootPath,
      entry,
      lastUpdated,
      bindingAddress
    )
  )
  $('sitemapindex').append(indexXML.join('\n'))
  return $
}

const sitemapBindingIndex = async (ctx: Context) => {
  const {
    state: { forwardedHost, matchingBindings: bindings },
    vtex: { production },
  } = ctx

  const $ = cheerio.load(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    {
      xmlMode: true,
    }
  )

  const date = currentDate()
  const bindingsIndexXML = bindings.map(binding =>
    sitemapBindingEntry(
      production ? binding.canonicalBaseAddress : forwardedHost,
      date,
      production ? '' : binding.canonicalBaseAddress
    )
  )
  $('sitemapindex').append(bindingsIndexXML.join('\n'))
  return $
}

export async function sitemap(ctx: Context, next: () => Promise<void>) {
  const {
    state: { matchingBindings, bindingAddress, rootPath },
  } = ctx

  const hasBindingIdentifier = rootPath || bindingAddress
  let $: any
  try {
    if (hasBindingIdentifier) {
      $ = await sitemapIndex(ctx)
    } else {
      const hasMultipleMatchingBindings = matchingBindings.length > 1
      $ = hasMultipleMatchingBindings
        ? await sitemapBindingIndex(ctx)
        : await sitemapIndex(ctx)
    }
  } catch (err) {
    if (err instanceof SitemapNotFound) {
      ctx.status = 404
      ctx.body = 'Generating sitemap...'
      ctx.vtex.logger.error(err.message)
      await startSitemapGeneration(ctx).catch(err => {
        if (!(err instanceof MultipleSitemapGenerationError)) {
          throw err
        }
      })
    }
    throw err
  }

  ctx.body = $.xml()
  next()
}
