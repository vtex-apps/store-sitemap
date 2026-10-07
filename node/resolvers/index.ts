import { deleteIndex, saveIndex } from './mutations'

export const resolvers = {
  Mutation: {
    deleteIndex,
    saveIndex,
  },
  Query: {
    /* Generation was replaced by another solution; log callers before removing the query. */
    generateSitemap: async (
      _: {},
      { force }: { force?: boolean },
      ctx: Context
    ) => {
      const {
        vtex: { account, workspace, logger },
        headers,
      } = ctx

      logger.warn({
        account,
        force,
        message:
          'Deprecated generateSitemap GraphQL query called, generation is no longer needed',
        origin: headers['x-forwarded-for'],
        type: 'deprecated-generate-sitemap',
        userAgent: headers['user-agent'],
        workspace,
      })

      return true
    },
  },
}
