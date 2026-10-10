import {
  resolveActiveCmsSource,
  shouldIncludeCustomRoutesSection,
} from './cmsSources'

describe('resolveActiveCmsSource (spec Decision 8 / FR-10)', () => {
  it('returns none when both flags are off', () => {
    expect(
      resolveActiveCmsSource({
        enableCmsRoutes: false,
        enableContentPlatformRoutes: false,
      })
    ).toBe('none')
  })

  it('returns hcms when only enableCmsRoutes is on', () => {
    expect(
      resolveActiveCmsSource({
        enableCmsRoutes: true,
        enableContentPlatformRoutes: false,
      })
    ).toBe('hcms')
  })

  it('returns content-platform when only enableContentPlatformRoutes is on', () => {
    expect(
      resolveActiveCmsSource({
        enableCmsRoutes: false,
        enableContentPlatformRoutes: true,
      })
    ).toBe('content-platform')
  })

  it('returns content-platform when both flags are on (Decision 8 tie-breaker)', () => {
    expect(
      resolveActiveCmsSource({
        enableCmsRoutes: true,
        enableContentPlatformRoutes: true,
      })
    ).toBe('content-platform')
  })

  it('returns none for undefined or empty settings', () => {
    expect(resolveActiveCmsSource(undefined)).toBe('none')
    expect(resolveActiveCmsSource({})).toBe('none')
  })
})

describe('shouldIncludeCustomRoutesSection', () => {
  it('includes only the active CMS section', () => {
    expect(shouldIncludeCustomRoutesSection('cms-routes', 'hcms')).toBe(true)
    expect(
      shouldIncludeCustomRoutesSection('cms-routes', 'content-platform')
    ).toBe(false)
    expect(
      shouldIncludeCustomRoutesSection('content-platform-routes', 'hcms')
    ).toBe(false)
    expect(
      shouldIncludeCustomRoutesSection(
        'content-platform-routes',
        'content-platform'
      )
    ).toBe(true)
  })

  it('passes through non-CMS sections', () => {
    expect(shouldIncludeCustomRoutesSection('user-routes', 'none')).toBe(true)
    expect(shouldIncludeCustomRoutesSection('apps-routes', 'hcms')).toBe(true)
  })
})
