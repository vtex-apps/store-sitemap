import { Binding } from '@vtex/api'
import { last } from 'ramda'

export const notFound = <T>(fallback: T) => (error: any): T => {
  if (error.response && error.response.status === 404) {
    return fallback
  }
  throw error
}

export const currentDate = (): string => new Date().toISOString().split('T')[0]

export class SitemapNotFound extends Error {}

// Validate this function
export const getBindingIdentifier = (binding: Binding) => {
  const { canonicalBaseAddress } = binding
  const lastSegment = canonicalBaseAddress.split('/')[1]
  if (lastSegment) {
    return lastSegment
  }
  const addressSplitedByDot = canonicalBaseAddress.split('.')
  const firstPart = addressSplitedByDot[0]
  if (firstPart !== 'www') {
    return firstPart
  }
  return last(addressSplitedByDot)
}

export const SITEMAP_URL = '/_v/public/newsitemap/:lang/:path'
