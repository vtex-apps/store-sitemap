import { startSitemapGeneration } from '../utils'
import { deleteIndex, saveIndex } from './mutations'

export const resolvers = {
  Mutation: {
    deleteIndex,
    saveIndex,
  },
  Query: {
    generateSitemap: async (
      _: {},
      { force }: { force?: boolean },
      ctx: Context
    ) => {
      await startSitemapGeneration(ctx, force)
      return true
    },
  },
}
