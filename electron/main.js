// Desktop-Hülle für die PP1-Steuerung: lädt die Weboberfläche aus dem App-Paket und
// übernimmt, was im Browser fehlt (Geräteauswahl, Pairing unter Linux).
const { app, BrowserWindow, ipcMain, net, protocol, session } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');

// Web Bluetooth ist unter Linux in Chromium noch hinter Flags
app.commandLine.appendSwitch('enable-experimental-web-platform-features');
app.commandLine.appendSwitch('enable-features', 'WebBluetooth');

// Eigenes Protokoll statt file://: sicherer Kontext für Web Bluetooth und ES-Module
protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let win = null;
let pendingDeviceCallback = null;

function createWindow() {
    win = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 420,
        title: 'PP1 Steuerung',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // Electron hat keinen eigenen Geräte-Dialog: Liste an die Oberfläche geben, Auswahl zurücknehmen.
    // Das Ereignis kommt wiederholt, solange neue Geräte gefunden werden.
    win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
        event.preventDefault();
        pendingDeviceCallback = callback;
        win.webContents.send('bt-devices', devices.map((d) => ({ id: d.deviceId, name: d.deviceName })));
    });

    win.loadURL('app://pp1/index.html');
}

ipcMain.on('bt-select', (_event, deviceId) => {
    if (!pendingDeviceCallback) return;
    pendingDeviceCallback(deviceId || ''); // leerer String = abgebrochen
    pendingDeviceCallback = null;
});

ipcMain.handle('pair-linux', async () => {
    if (process.platform !== 'linux') return { ok: false, message: 'Nur unter Linux nötig.' };
    return require('./pair-linux').pairPP1();
});

app.whenReady().then(() => {
    protocol.handle('app', (request) => {
        const { pathname } = new URL(request.url);
        const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
        if (!file.startsWith(ROOT + path.sep)) return new Response('Nicht erlaubt', { status: 403 });
        return net.fetch(pathToFileURL(file).toString());
    });

    // Pairing-Anfragen beim Verbinden (Windows/Linux): "Just Works"-Bestätigung automatisch annehmen
    session.defaultSession.setBluetoothPairingHandler((details, callback) => {
        if (details.pairingKind === 'confirm' || details.pairingKind === 'confirmPin') {
            callback({ confirmed: true });
        } else {
            // PIN-Eingabe ist bei der PP1 nicht vorgesehen
            callback({ confirmed: false });
        }
    });

    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
