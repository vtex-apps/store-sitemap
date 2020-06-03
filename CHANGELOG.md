# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Fixed
- Fallbacks to first store binding in case of missing binding

### Added
- Token security, by saving it in VBase
- Generation Id, to identify a generation and not process events from other ones

### Fixed
- Increases clients timeouts

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
