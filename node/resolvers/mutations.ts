import { CVBase } from '../clients/vbase'
import { EXTENDED_INDEX_FILE, getBucket, hashString } from '../utils'
import {
  currentDate,
  SitemapIndex,
} from './../middlewares/generateMiddlewares/utils'
import { getDefaultStoreBinding } from './../resources/bindings'

const getBucketName = async (ctx: Context, binding?: string) => {
  if (!binding) {
    binding = await getDefaultStoreBinding(ctx)
  }
  return getBucket('', hashString(binding))
}

const getExtendedIndexes = async (bucket: string, vbase: CVBase) => {
  const { index } = (await vbase.getJSON<SitemapIndex>(
    bucket,
    EXTENDED_INDEX_FILE,
    true
  )) || { index: [] }

  return index
}

const saveBucket = (
  bucket: string,
  extendedIndexes: string[],
  vbase: CVBase
) => {
  return vbase
    .saveJSON(bucket, EXTENDED_INDEX_FILE, {
      index: [...new Set(extendedIndexes)],
      lastUpdated: currentDate(),
    })
    .then(() => true)
    .catch(() => false)
}

export const saveIndex = async (
  _: {},
  { index, binding }: { index: string; binding?: string },
  ctx: Context
) => {
  const {
    clients: { vbase },
  } = ctx
  const bucket = await getBucketName(ctx, binding)
  const extendedIndexes = await getExtendedIndexes(bucket, vbase)

  // check if index is already in the extendedIndexes
  if (!extendedIndexes.includes(index)) {
    extendedIndexes.push(index)
  }

  return saveBucket(bucket, extendedIndexes, vbase)
}

export const deleteIndex = async (
  _: {},
  { index, binding }: { index: string; binding?: string },
  ctx: Context
) => {
  const {
    clients: { vbase },
  } = ctx
  const bucket = await getBucketName(ctx, binding)
  const extendedIndexes = await getExtendedIndexes(bucket, vbase)

  // if index is not in the extendedIndexes, treat as success
  if (!extendedIndexes.includes(index)) {
    return true
  }

  // remove index from extendedIndexes
  // and use set to eliminate any duplicates that may have been added previously
  const newExtendedIndexes = extendedIndexes.filter(i => i !== index)

  return saveBucket(bucket, newExtendedIndexes, vbase)
}
