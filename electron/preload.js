// Schmale Brücke zwischen Oberfläche und Electron-Hauptprozess
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
    platform: process.platform,
    onBluetoothDevices: (callback) => ipcRenderer.on('bt-devices', (_event, devices) => callback(devices)),
    selectBluetoothDevice: (deviceId) => ipcRenderer.send('bt-select', deviceId),
    pairLinux: () => ipcRenderer.invoke('pair-linux'),
});
