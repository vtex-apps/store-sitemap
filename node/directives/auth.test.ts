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

// Cookie token → { user, account } returned by validateCredential:
//   '1' → regular admin of testAccount
//   '2' → non-admin user of testAccount
//   '3' → @vtex.com user who is NOT a Sphinx admin (canBypass removed)
//   '4' → @vtex.com user who IS a Sphinx admin
//   '5' → valid user but token issued for a different account (cross-account)
//   default → unresolvable token (empty user)

const TEST_ACCOUNT = 'testAccount'

describe('Test auth directive code', () => {
  let context: Context

  const vtexID = class VtexIDMock extends vtexIDTypeMock.object {
    constructor() {
      super(ioContext.object)
    }

    public validateCredential = async (token: string) => {
      switch (token) {
        case '1':
          return { user: 'email@test.com', account: TEST_ACCOUNT }
        case '2':
          return { user: 'email2@test.com', account: TEST_ACCOUNT }
        case '3':
          return { user: 'email@vtex.com', account: TEST_ACCOUNT }
        case '4':
          return { user: 'admin@vtex.com', account: TEST_ACCOUNT }
        case '5':
          return { user: 'email@test.com', account: 'otherAccount' }
        default:
          return { user: '', account: '' }
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
        case 'admin@vtex.com':
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
    const cookies: Record<string, string> = { VtexIdclientAutCookie: '1' }

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
        account: TEST_ACCOUNT,
        logger: loggerMock.object,
      },
    }
  })

  // US-1: same-account admin is authorized
  it('Should authorize same-account admin', async () => {
    const authorized = await authFromCookie(context)
    expect(authorized).toBe(true)
  })

  // US-4: missing cookie
  it('Should throw error when VtexIdclientAutCookie is not found', async () => {
    context.cookies = {
      get: (_: string) => undefined,
    } as any
    const authorized = await authFromCookie(context)
    expect(authorized).toBe('VtexIdclientAutCookie not found.')
  })

  // US-4: unresolvable token
  it('Should throw error when user is not found', async () => {
    context.cookies = { get: (_: string) => '99' } as any
    const authorized = await authFromCookie(context)
    expect(authorized).toBe('Could not find user specified by token.')
  })

  // US-2: cross-account token is rejected and logger.warn is emitted
  it('Should reject cross-account token and emit logger.warn', async () => {
    const warnSpy = jest.fn()
    context.vtex = { ...context.vtex, logger: { ...loggerMock.object, warn: warnSpy } as any }
    context.cookies = { get: (_: string) => '5' } as any
    const authorized = await authFromCookie(context)
    expect(authorized).toBe('Cross-account token rejected.')
    expect(warnSpy).toHaveBeenCalledWith({
      message: 'Cross-account VtexIdclientAutCookie rejected',
      account: TEST_ACCOUNT,
      tokenAccount: 'otherAccount',
    })
  })

  // US-3: @vtex.com user who is NOT a Sphinx admin is denied (canBypass removed)
  it('Should deny @vtex.com user who is not a Sphinx admin of the target account', async () => {
    context.cookies = { get: (_: string) => '3' } as any
    const authorized = await authFromCookie(context)
    expect(authorized).toBe('User is not admin and can not access resource.')
  })

  // US-3 edge: @vtex.com user who IS a Sphinx admin is authorized
  it('Should authorize @vtex.com user who is a Sphinx admin of the target account', async () => {
    context.cookies = { get: (_: string) => '4' } as any
    const authorized = await authFromCookie(context)
    expect(authorized).toBe(true)
  })

  // Pre-existing: non-admin user is denied
  it('Should throw error if user is not admin', async () => {
    context.cookies = { get: (_: string) => '2' } as any
    const authorized = await authFromCookie(context)
    expect(authorized).toBe('User is not admin and can not access resource.')
  })
})
