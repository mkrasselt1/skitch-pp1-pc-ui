// Erzeugt die Stichdaten, die die PP1 per Bluetooth erwartet ("Pen"-Format).
//
// Pen-Format: je Stich 4 Byte, X und Y als int16 LE = Position in 0,1 mm ab Rahmenmitte * 8,
// die unteren 3 Bit sind Befehle: X|3 Farbwechsel, X|5 Ende, Y|1 Transport, Y|2 Fadenschnitt.
//
// Ablauf: Das Muster wird in Bewegungen zerlegt (Sprung zum Start eines Teilstücks, dann Stiche).
// Beim Aufbau kommen Vernähstiche und Schnitte hinzu, danach werden die Vernähstiche in
// Stichrichtung ausgerichtet und alles als absolute Positionen kodiert. Das Ergebnis ist
// byte-identisch mit dem, was die Hersteller-App für dasselbe Muster überträgt.

export const HOOP_TENTHS = 1000; // Rahmen 100 x 100 mm

const LONG_JUMP = 51;     // ab 5,1 mm Sprung: Schnitt und Vernähen
const TIE_LENGTH = 8;     // Vernähstiche 0,8 mm lang
const SHORT_STITCH = 8;   // kürzer als 0,8 mm gilt als kurzer Stich
const DIRECTION_SPAN = 5; // für die Stichrichtung höchstens 5 Bewegungen zusammenfassen

const FLAG_COLOR = 3, FLAG_END = 5;  // in X
const FLAG_FEED = 1, FLAG_CUT = 2;   // in Y

// Halbe Werte von der Null weg runden (wie das Zahlenformat der Hersteller-App)
const roundAway = (v) => Math.sign(v) * Math.floor(Math.abs(v) + 0.5 + 1e-9);
const length = ([x, y]) => Math.trunc(Math.sqrt(x * x + y * y));
const isZero = ([x, y]) => x === 0 && y === 0;

// ---------- Muster -> Farbblöcke mit Teilstücken ----------

// tsembroidery-Pattern (Einheiten 0,1 mm) -> { blocks: [{ color, runs: [[ [x,y], ... ]] }], width, height }
export function patternToBlocks(pattern) {
    const STITCH = 0, COLOR_CHANGE = 5, COLOR_BREAK = 0xe5; // pyembroidery-Konstanten
    const { minX, minY, maxX, maxY } = pattern.extents();
    const blocks = [];
    let block = null;
    let run = null;
    let threadIndex = 0;
    const startBlock = () => {
        const t = pattern.getThreadOrFiller(threadIndex++);
        block = { color: t.hexColor(), runs: [] };
        blocks.push(block);
        run = null;
    };
    for (const [x, y, cmd] of pattern.stitches) {
        const c = cmd & 0xff;
        if (c === STITCH) {
            if (!block) startBlock();
            if (!run) {
                run = [];
                block.runs.push(run);
            }
            run.push([x - minX, y - minY]);
        } else if (c === COLOR_CHANGE || c === COLOR_BREAK) {
            if (block && block.runs.length) startBlock();
        } else {
            run = null; // Sprung, Schnitt, Stopp: neues Teilstück
        }
    }
    for (const b of blocks) b.runs = b.runs.filter((r) => r.length > 1);
    return {
        blocks: blocks.filter((b) => b.runs.length),
        width: maxX - minX,
        height: maxY - minY,
    };
}

// ---------- Aufbau der Bewegungsliste ----------

class MoveBuilder {
    constructor() {
        this.moves = [];        // [dx, dy] in 0,1 mm
        this.colorEnds = [];    // je Farbe: Index der Bewegung nach dem letzten Stich der Farbe
        this.feeds = [];        // Index der Bewegung nach einem Transport
        this.cuts = [];         // Index der Bewegung nach einem Schnitt
        this.tieIns = [];       // Beginn von 4 Vernähstichen nach einem Schnitt
        this.tieOffs = [];      // 2 Vernähstiche direkt vor diesem Index (rückwärts ausgerichtet)
        this.leadIns = [];      // 2 Vernähstiche direkt vor diesem Index (vorwärts ausgerichtet)

        this.newColor = false;       // nächstes Teilstück beginnt eine neue Farbe
        this.awaitingFirst = false;  // Teilstück begonnen, erster Stich steht noch aus
        this.longBefore = false;     // vor dem letzten Sprung lagen lange Stiche
        this.shortJumpCheck = false; // nach kurzem Sprung: die ersten zwei Stiche prüfen
        this.colorSlot = -1;         // Eintrag in colorEnds, der zur laufenden Farbe gehört
    }

    get last() {
        return this.moves[this.moves.length - 1];
    }

    beginColor() {
        this.colorSlot = this.colorEnds.length - 1;
    }

    endColor() {
        this.colorEnds.push(this.moves.length);
        this.newColor = true;
    }

    // Ein Teilstück beginnt; die letzte Bewegung ist der Sprung dorthin
    beginRun() {
        const n = this.moves.length;
        this.awaitingFirst = true;
        if (n < 2) {
            this.longBefore = false;
            this.newColor = true;
            return;
        }
        const jump = this.moves[n - 1];
        this.longBefore = length(this.moves[n - 2]) >= SHORT_STITCH || length(this.moves[n - 3] ?? [0, 0]) >= SHORT_STITCH;
        if (this.newColor) {
            this.colorEnds[this.colorSlot] = this.tieOffBeforeLast();
            this.longBefore = false;
        } else if (this.longBefore && length(jump) >= LONG_JUMP) {
            this.tieOffBeforeLast();
            this.longBefore = false;
        }
    }

    // Zwei Platzhalter vor die letzte Bewegung schieben und dort vernähen
    tieOffBeforeLast() {
        const jump = this.moves.pop();
        this.moves.push([0, 0], [0, 0], jump);
        const at = this.moves.length - 1;
        this.tieOffs.push(at);
        return at;
    }

    add(move) {
        if (isZero(move)) return; // Null-Bewegungen entfallen
        if (this.awaitingFirst) this.firstStitch(move);
        else this.nextMove(move);
    }

    // Erster Stich nach einem Sprung
    firstStitch(move) {
        const n = this.moves.length;
        const jump = this.moves[n - 1] ?? [0, 0];
        const keepColor = move[0] === 0; // Eigenheit: bei X = 0 bleibt "neue Farbe" stehen
        this.feeds.push(n);
        this.awaitingFirst = false;

        if (length(jump) >= LONG_JUMP) {
            if (this.tieIns.length && this.tieIns[this.tieIns.length - 1] === n - 5) {
                // Davor ein leeres Teilstück (nur Vernähstiche): zusammenlegen
                this.moves.splice(n - 5, 5, jump);
                this.tieIns.pop();
                this.cuts.pop();
                this.feeds[this.feeds.length - 1] = n - 4;
            }
            const at = this.moves.length;
            this.tieIns.push(at);
            this.cuts.push(at);
            this.moves.push([0, 0], [0, 0], [0, 0], [0, 0], move);
            this.newColor = false;
            if (!keepColor) this.checkAfterShortJump();
        } else if (n < 2) {
            // Allererster Stich nach kurzem Sprung: vernähen, aber nicht schneiden
            this.tieIns.push(n);
            this.moves.push([0, 0], [0, 0], [0, 0], [0, 0], move);
            this.newColor = false;
            if (!keepColor) this.checkAfterShortJump();
        } else {
            this.moves.push(move);
            this.shortJumpCheck = true;
            if (!keepColor) this.newColor = false;
        }
    }

    nextMove(move) {
        this.moves.push(move);
        this.checkAfterShortJump();
    }

    // Eine offene Prüfung nach kurzem Sprung abschließen. Das Original prüft beim Y-Wert eines Stichs;
    // deshalb läuft sie auch beim ersten Stich nach einem langen Sprung, wenn X nicht 0 ist.
    checkAfterShortJump() {
        if (!this.shortJumpCheck) return;
        this.shortJumpCheck = false;

        // Die beiden Stiche nach einem kurzen Sprung (k = zweiter Stich)
        const k = this.moves.length - 1;
        const [first, second] = [this.moves[k - 1], this.moves[k]];
        if (length(first) < SHORT_STITCH && length(second) < SHORT_STITCH) {
            if (this.longBefore) {
                // Vor dem Sprung vernähen
                const jump = this.moves[k - 2];
                this.moves.splice(k - 2, 1, [0, 0], [0, 0], jump);
                this.tieOffs.push(k);
                this.feeds[this.feeds.length - 1] = k + 1;
                if (this.newColor) this.colorEnds[this.colorSlot] = k;
            }
            this.newColor = false;
        } else if (!this.longBefore) {
            // Am Anfang des Teilstücks vernähen
            this.moves.splice(k - 1, 0, [0, 0], [0, 0]);
            this.leadIns.push(k + 1);
            this.newColor = false;
        }
    }
}

// Alle Bewegungen wie die Hersteller-App aus den Teilstücken erzeugen
function buildMoves({ blocks, width, height }) {
    const b = new MoveBuilder();
    const offX = (HOOP_TENTHS - width) / 2, offY = (HOOP_TENTHS - height) / 2;
    let prev = [0, 0];
    for (const block of blocks) {
        b.beginColor();
        for (const run of block.runs) {
            const start = [run[0][0] + offX, run[0][1] + offY];
            b.add([roundAway(start[0] - prev[0]), roundAway(start[1] - prev[1])]);
            b.beginRun();
            for (let i = 1; i < run.length; i++) {
                b.add([roundAway(run[i][0] - run[i - 1][0]), roundAway(run[i][1] - run[i - 1][1])]);
            }
            const end = run[run.length - 1];
            prev = [end[0] + offX, end[1] + offY];
        }
        b.endColor();
    }
    return b;
}

// ---------- Vernähstiche ausrichten ----------

// Richtung aus bis zu 5 aufeinanderfolgenden Bewegungen: Sobald die Summe 0,8 mm erreicht,
// gilt diese Summe; sonst die längste Teilsumme. "start" ersetzt die längste Teilsumme,
// wenn die erste Bewegung leer ist.
function direction(vectors, start) {
    let sum = [0, 0];
    let best = null;
    let bestLen = 0;
    for (let i = 0; i < DIRECTION_SPAN; i++) {
        const v = vectors[i] ?? [0, 0];
        sum = [sum[0] + v[0], sum[1] + v[1]];
        const len = Math.sqrt(sum[0] * sum[0] + sum[1] * sum[1]);
        if (i === 0) {
            best = len > 0 ? sum : start;
            bestLen = len > 0 ? len : 0;
        } else if (len > bestLen) {
            best = sum;
            bestLen = len;
        }
        if (bestLen >= TIE_LENGTH) return { dir: sum, len: bestLen, best };
    }
    return { dir: best, len: bestLen, best };
}

// Auf 0,8 mm skalieren; ganzzahlig wie die Hersteller-App (gegen null abschneiden)
const toInt = (v) => (Number.isNaN(v) ? 0 : Math.max(-2147483648, Math.min(2147483647, Math.trunc(v))));
function scaled({ dir, len }) {
    return [toInt((dir[0] * TIE_LENGTH) / len), toInt((dir[1] * TIE_LENGTH) / len)];
}

function alignTies(b) {
    const m = b.moves;
    const at = (i) => (i >= 0 && i < m.length ? m[i] : [0, 0]);

    // Nach einem Schnitt: 4 Stiche vor und zurück in Richtung der folgenden Stiche
    for (const s of b.tieIns) {
        if (!b.feeds.includes(s) || s > m.length - 1) continue;
        const [x, y] = scaled(direction([at(s + 4), at(s + 5), at(s + 6), at(s + 7), at(s + 8)], [0, 0]));
        m[s] = [x, y]; m[s + 1] = [-x, -y]; m[s + 2] = [x, y]; m[s + 3] = [-x, -y];
    }

    // Vor einem Sprung: zurück und wieder vor, in Richtung der vorherigen Stiche.
    // Ist die erste Bewegung leer, gilt die Richtung des vorigen Vernähens weiter.
    let carried = [0, 0];
    for (const t of b.tieOffs) {
        if (t < 0 || t > m.length) continue;
        const r = direction([at(t - 3), at(t - 4), at(t - 5), at(t - 6), at(t - 7)], carried);
        carried = r.best;
        const [x, y] = scaled(r);
        m[t - 2] = [-x, -y]; m[t - 1] = [x, y];
    }

    // Am Anfang eines Teilstücks: in Richtung der folgenden Stiche. Eigenheit der Hersteller-App:
    // ohne 0,8 mm Weg wird nur X der längsten Teilsumme genommen, Y stammt vom letzten Vernähen davor.
    let carriedX = 0;
    for (const e of b.leadIns) {
        if (e < 0 || e > m.length) continue;
        const r = direction([at(e), at(e + 1), at(e + 2), at(e + 3), at(e + 4)], [carriedX, 0]);
        carriedX = r.best[0];
        if (r.len < TIE_LENGTH) r.dir = [r.best[0], carried[1]];
        const [x, y] = scaled(r);
        m[e - 2] = [-x, -y]; m[e - 1] = [x, y];
    }
}

// ---------- Kodieren ----------

// Markierungen der Reihe nach abarbeiten: eine Markierung gilt für die Bewegung davor
function marker(list) {
    let i = 0;
    return (k) => {
        if (i < list.length && list[i] - 1 === k) {
            i++;
            return true;
        }
        return false;
    };
}

function encode(b) {
    const m = b.moves;
    const out = new Uint8Array(m.length * 4);
    const isColor = marker(b.colorEnds), isFeed = marker(b.feeds), isCut = marker(b.cuts);
    let x = 0, y = 0;
    for (let k = 0; k < m.length; k++) {
        // Absolute Position ab Rahmenmitte, als int16 wie auf der Maschine
        x = k === 0 ? m[0][0] - HOOP_TENTHS / 2 : x + m[k][0];
        y = k === 0 ? m[0][1] - HOOP_TENTHS / 2 : y + m[k][1];
        x = (x << 16) >> 16;
        y = (y << 16) >> 16;
        let fx = 0, fy = 0;
        if (k === m.length - 1) fx = FLAG_END;
        else if (isColor(k)) fx = FLAG_COLOR;
        if (isFeed(k)) fy |= FLAG_FEED;
        if (isCut(k)) fy |= FLAG_CUT;
        const vx = ((x << 3) | fx) & 0xffff, vy = ((y << 3) | fy) & 0xffff;
        out[4 * k] = vx & 0xff; out[4 * k + 1] = vx >> 8;
        out[4 * k + 2] = vy & 0xff; out[4 * k + 3] = vy >> 8;
    }
    return out;
}

// ---------- Öffentliche Schnittstelle ----------

export function blocksToPen(layout) {
    const b = buildMoves(layout);
    alignTies(b);
    return encode(b);
}

export function patternToPen(pattern) {
    return blocksToPen(patternToBlocks(pattern));
}
