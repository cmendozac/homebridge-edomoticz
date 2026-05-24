# Changelog

Todos los cambios relevantes de este fork.

Formato basado en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versionado [SemVer](https://semver.org/).

## [3.0.2] - 2026-05-25

### Fixed
- Pre-existing latent bug carried over from upstream v2.1.50: `lib/domoticz.js` invocaba un `callback()` inexistente en dos ramas de error de red (líneas 51 y 211, dentro de `Domoticz.settings` y `Domoticz.updateWithURL`). Si esa rama llegaba a ejecutarse (caída de red contra Domoticz, código HTTP != 200, JSON corrupto), Node lanzaba `ReferenceError: callback is not defined` y mataba el plugin justo cuando ya estaba lidiando con un error. Las dos líneas se eliminan (eran código muerto que nunca se ejecutó correctamente). El logging del error se preserva.

## [3.0.1] - 2026-05-24

### Fixed
- HAP-NodeJS v2 movió los enums `Formats`, `Perms` y `Units` de propiedades estáticas de la clase `Characteristic` a la raíz del módulo `hap`. El plugin ahora resuelve estos enums mediante fallback (HAP v1 → HAP v2) dentro de `initServices`, con un `Error` defensivo si ningún path los provee. Sin este fix, todos los constructores reventaban con `TypeError: Cannot read properties of undefined (reading 'FLOAT')`. Descubierto en Fase 3 del smoke test, no estaba en el reporte original del bug. Ver `MIGRATION_NOTES.md` §10 para detalle.

## [3.0.0] - 2026-05-24

### Changed
- **BREAKING interno (no de API pública).** Las 20 Characteristics y 14 Services custom de `lib/services.js` migradas de constructores pre-ES6 + `util.inherits` a `class … extends Service|Characteristic`. Los cuerpos de clase ahora viven en una factory `initServices(Service, Characteristic, UUID, hap)` invocada desde `index.js` tras `homebridge.hap` estar disponible. Resuelve el crash `TypeError: Class constructor Service cannot be invoked without 'new'` bajo Homebridge 2.x / HAP-NodeJS v2.
- `engines.node`: `>=0.12.0` → `>=18.15.0` (mínimo de Homebridge 2.x).
- `engines.homebridge`: `>=0.2.5` → `>=1.8.0 || >=2.0.0`.
- `package.json`: `repository.url`, `bugs.url` y `homepage` repuntados a este fork.

### Preserved
- **Todos los UUIDs preservados byte a byte**, incluidas las colisiones históricas de `'eDomoticz:powermeter:customservice'` (AMP/VOLT/Meter) y `'eDomoticz:customchar:CurrentConsumption'` (reutilizado por GasConsumption). Los pairings HomeKit de instalaciones existentes siguen estables.
- API pública intacta: ningún cambio en el schema de `config.json`, el nombre de la plataforma (`eDomoticz`), ni el comportamiento runtime visible.
- `lib/domoticz_accessory.js` (2352 líneas) sin tocar. Los consumidores de `eDomoticzServices.X` siguen funcionando transparentemente.

### Added
- `test/load-plugin.js`: smoke test que carga el plugin contra `hap-nodejs@^2.0.0` e instancia las clases representativas de cada categoría (UUID Eve fijo, `UUID.generate`, colisión histórica, UUID fijo, Service compuesto). Verifica el invariante de que AMP/VOLT/Meter comparten UUID y se diferencian sólo por `subtype`.
- `MIGRATION_NOTES.md`: informe detallado del reconocimiento de Fase 1 y apéndice con el descubrimiento de Fase 3.

### Not addressed (deuda técnica anotada, fuera de alcance)
- `request@^2.81.0` está deprecated desde 2020. Funcional en Node 22 por ahora.
- Variables globales implícitas (`Service = homebridge.hap.Service` sin `var`/`let`/`const`) en `index.js`. Conservadas por compatibilidad con código existente que depende de ellas.
- `Helper.fixInheritance` es código muerto (nunca invocado). La dependencia `inherits` podría eliminarse si se retira.
- Bug latente en `lib/domoticz.js:51,211` invocando `callback()` indefinido en ramas de error de red. A registrar como issue futuro.

---

*Para la historia del plugin upstream antes del fork, ver el fichero `CHANGELOG` (sin extensión) en la raíz.*
