import { Binding, Events, IOContext, Logger, VBase } from '@vtex/api'
import * as TypeMoq from 'typemoq'

import { CONFIG_BUCKET, GENERATION_CONFIG_FILE, startSitemapGeneration } from './utils'

import { Clients } from './clients'

const eventsTypeMock = TypeMoq.Mock.ofInstance(Events)
const vbaseTypeMock = TypeMoq.Mock.ofInstance(VBase)
const contextMock = TypeMoq.Mock.ofType<Context>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()
const loggerMock = TypeMoq.Mock.ofType<Logger>()

const oneHourFromNowMS = () => `${new Date(Date.now() + 1 * 60 * 60 * 1000)}`
const minusOneHourFromNowMS = () => `${new Date(Date.now() - 1 * 60 * 60 * 1000)}`

const eventSent = jest.fn()

const DEFAULT_CONFIG = {
  endDate: oneHourFromNowMS(),
  generationId: '10',
}

describe('Test startSitemapGeneration', () => {
  let context: Context

  const vbase = class VBaseMock extends vbaseTypeMock.object {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private jsonData: Record<string, any> = {}

    constructor() {
      super(ioContext.object)
    }

    public getJSON = async <T>(
      bucket: string,
      file: string,
      nullOrUndefined?: boolean | undefined
    ): Promise<T> => {
      if (!this.jsonData[bucket]?.[file] && nullOrUndefined) {
        return (null as unknown) as T
      }
      return Promise.resolve(this.jsonData[bucket][file] as T)
    }

    public saveJSON = async <T>(
      bucket: string,
      file: string,
      data: T
    ): Promise<void> => {
      if (!this.jsonData[bucket]) {
        this.jsonData[bucket] = {}
      }
      this.jsonData[bucket][file] = data
    }
  }

  // tslint:disable-next-line:max-classes-per-file
  const events = class EventsMock extends eventsTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public sendEvent = async (_: string, __:string, ___: any, ____: any) => {
      eventSent()
    }
  }

    beforeEach(() => {
      // tslint:disable-next-line: max-classes-per-file
      const ClientsImpl = class ClientsMock extends Clients {
        get vbase() {
          return this.getOrSet('vbase', vbase)
        }

        get events() {
          return this.getOrSet('events', events)
        }
      }

      context = {
        ...contextMock.object,
        clients: new ClientsImpl({}, ioContext.object),
        query: {},
        state: {
          ...state.object,
          binding: {
            id: '1',
          } as Binding,
          bucket: 'bucket',
          forwardedHost: 'www.host.com',
          forwardedPath: '/sitemap/file1.xml',
          rootPath: '',
        },
        vtex: {
          ...ioContext.object,
          logger: loggerMock.object,
        },
      }
    })

    it('Should not start a generation if has already started', async () => {
     const { vbase: vbaseClient } = context.clients
     await vbaseClient.saveJSON(CONFIG_BUCKET, GENERATION_CONFIG_FILE, DEFAULT_CONFIG)
     await startSitemapGeneration(context)
     expect(context.status).toStrictEqual(202)
   })

   it('Should start a generation if date is expired', async () => {
    const { vbase: vbaseClient } = context.clients
    await vbaseClient.saveJSON(CONFIG_BUCKET, GENERATION_CONFIG_FILE, {
      ...DEFAULT_CONFIG,
      endDate: minusOneHourFromNowMS(),
    })
    await startSitemapGeneration(context)
    expect(eventSent).toBeCalled()
   })

   it('Should start a generation if date is invalid', async () => {
    const { vbase: vbaseClient } = context.clients
    await vbaseClient.saveJSON(CONFIG_BUCKET, GENERATION_CONFIG_FILE, {
      ...DEFAULT_CONFIG,
      endDate: 'INVALID',
    })
    await startSitemapGeneration(context)
    expect(eventSent).toBeCalled()
   })

   it('Should start a generation with the force querystring', async () => {
    const thisContext = {
      ...context,
      query: {
        __force: undefined,
      },
    }
    const { vbase: vbaseClient } = context.clients
    await vbaseClient.saveJSON(CONFIG_BUCKET, GENERATION_CONFIG_FILE, DEFAULT_CONFIG)
    await startSitemapGeneration(thisContext)
    expect(eventSent).toBeCalled()
   })

   it('Should start a generation', async () => {
      await startSitemapGeneration(context)
      expect(eventSent).toBeCalled()
   })
})
