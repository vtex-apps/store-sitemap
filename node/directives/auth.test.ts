import { IOContext, Logger, Sphinx } from '@vtex/api'
import * as TypeMoq from 'typemoq'

import { Clients } from '../clients'
import { VtexID } from '../clients/id'
import { authFromCookie } from './auth'

const vtexIDTypeMock = TypeMoq.Mock.ofInstance(VtexID)
const SphinxTypeMock = TypeMoq.Mock.ofInstance(Sphinx)
const contextMock = TypeMoq.Mock.ofType<Context>()
const ioContext = TypeMoq.Mock.ofType<IOContext>()
const state = TypeMoq.Mock.ofType<State>()
const loggerMock = TypeMoq.Mock.ofType<Logger>()

describe('Test auth directive code', () => {
  let context: Context

  const vtexID = class VtexIDMock extends vtexIDTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public getIdUser = async (_: string, token: string) => {
      switch (token) {
        case '1':
          return { user: 'email@test.com' }
        case '2':
          return { user: 'email2@test.com' }
        case '3':
          return { user: 'email@vtex.com' }
        default:
          return {}
      }
    }
  }

  // tslint:disable-next-line:max-classes-per-file
  const sphinx = class SphinxMock extends SphinxTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public isAdmin = async (email: string) => {
      switch (email) {
        case 'email@test.com':
          return true
        default:
          return false
      }
    }
  }

  beforeEach(() => {
    // tslint:disable-next-line: max-classes-per-file
    const ClientsImpl = class ClientsMock extends Clients {
      get vtexID() {
        return this.getOrSet('vtexID', vtexID)
      }

      get sphinx() {
        return this.getOrSet('sphinx', sphinx)
      }
    }
    const cookies: Record<string, string> = { 'VtexIdclientAutCookie': '1' }

    context = {
      ...contextMock.object,
      clients: new ClientsImpl({}, ioContext.object),
      cookies: {
        get: (key: string) => cookies[key],
      } as any,
      state: {
        ...state.object,
      },
      vtex: {
        ...ioContext.object,
        authToken: '3',
        logger: loggerMock.object,
      },
    }

  })

  it('Should authorize vtex email', async () => {
    const authrorized = await authFromCookie(context)
    expect(authrorized).toBe(true)
  })

  it('Should throw error when VtexIdclientAutCookie is not found', async () => {
    context.cookies = {
      get: (_: string) => undefined,
    } as any
    const authorized = await authFromCookie(context)
    expect(authorized).toBe('VtexIdclientAutCookie not found.')
  })

  it('Should throw error when user is not found', async () => {
    context.vtex.authToken = '4'
    const authorized = await authFromCookie(context)
    expect(authorized).toBe('Could not find user specified by token.')
  })

  it('Should throw error if user is not admin', async () => {
    context.vtex.authToken = '2'
    const authorized = await authFromCookie(context)
    expect(authorized).toBe('User is not admin and can not access resource.')
  })
  it('Should authorize admins', async () => {
    context.vtex.authToken = '1'
    const authorized = await authFromCookie(context)
    expect(authorized).toBe(true)
  })
})
