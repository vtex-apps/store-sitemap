import { Binding, VBase } from '@vtex/api'
import { Product } from 'vtex.catalog-graphql'
import { CONFIG_BUCKET, CONFIG_FILE, currentDate, getBucket, hashString, TENANT_CACHE_TTL_S } from '../../utils'
import {
  createTranslator,
  DEFAULT_CONFIG,
  filterBindingsBySalesChannel,
  GENERATE_PRODUCT_ROUTES_EVENT,
  initializeSitemap,
  Message,
  PRODUCT_ROUTES_INDEX,
  SitemapEntry,
  SitemapIndex,
  slugify
} from './utils'

const PAGE_LIMIT = 10

const FILE_LIMIT = 30000

const getEntry = (entity: string, count: number) => `${entity}-${count}`

const createDataSaver = (vbase: VBase, bucket: string, indexFile: string) =>
  async (entity: string, count: number, routes: Route[], lastUpdated: string) => {
    const currentEntry = getEntry(entity, count)
    const { routes: savedRoutes } = await vbase.getJSON<SitemapEntry>(bucket, currentEntry, true) || { routes: [] }
    const shouldUpdateIndex = savedRoutes.length === 0 || savedRoutes.length + routes.length > FILE_LIMIT

    if (shouldUpdateIndex) {
      const { index } = await vbase.getJSON<SitemapIndex>(bucket, PRODUCT_ROUTES_INDEX)
      const newCount = count + 1
      const newEntry = getEntry(entity, newCount)
      const newIndex = index.concat(newEntry)

      await Promise.all([
        vbase.saveJSON<SitemapEntry>(bucket, newEntry, {
          lastUpdated,
          routes,
        }),
        vbase.saveJSON<SitemapIndex>(bucket, indexFile, {
          index: newIndex,
          lastUpdated,
        }),
      ])
      return newCount
    } else {
      const updatedRoutes = [...savedRoutes, ...routes]
      await vbase.saveJSON<SitemapEntry>(bucket, currentEntry, {
        lastUpdated,
        routes: updatedRoutes,
      })
      return count
    }
  }

export async function generateProductRoutes(ctx: EventContext, next: () => Promise<void>) {
  if (!ctx.body.from) {
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
  const {generationPrefix, productionPrefix } = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG
  const tenantInfo = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })

  const {
    authToken, // TODO: CHECK IF IT IS SAFE
    entityCountByBinding,
    from,
    processedProducts,
    invalidProducts,
  }: ProductRoutesGenerationEvent = body!

  const to = from + PAGE_LIMIT - 1
  const { data, range: { total } } = await catalog.getProductsAndSkuIds(from, to, authToken)

  logger.debug({
    message: 'Event received',
    payload: {
      entityCountByBinding,
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
      const count = entityCountByBinding[bindingId] || 0
      const bucket = getBucket(generationPrefix, hashString(bindingId))
      const saveData = createDataSaver(vbase, bucket, PRODUCT_ROUTES_INDEX)
      const { messages, bindingLocale } = messagesByBinding[bindingId]
      const translatedSlugs = await translate(
        tenantLocale,
        bindingLocale,
        messages
      )
      const routes = translatedSlugs.map(slug => ({path: `/${slugify(slug).toLowerCase()}/p`}))
      const lastUpdated = currentDate()
      entityCountByBinding[bindingId] = await saveData('product', count, routes, lastUpdated)
    })
  )

  const payload: ProductRoutesGenerationEvent = {
    authToken,
    entityCountByBinding,
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
  ctx.state.nextEvent = {
    event: GENERATE_PRODUCT_ROUTES_EVENT,
    payload,
  }
  next()
}
