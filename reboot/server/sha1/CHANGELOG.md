# Changelog

## 0.6.0 (2018-10-06)

### Added

* New `sha1.version` field contains `sha1` version.

### Changed

* `sha1` now uses bitwise operation modules or Lua 5.3 bitwise operators when
  available. This improves performance considerably. Pure Lua fallback
  used on Lua 5.1 is now much faster, too.

## 0.5.0 (2014-01-22)

Initial LuaRocks release.
