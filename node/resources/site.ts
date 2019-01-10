import axios from 'axios'

const http = axios.create({
  timeout: 4000,
})

export const getSiteMapXML = async (ctx: Context) => http.get(
  `http://${ctx.vtex.account}.vtexcommercestable.com.br${ctx.get('x-forwarded-path')}`,
  {
    headers: {
      'Proxy-Authorization': ctx.vtex.authToken,
    }
  }
)

export const getRobotsTxt = async (ctx: Context) => http.get(
  `http://janus-edge.vtex.com.br/robots.txt?an=${ctx.vtex.account}`,
  {
    headers: {
      Authorization: ctx.vtex.authToken
    }
  }
)
