# Custom Routes Architecture

## Overview

The custom routes solution provides pre-generated route data for VTEX stores through a background processing architecture with caching and automatic regeneration.

## System Architecture

```mermaid
flowchart TD
    Start([Client Request: GET /custom-routes]) --> Middleware[customRoutes Middleware]
    
    Middleware --> CheckCache{Check VBase Cache}
    
    CheckCache -->|Cache Miss| NoCache[No Cached Data Found]
    CheckCache -->|Cache Hit| CacheFound[Cached Data Found]
    
    NoCache --> TriggerGen[Trigger Generation]
    TriggerGen --> CheckLock{Check Generation Lock}
    
    CheckLock -->|No Lock or Expired| CreateLock[Create Generation Lock]
    CheckLock -->|Active Lock| LockExists[Generation In Progress]
    
    CreateLock --> StartBackground[Start Background Generation]
    StartBackground --> Return404A[Return 404: Generation Triggered]
    
    LockExists --> Return404B[Return 404: Generation In Progress]
    
    CacheFound --> CheckAge{Data Age > 1 Day?}
    
    CheckAge -->|Yes - Stale| TriggerBackground[Trigger Background Regeneration]
    CheckAge -->|No - Fresh| ServeCache[Serve Cached Data]
    
    TriggerBackground --> ServeCache
    ServeCache --> Return200[Return 200 + Data]
    
    Return404A --> End([Client Receives 404])
    Return404B --> End
    Return200 --> EndSuccess([Client Receives 200])
    
    style Return404A fill:#ffcccc
    style Return404B fill:#ffcccc
    style Return200 fill:#ccffcc
    style End fill:#ffcccc
    style EndSuccess fill:#ccffcc
```

## Background Processing Flow

```mermaid
sequenceDiagram
    participant Client
    participant Middleware as customRoutes Middleware
    participant VBase as VBase Storage
    participant Background as Background Promise
    participant Generator as generateCustomRoutes Function
    participant AppsAPI as Apps Routes Service
    participant UserAPI as User Routes Service
    
    Client->>Middleware: GET /custom-routes
    Middleware->>VBase: Get custom-routes.json
    
    alt Cache Miss
        VBase-->>Middleware: null (not found)
        Middleware->>VBase: Check generation lock
        VBase-->>Middleware: No lock found
        Middleware->>VBase: Create lock file
        Middleware->>Background: Start generateCustomRoutes() (fire-and-forget)
        Middleware-->>Client: 404 - Generation triggered
        
        Background->>Generator: Execute generation
        Generator->>AppsAPI: Fetch apps routes
        Generator->>UserAPI: Fetch user routes
        AppsAPI-->>Generator: Apps routes array
        UserAPI-->>Generator: User routes array
        Generator->>Generator: Combine route data
        Generator->>VBase: Save custom-routes.json
        Generator->>VBase: Clear generation lock
        
    else Cache Hit - Fresh Data
        VBase-->>Middleware: Return cached data (< 1 day old)
        Middleware-->>Client: 200 + Routes data
        
    else Cache Hit - Stale Data
        VBase-->>Middleware: Return cached data (> 1 day old)
        Middleware->>Background: Trigger background regeneration (fire-and-forget)
        Middleware-->>Client: 200 + Routes data (stale)
        Background->>Generator: Execute regeneration
    end
```

## VBase Storage Structure

```mermaid
graph TD
    VBase[(VBase Storage)]
    
    VBase --> ConfigBucket[Bucket: configuration]
    VBase --> RoutesBucket[Bucket: custom-routes]
    
    ConfigBucket --> LockFile["File: generation-lock.json<br/>Type: Generation Lock<br/>TTL: 23 hours"]
    
    RoutesBucket --> RoutesFile["File: custom-routes.json<br/>Type: Cached Routes Data<br/>Regeneration: After 1 day"]
    
    LockFile --> LockContent["Content:<br/>{<br/>  generationId: string,<br/>  endDate: string<br/>}"]
    
    RoutesFile --> RoutesContent["Content:<br/>{<br/>  timestamp: number,<br/>  data: [<br/>    {name: 'apps-routes', routes: []},<br/>    {name: 'user-routes', routes: []}<br/>  ]<br/>}"]
    
    style ConfigBucket fill:#e1f5ff
    style RoutesBucket fill:#fff4e1
    style LockFile fill:#ffe1e1
    style RoutesFile fill:#e1ffe1
```

## Response Status Codes

| Status | Scenario | Body | Behavior |
|--------|----------|------|----------|
| **200** | Cached data available | `{ data: [...] }` | Returns cached routes (may trigger background refresh if stale) |
| **404** | No cache + Generation triggered | `{ message: "Custom routes not available. Generation has been triggered." }` | New generation started |
| **404** | No cache + Generation in progress | `{ message: "Generation already in progress, expires at {date}" }` | Active lock prevents duplicate generation |
| **500** | Server error | `{ success: false, error: "..." }` | Unexpected error occurred |

## Key Components

### Files

- **`node/middlewares/customRoutes.ts`**: Main middleware handling requests and triggering background generation
- **`node/middlewares/generateMiddlewares/generateCustomRoutes.ts`**: Background generation function
- **`node/utils.ts`**: Shared utilities and constants
- **`node/services/routes.ts`**: Route fetching services

### Constants (from `utils.ts`)

```typescript
export const CUSTOM_ROUTES_BUCKET = 'custom-routes'
export const CUSTOM_ROUTES_FILENAME = 'custom-routes.json'
export const CUSTOM_ROUTES_GENERATION_LOCK_FILENAME = 'generation-lock.json'
export const CONFIG_BUCKET = 'configuration'
```

### Background Generation Mechanism

The generation is triggered directly via a background promise (fire-and-forget pattern):

```typescript
// Execute generation in background - don't await
generateCustomRoutes(ctx).catch(error => {
  logger.error({
    message: 'Background custom routes generation failed',
    type: 'custom-routes-background-error',
    generationId,
    error,
  })
})
```

**Key characteristics:**

- **Direct function call**: No event system overhead
- **Fire-and-forget**: Promise runs in background without blocking response
- **Error handling**: Errors are caught and logged but don't crash the service
- **Synchronous trigger**: Immediate execution without event queue delays

### Generation Lock Mechanism

1. **Lock Creation**: When generation starts, a lock file is created with:
   - `generationId`: Random identifier
   - `endDate`: Expiration timestamp (23 hours from creation)

2. **Lock Check**: Before starting generation:
   - If lock exists and is valid → Reject with `MultipleCustomRoutesGenerationError`
   - If lock expired or doesn't exist → Proceed with generation

3. **Lock Cleanup**: After generation completes (success or failure), lock is removed

4. **Lock Duration Rationale**:
   - **23 hours** chosen to align with daily regeneration schedule
   - Prevents indefinite blocking if cleanup fails
   - Allows next day's scheduled generation to proceed even if previous generation failed

### Caching Strategy

- **Storage**: VBase bucket `custom-routes`, file `custom-routes.json`
- **Structure**: Account-level (not binding-specific)
- **Freshness**: Data older than 1 day triggers background regeneration
- **Stale-While-Revalidate**: Returns stale data while refreshing in background

## Benefits

✅ **Background Processing**: Asynchronous generation doesn't block requests  
✅ **Direct Execution**: No event system overhead or delays  
✅ **Lock Mechanism**: Prevents duplicate concurrent generations with 23-hour auto-expiration  
✅ **Stale-While-Revalidate**: Always serves data when available, refreshes in background  
✅ **Simple Filename**: Single `generation-lock.json` file for lock management  
✅ **Account-Level Caching**: Single `custom-routes.json` per account (not per binding)  
✅ **Centralized Constants**: All configuration in `utils.ts`  
✅ **Consistent Status Codes**: 404 when unavailable, 200 when serving data  
✅ **Daily Generation Safe**: 23-hour lock ensures next day's generation proceeds even if cleanup fails  
✅ **Error Resilience**: Background errors are logged but don't affect service availability
