import { last } from 'ramda'
import { CONFIG_BUCKET, CONFIG_FILE, getBucket, getStoreBindings, hashString } from '../../utils'
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

const FILE_PROCESS_LIMIT = 1500
const FILE_LIMIT = 5000

const reduceByEntity = (array: string[]) => array.reduce((acc, file) => {
  const entity = splitFileName(file)[0]
  if (!acc[entity]) {
    acc[entity] = []
  }
  acc[entity].push(file)
  return acc
}, {} as Record<string, string[]>)

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

  const { generationPrefix, productionPrefix } = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG
  const storeBindings = await getStoreBindings(tenant)

  const isBindingGroupingComplete = await Promise.all(storeBindings.map(async binding => {
    const rawBucket = getBucket(RAW_DATA_PREFIX, hashString(binding.id))
    const bucket = getBucket(generationPrefix, hashString(binding.id))
    const indexData = await vbase.getJSON<SitemapIndex>(rawBucket, indexFile)
    const rawIndex = uniq(indexData.index)
    const { index: newIndex } = from === 0
      ? { index: [] as string[] }
      : await vbase.getJSON<SitemapIndex>(bucket, indexFile, true) || { index: []as string[] }

    if (from > rawIndex.length) {
      return true
    }
    const slicedRawIndex = rawIndex.slice(from, from + FILE_PROCESS_LIMIT)
    const filesByEntity = reduceByEntity(slicedRawIndex)
    const indexByEntity = reduceByEntity(newIndex)

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

    const index = uniq(entries.reduce((acc, entryList) => acc.concat(entryList), newIndex))
    await vbase.saveJSON<SitemapIndex>(bucket, indexFile, {
      index,
      lastUpdated: currentDate(),
    })

    return from + FILE_PROCESS_LIMIT > rawIndex.length
  }))

  const isAllGroupingsComplete = isBindingGroupingComplete.every(Boolean)
  if (isAllGroupingsComplete) {
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
