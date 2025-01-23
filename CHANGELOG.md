# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]
 
### Added

- `MAX_CALL_STACK_SIZE` when appending entries to XML file

## [2.16.4] - 2024-09-11

## [2.16.3] - 2024-08-16

## [2.16.2] - 2024-08-14

## [2.16.1] - 2024-07-09

## [2.16.0] - 2024-02-27

### Added

- Support for ignoring bindings, for the scenario where an account has configured bindings but has not "gone live" with them yet

## [2.15.3] - 2024-02-26

## [2.15.2] - 2024-01-25

## [2.15.1] - 2024-01-12

## [2.15.0] - 2023-02-17

### Added

- Support for excluding routes that contain the saved string from the sitemap. New setting `disableRoutesTerm` added.

## [2.14.1] - 2023-02-03

### Fixed

- Cache for multi-binding sites

## [2.14.0] - 2022-05-11

### Added

- `deleteIndex` mutation

### Fixed

- `saveIndex` will not add index if it already exists
- eliminate duplicate indexes in `sitemapIndex` function

## [2.13.10] - 2022-01-04

### Fixed

- Info in the Configuration section on where to access the sitemap app in the Admin.
- Callouts

### Added

- Section: Before you start

## [2.13.9] - 2021-05-18

### Fixed

- Decreases number of data processed in `group entities` middleware
- Uses Vbase with cache for cacheable data

## [2.13.8] - 2021-02-25

## [2.13.7] - 2020-12-21

### Fixes

- Increases event client timeout
- Fixes 429 error handling

## [2.13.6] - 2020-12-16

### Fixed

- Varies sitemap according to x-forwarded-host

## [2.13.5] - 2020-12-16

### Fixed

- Adds correct policy for graphql calls
- Remove authorization from saveIndex mutation

## [2.13.4] - 2020-12-01

### Fixed

- Checks if account has one binding and one SC
- Optimizes XML creation
- Enables automatic sitemap generation

## [2.13.3] - 2020-11-17

## [2.13.2] - 2020-11-17

### Fixed

- Handles correctly 429 error
- Disables automatic sitemap generation
- Handles cases where the bindings doesn't have associated sales channels

## [2.13.0] - 2020-10-20

### Added

- Makes the sitemap root exensible via Graphql API

## [2.12.1] - 2020-10-14

### Fixed

- Filters store bindings from rewriter routes

## [2.12.0] - 2020-09-28

### Added

- Athentication directive

### Fixed

- Decreases number of products processed in an event
- Remoes randomness in sitemap generation

## [2.11.3] - 2020-09-17

### Fixed

- Decreases number of products processed in an event

## [2.11.2] - 2020-09-17

### Fixed

- Increases probability of automatic sitemap generation

## [2.11.1] - 2020-09-14

### Fixed

- Re-enables automatic sitemap generation but only for 20% of the times

## [2.11.0] - 2020-08-24

### Added

- Creates Graphql API

## [2.10.1] - 2020-08-20

### Fixed

- Adapts group entites middleware to event chain, to handle huge sitemaps

## [2.10.0] - 2020-08-20

### Added

- Optimization with the new product list API
- Bindings index improvements

## [2.9.5] - 2020-08-14 - [YANKED]

### Fixed

- Makes generation route public

## [2.9.4] - 2020-08-14

### Fixed

- Deduplicates routes and index

## [2.9.3] - 2020-08-13

### Fixed

- Changes product list API

## [2.9.2] - 2020-08-13

### Fixed

- Adds consistent VBase client

## [2.9.1] - 2020-07-20

### Fixed

- Reenables sitemap generation via API

## [2.9.0] - 2020-07-16

### Feature

- Adds throttling middleware

## [2.8.5] - 2020-07-16

### Fixed

- Increases generation blocking time
- Increases sitemap cache

## [2.8.4] - 2020-07-16

### Fixed

- Updated README.md file (docs folder)

## [2.8.3] - 2020-07-08

### Fixed

- Uses app's token for catalog api request

## [2.8.2] - 2020-07-02

### Fixed

- Adds flag to stop all sitemap generations

## [2.8.1] - 2020-06-25

### Fixed

- Add logs

## [2.8.0] - 2020-06-23

### Added

- Generate sitemap with apps routes

## [2.7.0] - 2020-06-23

### Added

- Settings to enable/disable route sources

## [2.6.0] - 2020-06-17

### Added

- Do not show rewriter routes that are disabled

## [2.5.3] - 2020-06-10

### Fixed

- Refactors generation middlewares
- Changes buckets if app is linked
- Builds alternates links with other bindings' routes

## [2.5.2] - 2020-06-08

### Fixed

- Waits for both product and rewriter routes to be complete before completing the sitemap

## [2.5.1] - 2020-06-05

### Fixed

- Use product search result to decide if product is active or not

## [2.5.0] - 2020-06-03

### Fixed

- Fallbacks to first store binding in case of missing binding
- Increases clients timeouts

### Added

- Token security, by saving it in VBase
- Generation Id, to identify a generation and not process events from other ones

## [2.3.1] - 2020-06-01

## [2.3.0] - 2020-06-01

### Added

- Removes unecessary tags
- Improves lastUpdated tag
- Get product routes from catalop
- Group entities

### Fixed

- Updated generation middleware to event chain

## [2.2.3] - 2020-05-08

### Fixed

- Increases timeouts and add retry

## [2.2.2] - 2020-05-07

### Added

- Adds two buckets one for generation the other for production

## [2.2.1] - 2020-05-05

### Fixed

- Remove alternate in single language sites

## [2.2.0] - 2020-05-05

### Added

- Groups sitemap entries by entity type
- Report log

## [2.1.0] - 2020-04-22

### Added

- Support robots separated by binding.

## [2.0.2] - 2020-04-16

### Changed

- Optimizes sitemap generation.

## [2.0.1] - 2020-04-15

### Changed

- Filter routes by binding.

## [2.0.0] - 2020-04-09

### Major

- New sitemap using rewriter.
