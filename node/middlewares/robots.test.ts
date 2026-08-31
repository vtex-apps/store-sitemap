import { ensureSitemapDirective } from './robots'

describe('ensureSitemapDirective', () => {
  const sitemapUrl = 'https://example.com/sitemap.xml'

  it('appends the directive to a body that has no Sitemap line', () => {
    const body = 'User-agent: *\nDisallow: /admin'
    const result = ensureSitemapDirective(body, sitemapUrl)
    expect(result).toContain('User-agent: *')
    expect(result).toContain('Disallow: /admin')
    expect(result).toContain(`Sitemap: ${sitemapUrl}`)
  })

  it('returns the body unchanged when a Sitemap directive already exists', () => {
    const body = `User-agent: *\nDisallow:\nSitemap: ${sitemapUrl}`
    const result = ensureSitemapDirective(body, sitemapUrl)
    expect(result).toEqual(body)
  })

  it('detects an existing Sitemap directive case-insensitively (invariant 8)', () => {
    const body = 'User-agent: *\nsITEmap: https://example.com/other.xml'
    const result = ensureSitemapDirective(body, sitemapUrl)
    expect(result).toEqual(body)
    expect((result.match(/sitemap\s*:/gi) || []).length).toBe(1)
  })

  it('detects an existing Sitemap directive even when indented with whitespace', () => {
    const body = `User-agent: *\n   Sitemap: ${sitemapUrl}`
    const result = ensureSitemapDirective(body, sitemapUrl)
    expect(result).toEqual(body)
  })

  it('writes a single-line file when given an empty body', () => {
    const result = ensureSitemapDirective(undefined, sitemapUrl)
    expect(result).toContain(`Sitemap: ${sitemapUrl}`)
  })

  it('is idempotent across repeated calls', () => {
    const initial = 'User-agent: *\nDisallow:'
    const once = ensureSitemapDirective(initial, sitemapUrl)
    const twice = ensureSitemapDirective(once, sitemapUrl)
    expect(twice).toEqual(once)
    expect((twice.match(/sitemap\s*:/gi) || []).length).toBe(1)
  })

  it('does not duplicate the directive when the existing Sitemap URL differs', () => {
    const body = 'User-agent: *\nSitemap: https://old.example.com/sitemap.xml'
    const result = ensureSitemapDirective(body, sitemapUrl)
    expect(result).toEqual(body)
    expect(result).not.toContain(sitemapUrl)
  })
})
