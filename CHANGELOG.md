# Changelog

All notable changes to this fork.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning [SemVer](https://semver.org/).

## [3.0.4] - 2026-09-11

### Fixed
- **Upgrading to 3.0.3 was not enough on an existing install.** Homebridge persists every characteristic's `props` (perms included) in `cachedAccessories` and HAP-NodeJS restores them verbatim, so a cache written by 3.0.0-3.0.2 under HAP v2 kept publishing the custom characteristics with `perms: [null, "ev"]` after the upgrade, and iOS kept refusing to pair until `accessories/cachedAccessories` was deleted by hand. The plugin now repairs the perms of cached custom characteristics on restore (`configureAccessory`), touching only `perms` and logging how many were repaired. Healthy caches are left untouched.

### Added
- Smoke test covers the cache repair: a deserialized characteristic with `[null, "ev"]` is healed, a healthy one is untouched, and a second pass is a no-op.

### Notes
- If pairing still fails with "Accessory not reachable" after this, try another mDNS advertiser in the Homebridge UI (Settings > Network). On the reference setup Avahi worked where Bonjour HAP did not; that is a Homebridge/network matter, not a plugin one.

## [3.0.3] - 2026-09-11

### Fixed
- **Bridge could not be paired from a clean install under Homebridge 2.x** ("Unable to Add Accessory - Accessory out of compliance", or "Accessory not reachable" on newer iOS builds). HAP-NodeJS v2 removed the deprecated `Perms.READ` / `Perms.WRITE` aliases (only `PAIRED_READ` / `PAIRED_WRITE` remain), so every custom Characteristic in `lib/services.js` was published with `perms: [null, "ev"]`, i.e. without read permission. iOS rejects the whole bridge as soon as one Domoticz device lands on a custom eDomoticz service (power/gas/water meters, barometer, wind, UV, rain, visibility, solar radiation, info text, temperature override, or the generic fallthrough meter service). HAP-NodeJS itself also refused reads on those characteristics with `WRITE_ONLY_CHARACTERISTIC`. Existing installs paired under HAP v1 were unaffected because iOS caches the accessory structure and does not re-validate it. Fixed by switching to `Perms.PAIRED_READ` / `Perms.PAIRED_WRITE`, which exist with identical wire values in HAP v1 as well, so Homebridge 1.x compatibility is unchanged. Reported upstream on PR #297 by PatchworkBoy.

### Added
- Smoke test now instantiates every custom Characteristic and fails if any perms entry is null or `PAIRED_READ` is missing.

## [3.0.2] - 2026-05-25

### Fixed
- Pre-existing latent bug carried over from upstream v2.1.50: `lib/domoticz.js` invoked an undefined `callback()` in two network-error branches (lines 51 and 211, inside `Domoticz.settings` and `Domoticz.updateWithURL`). If either branch ever ran (Domoticz network failure, non-200 HTTP code, malformed JSON), Node would throw `ReferenceError: callback is not defined` and kill the plugin process exactly when it was supposed to be handling the error. Both lines were removed (they were dead code that never executed correctly). Error logging is preserved.

## [3.0.1] - 2026-05-24

### Fixed
- HAP-NodeJS v2 moved the `Formats`, `Perms` and `Units` enums from static properties of the `Characteristic` class to the root of the `hap` module. The plugin now resolves these enums via fallback (HAP v1 → HAP v2) inside `initServices`, with a defensive `Error` if neither path provides them. Without this fix, every constructor blew up with `TypeError: Cannot read properties of undefined (reading 'FLOAT')`. Discovered during phase 3 of the smoke test; not in the original bug report. See `MIGRATION_NOTES.md` §10 for detail.

## [3.0.0] - 2026-05-24

### Changed
- **Internal breaking change (not public API).** The 20 custom Characteristics and 14 custom Services in `lib/services.js` were migrated from pre-ES6 constructors + `util.inherits` to `class … extends Service|Characteristic`. The class bodies now live in an `initServices(Service, Characteristic, UUID, hap)` factory invoked from `index.js` once `homebridge.hap` is available. Resolves the `TypeError: Class constructor Service cannot be invoked without 'new'` crash under Homebridge 2.x / HAP-NodeJS v2.
- `engines.node`: `>=0.12.0` → `>=18.15.0` (Homebridge 2.x minimum).
- `engines.homebridge`: `>=0.2.5` → `>=1.8.0 || >=2.0.0`.
- `package.json`: `repository.url`, `bugs.url` and `homepage` repointed to this fork.

### Preserved
- **All UUIDs preserved byte-for-byte**, including the historical collisions on `'eDomoticz:powermeter:customservice'` (AMP/VOLT/Meter) and `'eDomoticz:customchar:CurrentConsumption'` (reused by GasConsumption). HomeKit pairings on existing installations stay stable.
- Public API untouched: no change in `config.json` schema, platform name (`eDomoticz`) or visible runtime behaviour.
- `lib/domoticz_accessory.js` (2352 lines) not touched. Consumers of `eDomoticzServices.X` keep working transparently.

### Added
- `test/load-plugin.js`: smoke test that loads the plugin against `hap-nodejs@^2.0.0` and instantiates representative classes for each category (fixed Eve UUID, `UUID.generate`, historical collision, fixed UUID, composite Service). Asserts the invariant that AMP/VOLT/Meter share one UUID and differ only by `subtype`.
- `MIGRATION_NOTES.md`: detailed phase 1 reconnaissance report and an appendix covering the phase 3 discovery.

### Not addressed (technical debt noted, out of scope)
- `request@^2.81.0` is deprecated since 2020. Still functional under Node 22 for now.
- Implicit globals (`Service = homebridge.hap.Service` without `var`/`let`/`const`) in `index.js`. Kept for compatibility with existing code that relies on them.
- `Helper.fixInheritance` is dead code (never invoked). The `inherits` dependency could be removed if it is dropped.
- Latent bug in `lib/domoticz.js:51,211` invoking an undefined `callback()` in network-error branches. To be tracked as a future issue.

---

*For the upstream plugin history prior to the fork, see the `CHANGELOG` file (no extension) at the repository root.*
