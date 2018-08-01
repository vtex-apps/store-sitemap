import {Colossus} from '@vtex/api'

const defaultSubject = '-'

const userAgent = process.env.VTEX_APP_ID

export default (account: string, workspace: string, authToken: string) => {
  const client = new Colossus({account, workspace, authToken, region: 'aws-us-east-1', userAgent})
  return {
    log: (message: string, level: LogLevel, details: {} = {}, subject: string = defaultSubject): PromiseLike<void> =>
      client.sendLog(subject, {message, ...details}, level),
  }
}
