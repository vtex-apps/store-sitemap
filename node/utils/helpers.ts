export type Maybe<T> = T | null | undefined

export type Middleware = (ctx: Context) => Promise<void>
