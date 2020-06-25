import { Binding, VBase } from '@vtex/api'
import * as cheerio from 'cheerio'

import { SitemapNotFound, startSitemapGeneration } from '../utils'
import {
  currentDate,
  SitemapIndex
} from './generateMiddlewares/utils'

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
  forwardedHost: string,
  rootPath: string,
  lastUpdated: string,
  bindingAddress?: string
) => {
  const querystring = bindingAddress
    ? `?__bindingAddress=${bindingAddress}`
    : ''
  return `<sitemap>
      <loc>https://${forwardedHost}${rootPath}/sitemap.xml${querystring}</loc>
      <lastmod>${lastUpdated}</lastmod>
    </sitemap>`
}

const sitemapIndex = async (
  enabledIndexFiles: string[],
  forwardedHost: string,
  rootPath: string,
  vbase: VBase,
  bucket: string,
  bindingAddress?: string
) => {
  const $ = cheerio.load(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    {
      xmlMode: true,
    }
  )

  const rawIndexFiles = await Promise.all(
    enabledIndexFiles.map(indexFile =>
      vbase.getJSON<SitemapIndex>(
        bucket,
        indexFile,
        true
      )
    ))
  const indexFiles = rawIndexFiles.filter(Boolean)
  if (indexFiles.length === 0) {
    throw new SitemapNotFound('Sitemap not found')
  }

  const index = indexFiles.reduce((acc, { index: fileIndex }) => acc.concat(fileIndex), [] as string[])
  const lastUpdated = indexFiles[0].lastUpdated

  index.forEach(entry =>
    $('sitemapindex').append(
      sitemapIndexEntry(
        forwardedHost,
        rootPath,
        entry,
        lastUpdated,
        bindingAddress
      )
    )
  )
  return $
}

const sitemapBindingIndex = async (
  forwardedHost: string,
  rootPath: string,
  bindings: Binding[]
) => {
  const $ = cheerio.load(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    {
      xmlMode: true,
    }
  )

  const date = currentDate()
  bindings.forEach(binding => {
    $('sitemapindex').append(
      sitemapBindingEntry(
        forwardedHost,
        rootPath,
        date,
        rootPath ? '' : binding.canonicalBaseAddress
      )
    )
  })
  return $
}

export async function sitemap(ctx: Context, next: () => Promise<void>) {
  const {
    state: {
      enabledIndexFiles,
      forwardedHost,
      bucket,
      rootPath,
      matchingBindings,
      bindingAddress,
    },
    clients: { vbase },
  } = ctx

  const hasBindingIdentifier = rootPath || bindingAddress
  let $: any
  try {
    if (hasBindingIdentifier) {
      $ = await sitemapIndex(
        enabledIndexFiles,
        forwardedHost,
        rootPath,
        vbase,
        bucket,
        bindingAddress
      )
    } else {
      const hasMultipleMatchingBindings = matchingBindings.length > 1
      $ = hasMultipleMatchingBindings
        ? await sitemapBindingIndex(forwardedHost, rootPath, matchingBindings)
        : await sitemapIndex(enabledIndexFiles, forwardedHost, rootPath, vbase, bucket)
    }
  } catch (err) {
    if (err instanceof SitemapNotFound) {
      ctx.status = 404
      ctx.body = 'Generating sitemap...'
      ctx.vtex.logger.error(err.message)
      await startSitemapGeneration(ctx)
      return
    }
    throw err
  }

  ctx.body = $.xml()
  next()
}
