import { Events, IOContext, Logger } from '@vtex/api'
import * as TypeMoq from 'typemoq'

import { Clients } from './clients'
import { startSitemapGeneration } from './utils'

const eventsTypeMock = TypeMoq.Mock.ofInstance(Events)
const ioContext = TypeMoq.Mock.ofType<IOContext>()

describe('Test startSitemapGeneration', () => {
  const eventSent = jest.fn()
  const warn = jest.fn()

  // tslint:disable-next-line:max-classes-per-file
  const events = class EventsMock extends eventsTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public sendEvent = async (_: any, __: string, ___: any, ____: any) => {
      eventSent()
    }
  }

  // tslint:disable-next-line: max-classes-per-file
  const ClientsImpl = class ClientsMock extends Clients {
    get events() {
      return this.getOrSet('events', events)
    }
  }

  const context = ({
    clients: new ClientsImpl({}, ioContext.object),
    request: { header: { 'x-vtex-caller': 'some-app' } },
    vtex: {
      account: 'acc',
      logger: ({ warn } as unknown) as Logger,
      workspace: 'master',
    },
  } as unknown) as Context

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('Should log the call and not send any event', async () => {
    await startSitemapGeneration(context)

    expect(eventSent).not.toBeCalled()
    expect(warn).toBeCalledWith(
      expect.objectContaining({
        account: 'acc',
        caller: 'some-app',
        type: 'deprecated-generate-sitemap',
      })
    )
  })

  it('Should also only log when forced', async () => {
    await startSitemapGeneration(context, true)

    expect(eventSent).not.toBeCalled()
    expect(warn).toBeCalledTimes(1)
  })
})
