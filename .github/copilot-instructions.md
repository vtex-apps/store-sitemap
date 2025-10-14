# VTEX Store Sitemap - Copilot Instructions

## Project Overview
This is a VTEX IO app that generates XML sitemaps for VTEX stores. It's built with the VTEX IO framework using Node.js, GraphQL, and event-driven architecture.

## Key Architecture Patterns

### VTEX IO App Structure
- **`manifest.json`**: Defines app metadata, dependencies, policies, and settings schema
- **`node/`**: Backend service with TypeScript, runs on VTEX IO platform
- **`graphql/`**: GraphQL schema and directives for API
- **`service.json`**: Defines HTTP routes, events, and service configuration

### Core Components
1. **Event-Driven Generation**: Sitemap generation uses VTEX events (`generateSitemap`, `generateProductRoutes`, etc.)
2. **Middleware Pipeline**: Request processing through binding → cache → sitemap generation
3. **Multi-Binding Support**: Handles stores with multiple country/language bindings
4. **VBase Storage**: Uses VTEX's VBase for XML file storage and caching

### Data Flow Pattern
```
GraphQL Query → Event → Middleware Chain → External APIs → VBase Storage → XML Response
```

## Critical Files to Understand

### Service Entry Points
- **`node/index.ts`**: Main service setup with middleware registration
- **`node/service.json`**: Route definitions (`/sitemap.xml`, `/sitemap/:path`)
- **`node/resolvers/`**: GraphQL resolvers for `generateSitemap` mutation

### Middleware Architecture
- **`middlewares/sitemap.ts`**: Core sitemap serving logic with index/entry handling
- **`middlewares/generateMiddlewares/`**: Event handlers for route generation
- **`middlewares/binding.ts`**: Multi-binding support for international stores
- **`middlewares/cache.ts`**: Caching strategy for sitemap files

### External Integrations
- **`clients/`**: VTEX API clients (Catalog, Rewriter, Messages, VBase)
- **`manifest.json` policies**: Required permissions for VTEX APIs

## Development Patterns

### Testing
- Uses Jest with TypeMoq for mocking VTEX clients
- **`jest/setEnvVars.js`**: Sets required VTEX environment variables
- Test files follow `*.test.ts` pattern alongside source files

### Error Handling
- Custom error types in `errors.ts` (e.g., `MultipleSitemapGenerationError`)
- Proper HTTP status codes for concurrent generation attempts (202)

### VTEX-Specific Conventions
- Use `@vtex/api` for all VTEX platform integrations
- Event naming: `sitemap.generate`, `sitemap.generate:rewriter-routes`
- VBase bucket pattern: `CONFIG_BUCKET` for generation state

## Key Commands & Workflows

### Development
```bash
cd node/
yarn install
yarn test
yarn lint
```

### Deployment
- **`lint.sh`**: Pre-release linting (runs before release)
- VTEX CLI: `vtex link` for development, `vtex publish` for release

### Testing Sitemap Generation
```graphql
# In GraphQL IDE
{
  generateSitemap(force: true)
}
```

## Important Gotchas

### Multi-Binding Complexity
- Stores can have multiple bindings (countries/languages)
- Each binding gets its own sitemap with `?__bindingAddress=` query param
- Index sitemap lists all binding-specific sitemaps

### Generation State Management
- Uses VBase to track ongoing generation to prevent conflicts
- Generation can take 5-30+ minutes depending on product count
- Force restart with `force: true` parameter

### Route Types
Three main route sources (configurable via settings):
1. **Product Routes**: From catalog API
2. **Navigation Routes**: From rewriter/category structure  
3. **App Routes**: From other VTEX IO apps' `routes.json`

### XML Format Requirements
- Max 5,000 URLs per sitemap file
- Files split by entity type (products, categories, etc.)
- Uses cheerio for XML manipulation and validation

## External Dependencies
- **Catalog API**: Product data and availability
- **Rewriter**: URL rewriting rules and navigation structure
- **Messages**: I18n translations for routes
- **VBase**: File storage for generated XML sitemaps

## Settings Schema
Critical app settings (configured via admin):
- `enableProductRoutes`, `enableNavigationRoutes`, `enableAppsRoutes`
- `disableRoutesTerm`: Exclude routes containing specific strings
- `ignoreBindings`: Generate single sitemap even with multiple bindings

## Logging Best Practices

### Logger Access Patterns
```typescript
// From context (preferred in middlewares)
const { vtex: { logger } } = ctx
ctx.vtex.logger.error({ message: 'Error occurred', error })

// Direct import (for utilities/services)
import { Logger } from '@vtex/api'
logger.info({ message: 'Operation completed' })
```

### Structured Logging Format
Always use object format with `message` and `payload`/additional fields:

```typescript
// ✅ Good - Structured with context
logger.info({
  message: 'Fetching legacy sitemap entry',
  payload: {
    forwardedPath,
    bucket,
  },
})

// ✅ Good - Error logging with details
logger.error({
  message: 'Error in product search',
  error,
  productId,
})

// ✅ Good - Progress logging with metrics
logger.info({
  message: 'Product routes complete',
  invalidProducts: payload.invalidProducts,
  processedProducts: payload.processedProducts,
  total,
  type: 'product-routes',
})

// ❌ Avoid - Plain strings
logger.info('Operation completed')
```

### Log Levels and Use Cases
- **`debug`**: Internal state inspection, enabled files arrays
- **`info`**: Operation progress, completion status, metrics
- **`warn`**: Fallback behaviors, non-critical issues (e.g., binding fallbacks)
- **`error`**: Failures, exceptions, 404s with context

### Common Patterns
- **Generation tracking**: Include `generationId` for event correlation
- **Route processing**: Log counts, types, and completion status
- **Error context**: Always include operation details and identifiers
- **Fallback warnings**: Log when using default behaviors
