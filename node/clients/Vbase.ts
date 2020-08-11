import {
  ConflictsResolver,
  inflightURL,
  InfraClient,
  InstanceOptions,
  IOContext,
  IOResponse,
  RequestTracingConfig,
} from '@vtex/api'
import {
  IgnoreNotFoundRequestConfig,
} from '@vtex/api/lib/HttpClient/middlewares/notFound'
import { AxiosError } from 'axios'

const appId = process.env.VTEX_APP_ID
const [runningAppName] = appId ? appId.split('@') : ['']

const routes = {
  Bucket: (bucket: string) => `/buckets/${runningAppName}/${bucket}`,
  File: (bucket: string, path: string) => `${routes.Bucket(bucket)}/files/${path}`,
}

export class CVBase extends InfraClient {
  constructor (context: IOContext, options?: InstanceOptions) {
    super('vbase@2.x', context, options)
    if (runningAppName === '') {
      throw new Error(`Invalid path to access VBase. Variable VTEX_APP_ID is not available.`)
    }
  }

  public getJSON = <T>(bucket: string, path: string, nullIfNotFound?: boolean, conflictsResolver?: ConflictsResolver<T>, tracingConfig?: RequestTracingConfig) => {
    return this.getRawJSON<T>(bucket, path, nullIfNotFound, conflictsResolver, tracingConfig)
      .then(response => response.data)
  }

  public getRawJSON = <T>(bucket: string, path: string, nullIfNotFound?: boolean, conflictsResolver?: ConflictsResolver<T>, tracingConfig?: RequestTracingConfig) => {
    const headers: Headers = { 'Cache-Control': 'no-cache' }
    if (conflictsResolver) {
      headers['X-Vtex-Detect-Conflicts'] = 'true'
    }
    const inflightKey = inflightURL
    const metric = 'vbase-get-json'
    return this.http.getRaw<T>(routes.File(bucket, path), {
      headers, inflightKey, metric, nullIfNotFound, tracing: {
        requestSpanNameSuffix: metric,
        ...tracingConfig?.tracing,
      }
    } as IgnoreNotFoundRequestConfig)
      .catch(async (error: AxiosError<T>) => {
        const { response } = error
        if (response && response.status === 409 && conflictsResolver) {
          return { ...response, data: await conflictsResolver.resolve() } as IOResponse<T>
        }
        throw error
      })
  }

  public saveJSON = <T>(bucket: string, path: string, data: T, tracingConfig?: RequestTracingConfig, ifMatch?: string) => {
    const headers: Headers = { 'Content-Type': 'application/json' }
    if (ifMatch) {
      headers['If-Match'] = ifMatch
    }
    const metric = 'vbase-save-json'
    return this.http.put(routes.File(bucket, path), data, {
      headers, metric, tracing: {
        requestSpanNameSuffix: metric,
        ...tracingConfig?.tracing,
      }
    })
  }

  public deleteFile = (bucket: string, path: string, tracingConfig?: RequestTracingConfig, ifMatch?: string) => {
    const headers = ifMatch ? { 'If-Match': ifMatch } : null
    const metric = 'vbase-delete-file'
    return this.http.delete(routes.File(bucket, path), {headers, metric, tracing: {
      requestSpanNameSuffix: metric,
      ...tracingConfig?.tracing,
    }})
  }
}

interface Headers { [key: string]: string | number }
