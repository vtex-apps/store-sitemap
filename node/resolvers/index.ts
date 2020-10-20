import { startSitemapGeneration } from '../utils'
import { saveIndex } from './saveIndex'

export const resolvers = {
  Mutation: {
    saveIndex,
  },
  Query: {
    generateSitemap: async (_: {}, { force }: { force?: boolean},ctx: Context) => {
      await startSitemapGeneration(ctx, force)
      return true
    },
  },
}
