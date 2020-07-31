import { last, uniq } from 'ramda'
import { CONFIG_BUCKET, CONFIG_FILE, getBucket, hashString, STORE_PRODUCT, TENANT_CACHE_TTL_S } from '../../utils'
import {
  cleanConfigBucket,
  completeRoutes,
  createFileName,
  currentDate,
  DEFAULT_CONFIG,
  GROUP_ENTRIES_EVENT,
  isSitemapComplete,
  RAW_DATA_PREFIX,
  SitemapEntry,
  SitemapIndex,
  splitFileName,
  uniq
} from './utils'

const FILE_PROCESS_LIMIT = 3000
const FILE_LIMIT = 5000

const groupEntityEntries = async (entity: string, files: string[], index: string[] | undefined, bucket: string, rawBucket: string, ctx: EventContext) => {
  const { clients: { vbase }, vtex: { logger } } = ctx
  const lastFile = index && last(index)
  const lastFileData = lastFile ? await vbase.getJSON<SitemapEntry>(bucket, lastFile) : { routes: [] as Route[] }
  let currentRoutes = lastFileData.routes
  let routesCount = currentRoutes.length
  let count = lastFile ? Number(splitFileName(lastFile)[1]) : 0

  const newFiles: string[] = []
  for (const file of files) {
    const { routes } = await vbase.getJSON<SitemapEntry>(rawBucket, file)
    routesCount += routes.length
    currentRoutes = [...currentRoutes, ...routes]
    if (currentRoutes.length > FILE_LIMIT) {
      const rest = currentRoutes.splice(FILE_LIMIT)
      const entry = createFileName(entity, count)
      newFiles.push(entry)
      await vbase.saveJSON<SitemapEntry>(bucket, entry, {
        lastUpdated: currentDate(),
        routes: uniq(currentRoutes),
      })
      currentRoutes = rest
      count++
    }
  }
  if (currentRoutes.length > 0) {
    const entry = createFileName(entity, count)
    newFiles.push(entry)
    await vbase.saveJSON<SitemapEntry>(bucket, entry, {
      lastUpdated: currentDate(),
      routes: uniq(currentRoutes),
    })
  }
  logger.info({
    count: routesCount,
    entity,
    messages: 'Routes grouped',
  })
  return newFiles
}

export async function groupEntries(ctx: EventContext, next: () => Promise<void>) {
  const {
    body,
    clients: {
      tenant,
      vbase,
    },
    vtex: {
      logger,
    },
    state: {
      enabledIndexFiles,
    },
  } = ctx
  const { indexFile, generationId, from }: GroupEntriesEvent = body
  const { bindings } = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })
  const { generationPrefix, productionPrefix } = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG
  const storeBindings = bindings.filter(binding => binding.targetProduct === STORE_PRODUCT)

  const isCompleteArray = await Promise.all(storeBindings.map(async binding => {
    const rawBucket = getBucket(RAW_DATA_PREFIX, hashString(binding.id))
    const bucket = getBucket(generationPrefix, hashString(binding.id))
    const indexData = await vbase.getJSON<SitemapIndex>(rawBucket, indexFile)
    const fullIndex = uniq(indexData.index)
    const { index: newIndex } = from === 0
      ? { index: [] as string[] }
      : await vbase.getJSON<SitemapIndex>(bucket, indexFile, true) || { index: []as string[] }
    logger.debug({ message: '[group] Receiving', payload: body, totalFile: fullIndex.length })
    if (from > fullIndex.length) {
      return true
    }
    const index = fullIndex.slice(from, from + FILE_PROCESS_LIMIT)
    const filesByEntity = index.reduce((acc, file) => {
      const entity = splitFileName(file)[0]
      if (!acc[entity]) {
        acc[entity] = []
      }
      acc[entity].push(file)
      return acc
    }, {} as Record<string, string[]>)

    const indexByEntity = newIndex.reduce((acc, file) => {
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
          indexByEntity[entity],
          bucket,
          rawBucket,
          ctx
        )
      ))

    const indexes = entries.reduce((acc, entryList) => [...acc, ...entryList], [] as string[])
    await vbase.saveJSON<SitemapIndex>(bucket, indexFile, {
      index: uniq(newIndex.concat(indexes)),
      lastUpdated: currentDate(),
    })

    return from + FILE_PROCESS_LIMIT > fullIndex.length
  }))

  const isGroupingComplete = isCompleteArray.every(Boolean)
  logger.debug({ message: '[group] is Grouping complete', isGroupingComplete })
  if (isGroupingComplete) {
     await completeRoutes(indexFile, vbase)

    const isComplete = await isSitemapComplete(enabledIndexFiles, vbase, logger)
    if (isComplete) {
      await vbase.saveJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, {
        generationPrefix: productionPrefix,
        productionPrefix: generationPrefix,
      })
      await cleanConfigBucket(enabledIndexFiles, vbase)
      logger.info({ message: `Sitemap complete`, payload: body })
      return
    }
  } else {
    ctx.state.nextEvent = {
      event: GROUP_ENTRIES_EVENT,
      payload: {
        from: from + FILE_PROCESS_LIMIT,
        generationId,
        indexFile,
      },
    }

    await next()
  }
}
