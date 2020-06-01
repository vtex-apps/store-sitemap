import { Binding } from '@vtex/api'
import { Product } from 'vtex.catalog-graphql'
import { getBucket, hashString, TENANT_CACHE_TTL_S } from '../../utils'
import {
  createFileName,
  createTranslator,
  currentDate,
  filterBindingsBySalesChannel,
  GENERATE_PRODUCT_ROUTES_EVENT,
  GROUP_ENTRIES_EVENT,
  initializeSitemap,
  Message,
  PRODUCT_ROUTES_INDEX,
  RAW_DATA_PREFIX,
  SitemapEntry,
  SitemapIndex,
  slugify
} from './utils'

const PAGE_LIMIT = 50

export async function generateProductRoutes(ctx: EventContext, next: () => Promise<void>) {
  if (ctx.body.from === 0) {
    await initializeSitemap(ctx, PRODUCT_ROUTES_INDEX)
  }

  const {
    clients: {
      catalog,
      catalogGraphQL,
      vbase,
      messages: messagesClient,
      tenant,
    },
    body,
    vtex: {
      logger,
    },
  } = ctx

  const tenantInfo = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })

  const {
    authToken,
    from,
    processedProducts,
    invalidProducts,
  }: ProductRoutesGenerationEvent = body!

  const to = from + PAGE_LIMIT - 1
  const { data, range: { total } } = await catalog.getProductsAndSkuIds(from, to, authToken)

  const productsInfo = await Promise.all(Object.keys(data).map(async productId => {
    const hasSKUs = data[productId].length > 0
    if (!hasSKUs) {
      return
    }
    const { product } = await catalogGraphQL.product(productId) || { product: null }
    if (!product || !product.isActive ) {
      return
    }

    const bindings = filterBindingsBySalesChannel(
        tenantInfo,
        product.salesChannel as Product['salesChannel']
      )

    return bindings.map(binding => [binding, product] as [Binding, Product])
  }))

  let currentInvalidProducts = 0
  let currentProcessedProducts = 0
  const messagesByBinding = productsInfo.reduce((acc, productInfo) => {
    if (!productInfo) {
      currentInvalidProducts++
      return acc
    }
    currentProcessedProducts++
    productInfo.forEach(([binding, product]) => {
      const message: Message = {content: product.linkId!, context: product.id }
      if (acc[binding.id]) {
        acc[binding.id].messages =  acc[binding.id].messages.concat(message)
      } else {
        acc[binding.id] = { bindingLocale: binding.defaultLocale, messages: [message] }
      }
    })
    return acc
  }, {} as Record<string, { bindingLocale: string, messages: Message[] }>)

  const translate = createTranslator(messagesClient)
  const tenantLocale = tenantInfo.defaultLocale

  await Promise.all(
    Object.keys(messagesByBinding).map(async bindingId => {
      const bucket = getBucket(RAW_DATA_PREFIX, hashString(bindingId))
      const { messages, bindingLocale } = messagesByBinding[bindingId]
      const translatedSlugs = await translate(
        tenantLocale,
        bindingLocale,
        messages
      )
      const routes = translatedSlugs.map(slug => ({path: `/${slugify(slug).toLowerCase()}/p`}))
      const entry = createFileName('product',from)
      const { index } = await vbase.getJSON<SitemapIndex>(bucket, PRODUCT_ROUTES_INDEX)
      index.push(entry)
      const lastUpdated = currentDate()
      await Promise.all([
        vbase.saveJSON<SitemapIndex>(bucket, PRODUCT_ROUTES_INDEX, {
          index,
          lastUpdated,
        }),
        vbase.saveJSON<SitemapEntry>(bucket, entry, {
          lastUpdated,
          routes,
        }),
      ])
    })
  )

  const payload: ProductRoutesGenerationEvent = {
    authToken,
    from: from + PAGE_LIMIT,
    invalidProducts: invalidProducts + currentInvalidProducts,
    processedProducts: processedProducts + currentProcessedProducts,
  }
  ctx.state.nextEvent = {
    event: GENERATE_PRODUCT_ROUTES_EVENT,
    payload,
  }
  if (payload.processedProducts >= total || payload.from >= total) {
    logger.info({
      invalidProducts: payload.invalidProducts,
      message: `Product routes complete`,
      processedProducts: payload.processedProducts,
      total,
      type: 'product-routes',
    })
    ctx.state.nextEvent = {
      event: GROUP_ENTRIES_EVENT,
      payload: {
        indexFile: PRODUCT_ROUTES_INDEX,
      },
    }
  }

  await next()
}
