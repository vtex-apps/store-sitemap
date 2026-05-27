# CMS routes in sitemap (FastStore)

> **Availability**: `vtex.store-sitemap@2.19.x` and later, with `enableCmsRoutes: true`.
> **Jira**: [SFS-3123](https://vtex-dev.atlassian.net/browse/SFS-3123)

FastStore stores can now include pages created in VTEX headless CMS (hCMS) — PDPs, PLPs, landing pages, and any custom-slug page — directly in the generated sitemap, without manual workarounds like `next-sitemap` or hand-edited `sitemap.xml` files.

This document covers:

- [How it works](#how-it-works)
- [Enabling CMS routes](#enabling-cms-routes)
- [Verifying the sitemap](#verifying-the-sitemap)
- [Excluding a page from the sitemap](#excluding-a-page-from-the-sitemap)
- [Multi-locale stores](#multi-locale-stores)
- [Fetching CMS routes as JSON](#fetching-cms-routes-as-json)
- [robots.txt integration](#robotstxt-integration)
- [Known limitations](#known-limitations)

---

## How it works

When `enableCmsRoutes` is `true`, the Sitemap app:

1. **Sources CMS pages from Rewriter.** Pages published via hCMS are stored as Rewriter `Internal` entries. The app reads those entries and filters for CMS-origin routes, excluding framework-generated catalog pages (products, departments, categories, subcategories, brands) that are already covered by the existing product/navigation pipelines.

2. **Applies mandatory exclusions.** The following pages are never included, regardless of other settings:
   - Login pages
   - Error pages
   - Pages with `disableSitemapEntry: true` in Rewriter (the CMS "exclude from sitemap" toggle)
   - Pages matching the existing `disableRoutesTerm` setting

3. **Writes per-binding sub-sitemaps.** Each binding gets its own set of `cms-routes-N.xml` files under the `<sitemapindex>`, chunked at Google's protocol ceilings: **50,000 URLs** or **50 MB** per file — whichever is hit first.

4. **Emits protocol-compliant URL entries.** Every CMS URL includes `<loc>`, `<lastmod>`, `<changefreq>` (`weekly`), and `<priority>` (`0.5`). For multi-locale stores, each URL also declares `<xhtml:link>` alternate tags for every locale plus `hreflang="x-default"`.

5. **Injects a `Sitemap:` directive in `robots.txt`** if one is not already present.

6. **Exposes CMS routes via the JSON endpoint** (`/_v/public/sitemap/custom-routes`) so FastStore can consume them at build time or runtime.

The feature is **fully gated** by the `enableCmsRoutes` setting (default `false`). When the flag is off, the app behaves exactly as before — no extra VBase reads, no extra XML entries, no extra response keys.

---

## Enabling CMS routes

### Via Admin UI

1. In your browser, go to **Account settings > Apps > My apps** and search for the **Sitemap** app.
2. Enable the **Enable CMS routes source (FastStore)** toggle.
3. Save.

### Via CLI

```bash
vtex use {workspaceName} --production
```

Then patch the app settings via the VTEX Admin API:

```bash
curl -X PATCH \
  "https://{workspace}--{account}.myvtex.com/_v/private/apps/vtex.store-sitemap@2.x/settings" \
  -H "VtexIdclientAutCookie: {token}" \
  -H "Content-Type: application/json" \
  -d '{"enableCmsRoutes": true}'
```

> ⚠️ Replace the values in curly brackets with the values that apply to your scenario.

---

## Verifying the sitemap

After enabling the feature, the first request to any sitemap endpoint triggers background generation. The following steps verify that CMS routes are correctly included.

### Step 1 — Trigger generation

```bash
curl "https://{workspace}--{account}.myvtex.com/_v/public/sitemap/custom-routes"
```

**Expected response on first call (generation triggered):**

```json
{ "message": "Custom routes not available. Generation has been triggered." }
```

**Status code:** `404`

Generation runs in the background. The time depends on the number of pages. For most stores this completes in under a minute.

### Step 2 — Confirm the CMS section is present

Poll the same endpoint after a minute:

```bash
curl "https://{workspace}--{account}.myvtex.com/_v/public/sitemap/custom-routes"
```

**Expected response:**

```json
[
  { "name": "apps-routes",  "routes": ["/store-locator/ny", "/store-locator/ca"] },
  { "name": "user-routes",  "routes": ["/about-us", "/contact", "/faq"] },
  { "name": "cms-routes",   "routes": ["/our-story", "/black-friday", "/landing/holiday"] }
]
```

The `cms-routes` section contains all CMS pages that passed the filters.

### Step 3 — Check the sitemap index

```bash
curl "https://{workspace}--{account}.myvtex.com/sitemap.xml"
```

The `<sitemapindex>` should now reference one or more `cms-routes-N.xml` files:

```xml
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ...
  <sitemap>
    <loc>https://{account}.myvtex.com/sitemap/cms-routes-0.xml</loc>
    <lastmod>2026-05-27T...</lastmod>
  </sitemap>
</sitemapindex>
```

### Step 4 — Inspect a CMS sub-sitemap

```bash
curl "https://{workspace}--{account}.myvtex.com/sitemap/cms-routes-0.xml"
```

Each URL entry includes the full protocol tag set:

```xml
<url>
  <loc>https://{account}.myvtex.com/our-story</loc>
  <lastmod>2026-05-27T13:00:00.000Z</lastmod>
  <changefreq>weekly</changefreq>
  <priority>0.5</priority>
</url>
```

For multi-locale stores, the `<url>` also contains `<xhtml:link>` alternates — see [Multi-locale stores](#multi-locale-stores).

### Step 5 — Verify robots.txt

```bash
curl "https://{workspace}--{account}.myvtex.com/robots.txt" | grep -i Sitemap
```

**Expected output:**

```
Sitemap: https://{account}.myvtex.com/sitemap.xml
```

If your `robots.txt` already contained a `Sitemap:` directive, no duplicate is added.

---

## Excluding a page from the sitemap

### Option 1 — Per-page toggle (recommended)

The CMS "Include in sitemap" toggle maps to the `disableSitemapEntry` field in Rewriter. When the toggle is **off**, the page is excluded from both the XML sitemap and the `cms-routes` JSON section.

> ℹ️ The Admin UI for this toggle is currently being built by the hCMS team and will be released separately. In the meantime, use Option 2 below.

### Option 2 — Rewriter mutation

Set `disableSitemapEntry: true` directly via the Rewriter GraphQL API. Access the GraphQL Admin IDE at **Store Settings > Storefront > GraphiQL IDE**, select the `vtex.rewriter@1.x` app, and run:

```graphql
mutation {
  internal {
    save(route: {
      id: "your-page-id"
      from: "/your-page-slug"
      type: "userRoute"
      binding: "your-binding-id"
      disableSitemapEntry: true
    }) {
      id
      from
      disableSitemapEntry
    }
  }
}
```

To re-include the page, set `disableSitemapEntry: false` or omit the field.

### Option 3 — `disableRoutesTerm` setting

The existing `disableRoutesTerm` setting (a substring filter applied to all user-defined routes) also applies to CMS routes. Any page whose path contains the configured string is excluded.

Configure it via **Account settings > Apps > My apps > Sitemap > Disable routes from userRoutes with the following string**.

---

## Multi-locale stores

For stores with multiple bindings (multi-language / multi-currency), each CMS URL entry in the sitemap declares all locale alternates, including the URL itself and a `hreflang="x-default"` pointing at the default binding's version.

**Example — page `/about` in a store with `en-US` (default), `pt-BR`, and `de-DE`:**

```xml
<url>
  <loc>https://store.example.com/about</loc>
  <xhtml:link rel="alternate" hreflang="en-US"   href="https://store.example.com/about"/>
  <xhtml:link rel="alternate" hreflang="pt-BR"   href="https://store.example.com/br/sobre"/>
  <xhtml:link rel="alternate" hreflang="de-DE"   href="https://store.example.com/de/ueber-uns"/>
  <xhtml:link rel="alternate" hreflang="x-default" href="https://store.example.com/about"/>
  <lastmod>2026-05-27T...</lastmod>
  <changefreq>weekly</changefreq>
  <priority>0.5</priority>
</url>
```

This follows [Google's recommendation for localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions#example_2).

Single-binding stores do not emit `<xhtml:link>` tags — the behavior is unchanged from previous versions.

---

## Fetching CMS routes as JSON

The `/_v/public/sitemap/custom-routes` endpoint is useful for FastStore projects that build or serve their own sitemap (e.g., with `next-sitemap`) and need to pull CMS routes without parsing XML.

| Method | Endpoint |
|--------|----------|
| `GET`  | `/_v/public/sitemap/custom-routes` |

The `cms-routes` section is **only present** when `enableCmsRoutes` is `true`. When the flag is off, the response contains only `apps-routes` and `user-routes` (backwards-compatible behavior).

**Example response with `enableCmsRoutes: true`:**

```json
[
  { "name": "apps-routes",  "routes": ["/store-locator/ny"] },
  { "name": "user-routes",  "routes": ["/about-us", "/contact"] },
  { "name": "cms-routes",   "routes": ["/our-story", "/black-friday"] }
]
```

**Caching:** The response is cached for up to 1 day. Stale data triggers a background refresh and is still served while the new generation runs (stale-while-revalidate). See [`docs/CUSTOM_ROUTES_ARCHITECTURE.md`](./CUSTOM_ROUTES_ARCHITECTURE.md) for architecture details.

### Migrating from `next-sitemap` + custom rewrites

If your FastStore project currently uses `next-sitemap` with additional rewrites to include CMS pages, the migration path is:

1. Enable `enableCmsRoutes` in `vtex.store-sitemap`.
2. Verify CMS routes appear in `/_v/public/sitemap/custom-routes` and `/sitemap/cms-routes-0.xml`.
3. Point your storefront's sitemap generation to consume `/_v/public/sitemap/custom-routes` instead of the manually curated list.
4. Remove the custom rewrites and `next-sitemap` CMS overrides from your store repository.
5. Confirm `robots.txt` references `/sitemap.xml` (the app injects this automatically).

---

## robots.txt integration

The `robots` middleware automatically appends a `Sitemap:` directive pointing to `/sitemap.xml` whenever the served `robots.txt` does not already contain one.

The check is **case-insensitive** and tolerates leading whitespace, so a manually added line like `  sitemap: https://...` is correctly detected and not duplicated.

**Behavior summary:**

| Scenario | Result |
|---|---|
| `robots.txt` has no `Sitemap:` line | Directive is appended |
| `robots.txt` already has `Sitemap: https://store.example.com/sitemap.xml` | No change |
| `robots.txt` has `sitemap:` (lowercase) | No change (case-insensitive) |
| `enableCmsRoutes` is `false` | Directive is still appended (the `robots.txt` logic is independent of this setting) |

---

## Known limitations

The following features are **not yet available** and are planned as follow-up work:

| Limitation | Status |
|---|---|
| **`noindex` auto-exclusion** — pages marked as `noindex` in hCMS are not yet automatically filtered. Exclude them manually via `disableSitemapEntry` for now. | Waiting on hCMS metadata endpoint (cross-team dependency, Decision 3 of the spec). |
| **Canonical-mismatch auto-exclusion** — pages whose canonical points to a different URL are not yet automatically filtered. | Same dependency as above. |
| **Admin UI toggle in hCMS** — the per-page "Include in sitemap" toggle is not yet surfaced in the CMS Admin UI. Use the Rewriter mutation (Option 2 above) as a workaround. | Being built by the hCMS team. |
| **URL-level deduplication between `cms-routes` and `user-routes`** — if `enableNavigationRoutes` and `enableCmsRoutes` are both on, a CMS page whose Rewriter type is `userRoute` may appear in both sub-sitemaps. Search engines tolerate this; a deduplication step is planned. | Planned follow-up. |

---

## Reference

- [Spec: cms-routes-in-sitemap-for-faststore](../specs/cms-routes-in-sitemap-for-faststore.md)
- [Architecture: custom routes](./CUSTOM_ROUTES_ARCHITECTURE.md)
- [Google Sitemap protocol](https://www.sitemaps.org/protocol.html)
- [Google: localized versions with hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Known Issue: Native sitemap is not fully integrated with FastStore](https://help.vtex.com/known-issues/native-sitemap-is-not-fully-integrated-with-faststore--5IrsqCEtQKPFstqywlV7Nn)
