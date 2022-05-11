import { startSitemapGeneration } from '../utils'
import { saveIndex, deleteIndex } from './mutations'

export const resolvers = {
  Mutation: {
    saveIndex,
    deleteIndex,
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
