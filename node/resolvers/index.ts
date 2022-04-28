import { startSitemapGeneration } from '../utils'
import { saveIndex } from './saveIndex'
import { deleteIndex } from './deleteIndex'

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
