import { CONFIG_BUCKET, CONFIG_FILE, getBucket, hashString, STORE_PRODUCT, TENANT_CACHE_TTL_S } from '../../utils'
import {
  cleanConfigBucket,
  completeRoutes,
  createFileName,
  currentDate,
  DEFAULT_CONFIG,
  isSitemapComplete,
  RAW_DATA_PREFIX,
  SitemapEntry,
  SitemapIndex,
  splitFileName
} from './utils'

const FILE_LIMIT = 5000

const groupEntityEntries = async (entity: string, files: string[], bucket: string, rawBucket: string, ctx: EventContext) => {
  const { clients: { cVbase }, vtex: { logger } } = ctx
  let count = 0
  let routesCount = 0
  let currentRoutes: Route[] = []
  const newFiles: string[] = []
  for (const file of files) {
    const { routes } = await cVbase.getJSON<SitemapEntry>(rawBucket, file)
    routesCount += routes.length
    currentRoutes = [...currentRoutes, ...routes]
    if (currentRoutes.length > FILE_LIMIT) {
      const rest = currentRoutes.splice(FILE_LIMIT)
      const entry = createFileName(entity, count)
      newFiles.push(entry)
      await cVbase.saveJSON<SitemapEntry>(bucket, entry, {
        lastUpdated: currentDate(),
        routes: currentRoutes,
      })
      currentRoutes = rest
      count++
    }
  }
  if (currentRoutes.length > 0) {
    const entry = createFileName(entity, count)
    newFiles.push(entry)
    await cVbase.saveJSON<SitemapEntry>(bucket, entry, {
      lastUpdated: currentDate(),
      routes: currentRoutes,
    })
  }
  logger.info({
    count: routesCount,
    entity,
    messages: 'Routes grouped',
  })
  return newFiles
}

export async function groupEntries(ctx: EventContext) {
  const {
    body,
    clients: {
      tenant,
      cVbase,
    },
    vtex: {
      logger,
    },
    state: {
      enabledIndexFiles,
    },
  } = ctx
  const { indexFile }: GroupEntriesEvent = body
  const { bindings } = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })
  const { generationPrefix, productionPrefix } = await cVbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG
  const storeBindings = bindings.filter(binding => binding.targetProduct === STORE_PRODUCT)

  await Promise.all(storeBindings.map(async binding => {
    const rawBucket = getBucket(RAW_DATA_PREFIX, hashString(binding.id))
    const bucket = getBucket(generationPrefix, hashString(binding.id))
    const { index } = await cVbase.getJSON<SitemapIndex>(rawBucket, indexFile)

    const filesByEntity = index.reduce((acc, file) => {
      const entity = splitFileName(file)[0]
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
          ctx
        )
      ))

    const newIndex: string[] = entries.reduce((acc, entryList) => [...acc, ...entryList], [] as string[])
    await cVbase.saveJSON<SitemapIndex>(bucket, indexFile, {
      index: newIndex,
      lastUpdated: currentDate(),
    })
  }))
  await completeRoutes(indexFile, cVbase)

  const isComplete = await isSitemapComplete(enabledIndexFiles, cVbase, logger)
  if (isComplete) {
    await cVbase.saveJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, {
      generationPrefix: productionPrefix,
      productionPrefix: generationPrefix,
    })
    await cleanConfigBucket(enabledIndexFiles, cVbase)
    logger.info({ message: `Sitemap complete`, payload: body })
    return
  }
}
