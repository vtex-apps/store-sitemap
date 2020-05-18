import { CONFIG_BUCKET, CONFIG_FILE, currentDate, getBucket, hashString, TENANT_CACHE_TTL_S } from '../../utils'
import {
  DEFAULT_CONFIG,
  filterBindingsBySalesChannel,
  GENERATE_PRODUCT_ROUTES_EVENT,
  initializeSitemap,
  PRODUCT_ROUTES_INDEX,
  SitemapEntry,
  SitemapIndex,
  slugify
} from './utils'

const PAGE_LIMIT = 10

export async function generateProductRoutes(ctx: EventContext) {
  if (!ctx.body.from) {
    await initializeSitemap(ctx, PRODUCT_ROUTES_INDEX)
  }

  const {
    clients: {
      catalog,
      catalogGraphQL,
      events,
      vbase,
      meta,
      tenant,
    },
    body,
    vtex: {
      logger,
    },
  } = ctx
  const {generationPrefix, productionPrefix } = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG
  const tenantInfo = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })

  const {
    authToken, // CHECK IF IT IS SAFE
    from,
    processedProducts,
    invalidProducts,
  }: ProductRoutesGenerationEvent = body!

  const to = from + PAGE_LIMIT - 1
  const { data, range: { total } } = await catalog.getProductsAndSkuIds(from, to, authToken)

  logger.debug({
    message: 'Event received',
    payload: {
      from,
      invalidProducts,
      processedProducts,
      total,
    },
    type: 'product-routes',
  })

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
        product.salesChannel
      )
    return bindings.map(binding => {
        // TODO TRANSLSATE
        const translated = product.linkId
        const translatedSlug = slugify(translated).toLowerCase()
        const path = `/${translatedSlug}/p`

        return [binding.id, path] as [string, string]
      })
  }))

  let currentInvalidProducts = 0
  let currentProcessedProducts = 0
  const routesByBinding = productsInfo.reduce((acc, productInfo) => {
    if (!productInfo) {
      currentInvalidProducts++
      return acc
    }
    currentProcessedProducts++
    productInfo.forEach(([binding, path]) => {
      acc[binding] = acc[binding] ? acc[binding].concat({path}) : [{path}]
    })
    return acc
  }, {} as Record<string, Route[]>)


  await Promise.all(
    Object.keys(routesByBinding).map(async bindingId => {
      const bucket = getBucket(generationPrefix, hashString(bindingId))
      const routes = routesByBinding[bindingId]
      await meta.makeMetaRequest()
      const entry = `product-${from}`
      const indexData = await vbase.getJSON<SitemapIndex>(bucket, PRODUCT_ROUTES_INDEX, true)
      const { index } = indexData as SitemapIndex
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
  if (payload.processedProducts >= total || payload.from >= total) {
    logger.info({
      invalidProducts: payload.invalidProducts,
      message: `Product routes complete`,
      processedProducts: payload.processedProducts,
      total,
      type: 'product-routes',
    })

    logger.info(`Sitemap complete`)
    await vbase.saveJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, {
      generationPrefix: productionPrefix,
      productionPrefix: generationPrefix,
    })
    return
  }
  events.sendEvent('', GENERATE_PRODUCT_ROUTES_EVENT, payload)
  logger.debug({ message: 'Event sent', type: 'product-routes', payload })
}
