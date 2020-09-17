# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]
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
