import { startSitemapGeneration } from '../utils'

export const resolvers = {
  Query: {
    generateSitemap: async (_: {},__: {},ctx: Context) => {
      await startSitemapGeneration(ctx)
      return true
    },
  },
}
