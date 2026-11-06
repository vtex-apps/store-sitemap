import { readFileSync } from 'fs'
import { graphql } from 'graphql'
import { makeExecutableSchema } from 'graphql-tools'
import { join } from 'path'

import { Authorization } from '../directives/auth'
import { EXTENDED_INDEX_FILE, getBucket, hashString } from '../utils'
import { resolvers } from './index'

const ACCOUNT = 'test-account'
const BINDING = 'test-binding'
const INDEX = 'test-index'
const TOKEN = 'test-token'

const schema = makeExecutableSchema({
  resolvers,
  schemaDirectives: { requiresAuth: Authorization },
  typeDefs: ['directives.graphql', 'schema.graphql'].map(file =>
    readFileSync(join(__dirname, '../../graphql', file), 'utf8')
  ),
})

describe.each(['saveIndex', 'deleteIndex'])('%s authorization', mutation => {
  const getCookie = jest.fn()
  const validateCredential = jest.fn()
  const isAdmin = jest.fn()
  const getJSON = jest.fn()
  const saveJSON = jest.fn()
  let context: Context

  const execute = () =>
    graphql(
      schema,
      `mutation($index: String!, $binding: String) {
        ${mutation}(index: $index, binding: $binding)
      }`,
      undefined,
      context,
      { index: INDEX, binding: BINDING }
    )

  const expectDenied = async (message: string) => {
    const result = await execute()

    expect(result.errors).toHaveLength(1)
    expect(result.errors![0].message).toBe(message)
    expect(result.data).toBeNull()
    expect(getJSON).not.toHaveBeenCalled()
    expect(saveJSON).not.toHaveBeenCalled()
  }

  beforeEach(() => {
    jest.resetAllMocks()
    getCookie.mockReturnValue(TOKEN)
    validateCredential.mockResolvedValue({
      account: ACCOUNT,
      user: 'admin@example.test',
    })
    isAdmin.mockResolvedValue(true)
    getJSON.mockResolvedValue({
      index: mutation === 'deleteIndex' ? [INDEX] : [],
    })
    saveJSON.mockResolvedValue(undefined)
    context = {
      clients: {
        sphinx: { isAdmin },
        vbase: { getJSON, saveJSON },
        vtexID: { validateCredential },
      },
      cookies: { get: getCookie },
      vtex: { account: ACCOUNT, logger: { warn: jest.fn() } },
    } as unknown as Context
  })

  it('rejects anonymous requests before accessing VBase', async () => {
    getCookie.mockReturnValue(undefined)

    await expectDenied('VtexIdclientAutCookie not found.')
    expect(validateCredential).not.toHaveBeenCalled()
  })

  it('rejects invalid or expired credentials before accessing VBase', async () => {
    validateCredential.mockResolvedValue(null)

    await expectDenied('Could not validate token.')
    expect(isAdmin).not.toHaveBeenCalled()
  })

  it('rejects credentials from another account before accessing VBase', async () => {
    validateCredential.mockResolvedValue({
      account: 'another-account',
      user: 'admin@example.test',
    })

    await expectDenied('Cross-account token rejected.')
    expect(isAdmin).not.toHaveBeenCalled()
  })

  it('rejects non-admin users before accessing VBase', async () => {
    isAdmin.mockResolvedValue(false)

    await expectDenied('User is not admin and can not access resource.')
  })

  it('does not access VBase when credential validation fails', async () => {
    validateCredential.mockRejectedValue(new Error('Identity service unavailable'))

    await expectDenied('Identity service unavailable')
  })

  it('allows same-account administrators to update the index', async () => {
    const result = await execute()

    expect(result.errors).toBeUndefined()
    expect(result.data).toEqual({ [mutation]: true })
    expect(getCookie).toHaveBeenCalledWith('VtexIdclientAutCookie')
    expect(validateCredential).toHaveBeenCalledWith(TOKEN)
    expect(isAdmin).toHaveBeenCalledWith('admin@example.test')
    expect(saveJSON).toHaveBeenCalledTimes(1)
    expect(saveJSON).toHaveBeenCalledWith(
      getBucket('', hashString(BINDING)),
      EXTENDED_INDEX_FILE,
      {
        index: mutation === 'saveIndex' ? [INDEX] : [],
        lastUpdated: expect.any(String),
      }
    )
  })
})
