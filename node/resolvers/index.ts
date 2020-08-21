import { startSitemapGeneration } from '../utils'

export const resolvers = {
  Query: {
    generateSitemap: async (_: {}, { force }: { force?: boolean},ctx: Context) => {
      await startSitemapGeneration(ctx, force)
      return true
    },
  },
}
