'use strict';
/*
 * test/load-plugin.js
 *
 * Smoke test for the Homebridge 2.x / HAP-NodeJS v2 compatibility migration.
 *
 * It does NOT load the full plugin (index.js) on purpose: index.js pulls
 * domoticz_accessory.js + request + mqtt etc., and we want a focused check
 * on the migration itself. Instead it replicates what index.js does on
 * startup -- read Service/Characteristic/uuid from HAP, call initServices --
 * and then instantiates a representative battery of subclasses.
 *
 * The original v2.1.50 plugin crashed under HAP-NodeJS v2 with:
 *     TypeError: Class constructor Service cannot be invoked without 'new'
 *         at new eDomoticzServices.MeterDeviceService (lib/services.js:133:13)
 * This test will catch any regression of that bug.
 *
 * Coverage:
 *   - Characteristic with fixed Eve UUID            -> CurrentConsumption
 *   - Characteristic with UUID.generate              -> TodayConsumption
 *   - Characteristic with historical UUID collision  -> GasConsumption
 *   - The 3 Services that share 'eDomoticz:powermeter:customservice'
 *     (differentiated only by subtype) -> AMP / VOLT / Meter
 *   - Service with fixed UUID                        -> WindDeviceService
 *   - Service that composes a HAP stock Characteristic
 *     (Characteristic.CurrentTemperature)            -> WeatherService
 *
 * Exit codes:
 *   0  -> all instantiations succeeded
 *   2  -> @homebridge/hap-nodejs not installed (run `npm install` first)
 *   3  -> initServices threw
 *   1  -> at least one instantiation threw
 */

let hap;
try {
    hap = require('@homebridge/hap-nodejs');
} catch (e) {
    console.error('FAIL: @homebridge/hap-nodejs is not installed. Run `npm install` first.');
    console.error(e && e.stack ? e.stack : e);
    process.exit(2);
}

// 1. Load the migrated services module
const Services = require('../lib/services.js');

// 2. Replicate what index.js does on startup: hand HAP refs to the factory.
//    The 4th argument (the hap module itself) lets initServices resolve the
//    Formats/Perms/Units enums under HAP v2, where they live on the module
//    root rather than on the Characteristic class.
try {
    Services.initServices(hap.Service, hap.Characteristic, hap.uuid, hap);
} catch (e) {
    console.error('FAIL: Services.initServices threw.');
    console.error(e && e.stack ? e.stack : e);
    process.exit(3);
}

const eDomoticzServices = Services.eDomoticzServices;

// 3. Instantiate representatives
const cases = [
    // --- Characteristics ---
    {
        label: 'Characteristic, fixed Eve UUID (CurrentConsumption)',
        run: function () { return new eDomoticzServices.CurrentConsumption(); },
    },
    {
        label: 'Characteristic, UUID.generate (TodayConsumption)',
        run: function () { return new eDomoticzServices.TodayConsumption(); },
    },
    {
        label: 'Characteristic, historical UUID collision (GasConsumption)',
        run: function () { return new eDomoticzServices.GasConsumption(); },
    },

    // --- The 3 Services sharing UUID 'eDomoticz:powermeter:customservice' ---
    {
        label: "Service, shared UUID key, subtype='sub-amp' (AMPDeviceService)",
        run: function () { return new eDomoticzServices.AMPDeviceService('AMP', 'sub-amp'); },
    },
    {
        label: "Service, shared UUID key, subtype='sub-volt' (VOLTDeviceService)",
        run: function () { return new eDomoticzServices.VOLTDeviceService('VOLT', 'sub-volt'); },
    },
    {
        label: "Service, shared UUID key, subtype='sub-meter' (MeterDeviceService) -- original crash site",
        run: function () { return new eDomoticzServices.MeterDeviceService('Meter', 'sub-meter'); },
    },

    // --- Other shapes ---
    {
        label: 'Service, fixed UUID (WindDeviceService)',
        run: function () { return new eDomoticzServices.WindDeviceService('Wind', 'sub-wind'); },
    },
    {
        label: 'Service composing HAP stock + custom Characteristic (WeatherService)',
        run: function () { return new eDomoticzServices.WeatherService('Weather', 'sub-weather'); },
    },
];

let ok = 0;
let failed = 0;
const collisionUUIDs = [];

for (const c of cases) {
    try {
        const inst = c.run();
        if (!inst) throw new Error('instance is falsy');
        ok++;
        // Capture the UUID of the three colliding services so we can assert
        // afterwards that they really do share the same UUID and differ only
        // in subtype (the historical upstream invariant).
        if (/AMPDeviceService|VOLTDeviceService|MeterDeviceService/.test(c.label)) {
            collisionUUIDs.push({ label: c.label.split(' (')[1].replace(')', ''), uuid: inst.UUID, subtype: inst.subtype });
        }
        console.log('  OK   ' + c.label + '  ->  UUID=' + inst.UUID + (inst.subtype ? ', subtype=' + inst.subtype : ''));
    } catch (e) {
        failed++;
        const stack = e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n         ') : String(e);
        console.error('  FAIL ' + c.label);
        console.error('         ' + stack);
    }
}

// Assert the historical collision is preserved: same UUID across the 3
// services, distinct subtypes.
if (failed === 0 && collisionUUIDs.length === 3) {
    const uniqueUUIDs = new Set(collisionUUIDs.map(function (x) { return x.uuid; }));
    const uniqueSubtypes = new Set(collisionUUIDs.map(function (x) { return x.subtype; }));
    if (uniqueUUIDs.size !== 1) {
        failed++;
        console.error('  FAIL collision invariant: the 3 powermeter services should share one UUID, got ' + uniqueUUIDs.size + ' distinct UUIDs.');
    } else if (uniqueSubtypes.size !== 3) {
        failed++;
        console.error('  FAIL collision invariant: subtypes should be distinct, got ' + uniqueSubtypes.size + '.');
    } else {
        console.log('  OK   collision invariant: 3 services share UUID ' + Array.from(uniqueUUIDs)[0] + ' with 3 distinct subtypes');
    }
}

if (failed) {
    console.error('\n' + failed + ' check(s) failed.');
    process.exit(1);
}

console.log('\nOK: ' + ok + ' instanciaciones completadas');
console.log('Carga + instanciacion OK');
process.exit(0);
