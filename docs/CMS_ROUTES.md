# CMS routes in sitemap (FastStore)

> **Availability (hCMS legacy)**: `vtex.store-sitemap@2.19.x` and later, with `enableCmsRoutes: true`.
> **Availability (Content Platform — new CMS)**: planned for `vtex.store-sitemap@2.20.x`, with `enableContentPlatformRoutes: true`. See [Content Platform support](#content-platform-support).
> **Jira**: [SFS-3123](https://vtex-dev.atlassian.net/browse/SFS-3123)

FastStore stores can include CMS pages — PDPs, PLPs, landing pages, and any custom-slug page — directly in the generated sitemap, without manual workarounds like `next-sitemap` or hand-edited `sitemap.xml` files. The app supports both VTEX CMS surfaces:

- **Headless CMS (hCMS, legacy)** — pages persisted as Rewriter `Internal` entries. Available today.
- **VTEX CMS (Content Platform, new)** — pages stored in the CMS's own CQRS data plane with branches and ETag caching. [Progressively rolled out since March 2026](https://help.vtex.com/announcements/2026-03-30-headless-cms-stores-will-be-upgraded-to-the-new-vtex-cms).

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

## Content Platform support

> **Status**: Planned for `vtex.store-sitemap@2.20.x` (spec [Increment 1](../specs/cms-routes-in-sitemap-for-faststore.md#2-arch-decisions), phases P6–P8).
>
> This section anticipates the rollout. The `enableContentPlatformRoutes` setting and the `/sitemap/content-platform-routes-N.xml` files become available once the increment ships.

The new **VTEX CMS (Content Platform)** is the [successor to the Headless CMS (legacy)](https://help.vtex.com/announcements/2026-03-30-headless-cms-stores-will-be-upgraded-to-the-new-vtex-cms), used by FastStore v3 stores. It has a **different architecture** than hCMS — content lives in a CQRS data plane with branches, ETag caching, and native multi-language — and pages are **not** persisted as Rewriter Internals.

The Sitemap app supports Content Platform via a **parallel ingestion path**: a separate middleware (`generateContentPlatformRoutes`) reads from the VTEX CMS **Data Plane REST API** and writes its own VBase bucket. Everything downstream — chunking, `<sitemapindex>` composition, multi-locale `xhtml:link` emission, `robots.txt` directive — is shared with the hCMS path.

### How it works

When `enableContentPlatformRoutes` is `true`, the Sitemap app:

1. **Resolves the production branch.** All Data Plane reads are pinned to the store's production branch. Draft / preview / feature branches are **never** read for sitemap purposes — sitemaps are for production crawlers.

2. **Discovers ingestable content types schema-first.** The app lists the store's registered Content Platform schemas and selects **every type whose schema declares a `path` (or store-configured equivalent slug) field**. No hardcoded type-name allowlist is used. This means custom types like `microsite`, `campaign`, or `editorial` are picked up automatically — no app upgrade required. PDP / PLP / search Content Types are explicitly excluded because their URLs come from the catalog pipelines.

3. **Iterates published entries × locales.** One `<url>` is emitted per (entry × actually-published-locale). Locales served via runtime fallback are **not** emitted as separate URLs — only locales where the entry actually has published content appear in the sitemap.

4. **Applies SEO-field opt-out.** A Content Platform entry is excluded from the sitemap when any of the following holds:
   - The SEO field `noindex: true` is set
   - The SEO field `canonical` is set to a URL different from the entry's own path
   - The schema/entry classifies the page as a login or error page

   There is **no separate "Include in sitemap" toggle** in the Content Platform schema — opt-out is SEO-driven (see [the spec's Decision 10](../specs/cms-routes-in-sitemap-for-faststore.md#decision-10-content-platform-opt-out-via-seo-fields)).

5. **Uses ETag caching.** The Data Plane client sends `If-None-Match` on subsequent reads. A `304 Not Modified` short-circuits the work for that scope — the prior VBase entry is reused verbatim with no rewrite.

6. **Writes per-binding sub-sitemaps.** Each binding gets its own set of `content-platform-routes-N.xml` files under the `<sitemapindex>`, chunked at Google's protocol ceilings (50k URLs / 50 MB per file).

7. **Emits protocol-compliant URL entries.** Same shape as `cms-routes-N.xml`: `<loc>`, `<lastmod>`, `<changefreq>`, `<priority>` and (multi-locale only) full `<xhtml:link>` alternate set including `hreflang="x-default"`.

8. **Exposes Content Platform routes via the JSON endpoint** as a new section named `content-platform-routes` (parallel to `cms-routes` for hCMS).

The feature is **fully gated** by the `enableContentPlatformRoutes` setting (default `false`).

### Source mutual exclusivity

A store is expected to use exactly one VTEX CMS surface at a time during the upgrade window. Accordingly, **at most one of `enableCmsRoutes` / `enableContentPlatformRoutes` takes effect per generation**:

| `enableCmsRoutes` | `enableContentPlatformRoutes` | Active source | Sub-sitemap files | JSON section |
|---|---|---|---|---|
| `false` | `false` | None | none added | `apps-routes`, `user-routes` only |
| `true`  | `false` | hCMS legacy | `cms-routes-N.xml` | `cms-routes` |
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

Unlike hCMS — which uses the `disableSitemapEntry` toggle (mapped from a CMS UI toggle) — **Content Platform opt-out is driven exclusively by the SEO fields** already in the schema.

To exclude a single page:

1. Open the page in the Content Platform admin (**Storefront > Content > Content**).
2. Switch to the **Settings** tab → **SEO** section.
3. Set **`noindex`** to `true`. Save and publish.
4. The page will be excluded from the next sitemap regeneration.

Alternatively, set the page's **canonical URL** to a different URL (e.g., the canonical version of the page). The generator excludes any entry whose canonical points elsewhere.

> **Why no dedicated toggle?** The Content Platform team treats sitemap inclusion as SEO semantics: a page marked `noindex` shouldn't appear in the sitemap anyway. Adding a separate `includeInSitemap` toggle would be redundant and inconsistent with the platform's SEO model. See the [spec's Decision 10](../specs/cms-routes-in-sitemap-for-faststore.md#decision-10-content-platform-opt-out-via-seo-fields) for the full rationale.

The existing `disableRoutesTerm` setting (a substring filter applied to all user-defined routes) also applies to Content Platform routes.

### Observability

Every Content Platform regeneration emits these structured events:

| Event | When emitted |
|---|---|
| `content-platform-routes-generation-start` | At the start of a generation cycle when `enableContentPlatformRoutes` is the active source. |
| `content-platform-routes-generation-success` | After a successful generation. Includes counts per content type, ETag hit ratio, total URLs emitted. |
| `content-platform-routes-generation-error` | On persistent Data Plane failure (after retries). The previous successful VBase entries are kept; served XML does not regress. |
| `content-platform-new-routable-type` | First time a new content type with a `path` field is encountered. Useful when a store adds a custom routable type. |
| `cms-routes-ignored-by-mutual-exclusivity` | When both `enableCmsRoutes` and `enableContentPlatformRoutes` are `true`. Emitted once per generation cycle. |

---

## Migrating from hCMS to Content Platform

If your store is on FastStore v3 and the CMS team is upgrading you from the legacy Headless CMS to the new Content Platform, here is the recommended migration path for the sitemap.

### Before you start

- Make sure the CMS team's content migration is **complete** (your pages are visible in the new **Storefront > Content > Content** admin).
- Confirm your Content Platform store has a **production branch** with the same pages you currently serve.
- (Recommended) Pre-validate your schemas via the FastStore CLI: `vtex content upload-schema`. Pay attention to which content types declare a `path` field — those are the types that will be ingested.

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
- Check its SEO fields: `noindex: false` and `canonical` either unset or pointing to itself.
- Check that the entry is published on the **production branch** (not just on a draft branch).
- Check that the entry's content type declares a `path` field in its schema.

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
| **Admin UI toggle in hCMS** — the per-page "Include in sitemap" toggle is not yet surfaced in the CMS Admin UI. Use the Rewriter mutation (Option 2 above) as a workaround. | Being built by the hCMS team. |
| **URL-level deduplication between `cms-routes` and `user-routes`** — if `enableNavigationRoutes` and `enableCmsRoutes` are both on, a CMS page whose Rewriter type is `userRoute` may appear in both sub-sitemaps. Search engines tolerate this; a deduplication step is planned. | Planned follow-up. |
| **Content Platform support not yet shipped** — `enableContentPlatformRoutes` is documented and specified but ships in `vtex.store-sitemap@2.20.x`. Until then the flag has no effect. | In progress, P6–P8 of the [spec's Implementation Plan](../specs/cms-routes-in-sitemap-for-faststore.md#implementation-plan). |
| **Parallel ingestion of both VTEX CMSs** — the two sources are mutually exclusive per generation. Stores genuinely needing parallel coverage during a long migration must wait for a future enhancement. | Explicitly out of scope of the current increment; revisit on customer demand. |
| **Non-production branches (Content Platform)** — preview / draft / feature branches are never read for sitemap purposes. This is by design (sitemaps are for production crawlers) and not a planned addition. | By design, see [spec invariant 11](../specs/cms-routes-in-sitemap-for-faststore.md#invariants--constraints). |

---

## Reference

- [Spec: cms-routes-in-sitemap-for-faststore](../specs/cms-routes-in-sitemap-for-faststore.md) (Done for hCMS legacy · Draft for Content Platform increment)
- [Architecture: custom routes](./CUSTOM_ROUTES_ARCHITECTURE.md)
- [Google Sitemap protocol](https://www.sitemaps.org/protocol.html)
- [Google: localized versions with hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Known Issue: Native sitemap is not fully integrated with FastStore](https://help.vtex.com/known-issues/native-sitemap-is-not-fully-integrated-with-faststore--5IrsqCEtQKPFstqywlV7Nn)
- [Announcement: Headless CMS stores will be upgraded to the new VTEX CMS (Mar 30, 2026)](https://help.vtex.com/announcements/2026-03-30-headless-cms-stores-will-be-upgraded-to-the-new-vtex-cms)
- [Developer guide: CMS for FastStore storefronts](https://developers.vtex.com/docs/guides/cms-for-faststore-storefronts)
- [Developer guide: Upgrading from Headless CMS (legacy) to CMS](https://developers.vtex.com/docs/guides/comparing-headless-cms-legacy-and-cms-features)
