import { IOContext, Logger, VBase, VBaseSaveResponse } from '@vtex/api'
import * as TypeMoq from 'typemoq'

import { Clients } from '../../clients'
import { CONFIG_BUCKET, GENERATION_CONFIG_FILE } from '../../utils'
import { prepare } from './prepare'

const vbaseTypeMock = TypeMoq.Mock.ofInstance(VBase)
const contextMock = TypeMoq.Mock.ofType<EventContext>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()
const loggerMock = TypeMoq.Mock.ofType<Logger>()

const next = jest.fn()

describe('Test generation prepare', () => {
  let context: EventContext

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
    ): Promise<VBaseSaveResponse> => {
      if (!this.jsonData[bucket]) {
        this.jsonData[bucket] = {}
      }
      this.jsonData[bucket][file] = data
      return Promise.resolve([{ path: file, hash: 'mocked-hash' }])
    }
  }
  beforeEach(() => {
    // tslint:disable-next-line:max-classes-per-file
    const ClientsImpl = class ClientsMock extends Clients {
      public get vbase() {
        return this.getOrSet('vbase', vbase)
      }
    }
    context = {
      ...contextMock.object,
      body: {
        generationId: '1',
      },
      clients: new ClientsImpl({}, ioContext.object),
      state: {
        ...state.object,
      },
      vtex: {
        ...ioContext.object,
        logger: loggerMock.object,
      },
    }
  })

  it('Shouldnt continue if genereationId isnt found', async () => {
    const thisContext = {
      ...context,
      body: {
        generationId: undefined,
      },
    }
    await prepare(thisContext, next)
    expect(next).toHaveBeenCalledTimes(0)
  })

  it('Shouldnt continue if generationId is not the one in VBae', async () => {
    const { vbase: vbaseClient } = context.clients
    await vbaseClient.saveJSON(CONFIG_BUCKET, GENERATION_CONFIG_FILE, {
      generationId: '2',
    })
    await prepare(context, next)
    expect(next).toHaveBeenCalledTimes(0)
  })

  it('Shouldnt continue if no config file is found', async () => {
    await prepare(context, next)
    expect(next).toHaveBeenCalledTimes(0)
  })

  it('Should continue if generationId matches the config', async () => {
    const { vbase: vbaseClient } = context.clients
    await vbaseClient.saveJSON(CONFIG_BUCKET, GENERATION_CONFIG_FILE, {
      generationId: '1',
    })
    await prepare(context, next)
    expect(next).toBeCalled()
  })
})
