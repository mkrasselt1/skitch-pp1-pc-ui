// Koppelt die PP1 unter Linux über BlueZ (D-Bus). Die Maschine verlangt eine verschlüsselte
// Verbindung; Android erledigt das Pairing automatisch, unter Linux braucht es einen Agenten.
const dbus = require('dbus-next');

const { Interface } = dbus.interface;
const { Variant, DBusError } = dbus;

const PP1_SERVICE = 'a76eb9e0-f3ac-4990-84cf-3a94d2426b2b';
const NAME_PREFIX = 'Brother PP1'; // so meldet sich die Maschine
const AGENT_PATH = '/io/github/pp1steuerung/agent';
const SCAN_SECONDS = 15;

// Pairing ohne Eingabe ("Just Works"), wie die PP1 es anbietet
class Agent extends Interface {
    Release() {}
    RequestPinCode() { throw new DBusError('org.bluez.Error.Rejected', 'Keine PIN vorgesehen'); }
    DisplayPinCode() {}
    RequestPasskey() { throw new DBusError('org.bluez.Error.Rejected', 'Kein Passkey vorgesehen'); }
    DisplayPasskey() {}
    RequestConfirmation() {}
    RequestAuthorization() {}
    AuthorizeService() {}
    Cancel() {}
}
Agent.configureMembers({
    methods: {
        Release: { inSignature: '', outSignature: '' },
        RequestPinCode: { inSignature: 'o', outSignature: 's' },
        DisplayPinCode: { inSignature: 'os', outSignature: '' },
        RequestPasskey: { inSignature: 'o', outSignature: 'u' },
        DisplayPasskey: { inSignature: 'ouq', outSignature: '' },
        RequestConfirmation: { inSignature: 'ou', outSignature: '' },
        RequestAuthorization: { inSignature: 'o', outSignature: '' },
        AuthorizeService: { inSignature: 'os', outSignature: '' },
        Cancel: { inSignature: '', outSignature: '' },
    },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function managedObjects(bus) {
    const root = await bus.getProxyObject('org.bluez', '/');
    return root.getInterface('org.freedesktop.DBus.ObjectManager').GetManagedObjects();
}

function findPP1(objects) {
    for (const [objPath, ifaces] of Object.entries(objects)) {
        const dev = ifaces['org.bluez.Device1'];
        const name = dev?.Name?.value ?? dev?.Alias?.value ?? '';
        if (dev && name.startsWith(NAME_PREFIX)) {
            return { path: objPath, name, paired: !!dev.Paired?.value, adapter: dev.Adapter?.value };
        }
    }
    return null;
}

function findAdapter(objects) {
    for (const [objPath, ifaces] of Object.entries(objects)) {
        const a = ifaces['org.bluez.Adapter1'];
        if (a) return { path: objPath, powered: !!a.Powered?.value };
    }
    return null;
}

async function scanForPP1(bus, adapterPath) {
    const adapter = (await bus.getProxyObject('org.bluez', adapterPath)).getInterface('org.bluez.Adapter1');
    await adapter.SetDiscoveryFilter({ UUIDs: new Variant('as', [PP1_SERVICE]), Transport: new Variant('s', 'le') });
    await adapter.StartDiscovery();
    try {
        for (let i = 0; i < SCAN_SECONDS; i++) {
            await sleep(1000);
            const found = findPP1(await managedObjects(bus));
            if (found) return found;
        }
        return null;
    } finally {
        await adapter.StopDiscovery().catch(() => {});
    }
}

async function pairPP1() {
    let bus;
    try {
        bus = dbus.systemBus();
        let objects = await managedObjects(bus);
        const adapterInfo = findAdapter(objects);
        if (!adapterInfo) return { ok: false, message: 'Kein Bluetooth-Adapter gefunden.' };
        if (!adapterInfo.powered) return { ok: false, message: 'Bluetooth ist ausgeschaltet. Bitte in den Systemeinstellungen einschalten.' };

        let device = findPP1(objects);
        if (!device) device = await scanForPP1(bus, adapterInfo.path);
        if (!device) {
            return { ok: false, message: 'Keine PP1 gefunden. Ist die Maschine eingeschaltet und in der Nähe? Ggf. die Bluetooth-Taste an der Maschine gedrückt halten, bis sie piept.' };
        }

        const devObj = await bus.getProxyObject('org.bluez', device.path);
        const dev = devObj.getInterface('org.bluez.Device1');
        const props = devObj.getInterface('org.freedesktop.DBus.Properties');

        if (!device.paired) {
            bus.export(AGENT_PATH, new Agent('org.bluez.Agent1'));
            const manager = (await bus.getProxyObject('org.bluez', '/org/bluez')).getInterface('org.bluez.AgentManager1');
            await manager.RegisterAgent(AGENT_PATH, 'NoInputNoOutput');
            try {
                await dev.Pair();
            } catch (error) {
                if (error.type !== 'org.bluez.Error.AlreadyExists') throw error;
            } finally {
                await manager.UnregisterAgent(AGENT_PATH).catch(() => {});
            }
        }
        await props.Set('org.bluez.Device1', 'Trusted', new Variant('b', true));
        // Trennen, damit sich die App danach selbst verbindet
        await dev.Disconnect().catch(() => {});
        return { ok: true, message: device.paired ? `${device.name} war bereits gekoppelt.` : `${device.name} ist jetzt gekoppelt.` };
    } catch (error) {
        return { ok: false, message: `Pairing fehlgeschlagen: ${error.text || error.message || error}` };
    } finally {
        bus?.disconnect();
    }
}

module.exports = { pairPP1 };
