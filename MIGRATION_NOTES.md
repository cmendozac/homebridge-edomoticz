# MIGRATION_NOTES — homebridge-edomoticz → Homebridge 2.x / HAP-NodeJS 2.x

> Informe de reconocimiento (Fase 1). **No se ha modificado nada del código todavía.**
> Pendiente: OK del propietario para pasar a Fase 2 (migración real).

---

## 1. `package.json` — estado actual

| Campo | Valor actual | Observación |
|---|---|---|
| `name` | `homebridge-edomoticz` | Se mantendrá para uso local desde GitHub |
| `version` | `2.1.50` | Última publicada en npm por upstream (sep 2024, abandonado) |
| `main` | `index.js` | OK |
| `engines.node` | `>=0.12.0` | Antiquísimo. Hay que subir a `>=18.15.0` para HB 2.x |
| `engines.homebridge` | `>=0.2.5` | Hay que subir a `>=1.8.0 || >=2.0.0` |
| `dependencies.inherits` | `^2.0.1` | Se podrá retirar tras la migración (sólo `util.inherits` lo usa indirectamente vía `lib/helper.js`, que es código muerto — ver §4) |
| `dependencies.mqtt` | `^2.15.0` | Funcional. Sin cambios |
| `dependencies.request` | `^2.81.0` | **DEPRECATED desde 2020.** No rompe HB 2.x por sí solo. Fuera de alcance de esta migración — anotar como deuda futura |
| `peerDependencies` | *(no existe)* | Convendría añadirla con `homebridge` (recomendado en plugins modernos), pero el plan dice no introducir cambios no estrictamente necesarios → **no se añade** |
| `devDependencies` | *(no existe)* | Sin scripts de build. Plain JS. Se añadirá `hap-nodejs` y `homebridge` (peer-style) sólo si el test de carga de Fase 3 los requiere |
| `scripts.test` | `echo "Error: no test specified" && exit 1` | Se añadirá `node test/load-plugin.js` en Fase 3 |
| `license` | `GPL-3.0` | Sin cambios |

---

## 2. Estructura del repositorio

```
.gitignore
CHANGELOG          (texto plano histórico de upstream)
InstallGuide
LICENSE
README.md
config.schema.json (UI de Homebridge)
edomoticz.png
index.js                   ← entry point (300 líneas)
lib/
  constants.js             ← constantes Domoticz (no se toca)
  domoticz.js              ← cliente HTTP de la API Domoticz (no se toca)
  domoticz_accessory.js    ← clase eDomoticzAccessory, 2352 líneas (no se toca)
  helper.js                ← utilidades generales (no se toca)
  mqtt.js                  ← cliente MQTT (no se toca)
  services.js              ← TODAS las clases Service/Characteristic custom (367 líneas) ← AQUÍ está la migración
```

**Conclusión:** la migración es muy contenida. Sólo dos ficheros se editan:
- `lib/services.js` — reescribir los 34 constructores en ES6
- `index.js` — eliminar los 34 `util.inherits(...)` y limpiar el `require('util')` si queda huérfano

---

## 3. Patrones a migrar — localizados

### 3.1 `util.inherits` en `index.js` (líneas 27-60, 34 ocurrencias)

```js
util.inherits(eDomoticzServices.TotalConsumption, Characteristic);
util.inherits(eDomoticzServices.CurrentConsumption, Characteristic);
// ... 32 más
util.inherits(eDomoticzServices.UVIndex, Characteristic);
```

Todas se eliminan tras pasar las clases a `class … extends …` en `lib/services.js`.

### 3.2 `Service.call(this, …)` y `Characteristic.call(this, …)` en `lib/services.js`

- `Characteristic.call(this, …)` — **20 ocurrencias** (uno por Characteristic custom)
- `Service.call(this, displayName, serviceUUID, subtype)` — **14 ocurrencias** (uno por Service custom)

Esto **es la causa raíz directa del crash reportado**:

```
TypeError: Class constructor Service cannot be invoked without 'new'
    at new eDomoticzServices.MeterDeviceService (lib/services.js:133:13)
```

En HAP-NodeJS v2 `Service` y `Characteristic` son clases ES6 estrictas. `Service.call(this, …)` falla porque no se puede invocar una clase ES6 sin `new`.

### 3.3 Otros patrones que NO requieren cambio

| Patrón | Dónde | Por qué se deja |
|---|---|---|
| `inherits(subclass, superclass)` en `lib/helper.js:62` | `Helper.fixInheritance` | Función helper **nunca invocada en el código** (búsqueda exhaustiva confirmada). Código muerto. Dejar en paz para no introducir ruido. |
| `Types = homebridge.hapLegacyTypes;` en `index.js:24` | Asignación a global | `Types` **nunca se usa** en ningún `.js` del repo. Es asignación huérfana. Si `hapLegacyTypes` no existe en HB 2.x se asigna `undefined` → inocuo. Se puede dejar (o quitar como limpieza menor). |
| `global.Service;` etc. en `lib/constants.js:1-5` | Statements no-op | Son referencias sin asignación (sólo "tocan" la propiedad del global). No tienen efecto en runtime; documentan intención. No tocar. |
| `require('hap-nodejs')` directo | — | **No existe en el código.** El plugin obtiene `Service`/`Characteristic` desde `homebridge.hap.*` (correcto). Nada que migrar aquí. |

---

## 4. Cómo el plugin obtiene `Service` y `Characteristic`

`index.js:21-25`:

```js
module.exports = function(homebridge) {
    Service       = homebridge.hap.Service;          // asignación SIN var → global implícito
    Characteristic= homebridge.hap.Characteristic;
    Categories    = homebridge.hap.Accessory.Categories;
    Types         = homebridge.hapLegacyTypes;       // huérfano, nunca usado
    UUID          = homebridge.hap.uuid;
    …
};
```

- Estos identificadores se asignan **sin** `var`/`let`/`const`, por lo que en CommonJS no-strict acaban como globales del proceso.
- El resto del código (`lib/services.js`, `lib/domoticz_accessory.js`, `lib/constants.js`) los lee por nombre bare, contando con que esos globales existan.
- `lib/constants.js:1-5` declara `global.Service;` etc. como "hint" documental.
- **Es frágil pero funciona** en HB 2.x. Está dentro de las restricciones del plan: "Si ya lo hace bien, no toques" — se accede vía el objeto `api`/`homebridge` que pasa el host, no vía `require('hap-nodejs')`. **No se modifica.**

> **Deuda anotada (NO se aborda ahora):** convendría inyectar `Service`/`Characteristic` como parámetros explícitos en lugar de globals. Refactor mayor fuera del alcance de esta migración de compatibilidad.

---

## 5. Inventario completo de clases custom

### 5.1 Characteristics custom (20) — todas heredan de `Characteristic`

| # | Nombre | UUID | Origen UUID |
|---|---|---|---|
| 1 | `TotalConsumption` | `E863F10C-079E-48FF-8F27-9C2605A29F52` | Fijo (Eve) |
| 2 | `TodayConsumption` | *generado*: `eDomoticz:customchar:TodayConsumption` | UUID.generate |
| 3 | `CurrentConsumption` | `E863F10D-079E-48FF-8F27-9C2605A29F52` | Fijo (Eve) |
| 4 | `Ampere` | `E863F126-079E-48FF-8F27-9C2605A29F52` | Fijo (Eve) |
| 5 | `Volt` | `E863F10A-079E-48FF-8F27-9C2605A29F52` | Fijo (Eve) |
| 6 | `GasConsumption` | *generado*: `eDomoticz:customchar:CurrentConsumption` | UUID.generate ⚠️ **misma clave que CurrentConsumption (colisión histórica del upstream)** |
| 7 | `WaterFlow` | *generado*: `eDomoticz:customchar:WaterFlow` | UUID.generate |
| 8 | `TotalWaterFlow` | *generado*: `eDomoticz:customchar:TotalWaterFlow` | UUID.generate |
| 9 | `TempOverride` | *generado*: `eDomoticz:customchar:OverrideTime` | UUID.generate |
| 10 | `CurrentUsage` | *generado*: `eDomoticz:customchar:CurrentUsage` | UUID.generate |
| 11 | `Location` | *generado*: `eDomoticz:customchar:Location` | UUID.generate |
| 12 | `WindSpeed` | `49C8AE5A-A3A5-41AB-BF1F-12D5654F9F41` | Fijo |
| 13 | `WindChill` | *generado*: `eDomoticz:customchar:WindChill` | UUID.generate |
| 14 | `WindDirection` | `46f1284c-1912-421b-82f5-eb75008b167e` | Fijo |
| 15 | `Rainfall` | `ccc04890-565b-4376-b39a-3113341d9e0f` | Fijo |
| 16 | `Visibility` | `d24ecc1e-6fad-4fb5-8137-5af88bd5e857` | Fijo |
| 17 | `UVIndex` | `05ba0fe0-b848-4226-906d-5b64272e05ce` | Fijo |
| 18 | `SolRad` | *generado*: `eDomoticz:customchar:SolRad` | UUID.generate |
| 19 | `Barometer` | `E863F10F-079E-48FF-8F27-9C2605A29F52` | Fijo (Eve) |
| 20 | `Infotext` | *generado*: `eDomoticz:customchar:Infotext` | UUID.generate |

### 5.2 Services custom (14) — todos heredan de `Service`

| # | Nombre | UUID | Origen UUID |
|---|---|---|---|
| 1 | `AMPDeviceService` | *generado*: `eDomoticz:powermeter:customservice` | UUID.generate ⚠️ comparte clave con VOLTDeviceService y MeterDeviceService (diferenciados por `subtype`) |
| 2 | `VOLTDeviceService` | *generado*: `eDomoticz:powermeter:customservice` | UUID.generate ⚠️ |
| 3 | `MeterDeviceService` | *generado*: `eDomoticz:powermeter:customservice` | UUID.generate ⚠️ |
| 4 | `WaterDeviceService` | *generado*: `eDomoticz:watermeter:customservice` | UUID.generate |
| 5 | `GasDeviceService` | *generado*: `eDomoticz:gasmeter:customservice` | UUID.generate |
| 6 | `UsageDeviceService` | *generado*: `eDomoticz:usagedevice:customservice` | UUID.generate |
| 7 | `LocationService` | *generado*: `eDomoticz:location:customservice` | UUID.generate |
| 8 | `WindDeviceService` | `2AFB775E-79E5-4399-B3CD-398474CAE86C` | Fijo |
| 9 | `RainDeviceService` | `D92D5391-92AF-4824-AF4A-356F25F25EA1` | Fijo |
| 10 | `VisibilityDeviceService` | *generado*: `eDomoticz:visibilitydevice:customservice` | UUID.generate |
| 11 | `UVDeviceService` | *generado*: `eDomoticz:uvdevice:customservice` | UUID.generate |
| 12 | `SolRadDeviceService` | *generado*: `eDomoticz:solraddevice:customservice` | UUID.generate |
| 13 | `WeatherService` | `debf1b79-312e-47f7-bf82-993d9950f3a2` | Fijo |
| 14 | `InfotextDeviceService` | *generado*: `eDomoticz:infotextdevice:customservice` | UUID.generate |

> ⚠️ **Colisiones de UUID preexistentes**: los UUIDs derivados de `UUID.generate('eDomoticz:powermeter:customservice')` son el mismo string en los tres servicios (AMP/VOLT/Meter). Esto **es así en el upstream desde hace años** y debe **preservarse al pie de la letra** para no romper pairings ya emparejados en instalaciones existentes. La diferenciación entre servicios la hace HomeKit por `subtype`. **No se corrige** en esta migración (restricción explícita: "NO cambies UUIDs").

---

## 6. Mapa de la migración (referencia para Fase 2)

### 6.1 Patrón origen (ejemplo `MeterDeviceService`)

```js
// en lib/services.js
eDomoticzServices.MeterDeviceService = function(displayName, subtype) {
    var serviceUUID = UUID.generate('eDomoticz:powermeter:customservice');
    Service.call(this, displayName, serviceUUID, subtype);
    this.addCharacteristic(new eDomoticzServices.CurrentConsumption());
    this.addOptionalCharacteristic(new eDomoticzServices.TotalConsumption());
    this.addOptionalCharacteristic(new eDomoticzServices.TodayConsumption());
};

// en index.js
util.inherits(eDomoticzServices.MeterDeviceService, Service);
```

### 6.2 Patrón destino ES6

```js
// en lib/services.js — única definición, herencia incluida
eDomoticzServices.MeterDeviceService = class extends Service {
    constructor(displayName, subtype) {
        var serviceUUID = UUID.generate('eDomoticz:powermeter:customservice');
        super(displayName, serviceUUID, subtype);
        this.addCharacteristic(new eDomoticzServices.CurrentConsumption());
        this.addOptionalCharacteristic(new eDomoticzServices.TotalConsumption());
        this.addOptionalCharacteristic(new eDomoticzServices.TodayConsumption());
    }
};

// en index.js — el util.inherits correspondiente se ELIMINA
```

**Punto delicado de orden de carga**: `lib/services.js` se `require()`a en `index.js:17`, **antes** de que `homebridge` setee los globales `Service`/`Characteristic` (índex.js:21-25). Las clases custom **se evalúan en el momento del `require()`** — si en ese instante `Service`/`Characteristic` aún no están definidos, `class extends undefined` truena.

Solución: envolver las definiciones de clases custom en una función exportada que reciba `Service` y `Characteristic` y se invoque desde `index.js` **después** de leer `homebridge.hap`. Es el patrón canónico de los plugins de Homebridge modernos.

Esquema propuesto (a confirmar contigo en Fase 2):

```js
// lib/services.js
module.exports = function eDomoticzServicesFactory(Service, Characteristic, UUID) {
    const eDomoticzServices = {};

    eDomoticzServices.MeterDeviceService = class extends Service {
        constructor(displayName, subtype) {
            super(displayName, UUID.generate('eDomoticz:powermeter:customservice'), subtype);
            this.addCharacteristic(new eDomoticzServices.CurrentConsumption());
            …
        }
    };
    …
    return eDomoticzServices;
};
```

```js
// index.js
const eDomoticzServicesFactory = require('./lib/services.js');
let eDomoticzServices; // se inicializa dentro del exports

module.exports = function(homebridge) {
    Service        = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUID           = homebridge.hap.uuid;
    eDomoticzServices = eDomoticzServicesFactory(Service, Characteristic, UUID);
    // … los 34 util.inherits desaparecen completamente
    homebridge.registerPlatform("homebridge-edomoticz", "eDomoticz", eDomoticzPlatform, true);
};
```

**Pero hay un problema**: `lib/domoticz_accessory.js:5` hace `require('./services.js').eDomoticzServices` al evaluarse, y usa `eDomoticzServices.AMPDeviceService` directamente con `new`. Si convertimos `services.js` a factory, ese require deja de funcionar.

→ **Opción A (mínima invasión, recomendada)**: mantener `lib/services.js` exportando un objeto `eDomoticzServices` pre-construido, pero **diferir la definición de las clases hasta una función `init(Service, Characteristic, UUID)` que invoque `index.js`** después de tener los globales. Las propiedades del objeto se asignan en el `init`, no al require. Esto preserva la API: `require('./services.js').eDomoticzServices.AMPDeviceService` sigue siendo el mismo objeto; sólo cambia *cuándo* tiene sus campos rellenos.

→ **Opción B (más invasiva)**: convertir `services.js` a factory y refactorizar `domoticz_accessory.js` para recibir el objeto. Toca mucho código y va contra la restricción del plan ("NO toques la lógica de descubrimiento…").

**Recomendación de Fase 1: ir por la Opción A.** Quedará así (esquema):

```js
// lib/services.js
const eDomoticzServices = {};
module.exports = {
    eDomoticzServices,
    initServices: function(Service, Characteristic, UUID) {
        eDomoticzServices.TotalConsumption = class extends Characteristic { … };
        eDomoticzServices.MeterDeviceService = class extends Service { … };
        …
    }
};

// index.js
const { eDomoticzServices, initServices } = require('./lib/services.js');

module.exports = function(homebridge) {
    Service        = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Categories     = homebridge.hap.Accessory.Categories;
    UUID           = homebridge.hap.uuid;
    initServices(Service, Characteristic, UUID); // ← rellena el objeto
    homebridge.registerPlatform("homebridge-edomoticz", "eDomoticz", eDomoticzPlatform, true);
};
```

`domoticz_accessory.js` sigue intacto: cuando se invoca `new eDomoticzServices.MeterDeviceService(...)` desde un accessory (que pasa por `synchronizeAccessories` → `didFinishLaunching` → MUY después del `initServices`), las clases ya están registradas.

---

## 7. Cambios planificados para Fase 2 (resumen, sin tocar nada todavía)

1. **`package.json`** — bump versión a `3.0.0`; subir `engines.node` y `engines.homebridge`.
2. **`lib/services.js`** — reescribir los 34 constructores como `class … extends Service|Characteristic`, encapsulados en una función `initServices(Service, Characteristic, UUID)`. Mantener UUIDs EXACTOS, incluida la colisión preexistente.
3. **`index.js`** — añadir llamada a `initServices(...)` tras leer `homebridge.hap.*`; eliminar los 34 `util.inherits` y el `const util = require('util')` si queda huérfano.
4. **Validación** — `node --check` por fichero, luego un harness `test/load-plugin.js` con un mock de `homebridge` que cargue `hap-nodejs@2.x`.
5. **Sin cambios** en: `domoticz_accessory.js`, `domoticz.js`, `mqtt.js`, `constants.js`, `helper.js`, `config.schema.json`, `README` (excepto añadir sección "fork HB 2.x compat").

---

## 8. Riesgos y deudas detectadas (fuera del alcance, anotadas para ti)

| Riesgo | Severidad | Acción propuesta |
|---|---|---|
| `request` está deprecated desde 2020 | Media-Baja | Sigue funcionando en Node 22. Cambiar a `axios`/`undici` sería refactor importante. **No se aborda ahora.** |
| Uso de globals implícitos sin `var`/`let`/`const` en `index.js` | Baja | Funciona en CommonJS no-strict. Sin cambios. |
| `Types = homebridge.hapLegacyTypes` huérfano, `hapLegacyTypes` podría no existir en HB 2.x | Muy baja | `Types` no se usa en ningún sitio. Inocuo. Se puede comentar/eliminar como limpieza opcional. |
| UUIDs colisionantes en `eDomoticz:powermeter:customservice` (AMP/VOLT/Meter) | Histórica | **Preservar exactamente** por estabilidad de pairings. No corregir. |
| `Helper.fixInheritance` definido pero sin uso | Cosmético | Dejar en paz para no introducir ruido en el diff. |
| `request` callback en `domoticz.js:51,211` invoca `callback()` indefinido | **Bug latente preexistente** | Fuera de alcance — sólo se dispara en rama de error de red. Anotar como issue futuro. |

---

## 9. Preguntas abiertas para ti antes de Fase 2

1. ¿OK con la **Opción A** (factory `initServices` dentro de `lib/services.js`, sin tocar `domoticz_accessory.js`)?
2. ¿Bumpeo el `name` del paquete o lo dejo como `homebridge-edomoticz`? (Por las instrucciones, si es uso local desde GitHub, déjalo igual → lo dejaré salvo que digas otra cosa.)
3. ¿Mantengo el `repository.url` apuntando a `patchworkboy/homebridge-eDomoticz` o lo cambio a tu fork `cmendozac/homebridge-edomoticz`? Recomiendo cambiarlo a tu fork.
4. ¿Hago commit del `MIGRATION_NOTES.md` ahora (un solo commit "docs: phase 1 reconnaissance") o lo dejo sin commitear hasta el final?

---

**Estado: Fase 1 completada. Esperando OK para entrar en Fase 2.**
