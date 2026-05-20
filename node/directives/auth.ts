import { defaultFieldResolver, GraphQLField } from 'graphql'
import { SchemaDirectiveVisitor } from 'graphql-tools'

export const authFromCookie = async (ctx: Context) => {
  const {
    clients: { sphinx, vtexID },
    vtex: { account, logger },
  } = ctx

  const vtexIdToken = ctx.cookies.get('VtexIdclientAutCookie')
  if (!vtexIdToken) {
    return 'VtexIdclientAutCookie not found.'
  }

  let credential: { user: string; account: string }
  try {
    credential = (await vtexID.validateCredential(vtexIdToken)) ?? { user: '', account: '' }
  } catch (err) {
    logger.warn({ message: 'VtexID credential validation failed', error: err })
    return 'Could not validate token.'
  }

  const { user: email, account: tokenAccount } = credential

  if (!email) {
    return 'Could not find user specified by token.'
  }

  if (tokenAccount !== account) {
    logger.warn({
      message: 'Cross-account VtexIdclientAutCookie rejected',
      account,
      tokenAccount,
    })
    return 'Cross-account token rejected.'
  }

  const isAdminUser = await sphinx.isAdmin(email)
  if (!isAdminUser) {
    return 'User is not admin and can not access resource.'
  }

  return true
}

export class Authorization extends SchemaDirectiveVisitor {
  public visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve = defaultFieldResolver } = field
    field.resolve = async (root, args, ctx, info) => {
      const cookieAllowsAccess = await authFromCookie(ctx)

      if (cookieAllowsAccess !== true) {
        throw new Error(cookieAllowsAccess)
      }

      return resolve(root, args, ctx, info)
    }
  }
}
