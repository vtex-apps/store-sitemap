import {
  IOContext,
  VBase,
  VBaseSaveResponse,
} from '@vtex/api'
import * as TypeMoq from 'typemoq'

export interface LoggerCapture {
  error: jest.Mock
  info: jest.Mock
  warn: jest.Mock
}

export const makeLogger = (): LoggerCapture => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
})

export interface MemoryVBaseOptions {
  initialData?: Record<string, Record<string, unknown>>
}

/**
 * In-memory VBase mock shared by CMS middleware tests.
 */
export const createMemoryVBaseMock = (
  ioContext: IOContext,
  options: MemoryVBaseOptions = {}
) => {
  const vbaseTypeMock = TypeMoq.Mock.ofInstance(VBase)

  // tslint:disable-next-line:max-classes-per-file
  return class MemoryVBaseMock extends vbaseTypeMock.object {
    public jsonData: Record<string, Record<string, unknown>> = {
      ...(options.initialData ?? {}),
    }

    constructor() {
      super(ioContext)
    }

    public getJSON = async <T>(
      bucket: string,
      file: string,
      nullOrUndefined?: boolean
    ): Promise<T> => {
      if (!this.jsonData[bucket]?.[file] && nullOrUndefined) {
        return (null as unknown) as T
      }
      return Promise.resolve(this.jsonData[bucket]?.[file] as T)
    }

    public saveJSON = async <T>(
      bucket: string,
      file: string,
      data: T
    ): Promise<VBaseSaveResponse> => {
      if (!this.jsonData[bucket]) {
        this.jsonData[bucket] = {}
      }
      this.jsonData[bucket][file] = data
      return ({ updated: true } as unknown) as VBaseSaveResponse
    }
  }
}

export interface CmsActiveSettings {
  enableCmsRoutes: boolean
  enableContentPlatformRoutes: boolean
}

export const defaultCmsServingSettings = (
  activeSettings: CmsActiveSettings
) => ({
  disableRoutesTerm: '',
  enableAppsRoutes: true,
  enableCmsRoutes: activeSettings.enableCmsRoutes,
  enableContentPlatformRoutes: activeSettings.enableContentPlatformRoutes,
  enableNavigationRoutes: true,
  enableProductRoutes: true,
  ignoreBindings: false,
})
