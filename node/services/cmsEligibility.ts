/**
 * Shared eligibility rules for CMS route sources (hCMS and Content Platform).
 */

/** Canonical opt-out: non-empty canonical pointing away from the page's own slug. */
export const isExcludedByCanonical = (
  ownSlug: string,
  canonical: string | undefined
): boolean => {
  if (!canonical) {
    return false
  }
  const trimmed = canonical.trim()
  if (trimmed === '') {
    return false
  }
  return trimmed !== ownSlug
}

export const matchesDisableRoutesTerm = (
  path: string,
  term: string
): boolean => Boolean(term) && path.includes(term)

export const isEligibleCmsPath = (args: {
  slug: string | undefined
  canonical: string | undefined
  disableRoutesTerm: string
}): boolean => {
  const { slug, canonical, disableRoutesTerm } = args
  if (!slug) {
    return false
  }
  if (isExcludedByCanonical(slug, canonical)) {
    return false
  }
  if (matchesDisableRoutesTerm(slug, disableRoutesTerm)) {
    return false
  }
  return true
}
