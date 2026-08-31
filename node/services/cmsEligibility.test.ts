import {
  isEligibleCmsPath,
  isExcludedByCanonical,
  matchesDisableRoutesTerm,
} from './cmsEligibility'

describe('cmsEligibility', () => {
  describe('isExcludedByCanonical', () => {
    it('treats empty or self-referencing canonical as not excluded', () => {
      expect(isExcludedByCanonical('/page', undefined)).toBe(false)
      expect(isExcludedByCanonical('/page', '')).toBe(false)
      expect(isExcludedByCanonical('/page', '  ')).toBe(false)
      expect(isExcludedByCanonical('/page', '/page')).toBe(false)
    })

    it('excludes when canonical points elsewhere', () => {
      expect(isExcludedByCanonical('/page', '/other')).toBe(true)
    })
  })

  describe('matchesDisableRoutesTerm', () => {
    it('matches substrings when term is non-empty', () => {
      expect(matchesDisableRoutesTerm('/internal/foo', '/internal/')).toBe(
        true
      )
      expect(matchesDisableRoutesTerm('/public', '/internal/')).toBe(false)
      expect(matchesDisableRoutesTerm('/public', '')).toBe(false)
    })
  })

  describe('isEligibleCmsPath', () => {
    it('requires slug and honors canonical and disableRoutesTerm', () => {
      expect(
        isEligibleCmsPath({
          canonical: '/other',
          disableRoutesTerm: '',
          slug: '/page',
        })
      ).toBe(false)
      expect(
        isEligibleCmsPath({
          canonical: '/page',
          disableRoutesTerm: '/staging',
          slug: '/staging-page',
        })
      ).toBe(false)
      expect(
        isEligibleCmsPath({
          canonical: '/page',
          disableRoutesTerm: '',
          slug: '/page',
        })
      ).toBe(true)
    })
  })
})
