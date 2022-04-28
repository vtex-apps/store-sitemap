import { EXTENDED_INDEX_FILE, getBucket, hashString } from '../utils'
import {
  currentDate,
  SitemapIndex,
} from './../middlewares/generateMiddlewares/utils'
import { getDefaultStoreBinding } from './../resources/bindings'

export const deleteIndex = async (
  _: {},
  { index, binding }: { index: string; binding?: string },
  ctx: Context
) => {
  const {
    clients: { vbase },
  } = ctx
  let success = false
  if (!binding) {
    binding = await getDefaultStoreBinding(ctx)
  }
  const bucket = getBucket('', hashString(binding))
  const { index: extendedIndexes } = (await vbase.getJSON<SitemapIndex>(
    bucket,
    EXTENDED_INDEX_FILE,
    true
  )) || { index: [] }
  // if index is not in the extendedIndexes, treat as success
  if (!extendedIndexes.includes(index)) {
    success = true
    return success
  }
  // remove index from extendedIndexes and also eliminate duplicates
  const newExtendedIndexes = [
    ...new Set(extendedIndexes.filter(i => i !== index)),
  ]
  await vbase
    .saveJSON(bucket, EXTENDED_INDEX_FILE, {
      index: newExtendedIndexes,
      lastUpdated: currentDate(),
    })
    .then(() => {
      success = true
    })
    .catch(() => null)
  return success
}
