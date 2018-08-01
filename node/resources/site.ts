import axios from 'axios'

const client = axios.create({
  timeout: 4000,
})

export async function getSiteMapXML (account: string, authToken: string, path: string) {
  const url = `http://${account}.vtexcommercestable.com.br/${path}.xml`
  const headers = {
    Authorization: `bearer ${authToken}`,
    'Proxy-Authorization': authToken,
  }
  return client.get(url, {headers})
}

export async function getRobotsTxt (originalHost: string) {
  const url = `http://janus-edge.vtex.com.br/robots.txt`
  const headers = {
    Host: originalHost
  }
  return client.get(url, {headers})
}
