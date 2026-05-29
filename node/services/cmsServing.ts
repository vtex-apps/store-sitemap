import * as cheerio from 'cheerio'

import { SitemapEntry, SitemapIndex } from '../middlewares/generateMiddlewares/utils'
import { xmlTruncateNodes } from '../utils'
import {
  ActiveCmsSource,
  readCmsIndex,
  resolveActiveCmsSource,
  resolveCmsBucket,
} from './cmsSources'

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

export const mergeCmsIndexIntoCatalogXml = (
  catalogXml: string,
  cmsIndex: SitemapIndex,
  forwardedHost: string,
  rootPath: string,
  bindingAddress?: string
): string => {
  const $ = cheerio.load(catalogXml, { xmlMode: true })
  const sitemapIndexEl = $('sitemapindex')
  if (!sitemapIndexEl.length || !cmsIndex.index?.length) {
    return catalogXml
  }

  const indexXML = cmsIndex.index.map(entry =>
    sitemapIndexEntry(
      forwardedHost,
      rootPath,
      entry,
      cmsIndex.lastUpdated,
      bindingAddress
    )
  )
  sitemapIndexEl.append(xmlTruncateNodes(indexXML))
  return $.xml()
}

export const mergeActiveCmsIndexIntoCatalogXml = async (
  catalogXml: string,
  ctx: Context
): Promise<string> => {
  const {
    clients: { vbase },
    state: { binding, bindingAddress, forwardedHost, rootPath, settings },
  } = ctx

  if (!binding?.id) {
    return catalogXml
  }

  const activeCmsSource = resolveActiveCmsSource(settings)
  const cmsIndex = await readCmsIndex(activeCmsSource, vbase, binding.id)

  if (!cmsIndex?.index?.length) {
    return catalogXml
  }

  return mergeCmsIndexIntoCatalogXml(
    catalogXml,
    cmsIndex,
    forwardedHost,
    rootPath,
    bindingAddress
  )
}

export const serveCmsEntryFromVBase = async (
  ctx: Context,
  fileName: string,
  activeCmsSource?: ActiveCmsSource
): Promise<SitemapEntry | null> => {
  const {
    clients: { vbase },
    state: { binding, settings },
  } = ctx

  const source = activeCmsSource ?? resolveActiveCmsSource(settings)
  const cmsBucket =
    binding?.id != null ? resolveCmsBucket(source, binding.id) : null

  if (!cmsBucket) {
    return null
  }

  return vbase.getJSON<SitemapEntry>(cmsBucket, fileName, true)
}

export const serveCmsEntryFromCandidateBuckets = async (
  ctx: Context,
  fileName: string,
  productionBucket: string
): Promise<SitemapEntry | null> => {
  const {
    clients: { vbase },
    state: { binding, settings },
  } = ctx

  const activeCmsSource = resolveActiveCmsSource(settings)
  const cmsBucket =
    binding?.id != null
      ? resolveCmsBucket(activeCmsSource, binding.id)
      : null
  const candidateBuckets = [productionBucket, cmsBucket].filter(
    (b): b is string => b != null
  )

  for (const candidateBucket of candidateBuckets) {
    // eslint-disable-next-line no-await-in-loop
    const maybeRoutesInfo = await vbase.getJSON<SitemapEntry>(
      candidateBucket,
      fileName,
      true
    )
    if (maybeRoutesInfo) {
      return maybeRoutesInfo
    }
  }

  return null
}
