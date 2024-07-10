import { Binding, Logger, VBase } from '@vtex/api'
import { isEmpty, zipObj } from 'ramda'
import { Product } from 'vtex.catalog-graphql'

import {
  getBucket,
  getStoreBindings,
  hashString,
  TENANT_CACHE_TTL_S,
} from '../../utils'
import { GraphQLServer, ProductNotFound } from '../../clients/graphqlServer'
import {
  createFileName,
  createTranslator,
  currentDate,
  filterBindingsBySalesChannel,
  GENERATE_PRODUCT_ROUTES_EVENT,
  getAccountSalesChannels,
  GROUP_ENTRIES_EVENT,
  initializeSitemap,
  Message,
  PRODUCT_ROUTES_INDEX,
  RAW_DATA_PREFIX,
  retryOn429,
  SitemapEntry,
  SitemapIndex,
  slugify,
  Translator,
} from './utils'

const PRODUCT_QUERY = `query Product($identifier: ProductUniqueIdentifier) {
  product(identifier: $identifier) @context(provider: "vtex.search-graphql") {
		productId
  }
}`

type ProductInfo = Array<[Binding, Product]>
type MessagesByBinding = Record<
  string,
  { bindingLocale: string; messages: Message[] }
>

const isProductSearchResponseEmpty = async (
  productId: string,
  graphqlServer: GraphQLServer,
  logger: Logger
) => {
  const searchResponse = await graphqlServer
    .query(
      PRODUCT_QUERY,
      { identifier: { field: 'id', value: productId } },
      {
        persistedQuery: {
          provider: 'vtex.search-graphql@0.x',
          sender: 'vtex.store-sitemap@2.x',
        },
      }
    )
    .catch(error => {
      if (error instanceof ProductNotFound) {
        return null
      }
      logger.error({
        error,
        message: 'Error in product search',
        productId,
      })
      return null
    })
  return searchResponse !== null
}

const getProductInfo = (
  storeBindings: Binding[],
  hasSalesChannels: boolean,
  ctx: EventContext
) => async (productId: string): Promise<ProductInfo | undefined> => {
  const {
    clients: { catalogGraphQL, graphqlServer },
    vtex: { logger },
  } = ctx
  const [catalogResponse, hasSearchResponse] = await Promise.all([
    catalogGraphQL.product(productId),
    isProductSearchResponseEmpty(productId, graphqlServer, logger),
  ])
  const product = catalogResponse?.product
  if (!product || !product.isActive || !hasSearchResponse) {
    return
  }

  const bindings = hasSalesChannels
    ? filterBindingsBySalesChannel(
        storeBindings,
        product.salesChannel as Product['salesChannel']
      )
    : storeBindings

  return bindings.map(binding => [binding, product] as [Binding, Product])
}

const getMessagesFromProductsInfo = (
  productsInfo: Array<ProductInfo | undefined>
) =>
  productsInfo.reduce(
    (acc, productInfo) => {
      const { messagesByBinding } = acc
      if (!productInfo) {
        acc.currentInvalidProducts++
        return acc
      }
      acc.currentProcessedProducts++
      productInfo.forEach(([binding, product]) => {
        const message: Message = {
          content: product.linkId!,
          context: product.id,
        }
        if (messagesByBinding[binding.id]) {
          messagesByBinding[binding.id].messages = messagesByBinding[
            binding.id
          ].messages.concat(message)
        } else {
          messagesByBinding[binding.id] = {
            bindingLocale: binding.defaultLocale,
            messages: [message],
          }
        }
      })
      return acc
    },
    {
      currentInvalidProducts: 0,
      currentProcessedProducts: 0,
      messagesByBinding: {} as MessagesByBinding,
    }
  )

const createRoutes = (
  messagesByBinding: MessagesByBinding,
  tenantLocale: string,
  pathsDictionary: Record<string, string>,
  translate: Translator
) => async (bindingId: string) => {
  const { messages, bindingLocale } = messagesByBinding[bindingId]
  const translatedSlugs = await translate(tenantLocale, bindingLocale, messages)
  const ids = messages.map(message => message.context)
  const pathById = zipObj(ids, translatedSlugs)
  const routes: Route[] = Object.keys(pathById).map(id => {
    const slug = pathById[id]
    const path = `/${slugify(slug).toLowerCase()}/p`
    const key = `${bindingId}_${id}`
    pathsDictionary[key] = path
    return { path, id }
  })
  return routes
}

const completeRoutes = (
  pathsDictionary: Record<string, string>,
  bindingIds: string[]
) => (route: Route): Route => {
  const alternates: AlternateRoute[] = bindingIds.map(id => ({
    bindingId: id,
    path: pathsDictionary[`${id}_${route.id}`],
  }))
  return {
    ...route,
    alternates,
  }
}

const saveRoutes = (
  routesByBinding: Record<string, Route[]>,
  pathsDictionary: Record<string, string>,
  bindingsIds: string[],
  entry: string,
  vbase: VBase
) => async (bindingId: string) => {
  const routes = routesByBinding[bindingId].map(
    completeRoutes(pathsDictionary, bindingsIds)
  )
  const bucket = getBucket(RAW_DATA_PREFIX, hashString(bindingId))
  const { index } = await vbase.getJSON<SitemapIndex>(
    bucket,
    PRODUCT_ROUTES_INDEX
  )
  index.push(entry)
  const lastUpdated = currentDate()

  try {
    await retryOn429(() =>
      vbase.saveJSON<SitemapEntry>(bucket, entry, {
        lastUpdated,
        routes,
      })
    )

    await retryOn429(() =>
      vbase.saveJSON<SitemapIndex>(bucket, PRODUCT_ROUTES_INDEX, {
        index,
        lastUpdated,
      })
    )
  } catch (error) {
    console.error(`Failed to save data after retries: ${error.message}`)
  }
}

const pageWasProcessed = async (
  entry: string,
  bindingId: string,
  vbase: VBase
) => {
  const bucket = getBucket(RAW_DATA_PREFIX, hashString(bindingId))
  const { index } = await vbase.getJSON<SitemapIndex>(
    bucket,
    PRODUCT_ROUTES_INDEX
  )
  if (index.includes(entry)) {
    return true
  }
  return false
}

export async function generateProductRoutes(
  ctx: EventContext,
  next: () => Promise<void>
) {
  if (ctx.body.page === 1) {
    await initializeSitemap(ctx, PRODUCT_ROUTES_INDEX)
  }
  const {
    clients: { catalog, vbase, messages: messagesClient, tenant },
    body,
    vtex: { logger },
  } = ctx

  const tenantInfo = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })

  const {
    page,
    generationId,
    processedProducts,
    invalidProducts,
  }: ProductRoutesGenerationEvent = body!

  const entry = createFileName('product', page)
  const storeBindings = await getStoreBindings(tenant)
  const salesChannels = getAccountSalesChannels(storeBindings)
  const hasSalesChannels = !!salesChannels?.length

  if (await pageWasProcessed(entry, storeBindings[0].id, vbase)) {
    logger.error({ message: 'Page already processed', page })
    return
  }

  const {
    items,
    paging: { pages: totalPages, total },
  } = await catalog.getProductsIds(page, salesChannels)

  const productsWithError: Array<{
    productId: string
    error: unknown
  }> = []

  const getProductInfoFn = getProductInfo(storeBindings, hasSalesChannels, ctx)
  const productsInfo = await Promise.all(
    items.map((productId: { toString: () => string }) =>
      getProductInfoFn(productId.toString()).catch(error => {
        productsWithError.push({ productId: productId.toString(), error })
        return undefined
      })
    )
  )

  if (!isEmpty(productsWithError)) {
    logger.error({
      message: `Error in product search, ${productsWithError.length} failed when adding into sitemap`,
      productsWithError,
    })
  }

  const {
    currentInvalidProducts,
    currentProcessedProducts,
    messagesByBinding,
  } = getMessagesFromProductsInfo(productsInfo)

  const translate = createTranslator(messagesClient)
  const tenantLocale = tenantInfo.defaultLocale

  const pathsDictionary: Record<string, string> = {}
  const routesList = await Promise.all(
    Object.keys(messagesByBinding).map(
      createRoutes(messagesByBinding, tenantLocale, pathsDictionary, translate)
    )
  )

  const bindingsIds = Object.keys(messagesByBinding)
  const routesByBinding: Record<string, Route[]> = zipObj(
    bindingsIds,
    routesList
  )
  await Promise.all(
    Object.keys(routesByBinding).map(
      saveRoutes(routesByBinding, pathsDictionary, bindingsIds, entry, vbase)
    )
  )

  const payload: ProductRoutesGenerationEvent = {
    generationId,
    invalidProducts: invalidProducts + currentInvalidProducts,
    page: page + 1,
    processedProducts: processedProducts + currentProcessedProducts,
  }
  ctx.state.nextEvent = {
    event: GENERATE_PRODUCT_ROUTES_EVENT,
    payload,
  }
  if (page >= totalPages) {
    logger.info({
      invalidProducts: payload.invalidProducts,
      message: `Product routes complete`,
      page,
      processedProducts: payload.processedProducts,
      total,
      totalPages,
      type: 'product-routes',
    })
    ctx.state.nextEvent = {
      event: GROUP_ENTRIES_EVENT,
      payload: {
        from: 0,
        generationId,
        indexFile: PRODUCT_ROUTES_INDEX,
      },
    }
  }

  await next()
}
