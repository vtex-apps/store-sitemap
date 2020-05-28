import { VBase } from '@vtex/api'

import { CONFIG_BUCKET, CONFIG_FILE, currentDate, getBucket, hashString, TENANT_CACHE_TTL_S } from '../../utils'
import { DEFAULT_CONFIG, PRODUCT_ROUTES_INDEX, RAW_DATA_PREFIX, SitemapEntry, SitemapIndex } from './utils'

const FILE_LIMIT = 10000
const groupEntityEntries = async (entity: string, files: string[], bucket: string, rawBucket: string, vbase: VBase) => {
  let count = 0
  let currentRoutes: Route[] = []
  const newFiles: string[] = []
  for (const file of files) {
    const { routes } = await vbase.getJSON<SitemapEntry>(rawBucket, file)
    currentRoutes = [...currentRoutes, ...routes]
    if (currentRoutes.length > FILE_LIMIT) {
      // Split
      // Save file
      // Add to ersponse array
    }
  }
  if (currentRoutes.length > 0) {
    const entry = `${entity}-${count}`
    newFiles.push(entry)
    await vbase.saveJSON<SitemapEntry>(bucket, entry, {
      lastUpdated: currentDate(),
      routes: currentRoutes,
    })
  }
  return newFiles
}

export async function groupEntries(ctx: EventContext) {
  const { body, clients: { tenant, vbase }, vtex: { logger } } = ctx
  const { indexFile }: GroupEntriesEvent = body
  const { bindings } = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })
  const { generationPrefix, productionPrefix } = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG
  const storeBindings = bindings.filter(binding => binding.targetProduct === 'vtex.storefront')

  await Promise.all(storeBindings.map(async binding => {
    const rawBucket = getBucket(RAW_DATA_PREFIX, hashString(binding.id))
    const bucket = getBucket(generationPrefix, hashString(binding.id))
    const { index } = await vbase.getJSON<SitemapIndex>(bucket, indexFile)

    const filesByEntity = index.reduce((acc, file) => {
      // Centralize file name creation
      const [entity, _] = file.split('-')
      if (!acc[entity]) {
        acc[entity] = []
      }
      acc[entity].push(file)
      return acc
    }, {} as Record<string, string[]>)

    const entries = await Promise.all(
      Object.keys(filesByEntity).map(async entity =>
        groupEntityEntries(
          entity,
          filesByEntity[entity],
          bucket,
          rawBucket,
          vbase
        )
      ))
    await vbase.saveJSON<SitemapIndex>(bucket, indexFile, {
      index: entries,
      lastUpdated: currentDate(),
    })
    await vbase.deleteFile(rawBucket, indexFile)
  }))



  if (indexFile === PRODUCT_ROUTES_INDEX) {
    logger.info(`Sitemap complete`)
    await vbase.saveJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, {
      generationPrefix: productionPrefix,
      productionPrefix: generationPrefix,
    })
    return
  }
}
