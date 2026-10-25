// BLE-Anbindung der Brother PP1.
// Protokoll aus der Brother-App (Artspira 2.9.10) dekompiliert:
//   Asura.Core.Models.BLEDeviceManager, Asura.Core.Models.MonitorManager,
//   Asura.android.ServicesProvider.BLEServiceProvider
// Ablauf je Befehl: [Befehl u16 Big-Endian][Daten] auf WRITER schreiben (mit Antwort),
// danach READER lesen. Antwort: [Befehl u16 BE][Nutzdaten ...], Werte in den Nutzdaten Little-Endian.
const PP1_SERVICE = 'a76eb9e0-f3ac-4990-84cf-3a94d2426b2b';
const PP1_WRITER = 'a76eb9e2-f3ac-4990-84cf-3a94d2426b2b';
const PP1_READER = 'a76eb9e1-f3ac-4990-84cf-3a94d2426b2b';

const CMD = {
    MACHINE_INFO: 0,
    MACHINE_STATE: 1,
    PATTERN_UUID_REQUEST: 1794,
    EMB_SEWING_INFO: 1798,
    PATTERN_SEWING_INFO: 1799,
    NEEDLE_MODE_INSTRUCTIONS: 1801, // Start-Stich setzen (u16 LE, 0-basiert)
    MASK_TRACE: 1796,
    LAYOUT_SEND: 1797,
    MASK_TRACE_BOX: 1808,
    SETTING_INFO: 3074,
    EMB_SEWING_DATA_DELETE: 1800,
    EMB_UUID_SEND: 1802,
    RESUME: 1804,
    START_SEWING: 1806,
    HOOP_AVOIDANCE: 1807,
    SEND_DATA_INFO: 4608,
    SEND_DATA: 4609,
    CLEAR_ERROR: 4864,
};

// Blockgrößen für die Datenübertragung. Die App nimmt MTU-12, höchstens 500 Byte.
// Web Bluetooth verrät die MTU nicht, deshalb wird bei Schreibfehlern die nächstkleinere probiert.
const CHUNK_SIZES = [500, 232, 170, 100, 50, 13];

// SewingMachineStatus, Hinweise und Fehler: Texte in i18n.js (status.*, hint.*, err.*).
// Die Hinweise sind den Texten der Hersteller-App nachempfunden.
const STATUS_CODES = new Set([0, 1, 16, 17, 18, 32, 33, 34, 48, 49, 50, 64, 65, 66, 80, 81, 96, 97, 255]);
const HINT_CODES = new Set([0, 1, 16, 17, 32, 33, 34, 49, 64, 80]);
const ERROR_CODES = new Set([0, 1, 2, 3, 32, 33, 96, 97, 98, 99, 112, 113, 114, 128, 152, 255]);

const statusText = (code) => (STATUS_CODES.has(code) ? t(`status.${code}`) : t('status.unknown', { n: code }));
const hintText = (code) => (HINT_CODES.has(code) ? t(`hint.${code}`) : '');
function errorText(code) {
    if (code === 221 || code === 238) return ''; // keiner / unbekannt
    if (ERROR_CODES.has(code)) return t(`err.${code}`);
    if (code >= 16 && code <= 28) return t('err.restart', { code: code.toString(16).toUpperCase() });
    return t('err.unknown', { n: code });
}

// In diesen Zuständen fragt die Brother-App Stickinfo und Fortschritt ab
const SEWING_STATES = new Set([17, 48, 49, 64, 65, 66]);
const MONITOR_INTERVAL_MS = 3000;

const i16 = (v) => [v & 0xff, (v >> 8) & 0xff];

// Umrandung des Motivs wie PointsToBytes(TopLeft, BottomRight, Center): je x/y int16 LE,
// 0,1 mm ab Rahmenmitte, Y nach unten. Das Motiv liegt mittig (siehe pen.js).
function boxBytes(widthTenthMm, heightTenthMm) {
    const halfW = Math.trunc(widthTenthMm / 2), halfH = Math.trunc(heightTenthMm / 2);
    return [...i16(-halfW), ...i16(-halfH), ...i16(halfW), ...i16(halfH), ...i16(0), ...i16(0)];
}

// Wie GattTimeout in BLEServiceProvider (10 s)
const GATT_TIMEOUT_MS = 10000;

function withTimeout(promise, what) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(t('log.timeout', { what, s: GATT_TIMEOUT_MS / 1000 }))), GATT_TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const toHex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(' ');

class PP1Controller {
    constructor() {
        this.device = null;
        this.writer = null;
        this.reader = null;
        this.queue = Promise.resolve();
        this.monitorTimer = null;
        this.status = null;
        this.error = null;
        this.machineTotal = 0;
    }

    isConnected() {
        return !!(this.device && this.device.gatt.connected && this.writer && this.reader);
    }

    log(message, type = 'info') {
        const logEl = document.getElementById('log');
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString(currentLocale())}] ${message}`;
        logEl.appendChild(entry);
        logEl.scrollTop = logEl.scrollHeight;
    }

    setStatus(text, state = '') {
        document.getElementById('statusText').textContent = text;
        document.getElementById('statusDot').className = `status-dot ${state}`;
    }

    async connect() {
        try {
            this.setStatus(t('conn.searching'), 'busy');
            this.device = await navigator.bluetooth.requestDevice({
                // Der Schneideplotter (Snip) nutzt dieselben UUIDs, deshalb zusätzlich nach Namen filtern
                filters: [{ services: [PP1_SERVICE], namePrefix: 'Brother PP1' }],
                optionalServices: [PP1_SERVICE],
            });
            this.device.addEventListener('gattserverdisconnected', () => this.onDisconnect());

            this.log(t('log.deviceChosen', { name: this.device.name || t('log.noName') }));
            const server = await this.device.gatt.connect();
            const service = await server.getPrimaryService(PP1_SERVICE);
            this.writer = await service.getCharacteristic(PP1_WRITER);
            this.reader = await service.getCharacteristic(PP1_READER);

            this.log(t('log.connectedQuery'));
            this.machineTotal = 0;
            try {
                await this.poll();
            } catch (error) {
                this.log(t('log.noAnswer', { msg: error.message }), 'error');
                this.log(t('log.pairingNeeded') + ' ' + t(isLinuxDesktop() ? 'log.pairingDesktop' : 'log.pairingReadme'), 'error');
                this.disconnect();
                return;
            }
            this.setStatus(t('conn.connected', { name: this.device.name || 'PP1' }), 'connected');
            this.startMonitor();
        } catch (error) {
            this.log(t('log.connectFailed', { msg: error.message }), 'error');
            this.setStatus(t('conn.none'), 'error');
        }
        updateButtons();
    }

    disconnect() {
        if (this.device && this.device.gatt.connected) this.device.gatt.disconnect();
    }

    onDisconnect() {
        this.stopMonitor();
        this.writer = null;
        this.reader = null;
        this.status = null;
        this.error = null;
        this.log(t('log.disconnected'));
        this.setStatus(t('conn.none'));
        setMachineStatus('–');
        window.embPreview?.clearMachine();
        updateButtons();
    }

    // Wie in der App immer nur ein Vorgang gleichzeitig auf dem Kanal
    enqueue(run) {
        const result = this.queue.then(run, run);
        this.queue = result.catch(() => {});
        return result;
    }

    async write(cmd, data) {
        const packet = new Uint8Array(2 + data.length);
        packet[0] = (cmd >> 8) & 0xff;
        packet[1] = cmd & 0xff;
        packet.set(data, 2);
        await withTimeout(this.writer.writeValueWithResponse(packet), t('log.write', { cmd }));
    }

    async read() {
        const value = await withTimeout(this.reader.readValue(), t('log.read'));
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }

    // Befehl senden und Antwort lesen (BLEDeviceManager.SendCommand)
    send(cmd, data = []) {
        return this.enqueue(async () => {
            await this.write(cmd, data);
            return this.read();
        });
    }

    // Nur senden (SendCommandNoResponse)
    sendNoResponse(cmd, data) {
        return this.enqueue(() => this.write(cmd, data));
    }

    readOnly() {
        return this.enqueue(() => this.read());
    }

    // Übertragung wie BLEDeviceManager.SendEmbroideryData
    async upload(pen, onProgress) {
        let sum16 = 0;
        for (const b of pen) sum16 = (sum16 + b) & 0xffff;
        const le32 = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];

        for (const chunk of CHUNK_SIZES) {
            await this.send(CMD.EMB_SEWING_DATA_DELETE);
            const info = await this.send(CMD.SEND_DATA_INFO, [3, ...le32(pen.length), sum16 & 0xff, sum16 >> 8]);
            if (info.length < 3 || info[2] !== 0) throw new Error(t('log.uploadRejected', { hex: toHex(info) }));

            try {
                for (let offset = 0; offset < pen.length; offset += chunk) {
                    const part = pen.subarray(offset, offset + chunk);
                    let sum8 = 0;
                    for (const b of part) sum8 = (sum8 + b) & 0xff;
                    await this.sendNoResponse(CMD.SEND_DATA, [...le32(offset), ...part, sum8]);
                    onProgress?.(Math.min(pen.length, offset + chunk) / pen.length);
                }
            } catch (error) {
                this.log(t('log.chunkFailed', { chunk, msg: error.message }));
                continue;
            }

            // Die Maschine meldet 2 (noch beschäftigt), 1 (Fehler) oder 0 (fertig)
            for (let tries = 0; tries < 120; tries++) {
                const ans = await this.readOnly();
                if (ans.length < 3 || ans[2] === 1) throw new Error(t('log.uploadMachineError', { hex: toHex(ans) }));
                if (ans[2] === 0) return chunk;
                await new Promise((r) => setTimeout(r, 1000));
            }
            throw new Error(t('log.uploadNoFinish'));
        }
        throw new Error(t('log.noChunkSize'));
    }

    // Layout senden wie BLETransferGuidanceViewModel: Job.Layout.ToBytes() + PointsToBytes(TL, BR, Mitte).
    // Motiv zentriert, ohne Drehung. Maße in 0,1 mm, Y nach unten, alles int16 LE.
    async sendLayout(widthTenthMm, heightTenthMm) {
        // Die App wählt den 70-mm-Rahmen, wenn das Motiv hineinpasst
        const frame = widthTenthMm <= 700 && heightTenthMm <= 700 ? 0 : 1;
        const data = [
            ...i16(0), ...i16(0),       // MoveX, MoveY
            ...i16(100), ...i16(100),   // SizeX, SizeY in %
            ...i16(0),                  // Rotate in Grad
            0,                          // Flip
            frame,
            ...boxBytes(widthTenthMm, heightTenthMm),
        ];
        const ans = await this.send(CMD.LAYOUT_SEND, data);
        if (ans.length < 2) throw new Error(t('log.noLayoutAnswer'));
        return frame;
    }

    // Probelauf wie MaskTraceViewModel.MaskTrace: Rahmen fährt die Umrandung ab, ohne zu sticken.
    // Ist "Sprungstich schneiden" aus, geht die Umrandung mit (1808), sonst nur [00] (1796).
    async trialRun(widthTenthMm, heightTenthMm) {
        const settings = await this.send(CMD.SETTING_INFO);
        if (settings.length < 4) throw new Error(t('log.settingsUnreadable', { hex: toHex(settings) }));
        const jumpingCut = settings[3];
        return jumpingCut === 0
            ? this.command(t('label.trial'), CMD.MASK_TRACE_BOX, boxBytes(widthTenthMm, heightTenthMm))
            : this.command(t('label.trial'), CMD.MASK_TRACE, [0]);
    }

    // Neue Muster-ID wie Guid.NewGuid().ToByteArray()
    async sendPatternId() {
        const id = crypto.getRandomValues(new Uint8Array(16));
        const ans = await this.send(CMD.EMB_UUID_SEND, [...id]);
        if (ans.length < 3 || ans[2] !== 0) throw new Error(t('log.idRejected', { hex: toHex(ans) }));
    }

    startMonitor() {
        this.stopMonitor();
        let failures = 0;
        const tick = async () => {
            try {
                await this.poll();
                failures = 0;
            } catch (error) {
                this.log(t('log.pollFailed', { msg: error.message }), 'error');
                // Nach einem Timeout hängt der GATT-Kanal meist; sauber trennen statt weiter Fehler zu sammeln
                if (++failures >= 2) {
                    this.log(t('log.pollGiveUp'), 'error');
                    this.disconnect();
                    return;
                }
            }
            if (this.isConnected()) this.monitorTimer = setTimeout(tick, MONITOR_INTERVAL_MS);
        };
        tick();
    }

    stopMonitor() {
        clearTimeout(this.monitorTimer);
        this.monitorTimer = null;
    }

    async poll() {
        const state = await this.send(CMD.MACHINE_STATE);
        if (state.length < 3) return;
        const status = state[2];
        const error = state.length > 4 ? state[4] : 221;
        if (status !== this.status) {
            this.log(t('log.machineStatus', { status: statusText(status) }));
            this.status = status;
        }
        const errText = errorText(error);
        if (errText && error !== this.error) this.log(t('log.machineError', { n: error, text: errText }), 'error');
        this.error = errText ? error : null;
        this.lastError = error;
        setMachineStatus(statusText(status), errText, hintText(status));
        updateButtons();

        if (!SEWING_STATES.has(status)) return;

        if (!this.machineTotal) {
            const info = await this.send(CMD.EMB_SEWING_INFO);
            if (info.length >= 16) {
                const v = new DataView(info.buffer, info.byteOffset + 2);
                this.machineTotal = v.getUint16(10, true);
                const fileTotal = window.embPreview?.stitchCount ?? 0;
                this.log(t('log.machinePattern', { n: this.machineTotal, speed: v.getInt16(12, true) })
                    + (fileTotal && fileTotal !== this.machineTotal ? t('log.machinePatternFile', { n: fileTotal }) : ''));
            }
        }

        const mon = await this.send(CMD.PATTERN_SEWING_INFO);
        if (mon.length >= 12) {
            const v = new DataView(mon.buffer, mon.byteOffset + 2);
            const current = v.getUint16(0, true);
            // Die Maschine zählt die eingefügten Vernähstiche mit, die Vorschau nicht: proportional umrechnen
            const fileTotal = window.embPreview?.stitchCount ?? 0;
            const scaled = this.machineTotal && fileTotal ? Math.round((current * fileTotal) / this.machineTotal) : current;
            window.embPreview?.setMachineProgress(scaled);
        }
    }

    async command(label, cmd, data = []) {
        if (!this.isConnected()) return null;
        try {
            const answer = await this.send(cmd, data);
            // Eine echte Antwort beginnt mit der Befehlsnummer. Sonst hat die Maschine den Befehl
            // in ihrem aktuellen Zustand nicht angenommen (beobachtet: "00 00 00" auf Start im Status Initialisierung).
            if (answer.length < 2 || ((answer[0] << 8) | answer[1]) !== cmd) {
                this.log(t('log.notAccepted', { label, hex: toHex(answer) }), 'error');
                return null;
            }
            const ok = answer.length < 3 || answer[2] === 0;
            this.log(ok ? t('log.cmdOk', { label, hex: toHex(answer) }) : t('log.cmdMachine', { label, code: answer[2], hex: toHex(answer) }), ok ? 'success' : 'error');
            return answer;
        } catch (error) {
            this.log(t('log.cmdFailed', { label, msg: error.message }), 'error');
            return null;
        }
    }
}

const controller = new PP1Controller();

function setMachineStatus(text, error = '', hint = '') {
    document.getElementById('machineStatus').textContent = text;
    const el = document.getElementById('machineError');
    el.textContent = error ? `⚠ ${error}` : '';
    el.hidden = !error;
    const h = document.getElementById('machineHint');
    h.textContent = hint ? `👉 ${hint}` : '';
    h.hidden = !hint;
}

function updateButtons() {
    const connected = controller.isConnected();
    const hasFile = !!window.currentPattern;
    document.getElementById('connectBtn').disabled = connected || !navigator.bluetooth;
    document.getElementById('disconnectBtn').disabled = !connected;
    // Maschinen-Knöpfe erst freigeben, wenn die Maschine mindestens einmal geantwortet hat
    const answered = connected && controller.status !== null;
    for (const el of document.querySelectorAll('.needs-conn, .needs-file')) {
        el.disabled = (el.classList.contains('needs-conn') && !answered)
            || (el.classList.contains('needs-file') && !hasFile);
    }
}

function connectDevice() {
    controller.connect();
}

function disconnect() {
    controller.disconnect();
}

// StartSewing (1806) schickt die Brother-App beim Öffnen der Überwachung und ignoriert die Antwort.
// Beobachtet: Antwort immer "00 00 00", danach wechselt die Maschine auf "Bereit zum Sticken".
// Gestickt wird erst nach Start/Stop an der Maschine.
async function startSewing() {
    if (!controller.isConnected()) return;
    try {
        const ans = await controller.send(CMD.START_SEWING);
        controller.log(t('log.readySent', { hex: toHex(ans) }));
    } catch (error) {
        controller.log(t('log.readyFailed', { msg: error.message }), 'error');
    }
}

function resumeSewing() {
    controller.command(t('label.resume'), CMD.RESUME);
}

async function trialRun() {
    const pattern = window.currentPattern;
    if (!pattern || !controller.isConnected()) return;
    // Die App bietet den Probelauf nicht bei Unterbrechung oder aktivem Fehler an
    if (controller.status === 50) {
        controller.log(t('log.trialInterrupted'), 'error');
        return;
    }
    const { minX, minY, maxX, maxY } = pattern.extents();
    try {
        const ans = await controller.trialRun(maxX - minX, maxY - minY);
        if (ans) controller.log(t('log.trialPrepared'));
    } catch (error) {
        controller.log(t('log.trialFailed', { msg: error.message }), 'error');
    }
}

function hoopAway() {
    controller.command(t('label.hoop'), CMD.HOOP_AVOIDANCE);
}

async function jumpToStep() {
    const step = parseInt(document.getElementById('stepInput').value, 10);
    if (!Number.isInteger(step) || step < 1 || step > 32767) {
        controller.log(t('log.invalidStitch'), 'error');
        return;
    }
    // Die Maschine zählt ab 0 (die App sendet 0 für „von vorn“) und zählt die eingefügten
    // Vernähstiche mit. Die Nummer bezieht sich auf die Vorschau, also umrechnen.
    const fileTotal = window.embPreview?.stitchCount ?? 0;
    const index = controller.machineTotal && fileTotal
        ? Math.min(controller.machineTotal - 1, Math.round(((step - 1) * controller.machineTotal) / fileTotal))
        : step - 1;
    const answer = await controller.command(t('label.jump', { n: step, m: index + 1 }),
        CMD.NEEDLE_MODE_INSTRUCTIONS, [index & 0xff, (index >> 8) & 0xff]);
    if (answer && answer[2] === 0) window.embPreview?.unpin();
}

async function uploadCurrentFile() {
    const pattern = window.currentPattern;
    if (!pattern || !controller.isConnected()) return;
    const btn = document.getElementById('uploadBtn');
    btn.disabled = true;
    controller.stopMonitor();
    try {
        const { minX, minY, maxX, maxY } = pattern.extents();
        const w = maxX - minX, h = maxY - minY; // 0,1 mm
        if (w > 1000 || h > 1000) throw new Error(t('log.tooLarge', { w: w / 10, h: h / 10 }));
        const pen = window.buildPen(pattern);
        controller.log(t('log.uploading', { name: window.currentFile.name, n: pen.length / 4, bytes: pen.length }));
        let lastStep = -1;
        const chunk = await controller.upload(pen, (p) => {
            const step = Math.floor(p * 10);
            if (step !== lastStep) {
                lastStep = step;
                btn.textContent = t('btn.uploading', { p: Math.round(p * 100) });
            }
        });
        const frame = await controller.sendLayout(w, h);
        await controller.sendPatternId();
        controller.log(t('log.uploadDone', { chunk, frame: frame ? 100 : 70 }), 'success');
        controller.log(t('log.uploadSteps'));
        controller.machineTotal = 0;
    } catch (error) {
        controller.log(t('log.uploadFailed', { msg: error.message }), 'error');
    } finally {
        btn.textContent = t('btn.upload');
        controller.startMonitor();
        updateButtons();
    }
}

let bleHintKey = null;

function showBluetoothHelp(key) {
    bleHintKey = key;
    const hint = document.getElementById('bleHint');
    hint.replaceChildren();
    const p = document.createElement('div');
    p.textContent = t(key);
    hint.append(p);
    // Die Flag-Anleitung betrifft nur Chrome; die Desktop-App bringt Web Bluetooth mit
    if (!window.desktop && /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent)) {
        const steps = document.createElement('ol');
        for (const text of [t('ble.flags1'), t('ble.flags2'), t('ble.flags3'), t('ble.flags4')]) {
            const li = document.createElement('li');
            li.textContent = text;
            steps.append(li);
        }
        hint.append(steps);
    }
}

// ---------- Desktop-App (Electron) ----------

const isLinuxDesktop = () => window.desktop?.platform === 'linux';

// Electron hat keinen eigenen Geräte-Dialog; die Liste kommt laufend aus dem Hauptprozess
function setupDeviceDialog() {
    const dialog = document.getElementById('deviceDialog');
    const list = document.getElementById('deviceList');
    const choose = (id) => {
        window.desktop.selectBluetoothDevice(id);
        dialog.close();
    };
    document.getElementById('deviceCancel').addEventListener('click', () => choose(''));
    dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        choose('');
    });
    window.desktop.onBluetoothDevices((devices) => {
        list.replaceChildren();
        for (const d of devices) {
            const btn = document.createElement('button');
            btn.className = 'btn';
            btn.textContent = d.name || d.id;
            btn.addEventListener('click', () => choose(d.id));
            list.append(btn);
        }
        if (!dialog.open) dialog.showModal();
    });
}

async function pairLinux() {
    const btn = document.getElementById('pairBtn');
    btn.disabled = true;
    btn.textContent = t('btn.pairing');
    controller.disconnect();
    try {
        const result = await window.desktop.pairLinux();
        controller.log(result.message, result.ok ? 'success' : 'error');
        if (result.ok) controller.log(t('log.pairNow'));
    } finally {
        btn.disabled = false;
        btn.textContent = t('btn.pair');
    }
}

// Beim Sprachwechsel die Texte neu setzen, die nicht über data-i18n laufen
document.addEventListener('pp1-language', () => {
    if (controller.isConnected()) controller.setStatus(t('conn.connected', { name: controller.device.name || 'PP1' }), 'connected');
    if (controller.status !== null) {
        setMachineStatus(statusText(controller.status), errorText(controller.lastError ?? 221), hintText(controller.status));
    }
    if (bleHintKey) showBluetoothHelp(bleHintKey);
});

document.addEventListener('DOMContentLoaded', async () => {
    if (window.desktop) {
        setupDeviceDialog();
        document.getElementById('pairBtn').hidden = !isLinuxDesktop();
    }
    if (!navigator.bluetooth) {
        showBluetoothHelp('ble.unavailable');
    } else if (navigator.bluetooth.getAvailability && !(await navigator.bluetooth.getAvailability())) {
        showBluetoothHelp('ble.noAdapter');
    }
    updateButtons();
});
