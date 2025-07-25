import { ConflictsResolver, inflightURL, InstanceOptions, IOContext, IOResponse, RequestTracingConfig, VBase } from '@vtex/api'
import { AxiosError } from 'axios'

interface Headers { [key: string]: string | number }
const appId = process.env.VTEX_APP_ID
const [runningAppName] = appId ? appId.split('@') : ['']

const routes = {
  Bucket: (bucket: string) => `/buckets/${runningAppName}/${bucket}`,
  File: (bucket: string, path: string) => `${routes.Bucket(bucket)}/files/${path}`,
}

export class CVBase extends VBase {
  constructor (context: IOContext, options?: InstanceOptions) {
    super(context, options)
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
      },
    })
      .catch(async (error: AxiosError<T>) => {
        const { response } = error
        if (response && response.status === 409 && conflictsResolver) {
          return { ...response, data: await conflictsResolver.resolve() } as IOResponse<T>
        }
        throw error
      })
  }
}
