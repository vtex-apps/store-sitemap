import { Binding, PUBLIC_DOMAINS, Tenant } from '@vtex/api'

import { TENANT_CACHE_TTL_S } from '../utils'

export interface BindingDiscoveryResult {
  binding: Binding | null
  tenant: Tenant | null
}

interface BindingDiscoveryOptions {
  tenantCacheTTL?: number
}

const TEN_MINUTES_S = 10 * 60

const defaultOptions: BindingDiscoveryOptions = {
  tenantCacheTTL: TEN_MINUTES_S,
}

const ensureEndingSlash = (address: string) => {
  return address.endsWith('/') ? address : `${address}/`
}

const getStoreBinding = (bindings: Binding[]) => {
  const storeBinding = bindings.find(b => b.targetProduct === 'vtex-storefront')
  if (!storeBinding) {
    throw new Error('No binding found')
  }
  return storeBinding
}

export const getDefaultStoreBinding = async (ctx: Context) => {
  const {
    clients: { tenant },
  } = ctx

  const { bindings = [] } = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })
  const defaultStoreBinding = getStoreBinding(bindings)
  return defaultStoreBinding.id
}

export class BindingResolver {
  constructor(private options: BindingDiscoveryOptions = defaultOptions) {}

  public async discover(ctx: Context): Promise<Binding> {
    const {
      clients: { tenant: tenantClient },
      vtex: { account },
    } = ctx

    const tenantInfo = await tenantClient.info({
      forceMaxAge: this.options.tenantCacheTTL,
      nullIfNotFound: true,
      params: {
        q: account,
      },
    })

    const matchingBinding = this.resolve(ctx, tenantInfo.bindings)

    return matchingBinding
  }

  protected findMatchingBinding(
    account: string,
    hostAndPath: string,
    bindings: Binding[]
  ): Binding | null {
    const matching = bindings.reduce((currentWinner, candidate) => {
      const { canonicalBaseAddress, alternateBaseAddresses } = candidate
      const allCandidateAddresses = [
        canonicalBaseAddress,
        ...alternateBaseAddresses,
        ...PUBLIC_DOMAINS.map(
          domain => `${account}.${domain}/${canonicalBaseAddress}`
        ),
      ].map(ensureEndingSlash)
      const allMatchingAddress = allCandidateAddresses.filter(address =>
        hostAndPath.startsWith(address)
      )
      if (allMatchingAddress.length === 0) {
        return currentWinner
      }

      const [bestMatchingAddress] =
        allMatchingAddress.length === 1
          ? allMatchingAddress
          : allMatchingAddress.sort(
              (addressA, addressB) => addressB.length - addressA.length
            )

      const currentWinnerScore = currentWinner?.matchingAddress.length ?? 0

      return bestMatchingAddress.length > currentWinnerScore
        ? { matchingAddress: bestMatchingAddress, binding: candidate }
        : currentWinner
    }, null as { binding: Binding; matchingAddress: string } | null)

    return matching?.binding ?? null
  }

  protected mountHostAndPath(ctx: Context): string {
    const {
      vtex: { account, workspace },
    } = ctx
    const workspacePrefix = `${workspace}--`
    const rootPath = ctx.get('x-vtex-root-path')
    const forwardedHost = ctx.get('x-forwarded-host')
    const forwardedPath = ctx.get('x-forwarded-path')
    const isInternalPublicDomain = PUBLIC_DOMAINS.some(domain =>
      forwardedHost.endsWith(`${account}.${domain}`)
    )
    const bindingPath = isInternalPublicDomain
      ? this.toBindingPath(forwardedPath)
      : this.toBindingPath(rootPath)
    const resolvedHost =
      isInternalPublicDomain && forwardedHost.startsWith(workspacePrefix)
        ? forwardedHost.replace(`${workspace}--`, '')
        : forwardedHost
    return `${resolvedHost}${bindingPath}`
  }

  protected toBindingPath(path?: string): string {
    let resultPath = path?.split('?')[0] ?? '/'
    if (!resultPath.startsWith('/')) {
      resultPath = `/${resultPath}`
    }

    if (!resultPath.endsWith('/')) {
      resultPath += '/'
    }

    return resultPath
  }

  private resolve(ctx: Context, bindings: Binding[]): Binding {
    const {
      vtex: { account, binding, logger },
      query: { __bindingAddress, __bindingId },
    } = ctx
    const bindingId = binding?.id ?? __bindingId
    if (bindingId) {
      return this.getBindingById(bindingId, bindings)
    }

    if (__bindingAddress) {
      return this.getBindingByAddress(__bindingAddress, bindings)
    }

    const hostAndPath = this.mountHostAndPath(ctx)
    const matching = this.findMatchingBinding(account, hostAndPath, bindings)
    if (matching) {
      return matching
    }

    logger.warn({
      headers: ctx.request.headers,
      message: 'No binding found, falling back to the first store binding',
    })
    return getStoreBinding(bindings)
  }

  private getBindingById(bindingId: string, bindings: Binding[]): Binding {
    const binding = bindings.find(item => item.id === bindingId)
    if (!binding) {
      throw new Error(`Unable to find binding for id ${bindingId}`)
    }

    return binding
  }

  private getBindingByAddress(
    bindindAddress: string,
    bindings: Binding[]
  ): Binding {
    const binding = bindings.find(
      item => item.canonicalBaseAddress === bindindAddress
    )
    if (!binding) {
      throw new Error(`Unable to find binding for address ${bindindAddress}`)
    }

    return binding
  }
}
