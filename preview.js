// Vorschau, Live-Fortschritt und Zeitstrahl. Lesen der Stickdateien: tsembroidery (Port von pyembroidery, in vendor/)
import { readPes, readJef, readExp, readDst, readVp3, readXxx } from '@guillaumemmm/tsembroidery';
import { patternToPen } from './pen.js';

const READERS = { pes: readPes, jef: readJef, exp: readExp, dst: readDst, vp3: readVp3, xxx: readXxx };

// Koordinaten in tsembroidery-Patterns sind 0,1 mm
const UNITS_PER_MM = 10;
// Fadenstärke für die Darstellung (~0,4 mm)
const THREAD_WIDTH = 4;

const $ = (id) => document.getElementById(id);
const canvas = $('previewCanvas');
const ctx = canvas.getContext('2d');

let model = null;   // { steps, blocks, extents }
let done = 0;       // Anzahl bereits gestickter Stiche (0..steps.length)
let view = null;    // { scale, ox, oy, ghost }
let sim = null;     // Intervall-Handle der Simulation
let pinned = false;  // Nutzer hat eine Stelle gewählt: Maschinenstand überschreibt die Anzeige nicht
let machineDone = null; // letzter von der Maschine gemeldeter Stich (umgerechnet)

// ---------- Datenmodell ----------

function buildModel(pattern) {
    const steps = [];
    const blocks = [];
    let lastThread = null;
    for (const [run, thread] of pattern.getAsStitchblock()) {
        if (thread !== lastThread) {
            blocks.push({ color: thread.hexColor(), name: thread.description || '', start: steps.length, count: 0 });
            lastThread = thread;
        }
        run.forEach(([x, y], i) => steps.push({ x, y, penUp: i === 0, block: blocks.length - 1 }));
        blocks[blocks.length - 1].count += run.length;
    }
    const xs = steps.map((s) => s.x);
    const ys = steps.map((s) => s.y);
    const extents = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    return { steps, blocks, extents };
}

// ---------- Zeitschätzung ----------

function timing() {
    const spm = Math.max(1, Number($('spmInput').value) || 400);
    const changeSec = Math.max(0, Number($('changeInput').value) || 0);
    return { stitchSec: 60 / spm, changeSec };
}

// Geschätzte Zeit (s), bis `n` Stiche fertig sind
function timeAt(n) {
    const { stitchSec, changeSec } = timing();
    if (n <= 0) return 0;
    const block = model.steps[Math.min(n, model.steps.length) - 1].block;
    return n * stitchSec + block * changeSec;
}

const totalTime = () => timeAt(model.steps.length);

function fmt(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} h` : `${m}:${String(s).padStart(2, '0')} min`;
}

// ---------- Zeichnen ----------

function fit() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (!model) return;

    const { minX, maxX, minY, maxY } = model.extents;
    const pad = 24;
    const scale = Math.min((w - 2 * pad) / Math.max(1, maxX - minX), (h - 2 * pad) / Math.max(1, maxY - minY));
    const ox = (w - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = (h - (maxY - minY) * scale) / 2 - minY * scale;

    // Blasse Lage mit dem kompletten Motiv einmal vorberechnen
    const ghost = document.createElement('canvas');
    ghost.width = canvas.width;
    ghost.height = canvas.height;
    const g = ghost.getContext('2d');
    g.scale(dpr, dpr);
    g.globalAlpha = 0.2;
    strokeSteps(g, 0, model.steps.length, scale, ox, oy);

    view = { scale, ox, oy, ghost, dpr };
}

function strokeSteps(c, from, to, scale, ox, oy) {
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.lineWidth = Math.max(1, THREAD_WIDTH * scale);
    let block = -1;
    c.beginPath();
    for (let i = from; i < to; i++) {
        const s = model.steps[i];
        if (s.block !== block) {
            c.stroke();
            c.beginPath();
            c.strokeStyle = model.blocks[s.block].color;
            block = s.block;
            c.moveTo(ox + s.x * scale, oy + s.y * scale);
        } else if (s.penUp) {
            c.moveTo(ox + s.x * scale, oy + s.y * scale);
        } else {
            c.lineTo(ox + s.x * scale, oy + s.y * scale);
        }
    }
    c.stroke();
}

function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!model || !view) return;

    ctx.drawImage(view.ghost, 0, 0);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    strokeSteps(ctx, 0, done, view.scale, view.ox, view.oy);

    // Nadelposition
    const at = model.steps[Math.min(done, model.steps.length - 1)];
    const nx = view.ox + at.x * view.scale;
    const ny = view.oy + at.y * view.scale;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#d64545';
    ctx.beginPath();
    ctx.arc(nx, ny, 7, 0, Math.PI * 2);
    ctx.moveTo(nx - 11, ny);
    ctx.lineTo(nx + 11, ny);
    ctx.moveTo(nx, ny - 11);
    ctx.lineTo(nx, ny + 11);
    ctx.stroke();
}

// ---------- Fortschritt ----------

function setProgress(n) {
    if (!model) return;
    done = Math.max(0, Math.min(model.steps.length, Math.round(n)));
    const total = model.steps.length;
    const t = timeAt(done);

    $('statPercent').textContent = `${((done / total) * 100).toFixed(1)} %`;
    $('statStitch').textContent = `${fmtNumber(done)} / ${fmtNumber(total)}`;
    $('statElapsed').textContent = fmt(t);
    $('statRemaining').textContent = fmt(totalTime() - t);
    $('progressFill').style.width = `${(done / total) * 100}%`;
    $('timelinePlayhead').style.left = `${(t / totalTime()) * 100}%`;
    $('stepSlider').value = done;
    // Ein Feld, in dem gerade getippt wird, nie von außen überschreiben
    if (document.activeElement !== $('stepInput')) $('stepInput').value = Math.min(done + 1, total);
    updatePinHint();

    const current = model.steps[Math.min(done, total - 1)].block;
    $('blockTable').querySelectorAll('tr').forEach((tr, i) => tr.classList.toggle('active', i === current));
    render();
}

// Vom Nutzer gewählte Stelle: bleibt stehen, bis "Live anzeigen" oder ein erfolgreicher Sprung
function userSet(n) {
    pinned = true;
    setProgress(n);
}

// Von der Maschine gemeldeter Stand
function setMachineProgress(n) {
    machineDone = n;
    if (pinned) updatePinHint();
    else setProgress(n);
}

function clearMachine() {
    machineDone = null;
    updatePinHint();
}

function unpin() {
    pinned = false;
    if (machineDone !== null) setProgress(machineDone);
    else updatePinHint();
}

function updatePinHint() {
    const show = pinned && machineDone !== null && !!model;
    $('pinHint').hidden = !show;
    if (show) $('pinText').textContent = t('pin.text', { n: fmtNumber(machineDone + 1) });
}

$('pinLive').addEventListener('click', (e) => {
    e.preventDefault();
    unpin();
});

// ---------- Zeitstrahl ----------

function buildTimeline() {
    const total = totalTime();
    const { changeSec } = timing();
    const track = $('timelineTrack');
    const table = $('blockTable');
    track.replaceChildren();
    table.replaceChildren();

    model.blocks.forEach((b, i) => {
        if (i > 0 && changeSec > 0) {
            const ch = document.createElement('div');
            ch.className = 'tl-change';
            ch.style.width = `${(changeSec / total) * 100}%`;
            ch.title = t('tl.change', { time: fmt(changeSec) });
            track.append(ch);
        }
        const seg = document.createElement('div');
        seg.className = 'tl-seg';
        seg.style.background = b.color;
        seg.style.width = `${((b.count * timing().stitchSec) / total) * 100}%`;
        seg.title = t('tl.block', { i: i + 1, name: b.name ? ` (${b.name})` : '', n: b.count });
        track.append(seg);

        const start = timeAt(b.start) + (i > 0 ? changeSec : 0);
        const tr = document.createElement('tr');
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = b.color;
        const cells = [String(i + 1), '', fmtNumber(b.count), fmt(start), fmt(b.count * timing().stitchSec)];
        for (const text of cells) {
            const td = document.createElement('td');
            td.textContent = text;
            tr.append(td);
        }
        tr.children[1].prepend(swatch);
        tr.children[1].append(b.name || b.color);
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => userSet(b.start));
        table.append(tr);
    });

    const axis = $('timelineAxis');
    axis.replaceChildren();
    const ticks = 5;
    for (let k = 0; k <= ticks; k++) {
        const span = document.createElement('span');
        span.style.left = `${(k / ticks) * 100}%`;
        span.textContent = fmt((total * k) / ticks);
        axis.append(span);
    }
    $('totalTime').textContent = t('tl.total', { time: fmt(total), c: model.blocks.length });
}

// Klick-Position auf dem Zeitstrahl -> Stichindex
function stepAtTime(t) {
    const { stitchSec, changeSec } = timing();
    let acc = 0;
    for (let i = 0; i < model.blocks.length; i++) {
        const b = model.blocks[i];
        if (i > 0) {
            acc += changeSec;
            if (t < acc) return b.start;
        }
        const dur = b.count * stitchSec;
        if (t < acc + dur) return b.start + Math.round((t - acc) / stitchSec);
        acc += dur;
    }
    return model.steps.length;
}

$('timeline').addEventListener('click', (e) => {
    if (!model) return;
    const rect = e.currentTarget.getBoundingClientRect();
    userSet(stepAtTime(((e.clientX - rect.left) / rect.width) * totalTime()));
});

// ---------- Simulation (bis die Maschine echten Fortschritt meldet) ----------

// Simulation folgt der Zeitschätzung (Stiche/min + Fadenwechsel), beschleunigt um den gewählten Faktor
function stopSimulation() {
    clearInterval(sim);
    sim = null;
    $('simBtn').textContent = t('sim.start');
}

function toggleSimulation() {
    if (sim) {
        stopSimulation();
        return;
    }
    if (done >= model.steps.length) setProgress(0);
    $('simBtn').textContent = t('sim.stop');
    pinned = true;
    let simTime = timeAt(done);
    let last = performance.now();
    sim = setInterval(() => {
        const now = performance.now();
        simTime += ((now - last) / 1000) * Number($('simSpeed').value);
        last = now;
        setProgress(Math.max(done, stepAtTime(simTime)));
        if (done >= model.steps.length) stopSimulation();
    }, 40);
}

$('simBtn').addEventListener('click', toggleSimulation);

// ---------- Schrittweise vor/zurück ----------

function step(delta) {
    if (!model) return;
    if (sim) stopSimulation();
    userSet(done + delta);
}

// Zum Anfang der vorigen/nächsten Farbe. Rückwärts: steht man schon am Anfang eines Blocks, geht es zum vorigen.
function stepColor(direction) {
    if (!model) return;
    if (sim) stopSimulation();
    const starts = model.blocks.map((b) => b.start);
    const target = direction > 0
        ? starts.find((s) => s > done) ?? model.steps.length
        : [...starts].reverse().find((s) => s < done) ?? 0;
    userSet(target);
}

$('prevStepBtn').addEventListener('click', () => step(-1));
$('nextStepBtn').addEventListener('click', () => step(1));
$('prevColorBtn').addEventListener('click', () => stepColor(-1));
$('nextColorBtn').addEventListener('click', () => stepColor(1));

document.addEventListener('keydown', (e) => {
    if (!model || e.target.closest?.('input, textarea, select')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        step((e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1));
    }
});

// Dateiinfo links unter der Drop-Zone (bei Sprachwechsel neu aufgebaut)
function renderFileInfo(file) {
    const { minX, maxX, minY, maxY } = model.extents;
    const info = $('fileInfo');
    info.replaceChildren();
    const rows = [
        ['file.name', `${file.name} (${(file.size / 1024).toFixed(1)} KB)`],
        ['file.size', `${((maxX - minX) / UNITS_PER_MM).toFixed(1)} × ${((maxY - minY) / UNITS_PER_MM).toFixed(1)} mm`],
        ['file.stitches', fmtNumber(model.steps.length)],
        ['file.colors', ''],
    ];
    for (const [key, value] of rows) {
        const row = document.createElement('div');
        const l = document.createElement('span');
        l.className = 'info-label';
        l.textContent = t(key);
        row.append(l, value);
        if (key === 'file.colors') {
            for (const b of model.blocks) {
                const sw = document.createElement('span');
                sw.className = 'swatch';
                sw.style.background = b.color;
                sw.title = b.name || b.color;
                row.append(sw);
            }
        }
        info.append(row);
    }
}

// ---------- Datei laden ----------

async function showPreview(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const read = READERS[ext];
    if (!read) {
        controller.log(t('file.unsupported', { ext }), 'error');
        return;
    }

    try {
        const pattern = read(new Uint8Array(await file.arrayBuffer()));
        const next = buildModel(pattern);
        if (next.steps.length === 0) throw new Error(t('file.noStitches'));
        if (sim) stopSimulation();
        model = next;

        const { minX, maxX, minY, maxY } = model.extents;
        const widthMm = (maxX - minX) / UNITS_PER_MM;
        const heightMm = (maxY - minY) / UNITS_PER_MM;

        renderFileInfo(file);

        $('previewEmpty').hidden = true;
        $('stepSlider').max = model.steps.length;
        $('stepSlider').disabled = false;
        $('stepInput').max = model.steps.length;
        $('stepInput').disabled = false;
        $('simBtn').disabled = false;

        window.currentFile = file;
        window.currentPattern = pattern;
        updateButtons();

        fit();
        buildTimeline();
        pinned = false;
        setProgress(0);
        controller.log(t('file.loaded', { name: file.name, n: model.steps.length, c: model.blocks.length, w: widthMm.toFixed(1), h: heightMm.toFixed(1), time: fmt(totalTime()) }), 'success');
    } catch (error) {
        controller.log(t('file.readError', { name: file.name, msg: error.message }), 'error');
        console.error(error);
    }
}

$('previewFileInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) showPreview(e.target.files[0]);
});

const dropZone = $('dropZone');
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) showPreview(e.dataTransfer.files[0]);
});

$('stepSlider').addEventListener('input', (e) => userSet(Number(e.target.value)));
$('stepInput').addEventListener('input', () => { pinned = true; updatePinHint(); });
$('stepInput').addEventListener('change', (e) => userSet(Number(e.target.value) - 1));

for (const id of ['spmInput', 'changeInput']) {
    $(id).addEventListener('input', () => {
        if (!model) return;
        buildTimeline();
        setProgress(done);
    });
}

new ResizeObserver(() => {
    fit();
    render();
}).observe(canvas);

// Sprachwechsel: Dateiinfo, Zeitstrahl und Anzeigen neu aufbauen
document.addEventListener('pp1-language', () => {
    $('simBtn').textContent = t(sim ? 'sim.stop' : 'sim.start');
    if (!model) return;
    renderFileInfo(window.currentFile);
    buildTimeline();
    setProgress(done);
});

// Stichdaten für die Übertragung an die PP1 (siehe pen.js)
window.buildPen = (pattern) => patternToPen(pattern);

// Schnittstelle für die Maschinen-Anbindung: Fortschritt von außen setzen
window.embPreview = {
    showPreview, setProgress, setMachineProgress, unpin, clearMachine,
    get stitchCount() { return model ? model.steps.length : 0; },
    get selected() { return done; },
};
