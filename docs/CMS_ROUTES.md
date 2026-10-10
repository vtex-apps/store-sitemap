# CMS routes in sitemap (FastStore)

> **Availability (hCMS legacy)**: `vtex.store-sitemap@2.19.x` and later, with `enableCmsRoutes: true`.
> **Availability (Content Platform — new CMS)**: `vtex.store-sitemap@2.20.x` and later, with `enableContentPlatformRoutes: true`. See [Content Platform support](#content-platform-support).
> **Jira**: [SFS-3123](https://vtex-dev.atlassian.net/browse/SFS-3123)

FastStore stores can include CMS pages — PDPs, PLPs, landing pages, and any custom-slug page — directly in the generated sitemap, without manual workarounds like `next-sitemap` or hand-edited `sitemap.xml` files. The app supports both VTEX CMS surfaces:

- **Headless CMS (hCMS, legacy)** — FastStore pages served via the CMS Builder REST API (`/_v/cms/api/{projectId}/{contentType}`). They are **not** registered as Rewriter Internals. Available today.
- **VTEX CMS (Content Platform, new)** — pages exposed via the CMS's production-only **Data Plane REST API** (`{account}.vtexcommercestable.com.br/api/content-platform/data/*`), with native ETag caching and multi-language. [Progressively rolled out since March 2026](https://help.vtex.com/announcements/2026-03-30-headless-cms-stores-will-be-upgraded-to-the-new-vtex-cms).

The two sources are **mutually exclusive per store** — at most one is active per generation. When both flags are `true`, Content Platform wins (see [Content Platform support](#content-platform-support)).

This document covers:

- [How it works](#how-it-works)
- [Enabling CMS routes](#enabling-cms-routes)
- [Verifying the sitemap](#verifying-the-sitemap)
- [Excluding a page from the sitemap](#excluding-a-page-from-the-sitemap)
- [Multi-locale stores](#multi-locale-stores)
- [Fetching CMS routes as JSON](#fetching-cms-routes-as-json)
- [robots.txt integration](#robotstxt-integration)
- [Content Platform support](#content-platform-support)
- [Migrating from hCMS to Content Platform](#migrating-from-hcms-to-content-platform)
- [Known limitations](#known-limitations)

---

## How it works

This section describes the **hCMS legacy** flow. The Content Platform flow is parallel and described in [Content Platform support](#content-platform-support).

When `enableCmsRoutes` is `true`, the Sitemap app:

1. **Sources CMS pages from the CMS Builder API.** FastStore Headless CMS pages live in the CMS builder data layer (`{account}.myvtex.com/_v/cms/api/{projectId}/{contentType}`). The app lists **published** pages for the configured project (`hcmsProjectId`, default `"faststore"`) and content types (`hcmsContentTypes`, default `["landingPage", "home"]`), then emits routes from each page's `settings.seo.slug`.

2. **Applies eligibility filters.** A page is included only when it is published, has a non-empty `seo.slug` that is not the homepage (`/`), is not opted out via `seo.canonical` (see [Excluding a page](#excluding-a-page-from-the-sitemap)), and does not match the merchant's `disableRoutesTerm` setting.

3. **Writes per-binding sub-sitemaps.** Routes are stored under the default store binding and exposed as `hcms-routes-N.xml` files under the `<sitemapindex>`, chunked at Google's protocol ceilings: **50,000 URLs** or **50 MB** per file — whichever is hit first.

4. **Emits protocol-compliant URL entries.** Every CMS URL includes `<loc>`, `<changefreq>` (`weekly`), and `<priority>` (`0.5`). The CMS Builder listing does not expose per-page `updatedAt`, so hCMS entries omit `<lastmod>`. For multi-binding stores, hCMS routes carry a single self alternate on the default binding (the builder API is project-scoped and does not provide per-locale slugs).

5. **Injects a `Sitemap:` directive in `robots.txt`** if one is not already present.

6. **Exposes CMS routes via the JSON endpoint** (`/_v/public/sitemap/custom-routes`) under the `cms-routes` section so FastStore can consume them at build time or runtime.

The feature is **fully gated** by the `enableCmsRoutes` setting (default `false`). When the flag is off (and `enableContentPlatformRoutes` is also off), the app behaves exactly as before — no extra VBase reads, no extra XML entries, no extra response keys.

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

The `<sitemapindex>` should now reference one or more `hcms-routes-N.xml` files:

```xml
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ...
  <sitemap>
    <loc>https://{account}.myvtex.com/sitemap/hcms-routes-0.xml</loc>
    <lastmod>2026-05-27T...</lastmod>
  </sitemap>
</sitemapindex>
```

### Step 4 — Inspect a CMS sub-sitemap

```bash
curl "https://{workspace}--{account}.myvtex.com/sitemap/hcms-routes-0.xml"
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

### Option 1 — Canonical opt-out (recommended for FastStore hCMS)

Set `settings.seo.canonical` on the CMS page to a URL **different** from the page's own `seo.slug`. An empty or self-referencing canonical does not exclude the page. This is the same rule used by the Content Platform source (see [Content Platform support](#content-platform-support)).

### Option 2 — `disableRoutesTerm` setting

The existing `disableRoutesTerm` setting (a substring filter applied to all user-defined routes) also applies to CMS routes. Any page whose path contains the configured string is excluded.

Configure it via **Account settings > Apps > My apps > Sitemap > Disable routes from userRoutes with the following string**.

> **Note for Store Framework stores:** pages registered as Rewriter `Internal` entries can still be excluded via `disableSitemapEntry` in Rewriter. That path does **not** apply to FastStore hCMS pages, which are sourced from the CMS Builder API rather than Rewriter.

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
2. Verify CMS routes appear in `/_v/public/sitemap/custom-routes` and `/sitemap/hcms-routes-0.xml`.
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

## Content Platform support

The new **VTEX CMS (Content Platform)** is the [successor to the Headless CMS (legacy)](https://help.vtex.com/announcements/2026-03-30-headless-cms-stores-will-be-upgraded-to-the-new-vtex-cms), used by FastStore v3 stores. It has a **different architecture** than hCMS — content lives in a CQRS data plane with ETag caching and native multi-language — and pages are **not** persisted as Rewriter Internals.

The Sitemap app supports Content Platform via a **parallel ingestion path**: a separate middleware (`generateContentPlatformRoutes`) reads from the VTEX CMS **Data Plane REST API** (`https://{account}.vtexcommercestable.com.br/api/content-platform/data/*`) and writes its own VBase bucket. Everything downstream — chunking, `<sitemapindex>` composition, multi-locale `xhtml:link` emission, `robots.txt` directive — is shared with the hCMS path.

### How it works

When `enableContentPlatformRoutes` is `true`, the Sitemap app:

1. **Iterates the routable content type allowlist.** Types are read from the `contentPlatformContentTypes` app setting (default `["landingPage", "home"]`). Add custom routable types — e.g. `"microsite"`, `"campaign"`, `"editorial"` — to that array to get them ingested without an app release. PDP / PLP / search Content Types should not be added: their URLs come from the catalog pipelines.

2. **Paginates published entries via the Data Plane.** For each allowlisted type the app calls `listEntries` with the `scroll` cursor until exhausted. The Data Plane is **production-only by API design** — there is no `branch` parameter and no preview path through this app; drafts live on the Control Plane and are unreachable from here.

3. **Fans out one `getEntry` call per (entry × binding-locale).** Each binding's `defaultLocale` is sent as the `?locale=` query parameter. A `200 OK` produces a route candidate using `entry.seo.slug` as the public path; a `404 Not Found` means the editor did not publish that locale and the binding is **silently skipped** — runtime locale fallback is not synthesized into the sitemap.

4. **Applies SEO `canonical` opt-out.** A Content Platform entry is excluded when `seo.canonical` is a non-empty string AND points to a URL different from the entry's own `seo.slug`. `seo.canonical = ""` is the Data Plane default and means "no override". There is **no `noindex` opt-out today** — the field is not part of the current Content Platform `seo` schema (see [the spec's Decision 10](../specs/cms-routes-in-sitemap-for-faststore.md#decision-10-content-platform-opt-out-via-seo-canonical)).

5. **Uses a VBase-backed ETag cache.** Each successful `getEntry` response is stored in the `content-platform-data-cache` bucket keyed by `(contentType, entryId, locale)`. On the next run the cached ETag is sent as `If-None-Match`; a `304 Not Modified` reuses the cached entry verbatim. Steady-state regenerations collapse to ΔN re-serializations — only entries the editor actually touched re-fetch their SEO payload.

6. **Writes per-binding sub-sitemaps.** Each binding gets its own set of `content-platform-routes-N.xml` files under the `<sitemapindex>`, chunked at Google's protocol ceilings (50k URLs / 50 MB per file).

7. **Emits protocol-compliant URL entries.** Same shape as `cms-routes-N.xml`: `<loc>` (`seo.slug`), `<lastmod>` (listing-level `entry.updatedAt`), `<changefreq>` (`weekly`), `<priority>` (`0.5`) and (multi-locale only) full `<xhtml:link>` alternate set including `hreflang="x-default"`, built from the locales that actually returned 200.

8. **Exposes Content Platform routes via the JSON endpoint** as a new section named `content-platform-routes` (parallel to `cms-routes` for hCMS).

The feature is **fully gated** by the `enableContentPlatformRoutes` setting (default `false`).

### Source mutual exclusivity

A store is expected to use exactly one VTEX CMS surface at a time during the upgrade window. Accordingly, **at most one of `enableCmsRoutes` / `enableContentPlatformRoutes` takes effect per generation**:

| `enableCmsRoutes` | `enableContentPlatformRoutes` | Active source | Sub-sitemap files | JSON section |
|---|---|---|---|---|
| `false` | `false` | None | none added | `apps-routes`, `user-routes` only |
| `true`  | `false` | hCMS legacy | `hcms-routes-N.xml` | `cms-routes` |
| `false` | `true`  | Content Platform | `content-platform-routes-N.xml` | `content-platform-routes` |
| `true`  | `true`  | **Content Platform wins** — hCMS skipped | `content-platform-routes-N.xml` | `content-platform-routes` |

When both flags are set, a one-shot structured log `cms-routes-ignored-by-mutual-exclusivity` is emitted per generation cycle so the situation is observable.

### Enabling Content Platform routes

#### Via Admin UI

1. In your browser, go to **Account settings > Apps > My apps** and search for the **Sitemap** app.
2. Enable the **Enable Content Platform routes source (FastStore v3)** toggle.
3. If migrating from hCMS, also disable **Enable CMS routes source (FastStore)** to avoid the mutual-exclusivity log (the result is the same either way, but disabling the legacy flag is cleaner).
4. Save.

#### Via CLI

```bash
vtex use {workspaceName} --production
```

Then patch the app settings via the VTEX Admin API:

```bash
curl -X PATCH \
  "https://{workspace}--{account}.myvtex.com/_v/private/apps/vtex.store-sitemap@2.x/settings" \
  -H "VtexIdclientAutCookie: {token}" \
  -H "Content-Type: application/json" \
  -d '{"enableContentPlatformRoutes": true, "enableCmsRoutes": false}'
```

> Replace the values in curly brackets with the values that apply to your scenario.

#### Customizing the routable type allowlist

By default, only `landingPage` and `home` entries are ingested. If your store registered additional routable content types in Content Platform, add their keys to the `contentPlatformContentTypes` setting:

```bash
curl -X PATCH \
  "https://{workspace}--{account}.myvtex.com/_v/private/apps/vtex.store-sitemap@2.x/settings" \
  -H "VtexIdclientAutCookie: {token}" \
  -H "Content-Type: application/json" \
  -d '{"contentPlatformContentTypes": ["landingPage", "home", "microsite", "campaign"]}'
```

The `contentPlatformStoreId` setting (default `"faststore"`) controls the `{storeId}` path segment sent to the Data Plane. Leave it at the default unless your store customized `contentSource.project` to something other than `faststore`.

### Verifying the Content Platform sitemap

After enabling the feature, the first request to any sitemap endpoint triggers background generation. The flow mirrors the hCMS [Verifying the sitemap](#verifying-the-sitemap) section, with these differences:

- The JSON endpoint returns a section named `content-platform-routes` (instead of `cms-routes`):

  ```json
  [
    { "name": "apps-routes",             "routes": ["/store-locator/ny"] },
    { "name": "user-routes",             "routes": ["/about-us", "/contact"] },
    { "name": "content-platform-routes", "routes": ["/our-story", "/black-friday", "/microsite/holiday"] }
  ]
  ```

- The `<sitemapindex>` references `content-platform-routes-N.xml` files:

  ```xml
  <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ...
    <sitemap>
      <loc>https://{account}.myvtex.com/sitemap/content-platform-routes-0.xml</loc>
      <lastmod>2026-05-27T...</lastmod>
    </sitemap>
  </sitemapindex>
  ```

- Each `<url>` entry inside `content-platform-routes-N.xml` has the same shape as `cms-routes-N.xml` — `<loc>`, `<lastmod>`, `<changefreq>`, `<priority>` and (for multi-locale stores) the full `<xhtml:link>` alternate set including `hreflang="x-default"`.

### Excluding a Content Platform page from the sitemap

Unlike hCMS — which uses the `disableSitemapEntry` toggle (mapped from a CMS UI toggle) — **Content Platform opt-out is driven exclusively by the `seo.canonical` field** in the page's SEO settings.

To exclude a single page:

1. Open the page in the Content Platform admin (**Storefront > Content > Content**).
2. Switch to the **Settings** tab → **SEO** section.
3. Set **Canonical URL** to a URL different from the page's own slug (typically the URL of the equivalent page you want Google to credit instead).
4. Save and publish. The page will be excluded from the next sitemap regeneration.

> **Why no `noindex` toggle?** The current Content Platform `seo` schema exposes `slug`, `title`, `description`, `canonical` and `titleTemplate` — there is no `noindex` field. We expect the CMS team to add it eventually and will layer it on top of the canonical rule when they do. See the [spec's Decision 10](../specs/cms-routes-in-sitemap-for-faststore.md#decision-10-content-platform-opt-out-via-seo-canonical) for the full rationale.

The existing `disableRoutesTerm` setting (a substring filter applied to all user-defined routes) also applies to Content Platform routes.

### Observability

Every Content Platform regeneration emits these structured events:

| Event | When emitted |
|---|---|
| `content-platform-routes-generation-start` | At the start of a generation cycle when `enableContentPlatformRoutes` is the active source. |
| `content-platform-routes-generation-success` | After a successful generation. Includes counts per content type, ETag hit ratio, total URLs emitted. |
| `content-platform-routes-generation-error` | On persistent Data Plane failure (after retries). The previous successful VBase entries are kept; served XML does not regress. |
| `content-platform-entry-hydration-failed` | When a single `getEntry` call throws for non-404 reasons. The entry is skipped for that locale; generation continues. |
| `cms-routes-ignored-by-mutual-exclusivity` | When both `enableCmsRoutes` and `enableContentPlatformRoutes` are `true`. Emitted once per generation cycle. |

---

## Migrating from hCMS to Content Platform

If your store is on FastStore v3 and the CMS team is upgrading you from the legacy Headless CMS to the new Content Platform, here is the recommended migration path for the sitemap.

### Before you start

- Make sure the CMS team's content migration is **complete** (your pages are visible in the new **Storefront > Content > Content** admin) and that you have **published** the pages you want in the sitemap.
- Confirm `contentPlatformStoreId` in the Sitemap app settings matches your FastStore `contentSource.project` (default `"faststore"`).
- Decide which content types should appear in the sitemap. The default allowlist is `["landingPage", "home"]`; if your store has custom routable types (`microsite`, `campaign`, etc.), add them to `contentPlatformContentTypes` before flipping the flag.

### Step 1 — Snapshot the current sitemap

```bash
curl "https://{workspace}--{account}.myvtex.com/_v/public/sitemap/custom-routes" > before.json
curl "https://{workspace}--{account}.myvtex.com/sitemap.xml"                     > before-index.xml
```

Keep these files for comparison.

### Step 2 — Flip the flags

In a single PATCH, disable the legacy flag and enable the new one:

```bash
curl -X PATCH \
  "https://{workspace}--{account}.myvtex.com/_v/private/apps/vtex.store-sitemap@2.x/settings" \
  -H "VtexIdclientAutCookie: {token}" \
  -H "Content-Type: application/json" \
  -d '{"enableCmsRoutes": false, "enableContentPlatformRoutes": true}'
```

> If you flip only `enableContentPlatformRoutes: true` and leave `enableCmsRoutes: true`, Content Platform wins by [Decision 8](../specs/cms-routes-in-sitemap-for-faststore.md#decision-8-mutual-exclusivity-between-hcms-legacy-and-content-platform) but a `cms-routes-ignored-by-mutual-exclusivity` log is emitted on every generation. Cleaner to disable the legacy flag.

### Step 3 — Trigger and validate regeneration

```bash
curl "https://{workspace}--{account}.myvtex.com/_v/public/sitemap/custom-routes"
```

The first response is a `404` with `{ "message": "Custom routes not available. Generation has been triggered." }`. Wait ~1 minute for most stores (longer for large catalogs), then poll again.

When the response returns, verify the migration:

```bash
# Confirm the active source changed
curl "https://{workspace}--{account}.myvtex.com/_v/public/sitemap/custom-routes" > after.json
diff <(jq -r '.[].name' before.json) <(jq -r '.[].name' after.json)
# Expected diff: -cms-routes  +content-platform-routes

# Compare URL counts (should be similar, give or take new/removed pages)
jq -r '.[] | select(.name=="cms-routes") | .routes | length'             before.json
jq -r '.[] | select(.name=="content-platform-routes") | .routes | length' after.json
```

Inspect the new sub-sitemap:

```bash
curl "https://{workspace}--{account}.myvtex.com/sitemap.xml" | grep -E 'content-platform-routes|cms-routes'
# Expected: only content-platform-routes-N.xml references
curl "https://{workspace}--{account}.myvtex.com/sitemap/content-platform-routes-0.xml" | head -40
```

### Step 4 — Spot-check important URLs

For each high-traffic landing page or custom-slug page, confirm the URL is present in the new sitemap and that its `<loc>`, `<lastmod>`, `<changefreq>`, `<priority>` and (multi-locale) `<xhtml:link>` set are correct.

If a page is missing:
- Check its SEO **canonical** field: empty (default) keeps the page in the sitemap; a canonical pointing to a different URL excludes it.
- Confirm the entry is **published** (not only drafted in the Content Studio) — the Data Plane REST API used by the sitemap only exposes published data.
- Confirm the entry's content type is listed in the `contentPlatformContentTypes` setting (e.g., custom types like `"microsite"` must be added explicitly).
- Confirm the entry has been published for the locale you expect — the Data Plane returns `404 Not Found` for locales that have not been published, and the binding is silently skipped.

### Step 5 — Rollback (if needed)

The migration is reversible at any time. To roll back:

```bash
curl -X PATCH \
  "https://{workspace}--{account}.myvtex.com/_v/private/apps/vtex.store-sitemap@2.x/settings" \
  -H "VtexIdclientAutCookie: {token}" \
  -H "Content-Type: application/json" \
  -d '{"enableCmsRoutes": true, "enableContentPlatformRoutes": false}'
```

The next regeneration will serve `cms-routes-N.xml` again. Stale `content-platform-routes-N.xml` files in VBase are not referenced by the `<sitemapindex>` and are ignored on serve — passive cleanup, no manual purge needed.

---

## Known limitations

The following features are **not yet available** and are planned as follow-up work:

| Limitation | Status |
|---|---|
| **`noindex` auto-exclusion (hCMS)** — pages marked as `noindex` in hCMS are not yet automatically filtered. Exclude them manually via `disableSitemapEntry` for now. | Waiting on hCMS metadata endpoint (cross-team dependency, Decision 3 of the spec). |
| **Canonical-mismatch auto-exclusion (hCMS)** — pages whose canonical points to a different URL are not yet automatically filtered. | Same dependency as above. |
| **Per-page sitemap toggle in hCMS Admin UI** — FastStore hCMS exclusion today is via `seo.canonical` opt-out or `disableRoutesTerm`; there is no dedicated "include in sitemap" toggle on the builder API surface yet. | Use canonical opt-out (see [Excluding a page](#excluding-a-page-from-the-sitemap)). |
| **URL-level deduplication between `cms-routes` and `user-routes`** — a CMS landing page slug could theoretically overlap with a Rewriter `userRoute` when both `enableNavigationRoutes` and `enableCmsRoutes` are on. Search engines tolerate this; a deduplication step is planned. | Planned follow-up. |
| **`noindex` auto-exclusion (Content Platform)** — the Content Platform `seo` schema does not expose `noindex` today, so pages marked as such elsewhere (e.g., a custom field) are not automatically filtered. Use `seo.canonical` pointing to another URL as the documented opt-out. | Waiting on the CMS team to add `seo.noindex` to the schema. |
| **Auto-discovery of routable content types (Content Platform)** — custom content types must be added to the `contentPlatformContentTypes` setting manually. The Data Plane REST API has no schema-listing endpoint. | Planned follow-up: auto-populate via `vtex.admin-cms-graphql`, see [spec Decision 9](../specs/cms-routes-in-sitemap-for-faststore.md#decision-9-routable-type-discovery--settings-allowlist-with-future-graphql-discovery). |
| **Parallel ingestion of both VTEX CMSs** — the two sources are mutually exclusive per generation. Stores genuinely needing parallel coverage during a long migration must wait for a future enhancement. | Explicitly out of scope of the current increment; revisit on customer demand. |
| **Non-production reads (Content Platform)** — the Data Plane REST API exposes only published data; drafts live on the Control Plane and are unreachable from this app. | By design / API contract, see [spec invariant 11](../specs/cms-routes-in-sitemap-for-faststore.md#invariants--constraints). |

---

## Reference

- [Spec: cms-routes-in-sitemap-for-faststore](../specs/cms-routes-in-sitemap-for-faststore.md) (Done for hCMS legacy and Content Platform increment)
- [Architecture: custom routes](./CUSTOM_ROUTES_ARCHITECTURE.md)
- [Google Sitemap protocol](https://www.sitemaps.org/protocol.html)
- [Google: localized versions with hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Known Issue: Native sitemap is not fully integrated with FastStore](https://help.vtex.com/known-issues/native-sitemap-is-not-fully-integrated-with-faststore--5IrsqCEtQKPFstqywlV7Nn)
- [Announcement: Headless CMS stores will be upgraded to the new VTEX CMS (Mar 30, 2026)](https://help.vtex.com/announcements/2026-03-30-headless-cms-stores-will-be-upgraded-to-the-new-vtex-cms)
- [Developer guide: CMS for FastStore storefronts](https://developers.vtex.com/docs/guides/cms-for-faststore-storefronts)
- [Developer guide: Upgrading from Headless CMS (legacy) to CMS](https://developers.vtex.com/docs/guides/comparing-headless-cms-legacy-and-cms-features)
