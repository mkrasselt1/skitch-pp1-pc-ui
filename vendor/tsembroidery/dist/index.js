// src/binary.ts
var WHENCE_SET = 0;
var WHENCE_CUR = 1;
var WHENCE_END = 2;
var ByteReader = class {
  constructor(data) {
    this.data = data;
    this.offset = 0;
  }
  get length() {
    return this.data.length;
  }
  tell() {
    return this.offset;
  }
  seek(offset, whence = WHENCE_SET) {
    if (whence === WHENCE_CUR) {
      this.offset += offset;
    } else if (whence === WHENCE_END) {
      this.offset = this.data.length + offset;
    } else {
      this.offset = offset;
    }
    if (this.offset < 0) this.offset = 0;
  }
  read(length2) {
    if (length2 <= 0) return new Uint8Array(0);
    const start = Math.min(this.offset, this.data.length);
    const end = Math.min(start + length2, this.data.length);
    this.offset = end;
    return this.data.subarray(start, end);
  }
  readUInt8() {
    const b = this.read(1);
    return b.length === 1 ? b[0] : null;
  }
};
function signed8(b) {
  if (b > 127) return -256 + b;
  return b;
}
function signed16(v) {
  v &= 65535;
  if (v > 32767) return -65536 + v;
  return v;
}
function readSigned(stream, n) {
  const bytes = stream.read(n);
  const out = [];
  for (const b of bytes) out.push(signed8(b));
  return out;
}
function assemble(bytes, littleEndian) {
  let value = 0;
  if (littleEndian) {
    for (let i = bytes.length - 1; i >= 0; i--) {
      value = value * 256 + bytes[i];
    }
  } else {
    for (let i = 0; i < bytes.length; i++) {
      value = value * 256 + bytes[i];
    }
  }
  return value;
}
function readInt(stream, n, littleEndian) {
  const bytes = stream.read(n);
  return bytes.length === n ? assemble(bytes, littleEndian) : null;
}
function readInt8(stream) {
  return readInt(stream, 1, true);
}
function readInt16le(stream) {
  return readInt(stream, 2, true);
}
function readInt16be(stream) {
  return readInt(stream, 2, false);
}
function readInt24le(stream) {
  return readInt(stream, 3, true);
}
function readInt24be(stream) {
  return readInt(stream, 3, false);
}
function readInt32le(stream) {
  return readInt(stream, 4, true);
}
function readInt32be(stream) {
  return readInt(stream, 4, false);
}
var utf8Decoder = new TextDecoder("utf-8", { fatal: true });
function readString8(stream, length2) {
  const bytes = stream.read(length2);
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    return null;
  }
}

// src/constants.ts
var EmbConstant = {
  NO_COMMAND: -1,
  STITCH: 0,
  JUMP: 1,
  TRIM: 2,
  STOP: 3,
  END: 4,
  COLOR_CHANGE: 5,
  SEQUIN_MODE: 6,
  SEQUIN_EJECT: 7,
  SLOW: 11,
  FAST: 12,
  SEW_TO: 176,
  NEEDLE_AT: 177,
  STITCH_BREAK: 224,
  SEQUENCE_BREAK: 225,
  COLOR_BREAK: 226,
  TIE_ON: 228,
  TIE_OFF: 229,
  FRAME_EJECT: 233,
  MATRIX_TRANSLATE: 192,
  MATRIX_SCALE: 193,
  MATRIX_ROTATE: 194,
  MATRIX_RESET: 195,
  OPTION_ENABLE_TIE_ON: 209,
  OPTION_ENABLE_TIE_OFF: 210,
  OPTION_DISABLE_TIE_ON: 211,
  OPTION_DISABLE_TIE_OFF: 212,
  OPTION_MAX_STITCH_LENGTH: 213,
  OPTION_MAX_JUMP_LENGTH: 214,
  OPTION_EXPLICIT_TRIM: 215,
  OPTION_IMPLICIT_TRIM: 216,
  CONTINGENCY_NONE: 240,
  CONTINGENCY_JUMP_NEEDLE: 241,
  CONTINGENCY_SEW_TO: 242,
  CONTINGENCY_SEQUIN_UTILIZE: 245,
  CONTINGENCY_SEQUIN_JUMP: 246,
  CONTINGENCY_SEQUIN_STITCH: 247,
  CONTINGENCY_SEQUIN_REMOVE: 248,
  COMMAND_MASK: 255,
  FLAGS_MASK: 65280
};

// src/pyMath.ts
function pyRound(x) {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

// src/thread.ts
function colorDistanceRedMean(r1, g1, b1, r2, g2, b2) {
  const redMean = pyRound((r1 + r2) / 2);
  const r = r1 - r2;
  const g = g1 - g2;
  const b = b1 - b2;
  return ((512 + redMean) * r * r >> 8) + 4 * g * g + ((767 - redMean) * b * b >> 8);
}
function findNearestColorIndex(findColor, values) {
  const color = findColor instanceof EmbThread ? findColor.color : findColor;
  const red = color >> 16 & 255;
  const green = color >> 8 & 255;
  const blue = color & 255;
  let closestIndex = -1;
  let currentIndex = -1;
  let currentClosestValue = Infinity;
  for (const t of values) {
    currentIndex += 1;
    if (!t) continue;
    const dist = colorDistanceRedMean(
      red,
      green,
      blue,
      t.getRed(),
      t.getGreen(),
      t.getBlue()
    );
    if (dist <= currentClosestValue) {
      currentClosestValue = dist;
      closestIndex = currentIndex;
    }
  }
  return closestIndex;
}
var EmbThread = class {
  constructor() {
    this.color = 4278190080 >>> 0;
    this.description = null;
    this.catalog_number = null;
    this.details = null;
    this.brand = null;
    this.chart = null;
    this.weight = null;
    this.extras = {};
  }
  setColor(r, g, b) {
    this.color = (4278190080 | (r & 255) << 16 | (g & 255) << 8 | b & 255) >>> 0;
  }
  getOpaqueColor() {
    return (4278190080 | this.color) >>> 0;
  }
  getRed() {
    return this.color >> 16 & 255;
  }
  getGreen() {
    return this.color >> 8 & 255;
  }
  getBlue() {
    return this.color & 255;
  }
  findNearestColorIndex(values) {
    return findNearestColorIndex(this.color, values);
  }
  hexColor() {
    const hex = (n) => n.toString(16).padStart(2, "0");
    return `#${hex(this.getRed())}${hex(this.getGreen())}${hex(this.getBlue())}`;
  }
  // pyembroidery reverses 3-digit hex (#abc -> #ccbbaa); this expands it the CSS way.
  setHexColor(hexString) {
    const h = hexString.replace(/^#+/, "");
    const size = h.length;
    if (size === 6 || size === 8) {
      const value = parseInt(h.substring(0, 6), 16);
      if (Number.isNaN(value)) {
        throw new Error(`setHexColor: invalid hex string "${hexString}"`);
      }
      this.color = value;
    } else if (size === 4 || size === 3) {
      const digits = h.substring(0, 3);
      const value = parseInt(
        digits[0] + digits[0] + digits[1] + digits[1] + digits[2] + digits[2],
        16
      );
      if (Number.isNaN(value)) {
        throw new Error(`setHexColor: invalid hex string "${hexString}"`);
      }
      this.color = value;
    }
  }
};

// src/matrix.ts
function getIdentity() {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}
function getScale(sx, sy = null) {
  const y = sy === null ? sx : sy;
  return [sx, 0, 0, 0, y, 0, 0, 0, 1];
}
function getTranslate(tx, ty) {
  return [1, 0, 0, 0, 1, 0, tx, ty, 1];
}
function getRotate(theta) {
  const tau = Math.PI * 2;
  theta *= tau / 360;
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  return [ct, st, 0, -st, ct, 0, 0, 0, 1];
}
function matrixMultiply(a, b) {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
  ];
}
function pointInMatrixSpace(matrix, v0, v1) {
  if (v1 === void 0) {
    const p = v0;
    const x = p[0] * matrix[0] + p[1] * matrix[3] + 1 * matrix[6];
    const y = p[0] * matrix[1] + p[1] * matrix[4] + 1 * matrix[7];
    if (p.length >= 3) return [x, y, p[2]];
    return [x, y];
  }
  const a = v0;
  return [
    a * matrix[0] + v1 * matrix[3] + 1 * matrix[6],
    a * matrix[1] + v1 * matrix[4] + 1 * matrix[7]
  ];
}
function distanceSquared(x0, y0, x1, y1) {
  let dx = x1 - x0;
  let dy = y1 - y0;
  dx *= dx;
  dy *= dy;
  return dx + dy;
}
function distance(x0, y0, x1, y1) {
  return Math.sqrt(distanceSquared(x0, y0, x1, y1));
}
function towards(a, b, amount) {
  return amount * (b - a) + a;
}
function angleRadians(x0, y0, x1, y1) {
  return Math.atan2(y1 - y0, x1 - x0);
}
function oriented(x0, y0, x1, y1, r) {
  const radians = angleRadians(x0, y0, x1, y1);
  return [x0 + r * Math.cos(radians), y0 + r * Math.sin(radians)];
}

// src/encoder.ts
var {
  NO_COMMAND,
  STITCH,
  JUMP,
  TRIM,
  STOP,
  END,
  COLOR_CHANGE,
  SEQUIN_MODE,
  SEQUIN_EJECT,
  SLOW,
  FAST,
  SEW_TO,
  NEEDLE_AT,
  STITCH_BREAK,
  SEQUENCE_BREAK,
  COLOR_BREAK,
  TIE_OFF,
  TIE_ON,
  FRAME_EJECT,
  MATRIX_TRANSLATE,
  MATRIX_SCALE,
  MATRIX_ROTATE,
  MATRIX_RESET,
  OPTION_ENABLE_TIE_ON,
  OPTION_ENABLE_TIE_OFF,
  OPTION_DISABLE_TIE_ON,
  OPTION_DISABLE_TIE_OFF,
  OPTION_MAX_STITCH_LENGTH,
  OPTION_MAX_JUMP_LENGTH,
  OPTION_EXPLICIT_TRIM,
  OPTION_IMPLICIT_TRIM,
  CONTINGENCY_NONE,
  CONTINGENCY_JUMP_NEEDLE,
  CONTINGENCY_SEW_TO,
  CONTINGENCY_SEQUIN_UTILIZE,
  CONTINGENCY_SEQUIN_JUMP,
  CONTINGENCY_SEQUIN_STITCH,
  CONTINGENCY_SEQUIN_REMOVE
} = EmbConstant;
var BREAKS = /* @__PURE__ */ new Set([JUMP, TRIM, STOP, END, COLOR_CHANGE, STITCH_BREAK, SEQUENCE_BREAK, COLOR_BREAK, FRAME_EJECT]);
var Transcoder = class {
  constructor(settings = {}) {
    this.sourcePattern = null;
    this.destinationPattern = null;
    this.position = 0;
    this.colorIndex = -1;
    this.stitch = null;
    this.stateTrimmed = true;
    this.stateSequinMode = false;
    this.needleX = 0;
    this.needleY = 0;
    this.stateJumping = false;
    this.maxStitch = settings.max_stitch ?? Infinity;
    this.maxJump = settings.max_jump ?? Infinity;
    this.fullJump = settings.full_jump ?? false;
    this.round = settings.round ?? false;
    const stripSequins = settings.strip_sequins ?? true;
    let sequinContingency = stripSequins ? CONTINGENCY_SEQUIN_UTILIZE : CONTINGENCY_SEQUIN_JUMP;
    sequinContingency = settings.sequin_contingency ?? sequinContingency;
    this.sequinContingency = sequinContingency;
    this.stripSpeeds = settings.strip_speeds ?? true;
    this.explicitTrim = settings.explicit_trim ?? true;
    this.hasTieOn = settings.tie_on ?? false;
    this.hasTieOff = settings.tie_off ?? false;
    this.longStitchContingency = settings.long_stitch_contingency ?? CONTINGENCY_JUMP_NEEDLE;
    this.matrix = getIdentity();
    const translate = settings.translate;
    if (translate !== null && translate !== void 0) {
      this.applyTranslate(translate);
    }
    const scale = settings.scale;
    if (scale !== null && scale !== void 0) {
      this.applyScale(scale);
    }
    const rotate = settings.rotate;
    if (rotate !== null && rotate !== void 0) {
      if (typeof rotate !== "number") {
        throw new TypeError("rotate must be a number of degrees");
      }
      this.matrix = matrixMultiply(this.matrix, getRotate(rotate));
    }
  }
  applyTranslate(translate) {
    if (Array.isArray(translate)) {
      if (translate.length >= 2) {
        this.matrix = matrixMultiply(
          this.matrix,
          getTranslate(translate[0], translate[1])
        );
        return;
      }
      const point = translate;
      if (typeof point.x === "number" && typeof point.y === "number") {
        this.matrix = matrixMultiply(
          this.matrix,
          getTranslate(point.x, point.y)
        );
      }
      return;
    }
    if (typeof translate === "object") {
      const point = translate;
      if (typeof point.x === "number" && typeof point.y === "number") {
        this.matrix = matrixMultiply(
          this.matrix,
          getTranslate(point.x, point.y)
        );
      }
      return;
    }
    throw new TypeError(
      "translate must be [x, y] or {x, y} (python raises TypeError for scalars here)"
    );
  }
  applyScale(scale) {
    if (typeof scale === "number") {
      this.matrix = matrixMultiply(this.matrix, getScale(scale, scale));
      return;
    }
    if (Array.isArray(scale)) {
      if (scale.length >= 2) {
        this.matrix = matrixMultiply(
          this.matrix,
          getScale(scale[0], scale[1])
        );
        return;
      }
      throw new TypeError("scale: cannot build a matrix from a short array");
    }
    if (typeof scale === "object") {
      const point = scale;
      if (typeof point.x === "number" && typeof point.y === "number") {
        this.matrix = matrixMultiply(this.matrix, getScale(point.x, point.y));
        return;
      }
      throw new TypeError("scale: cannot build a matrix from this value");
    }
    throw new TypeError("scale: cannot build a matrix from this value");
  }
  transcode(sourcePattern, destinationPattern) {
    this.sourcePattern = sourcePattern;
    this.destinationPattern = destinationPattern;
    this.transcodeMetadata();
    this.transcodeThreads();
    this.transcodeStitches();
    return destinationPattern;
  }
  transcodeMetadata() {
    const source = this.sourcePattern.extras;
    const dest = this.destinationPattern.extras;
    Object.assign(dest, source);
  }
  transcodeThreads() {
    const source = this.sourcePattern.threadlist;
    const dest = this.destinationPattern.threadlist;
    dest.push(...source);
  }
  transcodeStitches() {
    const source = this.sourcePattern.stitches;
    this.stateTrimmed = true;
    this.needleX = 0;
    this.needleY = 0;
    this.position = 0;
    this.colorIndex = -1;
    let flags = NO_COMMAND;
    for (const [index, stitch] of source.entries()) {
      this.position = index;
      this.stitch = stitch;
      const p = pointInMatrixSpace(this.matrix, stitch);
      const x = this.round ? pyRound(p[0]) : p[0];
      const y = this.round ? pyRound(p[1]) : p[1];
      flags = stitch[2];
      if (flags === NO_COMMAND) {
        continue;
      } else if (flags === STITCH) {
        if (this.stateTrimmed) {
          this.jumpToWithinStitchrange(x, y);
          this.stitchAt(x, y);
          if (this.hasTieOn) this.tieOn();
        } else if (this.stateJumping) {
          this.needleTo(x, y);
          this.stateJumping = false;
        } else {
          this.stitchWithContingency(x, y);
        }
      } else if (flags === NEEDLE_AT) {
        if (this.stateTrimmed) {
          this.jumpToWithinStitchrange(x, y);
          this.stitchAt(x, y);
          if (this.hasTieOn) this.tieOn();
        } else if (this.stateJumping) {
          this.needleTo(x, y);
          this.stateJumping = false;
        } else {
          this.needleTo(x, y);
        }
      } else if (flags === SEW_TO) {
        if (this.stateTrimmed) {
          this.jumpToWithinStitchrange(x, y);
          this.stitchAt(x, y);
          if (this.hasTieOn) this.tieOn();
        } else if (this.stateJumping) {
          this.needleTo(x, y);
          this.stateJumping = false;
        } else {
          this.sewTo(x, y);
        }
      } else if (flags === STITCH_BREAK) {
        this.stateJumping = true;
      } else if (flags === FRAME_EJECT) {
        this.tieOffAndTrimIfNeeded();
        this.jumpTo(x, y);
        this.stopHere();
      } else if (flags === SEQUENCE_BREAK) {
        this.tieOffAndTrimIfNeeded();
      } else if (flags === COLOR_BREAK) {
        this.colorBreak();
      } else if (flags === TIE_OFF) {
        this.tieOff();
      } else if (flags === TIE_ON) {
        this.tieOn();
      } else if (flags === TRIM) {
        this.tieOffAndTrimIfNeeded();
      } else if (flags === JUMP) {
        if (!this.stateJumping) {
          this.jumpTo(x, y);
        }
      } else if (flags === SEQUIN_MODE) {
        this.toggleSequins();
      } else if (flags === SEQUIN_EJECT) {
        if (this.stateTrimmed) {
          this.jumpToWithinStitchrange(x, y);
          this.stitchAt(x, y);
          if (this.hasTieOn) this.tieOn();
        }
        if (!this.stateSequinMode) this.toggleSequins();
        this.sequinAt(x, y);
      } else if (flags === COLOR_CHANGE) {
        this.tieOffTrimColorChange();
      } else if (flags === STOP) {
        this.stopHere();
      } else if (flags === SLOW) {
        this.slowCommandHere();
      } else if (flags === FAST) {
        this.fastCommandHere();
      } else if (flags === END) {
        this.endHere();
        break;
      } else if (flags === OPTION_ENABLE_TIE_ON) {
        this.hasTieOn = true;
      } else if (flags === OPTION_ENABLE_TIE_OFF) {
        this.hasTieOff = true;
      } else if (flags === OPTION_DISABLE_TIE_ON) {
        this.hasTieOn = false;
      } else if (flags === OPTION_DISABLE_TIE_OFF) {
        this.hasTieOff = false;
      } else if (flags === OPTION_MAX_JUMP_LENGTH) {
        this.maxJump = stitch[0];
      } else if (flags === OPTION_MAX_STITCH_LENGTH) {
        this.maxStitch = stitch[0];
      } else if (flags === OPTION_EXPLICIT_TRIM) {
        this.explicitTrim = true;
      } else if (flags === OPTION_IMPLICIT_TRIM) {
        this.explicitTrim = false;
      } else if (flags === CONTINGENCY_NONE) {
        this.longStitchContingency = CONTINGENCY_NONE;
      } else if (flags === CONTINGENCY_JUMP_NEEDLE) {
        this.longStitchContingency = CONTINGENCY_JUMP_NEEDLE;
      } else if (flags === CONTINGENCY_SEW_TO) {
        this.longStitchContingency = CONTINGENCY_SEW_TO;
      } else if (flags === CONTINGENCY_SEQUIN_REMOVE) {
        if (this.stateSequinMode) this.toggleSequins();
        this.sequinContingency = CONTINGENCY_SEQUIN_REMOVE;
      } else if (flags === CONTINGENCY_SEQUIN_STITCH) {
        if (this.stateSequinMode) this.toggleSequins();
        this.sequinContingency = CONTINGENCY_SEQUIN_STITCH;
      } else if (flags === CONTINGENCY_SEQUIN_JUMP) {
        if (this.stateSequinMode) this.toggleSequins();
        this.sequinContingency = CONTINGENCY_SEQUIN_JUMP;
      } else if (flags === CONTINGENCY_SEQUIN_UTILIZE) {
        this.sequinContingency = CONTINGENCY_SEQUIN_UTILIZE;
      } else if (flags === MATRIX_TRANSLATE) {
        this.matrix = matrixMultiply(
          this.matrix,
          getTranslate(stitch[0], stitch[1])
        );
      } else if (flags === MATRIX_SCALE) {
        this.matrix = matrixMultiply(
          this.matrix,
          getScale(stitch[0], stitch[1])
        );
      } else if (flags === MATRIX_ROTATE) {
        this.matrix = matrixMultiply(
          this.matrix,
          getRotate(stitch[0])
        );
      } else if (flags === MATRIX_RESET) {
        this.matrix = getIdentity();
      }
    }
    if (flags !== END) {
      this.endHere();
    }
  }
  updateNeedlePosition(x, y) {
    this.needleX = x;
    this.needleY = y;
  }
  declareNotTrimmed() {
    if (this.stateTrimmed) {
      this.stateTrimmed = false;
      if (this.colorIndex === -1) {
        this.colorIndex = 0;
      }
    }
  }
  add(flags, x = null, y = null) {
    const ax = x === null ? this.needleX : x;
    const ay = y === null ? this.needleY : y;
    this.destinationPattern.stitches.push([ax, ay, flags]);
  }
  lookaheadStitch() {
    const source = this.sourcePattern.stitches;
    for (let pos = this.position; pos < source.length; pos++) {
      const flags = source[pos][2];
      if (flags === STITCH || flags === NEEDLE_AT || flags === SEW_TO || flags === TIE_ON || flags === SEQUIN_EJECT) {
        return true;
      } else if (flags === END) {
        return false;
      }
    }
    return false;
  }
  colorBreak() {
    if (this.colorIndex < 0) {
      return;
    }
    if (!this.stateTrimmed) {
      if (this.hasTieOff) this.tieOff();
      if (this.explicitTrim) this.trimHere();
    }
    if (!this.lookaheadStitch()) {
      return;
    }
    this.add(COLOR_CHANGE);
    this.colorIndex += 1;
    this.stateTrimmed = true;
  }
  tieOffTrimColorChange() {
    if (!this.stateTrimmed) {
      if (this.hasTieOff) this.tieOff();
      if (this.explicitTrim) this.trimHere();
    }
    this.add(COLOR_CHANGE);
    this.colorIndex += 1;
    this.stateTrimmed = true;
  }
  tieOffAndTrimIfNeeded() {
    if (!this.stateTrimmed) {
      this.tieOffAndTrim();
    }
  }
  tieOffAndTrim() {
    if (this.hasTieOff) this.tieOff();
    this.trimHere();
  }
  tieOff() {
    const source = this.sourcePattern.stitches;
    for (let offset = 1; offset <= source.length; offset += 1) {
      let index = this.position - offset;
      if (index < 0) index += source.length;
      const b = pointInMatrixSpace(this.matrix, source[index]);
      const flags = b[2];
      if (flags === STITCH || flags === NEEDLE_AT || flags === SEW_TO || flags === SEQUIN_EJECT) {
        if (b[0] !== this.needleX || b[1] !== this.needleY) {
          this.lockStitch(this.needleX, this.needleY, b[0], b[1], this.maxStitch);
          return;
        }
      } else if (BREAKS.has(flags)) {
        return;
      }
    }
  }
  tieOn() {
    const source = this.sourcePattern.stitches;
    const next = source[this.position + 1];
    if (next === void 0) {
      return;
    }
    const b = pointInMatrixSpace(this.matrix, next);
    const flags = b[2];
    if (flags === STITCH || flags === NEEDLE_AT || flags === SEW_TO || flags === SEQUIN_EJECT) {
      this.lockStitch(this.needleX, this.needleY, b[0], b[1], this.maxStitch);
    }
  }
  trimHere() {
    if (this.stateSequinMode) {
      this.toggleSequins();
    }
    this.add(TRIM);
    this.stateTrimmed = true;
  }
  toggleSequins() {
    const contingency = this.sequinContingency;
    if (contingency === CONTINGENCY_SEQUIN_UTILIZE) {
      this.add(SEQUIN_MODE);
      this.stateSequinMode = !this.stateSequinMode;
    }
  }
  jumpToWithinStitchrange(newX, newY) {
    const x0 = this.needleX;
    const y0 = this.needleY;
    const maxLength = this.maxJump;
    this.interpolateGapStitches(x0, y0, newX, newY, maxLength, JUMP);
    if (this.fullJump) {
      if (this.needleX !== newX || this.needleY !== newY) {
        this.jumpAt(newX, newY);
      }
    }
  }
  jumpTo(newX, newY) {
    const x0 = this.needleX;
    const y0 = this.needleY;
    const maxLength = this.maxJump;
    this.interpolateGapStitches(x0, y0, newX, newY, maxLength, JUMP);
    this.jumpAt(newX, newY);
  }
  jumpAt(newX, newY) {
    if (this.stateSequinMode) {
      this.toggleSequins();
    }
    this.add(JUMP, newX, newY);
    this.updateNeedlePosition(newX, newY);
  }
  stitchWithContingency(newX, newY) {
    if (this.longStitchContingency === CONTINGENCY_SEW_TO) {
      this.sewTo(newX, newY);
    } else if (this.longStitchContingency === CONTINGENCY_JUMP_NEEDLE) {
      this.needleTo(newX, newY);
    } else {
      this.stitchAt(newX, newY);
    }
  }
  sewTo(newX, newY) {
    const x0 = this.needleX;
    const y0 = this.needleY;
    const maxLength = this.maxStitch;
    this.interpolateGapStitches(x0, y0, newX, newY, maxLength, STITCH);
    this.stitchAt(newX, newY);
  }
  needleTo(newX, newY) {
    const x0 = this.needleX;
    const y0 = this.needleY;
    const maxLength = this.maxStitch;
    this.interpolateGapStitches(x0, y0, newX, newY, maxLength, JUMP);
    this.stitchAt(newX, newY);
  }
  stitchAt(newX, newY) {
    this.add(STITCH, newX, newY);
    this.updateNeedlePosition(newX, newY);
    this.declareNotTrimmed();
  }
  sequinAt(newX, newY) {
    const contingency = this.sequinContingency;
    if (contingency === CONTINGENCY_SEQUIN_UTILIZE) {
      this.add(SEQUIN_EJECT, newX, newY);
    } else if (contingency === CONTINGENCY_SEQUIN_JUMP) {
      this.add(JUMP, newX, newY);
    } else if (contingency === CONTINGENCY_SEQUIN_STITCH) {
      this.add(STITCH, newX, newY);
    } else if (contingency === CONTINGENCY_SEQUIN_REMOVE) {
      return;
    }
    this.updateNeedlePosition(newX, newY);
    this.declareNotTrimmed();
  }
  slowCommandHere() {
    if (!this.stripSpeeds) {
      this.add(SLOW);
    }
  }
  fastCommandHere() {
    if (!this.stripSpeeds) {
      this.add(FAST);
    }
  }
  stopHere() {
    this.add(STOP);
    this.stateTrimmed = true;
  }
  endHere() {
    this.add(END);
    this.stateTrimmed = true;
  }
  colorChangeHere() {
    this.add(COLOR_CHANGE);
    this.colorIndex += 1;
    this.stateTrimmed = true;
  }
  positionWillExceedConstraint(length2 = null, newX = null, newY = null) {
    const limit = length2 === null ? this.maxStitch : length2;
    if (newX === null || newY === null) {
      const stitch = this.stitch;
      const p = pointInMatrixSpace(this.matrix, stitch[0], stitch[1]);
      newX = p[0];
      newY = p[1];
    }
    const distanceX = newX - this.needleX;
    const distanceY = newY - this.needleY;
    return Math.abs(distanceX) > limit || Math.abs(distanceY) > limit;
  }
  interpolateGapStitches(x0, y0, x1, y1, maxLength, data) {
    const transcode = this.destinationPattern.stitches;
    const distanceX = x1 - x0;
    const distanceY = y1 - y0;
    if (Math.abs(distanceX) > maxLength || Math.abs(distanceY) > maxLength) {
      if (data === JUMP && this.stateSequinMode) {
        this.toggleSequins();
      }
      const stepsX = Math.ceil(Math.abs(distanceX / (maxLength * 1)));
      const stepsY = Math.ceil(Math.abs(distanceY / (maxLength * 1)));
      const steps = stepsX > stepsY ? stepsX : stepsY;
      const stepSizeX = distanceX / steps;
      const stepSizeY = distanceY / steps;
      let qx = x0;
      let qy = y0;
      for (let q = 1; q < steps; q++) {
        qx += stepSizeX;
        qy += stepSizeY;
        const stitch = [qx, qy, data];
        transcode.push(stitch);
        this.updateNeedlePosition(stitch[0], stitch[1]);
      }
    }
  }
  lockStitch(x, y, anchorX, anchorY, maxLength = null) {
    const limit = maxLength === null ? this.maxStitch : maxLength;
    const transcode = this.destinationPattern.stitches;
    let length2 = distance(x, y, anchorX, anchorY);
    if (length2 > limit) {
      const p = oriented(x, y, anchorX, anchorY, limit);
      anchorX = p[0];
      anchorY = p[1];
    }
    for (const amount of [0.33, 0.66, 0.33, 0]) {
      transcode.push([
        towards(x, anchorX, amount),
        towards(y, anchorY, amount),
        STITCH
      ]);
    }
  }
};

// src/pattern.ts
function sameThread(a, b) {
  return a === b || (a.color & 16777215) === (b.color & 16777215) && a.description === b.description && a.catalog_number === b.catalog_number && a.details === b.details && a.brand === b.brand && a.chart === b.chart && a.weight === b.weight;
}
var EmbPattern = class _EmbPattern {
  constructor() {
    this.stitches = [];
    this.threadlist = [];
    this.extras = {};
    this._previousX = 0;
    this._previousY = 0;
    this.extends = this.extents;
  }
  move(dx = 0, dy = 0) {
    this.addStitchRelative(EmbConstant.JUMP, dx, dy);
  }
  moveAbs(x, y) {
    this.addStitchAbsolute(EmbConstant.JUMP, x, y);
  }
  stitch(dx = 0, dy = 0) {
    this.addStitchRelative(EmbConstant.STITCH, dx, dy);
  }
  stitchAbs(x, y) {
    this.addStitchAbsolute(EmbConstant.STITCH, x, y);
  }
  stop(dx = 0, dy = 0) {
    this.addStitchRelative(EmbConstant.STOP, dx, dy);
  }
  trim(dx = 0, dy = 0) {
    this.addStitchRelative(EmbConstant.TRIM, dx, dy);
  }
  colorChange(dx = 0, dy = 0) {
    this.addStitchRelative(EmbConstant.COLOR_CHANGE, dx, dy);
  }
  sequinEject(dx = 0, dy = 0) {
    this.addStitchRelative(EmbConstant.SEQUIN_EJECT, dx, dy);
  }
  sequinMode(dx = 0, dy = 0) {
    this.addStitchRelative(EmbConstant.SEQUIN_MODE, dx, dy);
  }
  end(dx = 0, dy = 0) {
    this.addStitchRelative(EmbConstant.END, dx, dy);
  }
  addThread(thread) {
    if (thread instanceof EmbThread) {
      this.threadlist.push(thread);
      return;
    }
    if (typeof thread === "number") {
      const threadObject2 = new EmbThread();
      threadObject2.color = thread;
      this.threadlist.push(threadObject2);
      return;
    }
    const spec = thread;
    const threadObject = new EmbThread();
    if (spec.name) threadObject.description = spec.name;
    if (spec.description) threadObject.description = spec.description;
    if (spec.desc) threadObject.description = spec.desc;
    if (spec.brand) threadObject.brand = spec.brand;
    if (spec.manufacturer) threadObject.brand = spec.manufacturer;
    const color = spec.color !== void 0 ? spec.color : spec.rgb;
    if (color !== void 0) {
      if (typeof color === "number") {
        threadObject.color = color;
      } else if (typeof color === "string") {
        if (color === "random") {
          threadObject.color = (4278190080 | Math.floor(Math.random() * 16777216)) >>> 0;
        }
        if (color[0] === "#") threadObject.setHexColor(color.substring(1));
      } else if (Array.isArray(color)) {
        threadObject.color = (color[0] & 255) << 16 | (color[1] & 255) << 8 | color[2] & 255;
      }
    }
    if (spec.hex) threadObject.setHexColor(spec.hex);
    if (spec.id) threadObject.catalog_number = spec.id;
    if (spec.catalog) threadObject.catalog_number = spec.catalog;
    this.threadlist.push(threadObject);
  }
  metadata(name, data) {
    this.extras[name] = data;
  }
  getMetadata(name, fallback) {
    return this.extras[name] !== void 0 ? this.extras[name] : fallback;
  }
  addStitchAbsolute(cmd, x = 0, y = 0) {
    this.stitches.push([x, y, cmd]);
    this._previousX = x;
    this._previousY = y;
  }
  addStitchRelative(cmd, dx = 0, dy = 0) {
    const x = this._previousX + dx;
    const y = this._previousY + dy;
    this.addStitchAbsolute(cmd, x, y);
  }
  /** Appends without moving the relative-position cursor. */
  addCommand(cmd, x = 0, y = 0) {
    this.stitches.push([x, y, cmd]);
  }
  /** Inserts a command relative to the stitch before `position`. */
  insertStitchRelative(position, cmd, dx = 0, dy = 0) {
    if (position < 0) position += this.stitches.length;
    if (position === 0) {
      this.stitches.unshift([dx, dy, cmd]);
    } else if (position === this.stitches.length) {
      this.addStitchRelative(cmd, dx, dy);
    } else if (position > 0 && position < this.stitches.length) {
      const [x, y] = this.stitches[position - 1];
      this.stitches.splice(position, 0, [x + dx, y + dy, cmd]);
    }
  }
  addStitchblock(stitchblock) {
    const threadlist = this.threadlist;
    const block2 = stitchblock[0];
    const thread = stitchblock[1];
    if (threadlist.length === 0 || thread !== threadlist[threadlist.length - 1]) {
      threadlist.push(thread);
      this.addStitchRelative(EmbConstant.COLOR_BREAK);
    } else {
      this.addStitchRelative(EmbConstant.SEQUENCE_BREAK);
    }
    for (const stitch of block2) {
      this.addStitchAbsolute(stitch[2], stitch[0], stitch[1]);
    }
  }
  extents() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const stitch of this.stitches) {
      if (stitch[0] > maxX) maxX = stitch[0];
      if (stitch[0] < minX) minX = stitch[0];
      if (stitch[1] > maxY) maxY = stitch[1];
      if (stitch[1] < minY) minY = stitch[1];
    }
    return { minX, minY, maxX, maxY };
  }
  countStitchCommands(command) {
    let count = 0;
    for (const stitch of this.stitches) {
      if (stitch[2] === command) count += 1;
    }
    return count;
  }
  countColorChanges() {
    return this.countStitchCommands(EmbConstant.COLOR_CHANGE);
  }
  countStitches() {
    return this.stitches.length;
  }
  countThreads() {
    return this.threadlist.length;
  }
  static getRandomThread() {
    const thread = new EmbThread();
    thread.color = (4278190080 | Math.floor(Math.random() * 16777216)) >>> 0;
    thread.description = "Random";
    return thread;
  }
  /** Missing threads get a fresh black filler (pyembroidery uses a random color). */
  getThreadOrFiller(index) {
    if (this.threadlist.length <= index) return _EmbPattern.getFillerThread();
    return this.threadlist[index];
  }
  static getFillerThread() {
    const thread = new EmbThread();
    thread.setColor(0, 0, 0);
    thread.description = "Filler";
    return thread;
  }
  *getAsStitchblock() {
    let stitchblock = [];
    let thread = this.getThreadOrFiller(0);
    let threadIndex = 1;
    let stitched = false;
    for (const stitch of this.stitches) {
      const flags = stitch[2];
      if (flags === EmbConstant.STITCH) {
        stitchblock.push(stitch);
        stitched = true;
      } else {
        if (stitchblock.length > 0) {
          yield [stitchblock, thread];
          stitchblock = [];
        }
        if (flags === EmbConstant.COLOR_CHANGE || flags === EmbConstant.COLOR_BREAK && stitched) {
          thread = this.getThreadOrFiller(threadIndex);
          threadIndex += 1;
        }
      }
    }
    if (stitchblock.length > 0) yield [stitchblock, thread];
  }
  *getAsCommandBlocks() {
    let lastPos = 0;
    let lastCommand = EmbConstant.NO_COMMAND;
    for (let pos = 0; pos < this.stitches.length; pos++) {
      const stitch = this.stitches[pos];
      const command = stitch[2];
      if (command === lastCommand || lastCommand === EmbConstant.NO_COMMAND) {
        lastCommand = command;
        continue;
      }
      lastCommand = command;
      yield this.stitches.slice(lastPos, pos);
      lastPos = pos;
    }
    yield this.stitches.slice(lastPos);
  }
  *getAsColorblocks() {
    let threadIndex = 0;
    let lastPos = 0;
    let afterBreak = false;
    let thread;
    for (let pos = 0; pos < this.stitches.length; pos++) {
      const command = this.stitches[pos][2];
      if (command === EmbConstant.COLOR_BREAK) {
        if (lastPos !== pos) {
          thread = this.getThreadOrFiller(threadIndex);
          threadIndex += 1;
          yield [this.stitches.slice(lastPos, pos), thread];
        }
        lastPos = pos + 1;
        afterBreak = true;
        continue;
      }
      if (command !== EmbConstant.COLOR_CHANGE) continue;
      thread = this.getThreadOrFiller(threadIndex);
      threadIndex += 1;
      yield [this.stitches.slice(lastPos, pos), thread];
      lastPos = pos;
      afterBreak = false;
    }
    if (afterBreak && lastPos === this.stitches.length) return;
    thread = this.getThreadOrFiller(threadIndex);
    yield [this.stitches.slice(lastPos), thread];
  }
  getUniqueThreadlist() {
    return [...new Set(this.threadlist)];
  }
  getSingletonThreadlist() {
    const singleton = [];
    let lastThread = null;
    for (const thread of this.threadlist) {
      if (thread !== lastThread) singleton.push(thread);
      lastThread = thread;
    }
    return singleton;
  }
  moveCenterToOrigin() {
    const extents = this.extents();
    const cx = pyRound((extents.maxX + extents.minX) / 2);
    const cy = pyRound((extents.maxY + extents.minY) / 2);
    this.translate(-cx, -cy);
  }
  translate(dx, dy) {
    for (const stitch of this.stitches) {
      stitch[0] += dx;
      stitch[1] += dy;
    }
  }
  fixColorCount() {
    let threadIndex = 0;
    let initColor = true;
    for (const stitch of this.stitches) {
      const data = stitch[2] & EmbConstant.COMMAND_MASK;
      if (data === EmbConstant.STITCH || data === EmbConstant.SEW_TO || data === EmbConstant.NEEDLE_AT) {
        if (initColor) {
          threadIndex += 1;
          initColor = false;
        }
      } else if (data === EmbConstant.COLOR_CHANGE || data === EmbConstant.COLOR_BREAK) {
        initColor = true;
      }
    }
    while (this.threadlist.length < threadIndex) {
      this.addThread(this.getThreadOrFiller(this.threadlist.length));
    }
  }
  /**
   * Adds a TRIM before runs of `jumpsToRequireTrim` jumps, or of jumps going further than
   * `distanceToRequireTrim`, and drops runs of jumps that end where they started (with `clipping`).
   * Formats without a trim command (like DST) encode trims this way.
   */
  interpolateTrims(jumpsToRequireTrim = null, distanceToRequireTrim = null, clipping = true) {
    let i = -1;
    let ie = this.stitches.length - 1;
    let x = 0;
    let y = 0;
    let jumpCount = 0;
    let jumpStart = 0;
    let jumpDx = 0;
    let jumpDy = 0;
    let jumping = false;
    let trimmed = true;
    while (i < ie) {
      i += 1;
      const stitch = this.stitches[i];
      const dx = stitch[0] - x;
      const dy = stitch[1] - y;
      [x, y] = stitch;
      const command = stitch[2] & EmbConstant.COMMAND_MASK;
      if (command === EmbConstant.STITCH || command === EmbConstant.SEQUIN_EJECT) {
        trimmed = false;
        jumping = false;
      } else if (command === EmbConstant.COLOR_CHANGE || command === EmbConstant.TRIM) {
        trimmed = true;
        jumping = false;
      }
      if (command !== EmbConstant.JUMP) continue;
      if (!jumping) {
        [jumpDx, jumpDy, jumpCount, jumpStart] = [0, 0, 0, i];
        jumping = true;
      }
      jumpCount += 1;
      jumpDx += dx;
      jumpDy += dy;
      if (!trimmed && (jumpCount === jumpsToRequireTrim || distanceToRequireTrim !== null && (Math.abs(jumpDy) > distanceToRequireTrim || Math.abs(jumpDx) > distanceToRequireTrim))) {
        this.insertStitchRelative(jumpStart, EmbConstant.TRIM);
        jumpStart += 1;
        i += 1;
        ie += 1;
        trimmed = true;
      }
      if (clipping && jumpDx === 0 && jumpDy === 0) {
        this.stitches.splice(jumpStart, i + 1 - jumpStart);
        i = jumpStart - 1;
        ie = this.stitches.length - 1;
      }
    }
  }
  convertJumpsToTrim(jumpsToRequireTrim = 3) {
    const tempPattern = new _EmbPattern();
    let i = -1;
    const ie = this.stitches.length - 1;
    let count = 0;
    let trimmed = true;
    while (i < ie) {
      i += 1;
      let stitch = this.stitches[i];
      let command = stitch[2];
      if (command === EmbConstant.STITCH || command === EmbConstant.SEQUIN_EJECT) {
        trimmed = false;
      } else if (command === EmbConstant.COLOR_CHANGE || command === EmbConstant.TRIM) {
        trimmed = true;
      }
      if (trimmed || stitch[2] !== EmbConstant.JUMP) {
        tempPattern.addStitchAbsolute(stitch[2], stitch[0], stitch[1]);
        continue;
      }
      while (i < ie && command === EmbConstant.JUMP) {
        i += 1;
        stitch = this.stitches[i];
        command = stitch[2];
        count += 1;
      }
      if (command !== EmbConstant.JUMP) {
        i -= 1;
      }
      stitch = this.stitches[i];
      if (count >= jumpsToRequireTrim) {
        tempPattern.trim();
      }
      count = 0;
      tempPattern.addStitchAbsolute(stitch[2], stitch[0], stitch[1]);
    }
    this.stitches = tempPattern.stitches;
  }
  convertDuplicateColorChangeToStop() {
    const newPattern = new _EmbPattern();
    newPattern.addThread(this.getThreadOrFiller(0));
    let threadIndex = 0;
    for (const [x, y, command] of this.stitches) {
      if (command === EmbConstant.COLOR_CHANGE || command === EmbConstant.COLOR_BREAK) {
        threadIndex += 1;
        const thread = this.getThreadOrFiller(threadIndex);
        const last = newPattern.threadlist[newPattern.threadlist.length - 1];
        if (sameThread(thread, last)) {
          newPattern.stop();
        } else {
          newPattern.colorChange();
          newPattern.addThread(thread);
        }
      } else {
        newPattern.addStitchAbsolute(command, x, y);
      }
    }
    this.stitches = newPattern.stitches;
    this.threadlist = newPattern.threadlist;
  }
  convertStopToColorChange() {
    const newPattern = new _EmbPattern();
    newPattern.addThread(this.getThreadOrFiller(0));
    let threadIndex = 1;
    for (const [x, y, command] of this.stitches) {
      if (command === EmbConstant.COLOR_CHANGE || command === EmbConstant.COLOR_BREAK) {
        newPattern.addThread(this.getThreadOrFiller(threadIndex));
        newPattern.addStitchAbsolute(command, x, y);
        threadIndex += 1;
      } else if (command === EmbConstant.STOP) {
        newPattern.colorChange();
        newPattern.addThread(this.getThreadOrFiller(threadIndex));
      } else {
        newPattern.addStitchAbsolute(command, x, y);
      }
    }
    this.stitches = newPattern.stitches;
    this.threadlist = newPattern.threadlist;
  }
  getPatternMergeJumps() {
    const newPattern = new _EmbPattern();
    let i = -1;
    const ie = this.stitches.length - 1;
    let stitchBreak = false;
    while (i < ie) {
      i += 1;
      const stitch = this.stitches[i];
      if (stitch[2] === EmbConstant.JUMP) {
        if (stitchBreak) continue;
        newPattern.addCommand(EmbConstant.STITCH_BREAK);
        stitchBreak = true;
        continue;
      }
      newPattern.addStitchAbsolute(stitch[2], stitch[0], stitch[1]);
    }
    newPattern.threadlist.push(...this.threadlist);
    Object.assign(newPattern.extras, this.extras);
    return newPattern;
  }
  getStablePattern() {
    const stablePattern = new _EmbPattern();
    for (const stitchblock of this.getAsStitchblock()) {
      stablePattern.addStitchblock(stitchblock);
    }
    Object.assign(stablePattern.extras, this.extras);
    return stablePattern;
  }
  getNormalizedPattern(encodeSettings) {
    const normalPattern = new _EmbPattern();
    const transcoder = new Transcoder(encodeSettings);
    transcoder.transcode(this, normalPattern);
    return normalPattern;
  }
  appendTranslation(x, y) {
    this.addStitchRelative(EmbConstant.MATRIX_TRANSLATE, x, y);
  }
  appendEnableTieOn(x = 0, y = 0) {
    this.addStitchRelative(EmbConstant.OPTION_ENABLE_TIE_ON, x, y);
  }
  appendEnableTieOff(x = 0, y = 0) {
    this.addStitchRelative(EmbConstant.OPTION_ENABLE_TIE_OFF, x, y);
  }
  appendDisableTieOn(x = 0, y = 0) {
    this.addStitchRelative(EmbConstant.OPTION_DISABLE_TIE_ON, x, y);
  }
  appendDisableTieOff(x = 0, y = 0) {
    this.addStitchRelative(EmbConstant.OPTION_DISABLE_TIE_OFF, x, y);
  }
};

// src/pecThreads.ts
var EmbThreadPec = class extends EmbThread {
  constructor(red, green, blue, description, catalogNumber) {
    super();
    this.setColor(red, green, blue);
    this.description = description;
    this.catalog_number = catalogNumber;
    this.brand = "Brother";
    this.chart = "Brother";
  }
};
function getThreadSet() {
  return [
    new EmbThreadPec(0, 0, 0, "Unknown", "0"),
    new EmbThreadPec(14, 31, 124, "Prussian Blue", "1"),
    new EmbThreadPec(10, 85, 163, "Blue", "2"),
    new EmbThreadPec(0, 135, 119, "Teal Green", "3"),
    new EmbThreadPec(75, 107, 175, "Cornflower Blue", "4"),
    new EmbThreadPec(237, 23, 31, "Red", "5"),
    new EmbThreadPec(209, 92, 0, "Reddish Brown", "6"),
    new EmbThreadPec(145, 54, 151, "Magenta", "7"),
    new EmbThreadPec(228, 154, 203, "Light Lilac", "8"),
    new EmbThreadPec(145, 95, 172, "Lilac", "9"),
    new EmbThreadPec(158, 214, 125, "Mint Green", "10"),
    new EmbThreadPec(232, 169, 0, "Deep Gold", "11"),
    new EmbThreadPec(254, 186, 53, "Orange", "12"),
    new EmbThreadPec(255, 255, 0, "Yellow", "13"),
    new EmbThreadPec(112, 188, 31, "Lime Green", "14"),
    new EmbThreadPec(186, 152, 0, "Brass", "15"),
    new EmbThreadPec(168, 168, 168, "Silver", "16"),
    new EmbThreadPec(125, 111, 0, "Russet Brown", "17"),
    new EmbThreadPec(255, 255, 179, "Cream Brown", "18"),
    new EmbThreadPec(79, 85, 86, "Pewter", "19"),
    new EmbThreadPec(0, 0, 0, "Black", "20"),
    new EmbThreadPec(11, 61, 145, "Ultramarine", "21"),
    new EmbThreadPec(119, 1, 118, "Royal Purple", "22"),
    new EmbThreadPec(41, 49, 51, "Dark Gray", "23"),
    new EmbThreadPec(42, 19, 1, "Dark Brown", "24"),
    new EmbThreadPec(246, 74, 138, "Deep Rose", "25"),
    new EmbThreadPec(178, 118, 36, "Light Brown", "26"),
    new EmbThreadPec(252, 187, 197, "Salmon Pink", "27"),
    new EmbThreadPec(254, 55, 15, "Vermilion", "28"),
    new EmbThreadPec(240, 240, 240, "White", "29"),
    new EmbThreadPec(106, 28, 138, "Violet", "30"),
    new EmbThreadPec(168, 221, 196, "Seacrest", "31"),
    new EmbThreadPec(37, 132, 187, "Sky Blue", "32"),
    new EmbThreadPec(254, 179, 67, "Pumpkin", "33"),
    new EmbThreadPec(255, 243, 107, "Cream Yellow", "34"),
    new EmbThreadPec(208, 166, 96, "Khaki", "35"),
    new EmbThreadPec(209, 84, 0, "Clay Brown", "36"),
    new EmbThreadPec(102, 186, 73, "Leaf Green", "37"),
    new EmbThreadPec(19, 74, 70, "Peacock Blue", "38"),
    new EmbThreadPec(135, 135, 135, "Gray", "39"),
    new EmbThreadPec(216, 204, 198, "Warm Gray", "40"),
    new EmbThreadPec(67, 86, 7, "Dark Olive", "41"),
    new EmbThreadPec(253, 217, 222, "Flesh Pink", "42"),
    new EmbThreadPec(249, 147, 188, "Pink", "43"),
    new EmbThreadPec(0, 56, 34, "Deep Green", "44"),
    new EmbThreadPec(178, 175, 212, "Lavender", "45"),
    new EmbThreadPec(104, 106, 176, "Wisteria Violet", "46"),
    new EmbThreadPec(239, 227, 185, "Beige", "47"),
    new EmbThreadPec(247, 56, 102, "Carmine", "48"),
    new EmbThreadPec(181, 75, 100, "Amber Red", "49"),
    new EmbThreadPec(19, 43, 26, "Olive Green", "50"),
    new EmbThreadPec(199, 1, 86, "Dark Fuchsia", "51"),
    new EmbThreadPec(254, 158, 50, "Tangerine", "52"),
    new EmbThreadPec(168, 222, 235, "Light Blue", "53"),
    new EmbThreadPec(0, 103, 62, "Emerald Green", "54"),
    new EmbThreadPec(78, 41, 144, "Purple", "55"),
    new EmbThreadPec(47, 126, 32, "Moss Green", "56"),
    new EmbThreadPec(255, 204, 204, "Flesh Pink", "57"),
    new EmbThreadPec(255, 217, 17, "Harvest Gold", "58"),
    new EmbThreadPec(9, 91, 166, "Electric Blue", "59"),
    new EmbThreadPec(240, 249, 112, "Lemon Yellow", "60"),
    new EmbThreadPec(227, 243, 91, "Fresh Green", "61"),
    new EmbThreadPec(255, 153, 0, "Orange", "62"),
    new EmbThreadPec(255, 240, 141, "Cream Yellow", "63"),
    new EmbThreadPec(255, 200, 200, "Applique", "64")
  ];
}

// src/readers/pec.ts
var JUMP_CODE = 16;
var TRIM_CODE = 32;
var FLAG_LONG = 128;
function signed12(b) {
  b &= 4095;
  if (b > 2047) return -4096 + b;
  return b;
}
function signed7(b) {
  if (b > 63) return -128 + b;
  return b;
}
function readPec(f, out, pesChart = null) {
  f.seek(3, 1);
  const label = f.read(16);
  try {
    out.metadata("Label", new TextDecoder("utf-8", { fatal: true }).decode(label).trim());
  } catch {
  }
  f.seek(15 + 2 + 12, 1);
  const colorChanges = readInt8(f);
  if (colorChanges === null) {
    throw new Error("readPec: unexpected end of file in PEC header");
  }
  const countColors = colorChanges + 1;
  const colorBytes = f.read(countColors);
  mapPecColors(colorBytes, out, pesChart);
  f.seek(464 - colorChanges, 1);
  const lengthValue = readInt24le(f);
  if (lengthValue === null) {
    throw new Error("readPec: unexpected end of file reading stitch block length");
  }
  const stitchBlockEnd = lengthValue - 5 + f.tell();
  f.seek(11, 1);
  readPecStitches(f, out);
  f.seek(stitchBlockEnd, 0);
}
function processPecColors(colorBytes, out) {
  const threadSet = getThreadSet();
  const maxValue = threadSet.length;
  for (const byte of colorBytes) {
    const threadValue = threadSet[byte % maxValue];
    out.addThread(threadValue);
  }
}
function processPecTable(colorBytes, out, chart) {
  const threadSet = getThreadSet();
  const maxValue = threadSet.length;
  const threadMap = /* @__PURE__ */ new Map();
  for (let i = 0; i < colorBytes.length; i++) {
    const colorIndex = colorBytes[i] % maxValue;
    let threadValue = threadMap.get(colorIndex) ?? null;
    if (threadValue === null) {
      if (chart.length > 0) threadValue = chart.shift();
      else threadValue = threadSet[colorIndex];
      threadMap.set(colorIndex, threadValue);
    }
    out.addThread(threadValue);
  }
}
function mapPecColors(colorBytes, out, chart) {
  if (chart === null || chart.length === 0) {
    processPecColors(colorBytes, out);
  } else if (chart.length >= colorBytes.length) {
    for (const thread of chart) {
      out.addThread(thread);
    }
  } else {
    processPecTable(colorBytes, out, chart);
  }
}
function readPecStitches(f, out) {
  for (; ; ) {
    const val1 = readInt8(f);
    const val2 = readInt8(f);
    if (val1 === 255 && val2 === 0 || val2 === null || val1 === null) {
      break;
    }
    if (val1 === 254 && val2 === 176) {
      f.seek(1, 1);
      out.colorChange(0, 0);
      continue;
    }
    let jump = false;
    let trim = false;
    let x;
    let y;
    let code;
    let current2;
    if ((val1 & FLAG_LONG) !== 0) {
      if ((val1 & TRIM_CODE) !== 0) trim = true;
      if ((val1 & JUMP_CODE) !== 0) jump = true;
      code = val1 << 8 | val2;
      x = signed12(code);
      const nextByte = readInt8(f);
      if (nextByte === null) break;
      current2 = nextByte;
    } else {
      x = signed7(val1);
      current2 = val2;
    }
    if ((current2 & FLAG_LONG) !== 0) {
      if ((current2 & TRIM_CODE) !== 0) trim = true;
      if ((current2 & JUMP_CODE) !== 0) jump = true;
      const val3 = readInt8(f);
      if (val3 === null) break;
      code = current2 << 8 | val3;
      y = signed12(code);
    } else {
      y = signed7(current2);
    }
    if (jump) {
      out.move(x, y);
    } else if (trim) {
      out.trim();
      out.move(x, y);
    } else {
      out.stitch(x, y);
    }
  }
  out.end();
}

// src/readers/pes.ts
function readPes(bytes) {
  const pattern = new EmbPattern();
  readPesInto(new ByteReader(bytes), pattern);
  return pattern;
}
function readPesInto(f, out) {
  const loadedThreadValues = [];
  const pesString = readString8(f, 8);
  if (pesString === "#PEC0001") {
    readPec(f, out, loadedThreadValues);
    out.convertDuplicateColorChangeToStop();
    return;
  }
  const pecBlockPosition = readInt32le(f);
  if (pecBlockPosition === null) {
    throw new Error("readPes: unexpected end of file reading PEC block offset");
  }
  if (pesString === "#PES0060") {
    readPesHeaderVersion6(f, out, loadedThreadValues);
  } else if (pesString === "#PES0050" || pesString === "#PES0055" || pesString === "#PES0056") {
    readPesHeaderVersion5(f, out, loadedThreadValues);
  } else if (pesString === "#PES0040") {
    readPesHeaderVersion4(f, out);
  }
  f.seek(pecBlockPosition, 0);
  readPec(f, out, loadedThreadValues);
  out.convertDuplicateColorChangeToStop();
}
function readPesString(f) {
  const length2 = readInt8(f);
  if (length2 === null || length2 === 0) return null;
  return readString8(f, length2);
}
function readPesMetadata(f, out) {
  for (const key of ["name", "category", "author", "keywords", "comments"]) {
    const value = readPesString(f);
    if (value) out.metadata(key, value);
  }
}
function readPesThread(f, threadlist) {
  const thread = new EmbThread();
  thread.catalog_number = readPesString(f);
  const color = readInt24be(f);
  if (color === null) {
    throw new Error("readPes: unexpected end of file reading thread color");
  }
  thread.color = (4278190080 | color) >>> 0;
  f.seek(5, 1);
  thread.description = readPesString(f);
  thread.brand = readPesString(f);
  thread.chart = readPesString(f);
  threadlist.push(thread);
}
function readPesHeaderVersion4(f, out) {
  f.seek(4, 1);
  readPesMetadata(f, out);
}
function readPesHeaderThreads(f, out, threadlist, imageKey) {
  const v = readPesString(f);
  if (v !== null && v.length > 0) out.metadata(imageKey, v);
  f.seek(24, 1);
  const countProgrammableFills = readInt16le(f);
  if (countProgrammableFills !== 0) return;
  const countMotifs = readInt16le(f);
  if (countMotifs !== 0) return;
  const countFeatherPatterns = readInt16le(f);
  if (countFeatherPatterns !== 0) return;
  const countThreads = readInt16le(f);
  if (countThreads === null) return;
  for (let i = 0; i < countThreads; i++) {
    readPesThread(f, threadlist);
  }
}
function readPesHeaderVersion5(f, out, threadlist) {
  f.seek(4, 1);
  readPesMetadata(f, out);
  f.seek(24, 1);
  readPesHeaderThreads(f, out, threadlist, "image");
}
function readPesHeaderVersion6(f, out, threadlist) {
  f.seek(4, 1);
  readPesMetadata(f, out);
  f.seek(36, 1);
  readPesHeaderThreads(f, out, threadlist, "image_file");
}

// src/readers/dst.ts
var bit = (value, position) => value >> position & 1;
function decodeDx(b0, b1, b2) {
  return 81 * (bit(b2, 2) - bit(b2, 3)) + 27 * (bit(b1, 2) - bit(b1, 3)) + 9 * (bit(b0, 2) - bit(b0, 3)) + 3 * (bit(b1, 0) - bit(b1, 1)) + (bit(b0, 0) - bit(b0, 1));
}
function decodeDy(b0, b1, b2) {
  return -(81 * (bit(b2, 5) - bit(b2, 4)) + 27 * (bit(b1, 5) - bit(b1, 4)) + 9 * (bit(b0, 5) - bit(b0, 4)) + 3 * (bit(b1, 7) - bit(b1, 6)) + (bit(b0, 7) - bit(b0, 6)));
}
function readHeader(header, out) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let start = 0;
  header.forEach((byte, end) => {
    if (byte !== 13 && byte !== 10) return;
    let line;
    try {
      line = decoder.decode(header.subarray(start, end)).trim();
    } catch {
      return;
    } finally {
      start = end;
    }
    if (line.length <= 3) return;
    const [prefix, value] = [line.slice(0, 2).trim(), line.slice(3).trim()];
    if (prefix === "LA") out.metadata("name", value);
    else if (prefix === "AU") out.metadata("author", value);
    else if (prefix === "CP") out.metadata("copyright", value);
    else if (prefix === "TC") {
      const [hex, description, catalog] = value.split(",").map((part) => part.trim());
      out.addThread({ hex, description, catalog });
    } else out.metadata(prefix, value);
  });
}
function readDst(bytes) {
  const out = new EmbPattern();
  readHeader(bytes.subarray(0, 512), out);
  let sequinMode = false;
  for (let offset = 512; offset + 3 <= bytes.length; offset += 3) {
    const [b0, b1, b2] = bytes.subarray(offset, offset + 3);
    const dx = decodeDx(b0, b1, b2);
    const dy = decodeDy(b0, b1, b2);
    if ((b2 & 243) === 243) break;
    if ((b2 & 195) === 195) out.colorChange(dx, dy);
    else if ((b2 & 67) === 67) {
      out.sequinMode(dx, dy);
      sequinMode = !sequinMode;
    } else if ((b2 & 131) === 131) {
      if (sequinMode) out.sequinEject(dx, dy);
      else out.move(dx, dy);
    } else out.stitch(dx, dy);
  }
  out.end();
  out.interpolateTrims(3);
  return out;
}

// src/binaryWriter.ts
var ByteWriter = class {
  constructor() {
    this.bytes = new Uint8Array(1024);
    this.view = new DataView(this.bytes.buffer);
    this.offset = 0;
    this.end = 0;
  }
  get length() {
    return this.end;
  }
  tell() {
    return this.offset;
  }
  seek(offset) {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new RangeError(`ByteWriter.seek: invalid offset ${offset}`);
    }
    this.ensure(offset);
    this.offset = offset;
  }
  writeBytes(bytes) {
    this.ensure(this.offset + bytes.length);
    this.bytes.set(bytes, this.offset);
    this.offset += bytes.length;
  }
  writeUint8(value) {
    this.ensure(this.offset + 1);
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }
  writeInt16le(value) {
    this.ensure(this.offset + 2);
    this.view.setInt16(this.offset, value, true);
    this.offset += 2;
  }
  writeUint16le(value) {
    this.ensure(this.offset + 2);
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
  }
  writeInt24le(value) {
    this.writeUint8(value);
    this.writeUint8(Math.floor(value / 256));
    this.writeUint8(Math.floor(value / 65536));
  }
  writeUint32le(value) {
    this.ensure(this.offset + 4);
    this.view.setUint32(this.offset, value >>> 0, true);
    this.offset += 4;
  }
  writeUint16be(value) {
    this.ensure(this.offset + 2);
    this.view.setUint16(this.offset, value & 65535, false);
    this.offset += 2;
  }
  writeUint24be(value) {
    this.writeUint8(value >> 16 & 255);
    this.writeUint8(value >> 8 & 255);
    this.writeUint8(value & 255);
  }
  writeUint32be(value) {
    this.ensure(this.offset + 4);
    this.view.setUint32(this.offset, value >>> 0, false);
    this.offset += 4;
  }
  writeFloat32le(value) {
    this.ensure(this.offset + 4);
    this.view.setFloat32(this.offset, value, true);
    this.offset += 4;
  }
  toUint8Array() {
    return this.bytes.slice(0, this.end);
  }
  ensure(size) {
    this.end = Math.max(this.end, size);
    if (size <= this.bytes.length) return;
    let capacity = this.bytes.length;
    while (capacity < size) capacity *= 2;
    const next = new Uint8Array(capacity);
    next.set(this.bytes);
    this.bytes = next;
    this.view = new DataView(next.buffer);
  }
};

// src/writeDst.ts
var { COMMAND_MASK, STITCH: STITCH2, JUMP: JUMP2, TRIM: TRIM2, STOP: STOP2, END: END2, COLOR_CHANGE: COLOR_CHANGE2, SEQUIN_MODE: SEQUIN_MODE2, SEQUIN_EJECT: SEQUIN_EJECT2 } = EmbConstant;
var HEADER_SIZE = 512;
var MAX_DELTA = 121;
var WEIGHTS = [81, 27, 9, 3, 1];
var X_BITS = [[2, 2, 3], [1, 2, 3], [0, 2, 3], [1, 0, 1], [0, 0, 1]];
var Y_BITS = [[2, 5, 4], [1, 5, 4], [0, 5, 4], [1, 7, 6], [0, 7, 6]];
function encodeAxis(value, record, bits) {
  bits.forEach(([byte, positive, negative], i) => {
    const weight = WEIGHTS[i];
    if (value > (weight - 1) / 2) {
      record[byte] |= 1 << positive;
      value -= weight;
    } else if (value < -(weight - 1) / 2) {
      record[byte] |= 1 << negative;
      value += weight;
    }
  });
  if (value !== 0) throw new RangeError(`writeDst: a move exceeds the DST limit of ${MAX_DELTA}`);
}
function encodeRecord(dx, dy, command) {
  const record = [0, 0, 0];
  if (command === STITCH2 || command === JUMP2 || command === SEQUIN_EJECT2) {
    if (command !== STITCH2) record[2] |= 1 << 7;
    record[2] |= 3;
    encodeAxis(dx, record, X_BITS);
    encodeAxis(-dy, record, Y_BITS);
  } else if (command === COLOR_CHANGE2 || command === STOP2) {
    record[2] = 195;
  } else if (command === END2) {
    record[2] = 243;
  } else if (command === SEQUIN_MODE2) {
    record[2] = 67;
  }
  return record;
}
function field(text) {
  return `${text}\r`;
}
var signed = (value) => value >= 0 ? `+${String(value).padStart(5)}` : `-${String(-value).padStart(5)}`;
function writeHeader(out, pattern, extended) {
  const encoder3 = new TextEncoder();
  const stitches = pattern.stitches;
  const { minX, minY, maxX, maxY } = stitches.length > 0 ? pattern.extents() : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const last = stitches[stitches.length - 1];
  const name = pattern.getMetadata("name");
  const lines = [
    // Longer names would shift the fixed-width fields other programs expect.
    `LA:${(typeof name === "string" ? name : "Untitled").slice(0, 16).padEnd(16)}`,
    `ST:${String(pattern.countStitches()).padStart(7)}`,
    `CO:${String(pattern.countColorChanges()).padStart(3)}`,
    `+X:${String(Math.trunc(Math.abs(maxX))).padStart(5)}`,
    `-X:${String(Math.trunc(Math.abs(minX))).padStart(5)}`,
    `+Y:${String(Math.trunc(Math.abs(maxY))).padStart(5)}`,
    `-Y:${String(Math.trunc(Math.abs(minY))).padStart(5)}`,
    `AX:${signed(last ? Math.trunc(last[0]) : 0)}`,
    `AY:${signed(last ? -Math.trunc(last[1]) : 0)}`,
    `MX:${signed(0)}`,
    `MY:${signed(0)}`,
    "PD:******"
  ];
  if (extended) {
    const author = pattern.getMetadata("author");
    const copyright = pattern.getMetadata("copyright");
    if (author !== void 0) lines.push(`AU:${author}`);
    if (copyright !== void 0) lines.push(`CP:${copyright}`);
    for (const thread of pattern.threadlist) {
      lines.push(`TC:${thread.hexColor()},${thread.description ?? ""},${thread.catalog_number ?? ""}`);
    }
  }
  for (const line of lines) {
    const bytes = encoder3.encode(field(line));
    if (out.tell() + bytes.length >= HEADER_SIZE) break;
    out.writeBytes(bytes);
  }
  out.writeUint8(26);
  out.writeBytes(new Array(HEADER_SIZE - out.tell()).fill(32));
}
function writeDst(source, settings = {}) {
  const { encode = true, extendedHeader = false, ...encoderSettings } = settings;
  const pattern = encode ? source.getNormalizedPattern({
    max_jump: MAX_DELTA,
    max_stitch: MAX_DELTA,
    full_jump: false,
    round: true,
    // As in current pyembroidery: the machine handles the thread change, no trim needed.
    explicit_trim: false,
    sequin_contingency: EmbConstant.CONTINGENCY_SEQUIN_UTILIZE,
    ...encoderSettings
  }) : source;
  const out = new ByteWriter();
  writeHeader(out, pattern, extendedHeader);
  let x = 0;
  let y = 0;
  for (const stitch of pattern.stitches) {
    const command = stitch[2] & COMMAND_MASK;
    const dx = pyRound(stitch[0] - x);
    const dy = pyRound(stitch[1] - y);
    x += dx;
    y += dy;
    if (command === TRIM2) {
      out.writeBytes(encodeRecord(2, 2, JUMP2));
      out.writeBytes(encodeRecord(-4, -4, JUMP2));
      out.writeBytes(encodeRecord(2, 2, JUMP2));
    } else {
      out.writeBytes(encodeRecord(dx, dy, command));
    }
  }
  return out.toUint8Array();
}

// src/readers/exp.ts
function readExp(bytes) {
  const out = new EmbPattern();
  for (let offset = 0; offset + 2 <= bytes.length; offset += 2) {
    if (bytes[offset] !== 128) {
      out.stitch(signed8(bytes[offset]), -signed8(bytes[offset + 1]));
      continue;
    }
    const control = bytes[offset + 1];
    offset += 2;
    if (offset + 2 > bytes.length) break;
    const x = signed8(bytes[offset]);
    const y = -signed8(bytes[offset + 1]);
    if (control === 128) {
      out.trim();
    } else if (control === 2) {
      out.stitch(x, y);
    } else if (control === 4) {
      out.move(x, y);
    } else if (control === 1) {
      out.colorChange();
      if (x !== 0 || y !== 0) out.move(x, y);
    } else {
      break;
    }
  }
  out.end();
  return out;
}

// src/writeExp.ts
var { COMMAND_MASK: COMMAND_MASK2, STITCH: STITCH3, JUMP: JUMP3, TRIM: TRIM3, STOP: STOP3, COLOR_CHANGE: COLOR_CHANGE3 } = EmbConstant;
var MAX_DELTA2 = 127;
function writeDelta(out, dx, dy) {
  if (Math.abs(dx) > MAX_DELTA2 || Math.abs(dy) > MAX_DELTA2) {
    throw new RangeError(`writeExp: a move exceeds the EXP limit of ${MAX_DELTA2}`);
  }
  out.writeUint8(dx & 255);
  out.writeUint8(-dy & 255);
}
function writeExp(source, settings = {}) {
  const { encode = true, ...encoderSettings } = settings;
  const pattern = encode ? source.getNormalizedPattern({
    max_jump: MAX_DELTA2,
    max_stitch: MAX_DELTA2,
    full_jump: true,
    // As in current pyembroidery: no trim before color changes.
    explicit_trim: false,
    round: true,
    sequin_contingency: EmbConstant.CONTINGENCY_SEQUIN_JUMP,
    ...encoderSettings
  }) : source;
  const out = new ByteWriter();
  let x = 0;
  let y = 0;
  for (const stitch of pattern.stitches) {
    const command = stitch[2] & COMMAND_MASK2;
    const dx = pyRound(stitch[0] - x);
    const dy = pyRound(stitch[1] - y);
    x += dx;
    y += dy;
    if (command === STITCH3) {
      writeDelta(out, dx, dy);
    } else if (command === JUMP3) {
      out.writeBytes([128, 4]);
      writeDelta(out, dx, dy);
    } else if (command === TRIM3) {
      out.writeBytes([128, 128, 7, 0]);
    } else if (command === COLOR_CHANGE3 || command === STOP3) {
      out.writeBytes([128, 1, 0, 0]);
    }
  }
  return out.toUint8Array();
}

// src/jefThreads.ts
var JEF_THREADS = [
  [0, "Black", "002"],
  [16777215, "White", "001"],
  [16776983, "Yellow", "204"],
  [16737792, "Orange", "203"],
  [3103027, "Olive Green", "219"],
  [2323254, "Green", "226"],
  [6669e3, "Sky", "217"],
  [11229846, "Purple", "208"],
  [16148896, "Pink", "201"],
  [16711680, "Red", "225"],
  [11628622, "Brown", "214"],
  [733060, "Blue", "207"],
  [14992221, "Gold", "003"],
  [4725253, "Dark Brown", "205"],
  [11312327, "Pale Violet", "209"],
  [16577172, "Pale Yellow", "210"],
  [16357815, "Pale Pink", "211"],
  [16429953, "Peach", "212"],
  [13214848, "Beige", "213"],
  [9897267, "Wine Red", "215"],
  [10533068, "Pale Sky", "216"],
  [8372764, "Yellow Green", "218"],
  [15066597, "Silver Gray", "220"],
  [8952731, "Gray", "221"],
  [10016445, "Pale Aqua", "227"],
  [11723235, "Baby Blue", "228"],
  [3574688, "Powder Blue", "229"],
  [5211051, "Bright Blue", "230"],
  [3697297, "Slate Blue", "231"],
  [464464, "Navy Blue", "232"],
  [16357794, "Salmon Pink", "233"],
  [16344939, "Coral", "234"],
  [14889247, "Burnt Orange", "235"],
  [14852488, "Cinnamon", "236"],
  [11900020, "Umber", "237"],
  [14995353, "Blond", "238"],
  [16763648, "Sunflower", "239"],
  [14790100, "Orchid Pink", "240"],
  [12779646, "Peony Purple", "241"],
  [8388683, "Burgundy", "242"],
  [5506417, "Royal Purple", "243"],
  [11601189, "Cardinal Red", "244"],
  [13295808, "Opal Green", "245"],
  [9017430, "Moss Green", "246"],
  [6067226, "Meadow Green", "247"],
  [12564, "Dark Green", "248"],
  [6139540, "Aquamarine", "249"],
  [5029775, "Emerald Green", "250"],
  [30578, "Peacock Green", "251"],
  [5856097, "Dark Gray", "252"],
  [16777202, "Ivory White", "253"],
  [11622424, "Hazel", "254"],
  [13339143, "Toast", "255"],
  [9989248, "Salmon", "256"],
  [9988397, "Cocoa Brown", "257"],
  [5059609, "Sienna", "258"],
  [4993803, "Sepia", "259"],
  [3350538, "Dark Sepia", "260"],
  [5388951, "Violet Blue", "261"],
  [860542, "Blue Ink", "262"],
  [1996716, "Sola Blue", "263"],
  [11722067, "Green Dust", "264"],
  [15939209, "Crimson", "265"],
  [14574750, "Floral Pink", "266"],
  [9978209, "Wine", "267"],
  [5002770, "Olive Drab", "268"],
  [5015583, "Meadow", "269"],
  [14999161, "Mustard", "270"],
  [13339162, "Yellow Ocher", "271"],
  [13345308, "Old Gold", "272"],
  [16750597, "Honey Dew", "273"],
  [16560727, "Tangerine", "274"],
  [16770309, "Canary Yellow", "275"],
  [15741727, "Vermilion", "202"],
  [1737773, "Bright Green", "206"],
  [3697838, "Ocean Blue", "222"],
  [14927028, "Beige Gray", "223"],
  [14920833, "Bamboo", "224"]
];
var EmbThreadJef = class extends EmbThread {
  constructor(color, description, catalogNumber) {
    super();
    this.color = color;
    this.description = description;
    this.catalog_number = catalogNumber;
    this.brand = "Jef";
    this.chart = "Jef";
  }
};
function getJefThreadSet() {
  return [null, ...JEF_THREADS.map(([color, description, catalog]) => new EmbThreadJef(color, description, catalog))];
}

// src/readers/jef.ts
var PALETTE_START = 116;
function readJef(bytes) {
  const out = new EmbPattern();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const int32 = (offset) => offset + 4 <= bytes.length ? view.getInt32(offset, true) : 0;
  const stitchesStart = int32(0);
  const colorCount = int32(24);
  const jefThreads = getJefThreadSet();
  const threads = [];
  for (let i = 0; i < colorCount && PALETTE_START + 4 * i + 4 <= bytes.length; i++) {
    const index = Math.abs(int32(PALETTE_START + 4 * i));
    threads.push(index === 0 ? null : jefThreads[index % jefThreads.length]);
  }
  let colorIndex = 1;
  for (let offset = stitchesStart; offset + 2 <= bytes.length; offset += 2) {
    if (bytes[offset] !== 128) {
      out.stitch(signed8(bytes[offset]), -signed8(bytes[offset + 1]));
      continue;
    }
    const control = bytes[offset + 1];
    offset += 2;
    if (offset + 2 > bytes.length) break;
    if (control === 2) {
      out.move(signed8(bytes[offset]), -signed8(bytes[offset + 1]));
    } else if (control === 1) {
      if (threads[colorIndex] === null) {
        out.stop();
        threads.splice(colorIndex, 1);
      } else {
        out.colorChange();
        colorIndex += 1;
      }
    } else {
      break;
    }
  }
  out.end();
  for (const thread of threads) if (thread !== null) out.addThread(thread);
  out.interpolateTrims(null, 30, true);
  return out;
}

// src/writeJef.ts
var { COMMAND_MASK: COMMAND_MASK3, STITCH: STITCH4, JUMP: JUMP4, TRIM: TRIM4, STOP: STOP4, END: END3, COLOR_CHANGE: COLOR_CHANGE4 } = EmbConstant;
var MAX_DELTA3 = 127;
var HOOP_110X110 = 0;
var HOOP_50X50 = 1;
var HOOP_140X200 = 2;
var HOOP_126X110 = 3;
var HOOP_200X200 = 4;
function sameThread2(a, b) {
  return a !== null && (a.color & 16777215) === (b.color & 16777215) && a.description === b.description && a.catalog_number === b.catalog_number && a.details === b.details && a.brand === b.brand && a.chart === b.chart;
}
function now() {
  const date = /* @__PURE__ */ new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
function buildPalette(pattern) {
  const jefThreads = getJefThreadSet();
  const palette = [];
  let lastIndex = null;
  let lastThread = null;
  let colorToggled = false;
  let threadIndex = 0;
  for (const stitch of pattern.stitches) {
    const command = stitch[2] & COMMAND_MASK3;
    if (command === COLOR_CHANGE4 || threadIndex === 0) {
      const thread = pattern.getThreadOrFiller(threadIndex);
      threadIndex += 1;
      let index = thread.findNearestColorIndex(jefThreads);
      if (lastIndex === index && !sameThread2(lastThread, thread)) {
        const repeatedIndex = index;
        const repeated = jefThreads[repeatedIndex];
        jefThreads[repeatedIndex] = null;
        index = thread.findNearestColorIndex(jefThreads);
        jefThreads[repeatedIndex] = repeated;
      }
      palette.push(index);
      lastIndex = index;
      lastThread = thread;
      colorToggled = false;
    }
    if (command === STOP4) {
      colorToggled = !colorToggled;
      palette.push(colorToggled ? 0 : lastIndex);
    }
  }
  return palette;
}
function hoopSize(width, height) {
  if (width < 500 && height < 500) return HOOP_50X50;
  if (width < 1260 && height < 1100) return HOOP_126X110;
  if (width < 1400 && height < 2e3) return HOOP_140X200;
  if (width < 2e3 && height < 2e3) return HOOP_200X200;
  return HOOP_110X110;
}
function writeHoopEdges(out, x, y) {
  const values = Math.min(x, y) >= 0 ? [x, y, x, y] : [-1, -1, -1, -1];
  for (const value of values) out.writeUint32le(value);
}
function writeJef(source, settings = {}) {
  const { encode = true, trims = false, trimAt = 3, date = now(), ...encoderSettings } = settings;
  const pattern = encode ? source.getNormalizedPattern({
    max_jump: MAX_DELTA3,
    max_stitch: MAX_DELTA3,
    full_jump: true,
    // As in current pyembroidery: no trim before color changes.
    explicit_trim: false,
    round: true,
    sequin_contingency: EmbConstant.CONTINGENCY_SEQUIN_JUMP,
    ...encoderSettings
  }) : source;
  pattern.fixColorCount();
  const palette = buildPalette(pattern);
  const out = new ByteWriter();
  out.writeUint32le(116 + palette.length * 8);
  out.writeUint32le(20);
  out.writeBytes(new TextEncoder().encode(date));
  out.writeBytes([0, 0]);
  out.writeUint32le(palette.length);
  let pointCount = 1;
  for (const stitch of pattern.stitches) {
    const command = stitch[2] & COMMAND_MASK3;
    if (command === STITCH4) pointCount += 1;
    else if (command === JUMP4 || command === COLOR_CHANGE4 || command === STOP4) pointCount += 2;
    else if (command === TRIM4 && trims) pointCount += 2 * trimAt;
    else if (command === END3) break;
  }
  out.writeUint32le(pointCount);
  const { minX, minY, maxX, maxY } = pattern.stitches.length > 0 ? pattern.extents() : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const width = pyRound(maxX - minX);
  const height = pyRound(maxY - minY);
  out.writeUint32le(hoopSize(width, height));
  const halfWidth = pyRound(width / 2);
  const halfHeight = pyRound(height / 2);
  for (const value of [halfWidth, halfHeight, halfWidth, halfHeight]) out.writeUint32le(value);
  writeHoopEdges(out, 550 - halfWidth, 550 - halfHeight);
  writeHoopEdges(out, 250 - halfWidth, 250 - halfHeight);
  writeHoopEdges(out, 700 - halfWidth, 1e3 - halfHeight);
  writeHoopEdges(out, 700 - halfWidth, 1e3 - halfHeight);
  for (const index of palette) out.writeUint32le(index);
  for (let i = 0; i < palette.length; i++) out.writeUint32le(13);
  const delta = (dx, dy) => {
    if (Math.abs(dx) > MAX_DELTA3 || Math.abs(dy) > MAX_DELTA3) {
      throw new RangeError(`writeJef: a move exceeds the JEF limit of ${MAX_DELTA3}`);
    }
    out.writeBytes([dx & 255, -dy & 255]);
  };
  let x = 0;
  let y = 0;
  for (const stitch of pattern.stitches) {
    const command = stitch[2] & COMMAND_MASK3;
    const dx = pyRound(stitch[0] - x);
    const dy = pyRound(stitch[1] - y);
    x += dx;
    y += dy;
    if (command === STITCH4) {
      delta(dx, dy);
    } else if (command === COLOR_CHANGE4 || command === STOP4) {
      out.writeBytes([128, 1]);
      delta(dx, dy);
    } else if (command === TRIM4) {
      if (trims) for (let i = 0; i < trimAt; i++) out.writeBytes([128, 2, 0, 0]);
    } else if (command === JUMP4) {
      out.writeBytes([128, 2]);
      delta(dx, dy);
    } else if (command === END3) {
      break;
    }
  }
  out.writeBytes([128, 16]);
  return out.toUint8Array();
}

// src/readers/vp3.ts
var signed32 = (value) => (value ?? 0) | 0;
var signed162 = (high, low) => ((high & 255) << 8 | low & 255) << 16 >> 16;
function skipString(f) {
  f.seek(readInt16be(f) ?? 0, 1);
}
function readString(f) {
  return readString8(f, readInt16be(f) ?? 0) ?? "";
}
function readThread(f) {
  const thread = new EmbThread();
  const colors = readInt8(f) ?? 0;
  readInt8(f);
  for (let i = 0; i < colors; i++) {
    thread.color = readInt24be(f) ?? 0;
    readInt8(f);
    readInt16be(f);
  }
  readInt8(f);
  readInt8(f);
  thread.catalog_number = readString(f);
  thread.description = readString(f);
  thread.brand = readString(f);
  return thread;
}
function readColorblock(f, out, centerX, centerY) {
  f.seek(3, 1);
  const blockEnd = (readInt32be(f) ?? 0) + f.tell();
  const startX = signed32(readInt32be(f)) / 100;
  const startY = -(signed32(readInt32be(f)) / 100);
  const [x, y] = [startX + centerX, startY + centerY];
  if (x !== 0 && y !== 0) out.moveAbs(x, y);
  out.addThread(readThread(f));
  f.seek(15, 1);
  f.seek(3, 1);
  const bytes = readSigned(f, blockEnd - f.tell());
  for (let i = 0; i < bytes.length - 1; ) {
    const [dx, dy] = [bytes[i], bytes[i + 1]];
    i += 2;
    if ((dx & 255) !== 128) {
      out.stitch(dx, dy);
    } else if (dy === 1) {
      if (i + 4 > bytes.length) break;
      const longX = signed162(bytes[i], bytes[i + 1]);
      const longY = signed162(bytes[i + 2], bytes[i + 3]);
      i += 6;
      out.stitch(longX, longY);
    } else if (dy === 3) {
      out.trim();
    }
  }
}
function readVp3(bytes) {
  const out = new EmbPattern();
  const f = new ByteReader(bytes);
  f.seek(6);
  skipString(f);
  f.seek(7, 1);
  skipString(f);
  f.seek(32, 1);
  const centerX = signed32(readInt32be(f)) / 100;
  const centerY = -(signed32(readInt32be(f)) / 100);
  f.seek(27, 1);
  skipString(f);
  f.seek(24, 1);
  skipString(f);
  const colorCount = readInt16be(f) ?? 0;
  for (let i = 0; i < colorCount; i++) {
    readColorblock(f, out, centerX, centerY);
    if (i + 1 < colorCount) out.colorChange();
  }
  out.end();
  return out;
}

// src/writeVp3.ts
var { COMMAND_MASK: COMMAND_MASK4, FLAGS_MASK, STITCH: STITCH5, JUMP: JUMP5, TRIM: TRIM5, STOP: STOP5, END: END4, COLOR_CHANGE: COLOR_CHANGE5, SEQUIN_MODE: SEQUIN_MODE3, SEQUIN_EJECT: SEQUIN_EJECT3 } = EmbConstant;
var PRODUCER = "Produced by     Software Ltd";
var SKIPPED = /* @__PURE__ */ new Set([COLOR_CHANGE5, SEQUIN_MODE3, SEQUIN_EJECT3, STOP5, JUMP5]);
function writeString8(out, text) {
  const bytes = new TextEncoder().encode(text);
  out.writeUint16be(bytes.length);
  out.writeBytes(bytes);
}
function writeString16(out, text) {
  out.writeUint16be(text.length * 2);
  for (let i = 0; i < text.length; i++) out.writeUint16be(text.charCodeAt(i));
}
function block(out, tag) {
  out.writeBytes(tag);
  const offset = out.tell();
  out.writeUint32be(0);
  return () => {
    const end = out.tell();
    out.seek(offset);
    out.writeUint32be(end - offset - 4);
    out.seek(end);
  };
}
var vp3 = (value) => Math.trunc(value) * 100;
function writeThread(out, thread) {
  out.writeBytes([1, 0]);
  out.writeUint24be(thread.color);
  out.writeBytes([0, 0, 0, 5, 40]);
  writeString8(out, thread.catalog_number ?? "");
  writeString8(out, thread.description ?? thread.hexColor());
  writeString8(out, thread.brand ?? "");
}
function writeStitches(out, stitches, firstX, firstY) {
  const close = block(out, [0, 1, 0]);
  out.writeBytes([10, 246, 0]);
  let x = firstX;
  let y = firstY;
  for (const stitch of stitches) {
    const command = stitch[2] & COMMAND_MASK4;
    if (command === END4) {
      out.writeBytes([128, 3]);
      break;
    }
    if (command === TRIM5) {
      out.writeBytes([128, 3]);
      continue;
    }
    if (SKIPPED.has(command)) continue;
    const dx = Math.trunc(stitch[0] - x);
    const dy = Math.trunc(stitch[1] - y);
    x += dx;
    y += dy;
    if (command !== STITCH5) continue;
    if (Math.abs(dx) <= 127 && Math.abs(dy) <= 127 && (stitch[2] & FLAGS_MASK) === 0) {
      out.writeBytes([dx & 255, dy & 255]);
    } else {
      out.writeBytes([128, 1]);
      out.writeUint16be(dx);
      out.writeUint16be(dy);
      out.writeBytes([128, 2]);
    }
  }
  close();
}
function writeColorblock(out, first, centerX, centerY, stitches, thread) {
  const close = block(out, [0, 5, 0]);
  let [firstX, firstY] = stitches.length > 0 ? [stitches[0][0], stitches[0][1]] : [0, 0];
  if (first) [firstX, firstY] = [0, 0];
  const [lastX, lastY] = stitches.length > 0 ? [stitches[stitches.length - 1][0], stitches[stitches.length - 1][1]] : [0, 0];
  out.writeUint32be(vp3(firstX - centerX));
  out.writeUint32be(vp3(-(firstY - centerY)));
  writeThread(out, thread);
  out.writeUint32be(vp3(lastX - firstX));
  out.writeUint32be(vp3(-(lastY - firstY)));
  writeStitches(out, stitches, firstX, firstY);
  out.writeUint8(0);
  close();
}
function writeDesign(out, extents, colorblocks) {
  const close = block(out, [0, 3, 0]);
  const width = extents.maxX - extents.minX;
  const height = extents.maxY - extents.minY;
  const centerX = extents.maxX - width / 2;
  const centerY = extents.maxY - height / 2;
  out.writeUint32be(vp3(centerX));
  out.writeUint32be(-vp3(centerY));
  out.writeBytes([0, 0, 0]);
  for (const value of [-vp3(width / 2), vp3(width / 2), -vp3(height / 2), vp3(height / 2), vp3(width), vp3(height)]) {
    out.writeUint32be(value);
  }
  writeString16(out, "");
  out.writeBytes([100, 100]);
  for (const value of [4096, 0, 0, 4096]) out.writeUint32be(value);
  out.writeBytes(new TextEncoder().encode("xxPP\0"));
  writeString16(out, PRODUCER);
  out.writeUint16be(colorblocks.length);
  colorblocks.forEach(([stitches, thread], i) => writeColorblock(out, i === 0, centerX, centerY, stitches, thread));
  close();
}
function writeVp3(source, settings = {}) {
  const { encode = true, ...encoderSettings } = settings;
  const pattern = encode ? source.getNormalizedPattern({
    // VP3 stitches hold 16-bit moves; longer than 255 they count as jumps.
    max_jump: 3200,
    max_stitch: 255,
    full_jump: false,
    // As in current pyembroidery: no trim before color changes.
    explicit_trim: false,
    sequin_contingency: EmbConstant.CONTINGENCY_SEQUIN_JUMP,
    ...encoderSettings
  }) : source;
  pattern.fixColorCount();
  const out = new ByteWriter();
  out.writeBytes(new TextEncoder().encode("%vsm%"));
  out.writeUint8(0);
  writeString16(out, PRODUCER);
  const close = block(out, [0, 2, 0]);
  writeString16(out, "");
  const extents = pattern.stitches.length > 0 ? pattern.extents() : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const colorblocks = [...pattern.getAsColorblocks()];
  for (const value of [extents.maxX, -extents.minY, extents.minX, -extents.maxY]) {
    out.writeUint32be(Math.trunc(value * 100));
  }
  out.writeUint32be(pattern.stitches.length - pattern.countStitchCommands(END4));
  out.writeBytes([0, colorblocks.length & 255, 12, 0]);
  out.writeUint8(1);
  writeDesign(out, extents, colorblocks);
  close();
  return out.toUint8Array();
}

// src/readers/xxx.ts
var STITCHES_START = 256;
function readXxx(bytes) {
  const out = new EmbPattern();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const colorCount = bytes.length >= 41 ? view.getUint16(39, true) : 0;
  let offset = STITCHES_START;
  const byte = () => offset < bytes.length ? bytes[offset++] : null;
  while (offset < bytes.length) {
    const b1 = byte();
    if (b1 === 125 || b1 === 126) {
      if (offset + 4 > bytes.length) break;
      const x = signed16(view.getUint16(offset, true));
      const y = signed16(view.getUint16(offset + 2, true));
      offset += 4;
      out.move(x, -y);
      continue;
    }
    const b2 = byte();
    if (b2 === null) break;
    if (b1 !== 127) {
      out.stitch(signed8(b1), -signed8(b2));
      continue;
    }
    const b3 = byte();
    const b4 = byte();
    if (b3 === null || b4 === null) break;
    if (b2 === 1) {
      out.move(signed8(b3), -signed8(b4));
    } else if (b2 === 3) {
      out.trim();
      const [x, y] = [signed8(b3), -signed8(b4)];
      if (x !== 0 || y !== 0) out.move(x, y);
    } else if (b2 === 8 || b2 >= 10 && b2 <= 23) {
      out.colorChange();
    } else if (b2 === 127 || b2 === 24) {
      break;
    }
  }
  out.end();
  offset += 2;
  for (let i = 0; i < colorCount && offset + 4 <= bytes.length; i++, offset += 4) {
    const thread = new EmbThread();
    thread.color = view.getUint32(offset, false);
    out.addThread(thread);
  }
  return out;
}

// src/writeXxx.ts
var { COMMAND_MASK: COMMAND_MASK5, STITCH: STITCH6, JUMP: JUMP6, TRIM: TRIM6, STOP: STOP6, END: END5, COLOR_CHANGE: COLOR_CHANGE6 } = EmbConstant;
var MAX_DELTA4 = 124;
function zeros(out, count) {
  out.writeBytes(new Array(count).fill(0));
}
function writeHeader2(out, pattern) {
  const stitches = pattern.stitches;
  const last = stitches[stitches.length - 1] ?? [0, 0, END5];
  const { minX, minY, maxX, maxY } = stitches.length > 0 ? pattern.extents() : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  zeros(out, 23);
  out.writeUint32le(stitches.length - 1);
  zeros(out, 12);
  out.writeUint32le(pattern.threadlist.length);
  out.writeUint16le(0);
  for (const value of [maxX - minX, maxY - minY, last[0], -last[1], -minX, maxY]) {
    out.writeUint16le(Math.trunc(value) & 65535);
  }
  zeros(out, 66 + 4 + 115);
  out.writeUint16le(32);
  zeros(out, 8);
}
function writeShort(out, dx, dy) {
  if (dx < -128 || dx > 127 || dy < -127 || dy > 128) {
    throw new RangeError(`writeXxx: a move exceeds the XXX limit of ${MAX_DELTA4}`);
  }
  out.writeUint8(dx & 255);
  out.writeUint8(-dy & 255);
}
function writeStitches2(out, pattern) {
  let x = 0;
  let y = 0;
  for (const stitch of pattern.stitches) {
    const command = stitch[2] & COMMAND_MASK5;
    const dx = pyRound(stitch[0] - x);
    const dy = pyRound(stitch[1] - y);
    x += dx;
    y += dy;
    if (command === COLOR_CHANGE6 || command === STOP6) {
      out.writeBytes([127, 8]);
      writeShort(out, dx, dy);
    } else if (command === END5) {
      break;
    } else if (command === STITCH6) {
      if (Math.abs(dx) < MAX_DELTA4 && Math.abs(dy) < MAX_DELTA4) {
        writeShort(out, dx, dy);
      } else {
        out.writeUint8(125);
        out.writeUint16le(dx & 65535);
        out.writeUint16le(-dy & 65535);
      }
    } else if (command === TRIM6) {
      out.writeBytes([127, 3]);
      writeShort(out, dx, dy);
    } else if (command === JUMP6) {
      out.writeBytes([127, 1]);
      writeShort(out, dx, dy);
    }
  }
}
function writeColors(out, pattern) {
  out.writeBytes([0, 0]);
  for (const thread of pattern.threadlist) {
    out.writeBytes([0, thread.getRed(), thread.getGreen(), thread.getBlue()]);
  }
  zeros(out, 4 * Math.max(0, 21 - pattern.threadlist.length));
  out.writeUint32le(4294967040);
  out.writeBytes([0, 1]);
}
function writeXxx(source, settings = {}) {
  const { encode = true, ...encoderSettings } = settings;
  const pattern = encode ? source.getNormalizedPattern({
    max_jump: MAX_DELTA4,
    max_stitch: MAX_DELTA4,
    full_jump: false,
    // As in current pyembroidery: no trim before color changes.
    explicit_trim: false,
    round: true,
    ...encoderSettings
  }) : source;
  const out = new ByteWriter();
  writeHeader2(out, pattern);
  const endOfStitchesOffset = out.tell();
  out.writeUint32le(0);
  writeStitches2(out, pattern);
  const endOfStitches = out.tell();
  out.seek(endOfStitchesOffset);
  out.writeUint32le(endOfStitches);
  out.seek(endOfStitches);
  out.writeBytes([127, 127, 2, 20]);
  writeColors(out, pattern);
  return out.toUint8Array();
}

// src/writePec.ts
var { COMMAND_MASK: COMMAND_MASK6, STITCH: STITCH7, JUMP: JUMP7, END: END6, COLOR_CHANGE: COLOR_CHANGE7 } = EmbConstant;
var JUMP_CODE2 = 16;
var TRIM_CODE2 = 32;
var PEC_ICON_WIDTH = 48;
var PEC_ICON_HEIGHT = 38;
var PEC_STRIDE = 6;
var PEC_HEADER_SIZE = 512;
var SPACE = 32;
var encoder = new TextEncoder();
function fromHex(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(Number.parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}
var BLANK_GRAPHIC = Uint8Array.from(
  fromHex(
    "000000000000f0ffffffff0f080000000010040000000020020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040020000000040040000000020080000000010f0ffffffff0f000000000000"
  )
);
function truncateUtf8(value, maxBytes) {
  const bytes = [];
  for (const character of value) {
    const next = encoder.encode(character);
    if (bytes.length + next.length > maxBytes) break;
    bytes.push(...next);
  }
  return Uint8Array.from(bytes);
}
function finiteExtents(pattern) {
  if (pattern.stitches.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return pattern.extents();
}
function sameThreadValue(a, b) {
  return (a.color & 16777215) === (b.color & 16777215) && a.description === b.description && a.catalog_number === b.catalog_number && a.details === b.details && a.brand === b.brand && a.chart === b.chart && a.weight === b.weight;
}
function buildUniquePalette(threadlist) {
  const chart = getThreadSet();
  const uniqueThreads = [];
  for (const thread of threadlist) {
    if (!uniqueThreads.some((unique) => sameThreadValue(unique, thread))) {
      uniqueThreads.push(thread);
    }
  }
  const assignments = [];
  for (const thread of uniqueThreads) {
    const index = findNearestColorIndex(thread, chart);
    if (index < 0) {
      throw new RangeError(
        `writePes: a PEC palette supports at most ${chart.length} unique threads`
      );
    }
    assignments.push(index);
    chart[index] = null;
  }
  return threadlist.map(
    (thread) => assignments[uniqueThreads.findIndex((unique) => sameThreadValue(unique, thread))]
  );
}
function writePec(pattern, out) {
  const extents = finiteExtents(pattern);
  const palette = buildUniquePalette(pattern.threadlist);
  if (palette.length < 1 || palette.length > 255) {
    throw new RangeError("writePes: PES supports between 1 and 255 color blocks");
  }
  const pecStart = out.tell();
  const name = pattern.getMetadata("name");
  const label = new Uint8Array(16).fill(SPACE);
  label.set(truncateUtf8(typeof name === "string" ? name : "Untitled", 8));
  out.writeBytes(encoder.encode("LA:"));
  out.writeBytes(label);
  out.writeUint8(13);
  out.writeBytes([...new Array(12).fill(SPACE), 255, 0]);
  out.writeUint8(PEC_ICON_WIDTH / 8);
  out.writeUint8(PEC_ICON_HEIGHT);
  out.writeBytes(new Array(12).fill(SPACE));
  const colorIndexList = [palette.length - 1, ...palette];
  out.writeBytes(colorIndexList);
  out.writeBytes(new Array(pecStart + PEC_HEADER_SIZE - out.tell()).fill(SPACE));
  writePecBlock(pattern, out, extents);
  writePecGraphics(pattern, out, extents);
  return {
    colorIndexList,
    rgbList: pattern.threadlist.map((thread) => thread.color)
  };
}
function writePecBlock(pattern, out, extents) {
  const blockStart = out.tell();
  out.writeBytes([0, 0]);
  out.writeInt24le(0);
  out.writeBytes([49, 255, 240]);
  out.writeInt16le(pyRound(extents.maxX - extents.minX));
  out.writeInt16le(pyRound(extents.maxY - extents.minY));
  out.writeInt16le(480);
  out.writeInt16le(432);
  encodePecStitches(pattern, out);
  const blockEnd = out.tell();
  out.seek(blockStart + 2);
  out.writeInt24le(blockEnd - blockStart);
  out.seek(blockEnd);
}
function checkedDelta(value) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`writePes: stitch delta must be finite, got ${value}`);
  }
  const rounded = pyRound(value);
  if (rounded < -2048 || rounded > 2047) {
    throw new RangeError(
      `writePes: stitch delta ${rounded} exceeds the PEC limit of -2048..2047`
    );
  }
  return rounded;
}
function writeValue(out, value, forceLong = false, flag = 0) {
  if (!forceLong && value > -64 && value < 63) {
    out.writeUint8(value & 127);
    return;
  }
  const encoded = value & 4095 | 32768 | flag << 8;
  out.writeUint8(encoded >> 8 & 255);
  out.writeUint8(encoded & 255);
}
function writeDelta2(out, dx, dy, flag) {
  writeValue(out, dx, flag !== void 0, flag);
  writeValue(out, dy, flag !== void 0, flag);
}
function encodePecStitches(pattern, out) {
  let colorTwo = true;
  let jumping = true;
  let initial = true;
  let x = 0;
  let y = 0;
  for (const stitch of pattern.stitches) {
    const command = stitch[2] & COMMAND_MASK6;
    if (command === END6) break;
    const dx = checkedDelta(stitch[0] - x);
    const dy = checkedDelta(stitch[1] - y);
    x += dx;
    y += dy;
    if (command === STITCH7) {
      if (jumping) {
        if (dx !== 0 && dy !== 0) writeDelta2(out, 0, 0);
        jumping = false;
      }
      writeDelta2(out, dx, dy);
    } else if (command === JUMP7) {
      jumping = true;
      writeDelta2(out, dx, dy, initial ? JUMP_CODE2 : TRIM_CODE2);
    } else if (command === COLOR_CHANGE7) {
      if (jumping) {
        writeDelta2(out, 0, 0);
        jumping = false;
      }
      out.writeBytes([254, 176, colorTwo ? 2 : 1]);
      colorTwo = !colorTwo;
    }
    initial = false;
  }
  out.writeUint8(255);
}
function writePecGraphics(pattern, out, extents) {
  const allPoints = [];
  for (const [block2] of pattern.getAsStitchblock()) allPoints.push(...block2);
  out.writeBytes(drawScaled(extents, allPoints, 4));
  for (const [block2] of pattern.getAsColorblocks()) {
    const stitches = block2.filter((stitch) => (stitch[2] & COMMAND_MASK6) === STITCH7);
    out.writeBytes(drawScaled(extents, stitches, 5));
  }
}
function drawScaled(extents, points, buffer) {
  const graphic = BLANK_GRAPHIC.slice();
  const diagramWidth = extents.maxX - extents.minX || 1;
  const diagramHeight = extents.maxY - extents.minY || 1;
  const graphicWidth = PEC_STRIDE * 8;
  const graphicHeight = graphic.length / PEC_STRIDE;
  const scale = Math.min(
    (graphicWidth - buffer) / diagramWidth,
    (graphicHeight - buffer) / diagramHeight
  );
  const translateX = graphicWidth / 2 - (extents.maxX + extents.minX) / 2 * scale;
  const translateY = graphicHeight / 2 - (extents.maxY + extents.minY) / 2 * scale;
  for (const point of points) {
    const x = Math.floor(point[0] * scale + translateX);
    const y = Math.floor(point[1] * scale + translateY);
    if (x < 0 || x >= graphicWidth || y < 0 || y >= graphicHeight) continue;
    graphic[y * PEC_STRIDE + Math.floor(x / 8)] |= 1 << x % 8;
  }
  return graphic;
}

// src/writePes.ts
var {
  COMMAND_MASK: COMMAND_MASK7,
  STITCH: STITCH8,
  JUMP: JUMP8,
  STOP: STOP7,
  COLOR_CHANGE: COLOR_CHANGE8,
  COLOR_BREAK: COLOR_BREAK2,
  SEW_TO: SEW_TO2,
  NEEDLE_AT: NEEDLE_AT2,
  CONTINGENCY_SEQUIN_JUMP: CONTINGENCY_SEQUIN_JUMP2
} = EmbConstant;
var PES_VERSION_1_SIGNATURE = "#PES0001";
var PES_VERSION_6_SIGNATURE = "#PES0060";
var MAX_PES_DELTA = 2047;
var encoder2 = new TextEncoder();
function writePes(source, settings) {
  const values = { ...settings ?? {} };
  const version = values.version ?? 6;
  if (version !== 1 && version !== 6) {
    throw new RangeError(`writePes: unsupported PES version ${String(version)}`);
  }
  let normalized;
  if (values.encode ?? true) {
    const encodeSettings = { ...values };
    if (encodeSettings.max_jump === void 0) {
      encodeSettings.max_jump = MAX_PES_DELTA;
    }
    if (encodeSettings.max_stitch === void 0) {
      encodeSettings.max_stitch = MAX_PES_DELTA;
    }
    if (encodeSettings.full_jump === void 0) encodeSettings.full_jump = true;
    if (encodeSettings.round === void 0) encodeSettings.round = true;
    if (encodeSettings.sequin_contingency === void 0) {
      encodeSettings.sequin_contingency = CONTINGENCY_SEQUIN_JUMP2;
    }
    normalized = source.getNormalizedPattern(encodeSettings);
  } else {
    normalized = clonePattern(source);
  }
  preparePatternForPes(normalized);
  return version === 6 ? writeVersion6(normalized) : writeVersion1(normalized);
}
function clonePattern(source) {
  const clone = new EmbPattern();
  clone.stitches = source.stitches.map(
    ([x, y, command]) => [x, y, command]
  );
  clone.threadlist.push(...source.threadlist);
  Object.assign(clone.extras, source.extras);
  clone._previousX = source._previousX;
  clone._previousY = source._previousY;
  return clone;
}
function preparePatternForPes(pattern) {
  pattern.fixColorCount();
  if (pattern.threadlist.length === 0) {
    pattern.addThread(pattern.getThreadOrFiller(0));
  }
  let threadIndex = 0;
  for (const stitch of pattern.stitches) {
    const command = stitch[2] & COMMAND_MASK7;
    if (command === STITCH8 || command === SEW_TO2 || command === NEEDLE_AT2) {
      continue;
    }
    if (command === COLOR_CHANGE8 || command === COLOR_BREAK2) {
      threadIndex += 1;
    } else if (command === STOP7) {
      const thread = pattern.threadlist[threadIndex];
      if (thread === void 0) continue;
      pattern.threadlist.splice(threadIndex, 0, thread);
      stitch[2] = COLOR_CHANGE8;
      threadIndex += 1;
    }
  }
}
function writeVersion1(pattern) {
  const out = new ByteWriter();
  out.writeBytes(encoder2.encode(PES_VERSION_1_SIGNATURE));
  const offsetPosition = out.tell();
  out.writeUint32le(0);
  const extents = finiteExtents(pattern);
  const chart = getThreadSet();
  if (pattern.stitches.length === 0) {
    out.writeInt16le(1);
    out.writeInt16le(1);
    out.writeInt16le(0);
    out.writeUint16le(0);
    out.writeUint16le(0);
  } else {
    out.writeInt16le(1);
    out.writeInt16le(1);
    out.writeInt16le(1);
    out.writeUint16le(65535);
    out.writeUint16le(0);
    writePesBlocks(out, pattern, chart, extents);
  }
  patchPecOffset(out, offsetPosition);
  writePec(pattern, out);
  return out.toUint8Array();
}
function writeVersion6(pattern) {
  const out = new ByteWriter();
  out.writeBytes(encoder2.encode(PES_VERSION_6_SIGNATURE));
  const offsetPosition = out.tell();
  out.writeUint32le(0);
  const extents = finiteExtents(pattern);
  if (pattern.stitches.length === 0) {
    writePesHeaderV6(out, pattern, 0);
    out.writeUint16le(0);
    out.writeUint16le(0);
  } else {
    writePesHeaderV6(out, pattern, 1);
    out.writeUint16le(65535);
    out.writeUint16le(0);
    const blockInfo = writePesBlocks(out, pattern, pattern.threadlist, extents);
    out.writeUint32le(0);
    out.writeUint32le(0);
    for (let index = 0; index < blockInfo.colorLogCount; index++) {
      out.writeUint32le(index);
      out.writeUint32le(0);
    }
  }
  patchPecOffset(out, offsetPosition);
  const colorInfo = writePec(pattern, out);
  writePesAddendum(out, colorInfo);
  out.writeUint16le(0);
  return out.toUint8Array();
}
function patchPecOffset(out, position) {
  const pecPosition = out.tell();
  out.seek(position);
  out.writeUint32le(pecPosition);
  out.seek(pecPosition);
}
function writePesHeaderV6(out, pattern, distinctBlockObjects) {
  out.writeInt16le(1);
  out.writeBytes(encoder2.encode("02"));
  for (const key of ["name", "category", "author", "keywords", "comments"]) {
    writePesString8(out, pattern.getMetadata(key));
  }
  for (const value of [0, 0, 100, 100, 0, 200, 200, 100, 100, 100, 7, 19, 1, 1, 0, 100, 1, 0]) {
    out.writeInt16le(value);
  }
  writePesString8(out, pattern.getMetadata("image_file"));
  for (const value of [1, 0, 0, 1, 0, 0]) out.writeFloat32le(value);
  out.writeUint16le(0);
  out.writeUint16le(0);
  out.writeUint16le(0);
  if (pattern.threadlist.length > 65535) {
    throw new RangeError("writePes: too many PES v6 threads");
  }
  out.writeUint16le(pattern.threadlist.length);
  for (const thread of pattern.threadlist) writePesThread(out, thread);
  out.writeInt16le(distinctBlockObjects);
}
function writePesThread(out, thread) {
  writePesString8(out, thread.catalog_number);
  out.writeUint8(thread.getRed());
  out.writeUint8(thread.getGreen());
  out.writeUint8(thread.getBlue());
  out.writeUint8(0);
  out.writeUint32le(10);
  writePesString8(out, thread.description);
  writePesString8(out, thread.brand);
  writePesString8(out, thread.chart);
}
function writePesString8(out, value) {
  if (typeof value !== "string") {
    out.writeUint8(0);
    return;
  }
  const bytes = truncateUtf8(value, 255);
  out.writeUint8(bytes.length);
  out.writeBytes(bytes);
}
function writePesString16(out, value) {
  const bytes = truncateUtf8(value, 65535);
  out.writeUint16le(bytes.length);
  out.writeBytes(bytes);
}
function writePesBlocks(out, pattern, chart, extents) {
  if (pattern.stitches.length === 0) return { sectionCount: 0, colorLogCount: 0 };
  const centerX = (extents.maxX + extents.minX) / 2;
  const centerY = (extents.maxY + extents.minY) / 2;
  const left = extents.minX - centerX;
  const top = extents.minY - centerY;
  const right = extents.maxX - centerX;
  const bottom = extents.maxY - centerY;
  writePesString16(out, "CEmbOne");
  const sectionCountPosition = writePesSewSegHeader(out, right - left, bottom - top);
  out.writeUint16le(65535);
  out.writeUint16le(0);
  writePesString16(out, "CSewSeg");
  const segmentInfo = writePesSewSegSegments(
    out,
    pattern,
    chart,
    left,
    bottom,
    centerX,
    centerY
  );
  const end = out.tell();
  out.seek(sectionCountPosition);
  out.writeUint16le(segmentInfo.sectionCount);
  out.seek(end);
  out.writeUint16le(0);
  out.writeUint16le(0);
  return {
    sectionCount: segmentInfo.sectionCount,
    colorLogCount: segmentInfo.colorLogCount
  };
}
function writePesSewSegHeader(out, width, height) {
  for (let index = 0; index < 8; index++) out.writeUint16le(0);
  const translateX = 350 + 1300 / 2 - width / 2;
  const translateY = 100 + height + 1800 / 2 - height / 2;
  for (const value of [1, 0, 0, 1, translateX, translateY]) out.writeFloat32le(value);
  out.writeUint16le(1);
  out.writeUint16le(0);
  out.writeUint16le(0);
  out.writeInt16le(Math.trunc(width));
  out.writeInt16le(Math.trunc(height));
  out.writeBytes(new Array(8).fill(0));
  const sectionCountPosition = out.tell();
  out.writeUint16le(0);
  return sectionCountPosition;
}
function* getAsSegmentBlocks(pattern, chart) {
  let colorIndex = 0;
  let currentThread = pattern.getThreadOrFiller(colorIndex);
  colorIndex += 1;
  let colorCode = findNearestColorIndex(currentThread, chart);
  let stitchedX = 0;
  let stitchedY = 0;
  for (const commandBlock of pattern.getAsCommandBlocks()) {
    if (commandBlock.length === 0) continue;
    const points = [];
    const command = commandBlock[0][2] & COMMAND_MASK7;
    if (command === JUMP8) {
      points.push([stitchedX, stitchedY]);
      const last = commandBlock[commandBlock.length - 1];
      points.push([last[0], last[1]]);
      yield { points, colorCode, flag: 1 };
    } else if (command === COLOR_CHANGE8) {
      currentThread = pattern.getThreadOrFiller(colorIndex);
      colorIndex += 1;
      colorCode = findNearestColorIndex(currentThread, chart);
    } else if (command === STITCH8) {
      for (const stitch of commandBlock) {
        stitchedX = stitch[0];
        stitchedY = stitch[1];
        points.push([stitchedX, stitchedY]);
      }
      yield { points, colorCode, flag: 0 };
    }
  }
}
function writePesSewSegSegments(out, pattern, chart, left, bottom, centerX, centerY) {
  let section = 0;
  const colorLog = [];
  let previousColorCode = -1;
  let wrotePrevious = false;
  const adjustX = left + centerX;
  const adjustY = bottom + centerY;
  for (const segment of getAsSegmentBlocks(pattern, chart)) {
    if (wrotePrevious) out.writeUint16le(32771);
    if (previousColorCode !== segment.colorCode) {
      colorLog.push([section, segment.colorCode]);
      previousColorCode = segment.colorCode;
    }
    out.writeUint16le(segment.flag);
    out.writeUint16le(segment.colorCode);
    out.writeUint16le(segment.points.length);
    for (const [x, y] of segment.points) {
      out.writeInt16le(Math.trunc(x - adjustX));
      out.writeInt16le(Math.trunc(y - adjustY));
    }
    section += 1;
    wrotePrevious = true;
  }
  out.writeUint16le(colorLog.length);
  for (const [index, colorCode] of colorLog) {
    out.writeUint16le(index);
    out.writeUint16le(colorCode);
  }
  return {
    sectionCount: section,
    colorLogCount: colorLog.length
  };
}
function writePesAddendum(out, colorInfo) {
  out.writeBytes(colorInfo.colorIndexList);
  out.writeBytes(
    new Array(Math.max(0, 128 - colorInfo.colorIndexList.length)).fill(
      32
    )
  );
  out.writeBytes(new Array(144 * colorInfo.rgbList.length).fill(0));
  for (const color of colorInfo.rgbList) out.writeInt24le(color);
}

// src/svg/pathData.ts
import { SVGPathData } from "svg-pathdata";

// src/svg/numbers.ts
var UNITS_PER_MM = 10;
var NUMBER = "[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?";
var EXACT_NUMBER = new RegExp(`^${NUMBER}$`);
var LENGTH = new RegExp(`^(${NUMBER})\\s*([a-zA-Z%]*)$`);
var SVG_UNITS_TO_PX = {
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6
};
function parseNumberList(value, context) {
  const text = value.trim();
  if (text === "") return [];
  return text.split(/\s*,\s*|\s+/).map((token) => {
    const number = Number(token);
    if (!EXACT_NUMBER.test(token) || !Number.isFinite(number)) {
      throw new Error(`Invalid SVG ${context} number "${token}"`);
    }
    return number;
  });
}
function scanNumbers(value) {
  return (value.match(new RegExp(NUMBER, "g")) ?? []).map(Number).filter(Number.isFinite);
}
function parseSvgLength(value) {
  const match = value?.trim().match(LENGTH);
  if (!match) return null;
  const number = Number(match[1]);
  const factor = SVG_UNITS_TO_PX[(match[2] || "px").toLowerCase()];
  return Number.isFinite(number) && factor !== void 0 ? number * factor : null;
}

// src/svg/pathData.ts
var SATIN_MIN_WIDTH = 1 * UNITS_PER_MM;
var SATIN_MAX_WIDTH = 7 * UNITS_PER_MM;
function distance2(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
function flattenCubic(points, start, c1, c2, end, tolerance) {
  const bend = Math.max(
    Math.hypot(start.x - 2 * c1.x + c2.x, start.y - 2 * c1.y + c2.y),
    Math.hypot(c1.x - 2 * c2.x + end.x, c1.y - 2 * c2.y + end.y)
  );
  const steps = Math.max(
    1,
    Math.min(
      512,
      Math.ceil(Math.sqrt(0.75 * bend / Math.max(tolerance, 1e-3)))
    )
  );
  for (let index = 1; index < steps; index += 1) {
    const t = index / steps;
    const u = 1 - t;
    points.push({
      x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
      y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y
    });
  }
  points.push(end);
}
function flattenSvgPath(data, tolerance = 0.25, transform) {
  const path = new SVGPathData(data).toAbs().normalizeHVZ(false).normalizeST().qtToC().aToC();
  if (transform) {
    path.matrix(
      transform[0],
      transform[1],
      transform[3],
      transform[4],
      transform[6],
      transform[7]
    );
  }
  const subpaths = [];
  let points = [];
  let start = { x: 0, y: 0 };
  const flush = (closed) => {
    if (points.length > 0) subpaths.push({ points, closed });
    points = [];
  };
  for (const command of path.commands) {
    if (command.type === SVGPathData.MOVE_TO) {
      flush(false);
      start = { x: command.x, y: command.y };
      points = [start];
      continue;
    }
    if (command.type === SVGPathData.CLOSE_PATH) {
      flush(true);
      continue;
    }
    if (points.length === 0) points.push(start);
    if (command.type === SVGPathData.CURVE_TO) {
      flattenCubic(
        points,
        points[points.length - 1],
        { x: command.x1, y: command.y1 },
        { x: command.x2, y: command.y2 },
        { x: command.x, y: command.y },
        tolerance
      );
    } else if (command.type === SVGPathData.LINE_TO) {
      points.push({ x: command.x, y: command.y });
    }
  }
  flush(false);
  return subpaths;
}
function resample(points, closed, stitchLength) {
  const output = [points[0]];
  const segments = closed ? [...points, points[0]] : points;
  for (let index = 1; index < segments.length; index += 1) {
    const start = segments[index - 1];
    const end = segments[index];
    const length2 = distance2(start, end);
    if (length2 <= 1e-6) {
      const last = output[output.length - 1];
      if (last.x !== end.x || last.y !== end.y) output.push(end);
      continue;
    }
    const count = Math.max(1, Math.ceil(length2 / stitchLength));
    for (let step = 1; step <= count; step += 1) {
      const amount = step / count;
      output.push({
        x: start.x + (end.x - start.x) * amount,
        y: start.y + (end.y - start.y) * amount
      });
    }
  }
  return output;
}
function unit(x, y) {
  const length2 = Math.hypot(x, y);
  return length2 > 0 ? { x: x / length2, y: y / length2 } : { x: 0, y: 0 };
}
function satin(points, closed, width, spacing) {
  const line = points.filter(
    (point, i) => i === 0 || distance2(points[i - 1], point) > 1e-6
  );
  if (closed && line.length > 1 && distance2(line[0], line[line.length - 1]) > 1e-6)
    line.push(line[0]);
  if (line.length < 2) return [...line];
  const segments = line.slice(1).map((end, i) => unit(end.x - line[i].x, end.y - line[i].y));
  const tangents = line.map((_, i) => {
    let before = segments[i - 1];
    let after = segments[i];
    if (closed && (i === 0 || i === line.length - 1))
      [before, after] = [segments[segments.length - 1], segments[0]];
    if (!before || !after) return before ?? after;
    const blended = unit(before.x + after.x, before.y + after.y);
    return blended.x === 0 && blended.y === 0 ? after : blended;
  });
  const lengths = [0];
  for (let i = 1; i < line.length; i++)
    lengths.push(lengths[i - 1] + distance2(line[i - 1], line[i]));
  const total = lengths[lengths.length - 1];
  let count = Math.max(1, Math.ceil(total / (spacing / 2)));
  if (closed && count % 2 === 1) count += 1;
  const output = [];
  let segment = 0;
  for (let k = 0; k <= count; k++) {
    const along = total * k / count;
    while (segment < line.length - 2 && lengths[segment + 1] < along) segment++;
    const t = Math.min(
      1,
      Math.max(
        0,
        (along - lengths[segment]) / (lengths[segment + 1] - lengths[segment])
      )
    );
    const [a, b] = [line[segment], line[segment + 1]];
    const [ta, tb] = [tangents[segment], tangents[segment + 1]];
    const tangent = unit(ta.x + (tb.x - ta.x) * t, ta.y + (tb.y - ta.y) * t);
    const offset = k % 2 === 0 ? width / 2 : -width / 2;
    output.push({
      x: a.x + (b.x - a.x) * t - tangent.y * offset,
      y: a.y + (b.y - a.y) * t + tangent.x * offset
    });
  }
  return output;
}
function resolveStitchSettings(settings = {}) {
  const {
    runningStitchLength = 2.5,
    fillStitchLength = 3,
    rowSpacing = 0.4,
    pullCompensation = 0,
    underlay = true,
    fillAngle = 45,
    tieStitches = 0
  } = settings;
  const invalid = (message) => new RangeError(`Stitch settings: ${message}`);
  if (!Number.isFinite(runningStitchLength) || runningStitchLength <= 0) {
    throw invalid("running stitch length must be a positive finite number");
  }
  if (!Number.isFinite(fillStitchLength) || fillStitchLength <= 0) {
    throw invalid("fill stitch length must be a positive finite number");
  }
  if (!Number.isFinite(pullCompensation) || pullCompensation < 0) {
    throw invalid("pull compensation must be a non-negative number");
  }
  if (!Number.isFinite(rowSpacing) || rowSpacing <= 0) {
    throw invalid("row spacing must be a positive finite number");
  }
  if (typeof underlay !== "boolean") {
    throw invalid("underlay must be a boolean");
  }
  if (!Number.isFinite(fillAngle)) {
    throw invalid("fill angle must be a finite number");
  }
  if (!Number.isInteger(tieStitches) || tieStitches < 0) {
    throw invalid("tieStitches must be a non-negative integer");
  }
  return {
    runningStitchLength,
    fillStitchLength,
    rowSpacing,
    pullCompensation,
    underlay,
    fillAngle,
    tieStitches
  };
}
function resolveFlattenTolerance(flattenTolerance = 0.05) {
  if (!Number.isFinite(flattenTolerance) || flattenTolerance <= 0) {
    throw new RangeError(
      "SVG flatten tolerance must be a positive finite number"
    );
  }
  return flattenTolerance;
}
function strokeWidth(shape) {
  const [a, b, , c, d] = shape.transform;
  return (shape.outline?.style.width ?? 0) * Math.sqrt(Math.abs(a * d - b * c));
}
function strokePoints(line, width, options) {
  const run = resample(
    line.points,
    line.closed,
    options.runningStitchLength * UNITS_PER_MM
  );
  if (width < SATIN_MIN_WIDTH) return run;
  width += 2 * options.pullCompensation * UNITS_PER_MM;
  const spacing = options.rowSpacing * UNITS_PER_MM;
  if (!options.underlay) return satin(line.points, line.closed, width, spacing);
  const back = line.closed ? line.points : [...line.points].reverse();
  return [...run, ...satin(back, line.closed, width, spacing)];
}

// src/svg/normalize.ts
import { SVGShapes } from "svg-pathdata";

// src/svg/transform.ts
var TRANSFORM = /\s*,?\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/y;
var ARGUMENT_COUNTS = {
  matrix: [6],
  translate: [1, 2],
  scale: [1, 2],
  rotate: [1, 3],
  skewX: [1],
  skewY: [1]
};
function svgMatrix(a, b, c, d, e, f) {
  return [a, b, 0, c, d, 0, e, f, 1];
}
function composeSvgMatrix(outer, inner) {
  return matrixMultiply(inner, outer);
}
function invertMatrix(m) {
  const [a, b, , c, d, , e, f] = m;
  const determinant = a * d - b * c;
  return svgMatrix(
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant
  );
}
function transformMatrix(name, v) {
  switch (name) {
    case "matrix":
      return svgMatrix(v[0], v[1], v[2], v[3], v[4], v[5]);
    case "translate":
      return getTranslate(v[0], v[1] ?? 0);
    case "scale":
      return getScale(v[0], v[1] ?? v[0]);
    case "rotate":
      return v.length === 1 ? getRotate(v[0]) : matrixMultiply(matrixMultiply(getTranslate(-v[1], -v[2]), getRotate(v[0])), getTranslate(v[1], v[2]));
    case "skewX":
      return svgMatrix(1, 0, Math.tan(v[0] * Math.PI / 180), 1, 0, 0);
    default:
      return svgMatrix(1, Math.tan(v[0] * Math.PI / 180), 0, 1, 0, 0);
  }
}
function parseSvgTransform(value) {
  const source = value?.trim() ?? "";
  let result = getIdentity();
  if (source === "" || source === "none") return result;
  TRANSFORM.lastIndex = 0;
  while (TRANSFORM.lastIndex < source.length) {
    const offset = TRANSFORM.lastIndex;
    const match = TRANSFORM.exec(source);
    if (match === null) {
      throw new Error(`Invalid SVG transform syntax near "${source.slice(offset).trim()}"`);
    }
    const [, name, args] = match;
    const values = parseNumberList(args, "transform");
    if (!ARGUMENT_COUNTS[name].includes(values.length)) {
      throw new Error(`SVG ${name}() requires ${ARGUMENT_COUNTS[name].join(" or ")} numbers`);
    }
    result = composeSvgMatrix(result, transformMatrix(name, values));
  }
  return result;
}

// src/svg/viewport.ts
var ALIGNMENT = { Min: 0, Mid: 0.5, Max: 1 };
function viewportMatrix(x, y, width, height, targetSize, preserveAspectRatio) {
  const [align, meetOrSlice] = preserveAspectRatio.trim().split(/\s+/);
  const scaleX = targetSize / width;
  const scaleY = targetSize / height;
  if (align === "none") {
    return svgMatrix(scaleX, 0, 0, scaleY, -x * scaleX, -y * scaleY);
  }
  const [, alignX = "Mid", alignY = "Mid"] = align.match(/^x(Min|Mid|Max)Y(Min|Mid|Max)$/) ?? [];
  const scale = meetOrSlice === "slice" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  return svgMatrix(
    scale,
    0,
    0,
    scale,
    (targetSize - width * scale) * ALIGNMENT[alignX] - x * scale,
    (targetSize - height * scale) * ALIGNMENT[alignY] - y * scale
  );
}
function normalizeSvgViewport(root, targetSize = 1e3, preserveAspectRatio = "xMidYMid meet") {
  if (!Number.isFinite(targetSize) || targetSize <= 0) {
    throw new RangeError("SVG size must be a positive finite number");
  }
  const viewBox = root.getAttribute("viewBox");
  let x = 0;
  let y = 0;
  let width;
  let height;
  if (viewBox !== null) {
    const values = parseNumberList(viewBox, "viewBox");
    if (values.length !== 4) throw new Error("SVG viewBox requires four numbers");
    [x, y, width, height] = values;
  } else {
    width = parseSvgLength(root.getAttribute("width")) ?? 300;
    height = parseSvgLength(root.getAttribute("height")) ?? 150;
  }
  if (width <= 0 || height <= 0) {
    throw new Error("SVG viewport must have positive dimensions");
  }
  return {
    sourceX: x,
    sourceY: y,
    sourceWidth: width,
    sourceHeight: height,
    targetSize,
    preserveAspectRatio,
    transform: viewportMatrix(x, y, width, height, targetSize, preserveAspectRatio)
  };
}

// src/svg/css.ts
var SIMPLE_SELECTOR = /^([a-zA-Z][\w-]*|\*)?((?:[.#][\w-]+)*)$/;
function parseDeclarations(text) {
  const declarations = [];
  for (const part of text.split(";")) {
    const separator = part.indexOf(":");
    if (separator < 0) continue;
    const property = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).replace(/!important\s*$/i, "").trim();
    if (property && value) declarations.push([property, value]);
  }
  return declarations;
}
function parseSelector(text) {
  const match = text.match(SIMPLE_SELECTOR);
  if (!match || text === "") return null;
  const tag = match[1] && match[1] !== "*" ? match[1].toLowerCase() : null;
  const parts = match[2].match(/[.#][\w-]+/g) ?? [];
  const ids = parts.filter((part) => part.startsWith("#")).map((part) => part.slice(1));
  if (ids.length > 1) return null;
  const classes = parts.filter((part) => part.startsWith(".")).map((part) => part.slice(1));
  return {
    tag,
    id: ids[0] ?? null,
    classes,
    specificity: ids.length * 100 + classes.length * 10 + (tag ? 1 : 0)
  };
}
function parseStylesheet(source, warn) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  let offset = 0;
  while (offset < text.length) {
    const open = text.indexOf("{", offset);
    if (open < 0) break;
    let depth = 1;
    let close = open + 1;
    while (close < text.length && depth > 0) {
      if (text[close] === "{") depth += 1;
      else if (text[close] === "}") depth -= 1;
      close += 1;
    }
    const prelude = text.slice(offset, open).split(";").pop().trim();
    const body = text.slice(open + 1, close - 1);
    offset = close;
    if (prelude.startsWith("@")) {
      warn(`Skipped CSS at-rule ${prelude.split(/\s/)[0]}`);
      continue;
    }
    const declarations = parseDeclarations(body);
    for (const selectorText of prelude.split(",")) {
      const selector = parseSelector(selectorText.trim());
      if (selector === null) {
        warn(`Skipped unsupported CSS selector "${selectorText.trim()}"`);
        continue;
      }
      rules.push({ ...selector, order: rules.length, declarations });
    }
  }
  return rules;
}
function matchingDeclarations(element, tag, rules) {
  if (rules.length === 0) return [];
  const id = element.getAttribute("id");
  const classes = new Set((element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean));
  return rules.filter(
    (rule) => (rule.tag === null || rule.tag === tag) && (rule.id === null || rule.id === id) && rule.classes.every((name) => classes.has(name))
  ).sort((a, b) => a.specificity - b.specificity || a.order - b.order).flatMap((rule) => rule.declarations);
}

// src/svg/styles.ts
import { colord, extend } from "colord";
import namesPlugin from "colord/plugins/names";
var PRESENTATION_ATTRIBUTES = [
  "stroke",
  "fill",
  "color",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "fill-rule",
  "clip-rule",
  "clip-path",
  "opacity",
  "display",
  "visibility",
  "stop-color"
];
var NO_STYLES = { rules: [], resolvePaint: () => null };
function getDefaultSvgStyle() {
  const black = new EmbThread();
  black.setColor(0, 0, 0);
  return {
    stroke: null,
    fill: black,
    fillRule: "nonzero",
    strokeWidth: 1,
    linecap: "butt",
    linejoin: "miter",
    dashArray: null,
    dashOffset: 0,
    color: black,
    opacity: 1,
    display: true,
    visibility: true
  };
}
var namesLoaded = false;
function parseSvgColor(value) {
  if (value === null || value === void 0) return null;
  if (!namesLoaded) {
    extend([namesPlugin]);
    namesLoaded = true;
  }
  const color = colord(value.trim().toLowerCase());
  if (!color.isValid() || color.alpha() === 0) return null;
  const { r, g, b } = color.toRgb();
  const thread = new EmbThread();
  thread.setColor(r, g, b);
  return thread;
}
function parsePaint(text, style, context) {
  if (text.toLowerCase() === "currentcolor") return style.color;
  const reference = text.match(/^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)\s*(.*)$/i);
  if (reference === null) return parseSvgColor(text);
  return context.resolvePaint(reference[1]) ?? parseSvgColor(reference[2]);
}
function applyProperty(style, [name, text], context) {
  const keyword = text.toLowerCase();
  if (keyword === "inherit") return;
  switch (name) {
    case "stroke":
    case "fill":
      style[name] = parsePaint(text, style, context);
      break;
    case "color":
      style.color = parseSvgColor(text) ?? style.color;
      break;
    case "stroke-width":
      style.strokeWidth = parseSvgLength(text) ?? style.strokeWidth;
      break;
    case "stroke-linecap":
      style.linecap = text;
      break;
    case "stroke-linejoin":
      style.linejoin = text;
      break;
    case "stroke-dashoffset":
      style.dashOffset = parseSvgLength(text) ?? style.dashOffset;
      break;
    case "stroke-dasharray": {
      const values = keyword === "none" ? [] : text.split(/[\s,]+/).map(parseSvgLength).filter((item) => item !== null);
      style.dashArray = values.length > 0 ? values : null;
      break;
    }
    case "fill-rule":
      if (keyword === "evenodd" || keyword === "nonzero") style.fillRule = keyword;
      break;
    case "opacity": {
      const opacity = Number(text);
      if (Number.isFinite(opacity)) style.opacity *= Math.max(0, Math.min(1, opacity));
      break;
    }
    case "display":
      style.display = keyword !== "none";
      break;
    case "visibility":
      style.visibility = keyword !== "hidden" && keyword !== "collapse";
      break;
  }
}
function cascade(element, tag, rules) {
  const declarations = [];
  for (const property of PRESENTATION_ATTRIBUTES) {
    const value = element.getAttribute(property)?.trim();
    if (value) declarations.push([property, value]);
  }
  declarations.push(...matchingDeclarations(element, tag, rules));
  declarations.push(...parseDeclarations(element.getAttribute("style") ?? ""));
  return declarations;
}
function declaredValue(element, tag, rules, property) {
  return cascade(element, tag, rules).filter(([name]) => name === property).pop()?.[1] ?? null;
}
function applySvgStyle(element, tag, inherited, context = NO_STYLES) {
  const style = { ...inherited };
  for (const declaration of cascade(element, tag, context.rules)) {
    applyProperty(style, declaration, context);
  }
  return style;
}
function getStrokeStyle(style) {
  if (style.stroke === null || style.strokeWidth <= 0) return null;
  return {
    color: style.stroke,
    width: style.strokeWidth,
    linecap: style.linecap,
    linejoin: style.linejoin,
    dashArray: style.dashArray,
    dashOffset: style.dashOffset
  };
}
function getFillStyle(style) {
  return { color: style.fill, rule: style.fillRule };
}

// src/svg/normalize.ts
var SVG_NAMESPACE = "http://www.w3.org/2000/svg";
var XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
var SHAPE_TAGS = /* @__PURE__ */ new Set([
  "path",
  "line",
  "polyline",
  "polygon",
  "rect",
  "circle",
  "ellipse"
]);
var CONTAINER_TAGS = /* @__PURE__ */ new Set(["g", "svg", "a", "symbol"]);
var IGNORED_TAGS = /* @__PURE__ */ new Set([
  "defs",
  "style",
  "title",
  "desc",
  "metadata",
  "script",
  "foreignobject",
  "lineargradient",
  "radialgradient",
  "clippath"
]);
var GRADIENT_TAGS = /* @__PURE__ */ new Set(["lineargradient", "radialgradient"]);
function localName(element) {
  return (element.localName || element.tagName.split(":").pop() || "").toLowerCase();
}
function isSvgElement(element) {
  const namespace = element.namespaceURI;
  return namespace === null || namespace === "" || namespace === SVG_NAMESPACE;
}
function length(element, name) {
  return parseSvgLength(element.getAttribute(name)) ?? 0;
}
function parseDocument(source, Parser) {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new Error(
      "readSvg: DOCTYPE and entity declarations are not supported"
    );
  }
  if (Parser === void 0) {
    throw new Error("readSvg: no DOMParser here; pass one in the settings");
  }
  const text = source.replace(
    /<!\[CDATA\[([\s\S]*?)\]\]>/g,
    (_, content) => content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  );
  const document = new Parser().parseFromString(
    text,
    "image/svg+xml"
  );
  const error = document.getElementsByTagNameNS("*", "parsererror")[0] ?? document.getElementsByTagName("parsererror")[0];
  if (error) {
    throw new Error(
      `readSvg: XML parse error: ${error.textContent ?? "invalid SVG"}`
    );
  }
  const root = document.documentElement;
  if (!root || localName(root) !== "svg" || !isSvgElement(root)) {
    throw new Error("readSvg: document root must be an SVG element");
  }
  return document;
}
function shapePath(element, tag) {
  switch (tag) {
    case "path":
      return element.getAttribute("d")?.trim() || null;
    case "line":
      return SVGShapes.createPolyline([
        length(element, "x1"),
        length(element, "y1"),
        length(element, "x2"),
        length(element, "y2")
      ]);
    case "polyline":
    case "polygon": {
      const coords = scanNumbers(element.getAttribute("points") ?? "");
      if (coords.length < 4) return null;
      coords.length -= coords.length % 2;
      return tag === "polygon" ? SVGShapes.createPolygon(coords) : SVGShapes.createPolyline(coords);
    }
    case "rect": {
      const width = length(element, "width");
      const height = length(element, "height");
      if (width <= 0 || height <= 0) return null;
      const rx = parseSvgLength(element.getAttribute("rx"));
      const ry = parseSvgLength(element.getAttribute("ry"));
      return SVGShapes.createRect(
        length(element, "x"),
        length(element, "y"),
        width,
        height,
        Math.max(0, rx ?? ry ?? 0),
        Math.max(0, ry ?? rx ?? 0)
      );
    }
    case "circle":
    case "ellipse": {
      const rx = length(element, tag === "circle" ? "r" : "rx");
      const ry = length(element, tag === "circle" ? "r" : "ry");
      if (rx <= 0 || ry <= 0) return null;
      return SVGShapes.createEllipse(
        rx,
        ry,
        length(element, "cx"),
        length(element, "cy")
      );
    }
    default:
      return null;
  }
}
function childElements(element) {
  return Array.from(element.childNodes).filter((node) => node.nodeType === 1);
}
function collectIds(root) {
  const ids = /* @__PURE__ */ new Map();
  for (const element of [root, ...Array.from(root.getElementsByTagName("*"))]) {
    const id = element.getAttribute("id");
    if (id !== null && !ids.has(id)) ids.set(id, element);
  }
  return ids;
}
function colorDistance(a, b) {
  return Math.sqrt(
    colorDistanceRedMean(
      a.getRed(),
      a.getGreen(),
      a.getBlue(),
      b.getRed(),
      b.getGreen(),
      b.getBlue()
    )
  );
}
function averageColor(threads) {
  if (threads.length === 0) return null;
  const mean = (channel) => Math.round(
    threads.reduce((sum, thread2) => sum + channel(thread2), 0) / threads.length
  );
  const thread = new EmbThread();
  thread.setColor(
    mean((t) => t.getRed()),
    mean((t) => t.getGreen()),
    mean((t) => t.getBlue())
  );
  return thread;
}
function useHref(element) {
  return element.getAttribute("href")?.trim() || element.getAttribute("xlink:href")?.trim() || element.getAttributeNS(XLINK_NAMESPACE, "href")?.trim() || null;
}
function collectShapes(document, viewport, settings) {
  const root = document.documentElement;
  const ids = collectIds(root);
  const shapes = [];
  const warnings = [];
  const warn = (message) => warnings.push(message);
  const maxDepth = settings.maxUseDepth ?? 32;
  const maxInstances = settings.maxUseInstances ?? 1e4;
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    throw new RangeError("SVG maxUseDepth must be a non-negative integer");
  }
  if (!Number.isInteger(maxInstances) || maxInstances < 0) {
    throw new RangeError("SVG maxUseInstances must be a non-negative integer");
  }
  const tolerance = settings.colorTolerance ?? 10;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError("SVG colorTolerance must be a non-negative number");
  }
  let instances = 0;
  const styleSheet = Array.from(root.getElementsByTagName("style")).map((element) => element.textContent ?? "").join("\n");
  const rules = parseStylesheet(styleSheet, warn);
  const gradients = /* @__PURE__ */ new Map();
  const gradientColor = (id, seen = /* @__PURE__ */ new Set()) => {
    if (gradients.has(id)) return gradients.get(id);
    const element = ids.get(id);
    if (element === void 0 || !GRADIENT_TAGS.has(localName(element)) || seen.has(id)) {
      warn(`Unsupported paint url(#${id})`);
      gradients.set(id, null);
      return null;
    }
    const stops = childElements(element).filter(
      (child) => localName(child) === "stop"
    );
    let color;
    if (stops.length > 0) {
      color = averageColor(
        stops.map(
          (stop) => declaredValue(stop, "stop", rules, "stop-color") ?? "black"
        ).map(parseSvgColor).filter((thread) => thread !== null)
      );
    } else {
      const href = useHref(element);
      color = href?.startsWith("#") ? gradientColor(href.slice(1), seen.add(id)) : null;
    }
    gradients.set(id, color);
    return color;
  };
  const context = {
    rules,
    resolvePaint: (id) => gradientColor(id)
  };
  const threads = [];
  const canonicalThread = (thread) => {
    const match = threads.find(
      (known) => colorDistance(known, thread) <= tolerance
    );
    if (match) return match;
    threads.push(thread);
    return thread;
  };
  const clipReference = (value) => {
    if (value === null || value.toLowerCase() === "none") return null;
    const id = value.match(/^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/)?.[1];
    const element = id === void 0 ? void 0 : ids.get(id);
    if (element === void 0 || localName(element) !== "clippath") {
      warn(`Unsupported clip-path ${value}`);
      return null;
    }
    return element;
  };
  const clipChain = (element, tag) => {
    const chain = [];
    for (let clip = clipReference(declaredValue(element, tag, rules, "clip-path")); clip !== null && !chain.includes(clip); ) {
      chain.push(clip);
      clip = clipReference(declaredValue(clip, "clippath", rules, "clip-path"));
    }
    return chain;
  };
  const boundingBox = (owned, toLocal) => {
    const points = owned.flatMap(
      (shape) => flattenSvgPath(
        (shape.fill ?? shape.outline).d,
        0.1,
        composeSvgMatrix(toLocal, shape.transform)
      ).flatMap((subpath) => subpath.points)
    );
    if (points.length === 0) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const [x, y] = [Math.min(...xs), Math.min(...ys)];
    return svgMatrix(Math.max(...xs) - x, 0, 0, Math.max(...ys) - y, x, y);
  };
  const clipParts = (clip, ownerTransform, owned) => {
    let base = ownerTransform;
    if (clip.getAttribute("clipPathUnits") === "objectBoundingBox") {
      const box = boundingBox(owned, invertMatrix(ownerTransform));
      if (box === null) return [];
      base = composeSvgMatrix(base, box);
    }
    base = composeSvgMatrix(
      base,
      parseSvgTransform(clip.getAttribute("transform"))
    );
    const defaultRule = declaredValue(clip, "clippath", rules, "clip-rule");
    const parts = [];
    const add = (child, parent, depth) => {
      const tag = localName(child);
      if (declaredValue(child, tag, rules, "display") === "none") return;
      const transform = composeSvgMatrix(
        parent,
        parseSvgTransform(child.getAttribute("transform"))
      );
      if (tag === "use") {
        const target = ids.get(useHref(child)?.slice(1) ?? "");
        if (target !== void 0 && depth < maxDepth) {
          add(
            target,
            composeSvgMatrix(
              transform,
              getTranslate(length(child, "x"), length(child, "y"))
            ),
            depth + 1
          );
        }
        return;
      }
      if (!SHAPE_TAGS.has(tag)) {
        warn(`Skipped unsupported <${tag}> in clipPath`);
        return;
      }
      const path = shapePath(child, tag);
      if (path === null) return;
      const rule = declaredValue(child, tag, rules, "clip-rule") ?? defaultRule;
      parts.push({
        d: typeof path === "string" ? path : path.encode(),
        transform,
        rule: rule?.toLowerCase() === "evenodd" ? "evenodd" : "nonzero"
      });
    };
    for (const child of childElements(clip)) add(child, base, 0);
    return parts;
  };
  const visit = (element, parentTransform, inheritedStyle, inheritedClips, useDepth, visiting, allowSymbol = false) => {
    if (!isSvgElement(element)) {
      warnings.push(`Skipped non-SVG element <${localName(element)}>`);
      return;
    }
    const tag = localName(element);
    const style = applySvgStyle(element, tag, inheritedStyle, context);
    if (!style.display || !style.visibility || style.opacity <= 0) return;
    const transform = composeSvgMatrix(
      parentTransform,
      parseSvgTransform(element.getAttribute("transform"))
    );
    const chain = IGNORED_TAGS.has(tag) ? [] : clipChain(element, tag);
    const ownClips = chain.map(() => []);
    const clips = [...inheritedClips, ...ownClips];
    const start = shapes.length;
    render(
      element,
      tag,
      style,
      transform,
      clips,
      useDepth,
      visiting,
      allowSymbol
    );
    chain.forEach(
      (clip, index) => ownClips[index].push(...clipParts(clip, transform, shapes.slice(start)))
    );
  };
  const render = (element, tag, style, transform, clips, useDepth, visiting, allowSymbol) => {
    if (tag === "use") {
      if (useDepth >= maxDepth) {
        warnings.push(`Skipped <use> beyond maximum depth ${maxDepth}`);
        return;
      }
      const href = useHref(element);
      if (href === null || !href.startsWith("#") || href.length === 1) {
        warnings.push("Skipped external or empty <use> reference");
        return;
      }
      const target = ids.get(href.slice(1));
      if (target === void 0) {
        warnings.push(`Skipped missing <use> target ${href}`);
        return;
      }
      if (visiting.has(target)) {
        warnings.push(`Skipped cyclic <use> reference ${href}`);
        return;
      }
      instances += 1;
      if (instances > maxInstances) {
        warnings.push(
          `Stopped <use> expansion after ${maxInstances} instances`
        );
        return;
      }
      visit(
        target,
        composeSvgMatrix(
          transform,
          getTranslate(length(element, "x"), length(element, "y"))
        ),
        style,
        clips,
        useDepth + 1,
        new Set(visiting).add(target),
        true
      );
      return;
    }
    if (IGNORED_TAGS.has(tag) || tag === "symbol" && !allowSymbol) return;
    if (CONTAINER_TAGS.has(tag)) {
      for (const child of childElements(element)) {
        visit(child, transform, style, clips, useDepth, visiting, allowSymbol);
      }
      return;
    }
    if (!SHAPE_TAGS.has(tag)) {
      warnings.push(`Skipped unsupported SVG element <${tag}>`);
      return;
    }
    const path = shapePath(element, tag);
    if (path === null) return;
    const d = typeof path === "string" ? path : path.encode();
    const stroke = getStrokeStyle(style);
    const outline = stroke === null ? null : { d, style: { ...stroke, color: canonicalThread(stroke.color) } };
    const fillStyle = getFillStyle(style);
    const fill = fillStyle.color === null ? null : {
      d,
      style: { ...fillStyle, color: canonicalThread(fillStyle.color) }
    };
    shapes.push({ outline, fill, transform, sourceElement: tag, clips });
  };
  visit(root, viewport.transform, getDefaultSvgStyle(), [], 0, /* @__PURE__ */ new Set());
  return { shapes, warnings };
}
function normalizeSvg(source, settings = {}) {
  const document = parseDocument(
    source,
    settings.DOMParser ?? (typeof DOMParser === "undefined" ? void 0 : DOMParser)
  );
  const root = document.documentElement;
  const viewport = normalizeSvgViewport(
    root,
    (settings.size ?? 100) * UNITS_PER_MM,
    settings.preserveAspectRatio ?? root.getAttribute("preserveAspectRatio") ?? "xMidYMid meet"
  );
  return { viewport, ...collectShapes(document, viewport, settings) };
}

// src/svg/geometry.ts
import {
  booleanOpDWithPolyTree,
  ClipperD,
  ClipType,
  differenceD,
  intersectD,
  EndType,
  FillRule,
  inflatePathsD,
  JoinType,
  PolyTreeD,
  simplifyPathsD,
  unionD
} from "clipper2-ts";
var PRECISION = 2;
function clean(paths) {
  return paths.map(
    (path) => path.filter((point, i) => {
      const next = path[(i + 1) % path.length];
      return point.x !== next.x || point.y !== next.y;
    }).map(({ x, y }) => ({ x, y }))
  ).filter((ring) => ring.length >= 3);
}
function unionRings(subpaths, rule = "nonzero") {
  const paths = subpaths.filter((points) => points.length >= 3);
  return clean(unionD(paths, [], rule === "evenodd" ? FillRule.EvenOdd : FillRule.NonZero, PRECISION));
}
function unite(a, b) {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  return clean(unionD(a, b, FillRule.NonZero, PRECISION));
}
function subtract(region, cut) {
  if (cut.length === 0 || region.length === 0) return region;
  return clean(differenceD(region, cut, FillRule.NonZero, PRECISION));
}
function intersect(a, b) {
  if (a.length === 0 || b.length === 0) return [];
  return clean(intersectD(a, b, FillRule.NonZero, PRECISION));
}
function islands(region) {
  if (region.length === 0) return [];
  const tree = new PolyTreeD();
  booleanOpDWithPolyTree(ClipType.Union, region, null, tree, FillRule.NonZero, PRECISION);
  const result = [];
  const visit = (node) => {
    for (let i = 0; i < node.count; i += 1) {
      const outer = node.child(i);
      const holes = Array.from({ length: outer.count }, (_, j) => outer.child(j));
      const island = clean([outer.poly, ...holes.map((hole) => hole.poly)].filter((path) => path !== null));
      if (island.length > 0) result.push(island);
      holes.forEach(visit);
    }
  };
  visit(tree);
  return result;
}
function offsetRegion(region, delta) {
  if (delta === 0 || region.length === 0) return region;
  return clean(inflatePathsD(region, delta, JoinType.Miter, EndType.Polygon, 2, PRECISION));
}
function coverage(lines, width, close, tolerance) {
  const paths = lines.filter((line) => line.length > 0);
  if (paths.length === 0) return [];
  let region = inflatePathsD(paths, width / 2, JoinType.Round, EndType.Round, 2, PRECISION);
  if (close > 0) {
    region = inflatePathsD(region, close, JoinType.Round, EndType.Polygon, 2, PRECISION);
    region = inflatePathsD(region, -close, JoinType.Round, EndType.Polygon, 2, PRECISION);
  }
  return islands(clean(simplifyPathsD(region, tolerance, true)));
}
var JOINS = { round: JoinType.Round, bevel: JoinType.Bevel };
var CAPS = { round: EndType.Round, square: EndType.Square };
function strokeOutline(lines, width, linecap, linejoin) {
  const join = JOINS[linejoin] ?? JoinType.Miter;
  const inflate = (subpaths, end) => subpaths.length === 0 ? [] : inflatePathsD(subpaths.map((line) => line.points), width / 2, join, end, 4, PRECISION);
  return unite(
    clean(inflate(lines.filter((line) => line.closed), EndType.Joined)),
    clean(inflate(lines.filter((line) => !line.closed), CAPS[linecap] ?? EndType.Butt))
  );
}
function clipLines(lines, region) {
  return region.length === 0 ? lines : splitLines(lines, region, ClipType.Difference);
}
function linesInside(lines, region) {
  return region.length === 0 ? [] : splitLines(lines, region, ClipType.Intersection);
}
function splitLines(lines, region, clipType) {
  const clipper = new ClipperD(PRECISION);
  clipper.addOpenSubjectPaths(lines.map((line) => line.closed ? [...line.points, line.points[0]] : line.points));
  clipper.addClipPaths(region);
  const closed = [];
  const open = [];
  clipper.execute(clipType, FillRule.NonZero, closed, open);
  return open.filter((path) => path.length >= 2).map((path) => {
    const [first, last] = [path[0], path[path.length - 1]];
    return first.x === last.x && first.y === last.y && path.length > 2 ? { points: path.slice(0, -1).map(({ x, y }) => ({ x, y })), closed: true } : { points: path.map(({ x, y }) => ({ x, y })), closed: false };
  });
}

// src/svg/fill.ts
var UNDERLAY_STITCH = 3 * UNITS_PER_MM;
var UNDERLAY_SPACING = 2 * UNITS_PER_MM;
var UNDERLAY_INSET = 0.5 * UNITS_PER_MM;
var MIN_STITCH = 0.5 * UNITS_PER_MM;
var STAGGERS = 4;
function buildRows(rings, spacing) {
  const nodes = [];
  const graph = [];
  const addNode = (point) => {
    nodes.push(point);
    graph.push([]);
    return nodes.length - 1;
  };
  const link = (a, b) => {
    const weight = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
    graph[a].push([b, weight]);
    graph[b].push([a, weight]);
  };
  const rows = /* @__PURE__ */ new Map();
  for (const ring of rings) {
    const ringNodes = [];
    ring.forEach((p, index) => {
      ringNodes.push(addNode(p));
      const q = ring[(index + 1) % ring.length];
      if (p.y === q.y) return;
      const low = Math.min(p.y, q.y);
      const high = Math.max(p.y, q.y);
      const edgeCrossings = [];
      for (let row = Math.ceil(low / spacing - 0.5); (row + 0.5) * spacing < high; row += 1) {
        const y = (row + 0.5) * spacing;
        if (y < low) continue;
        const t = (y - p.y) / (q.y - p.y);
        const crossing = { x: p.x + t * (q.x - p.x), y, row, t, id: -1 };
        crossing.id = addNode(crossing);
        edgeCrossings.push(crossing);
        if (!rows.has(row)) rows.set(row, []);
        rows.get(row).push(crossing);
      }
      edgeCrossings.sort((c1, c2) => c1.t - c2.t).forEach((crossing) => ringNodes.push(crossing.id));
    });
    ringNodes.forEach(
      (node, index) => link(node, ringNodes[(index + 1) % ringNodes.length])
    );
  }
  const segments = [...rows.keys()].sort((r1, r2) => r1 - r2).map((row) => {
    const crossings = rows.get(row).sort((c1, c2) => c1.x - c2.x);
    const rowSegments = [];
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const [a, b] = [crossings[index], crossings[index + 1]];
      link(a.id, b.id);
      rowSegments.push({ row, a, b });
    }
    return rowSegments;
  });
  return { segments, graph, nodes };
}
function buildSections(rows) {
  const sections = [];
  let previous = [];
  for (const row of rows) {
    const current = [];
    const overlaps = (s, t) => Math.abs(s.row - t.row) === 1 && s.a.x < t.b.x && t.a.x < s.b.x;
    for (const segment of row) {
      const above = previous.filter(
        (entry) => overlaps(entry.segment, segment)
      );
      const unique = above.length === 1 && row.filter((other) => overlaps(above[0].segment, other)).length === 1;
      const section = unique ? above[0].section : [];
      if (!unique) sections.push(section);
      section.push(segment);
      current.push({ segment, section });
    }
    previous = current;
  }
  return sections;
}
function shortestPaths(graph, source) {
  const distance4 = new Float64Array(graph.length).fill(Infinity);
  const previous = new Int32Array(graph.length).fill(-1);
  const heap = [[0, source]];
  distance4[source] = 0;
  const swap = (i, j) => [heap[i], heap[j]] = [heap[j], heap[i]];
  while (heap.length > 0) {
    const [cost, node] = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        swap(i, m);
        i = m;
      }
    }
    if (cost > distance4[node]) continue;
    for (const [next, weight] of graph[node]) {
      const candidate = cost + weight;
      if (candidate >= distance4[next]) continue;
      distance4[next] = candidate;
      previous[next] = node;
      heap.push([candidate, next]);
      for (let i = heap.length - 1; i > 0; ) {
        const parent = i - 1 >> 1;
        if (heap[parent][0] <= heap[i][0]) break;
        swap(i, parent);
        i = parent;
      }
    }
  }
  return { distance: distance4, previous };
}
function rowPoints(row, from, to, y, length2) {
  const offset = (row % STAGGERS + STAGGERS) % STAGGERS / STAGGERS * length2;
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const grid = [];
  for (let k = Math.ceil((low + MIN_STITCH - offset) / length2); k * length2 + offset <= high - MIN_STITCH; k += 1) {
    grid.push(k * length2 + offset);
  }
  if (to < from) grid.reverse();
  return [from, ...grid, to].map((x) => ({ x, y }));
}
function entries(section) {
  const first = section[0];
  const last = section[section.length - 1];
  return [first.a, first.b, last.a, last.b];
}
function stitchSection(section, entry, out, length2) {
  const forward = entry === section[0].a || entry === section[0].b;
  const rows = forward ? section : [...section].reverse();
  let fromA = entry === rows[0].a;
  let exit = entry;
  for (const segment of rows) {
    const [start, end] = fromA ? [segment.a, segment.b] : [segment.b, segment.a];
    appendLine(out, [start], length2);
    out.push(
      ...rowPoints(segment.row, start.x, end.x, start.y, length2).slice(1)
    );
    exit = end;
    fromA = !fromA;
  }
  return exit;
}
function appendLine(out, points, maxLength) {
  if (out.length === 0) {
    out.push(points[0]);
    points = points.slice(1);
  }
  if (points.length === 0) return;
  out.push(
    ...resample([out[out.length - 1], ...points], false, maxLength).slice(1)
  );
}
function tatami(region, travelLength, from = null, { angle, spacing, stitchLength }) {
  const cos = Math.cos(angle * Math.PI / 180);
  const sin = Math.sin(angle * Math.PI / 180);
  const toRowSpace = (p) => ({
    x: p.x * cos + p.y * sin,
    y: p.y * cos - p.x * sin
  });
  const fromRowSpace = (p) => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos
  });
  const rings = region.map((ring) => ring.map(toRowSpace));
  const { segments, graph, nodes } = buildRows(rings, spacing);
  const sections = buildSections(segments);
  if (sections.length === 0) return [];
  const stitches = [];
  const emit = (points, command) => {
    for (const point of points) {
      const { x, y } = fromRowSpace(point);
      stitches.push([x, y, command]);
    }
  };
  const nearestEntry = (point, candidates) => [...candidates].flatMap(
    (section) => entries(section).map((crossing) => [section, crossing])
  ).reduce(
    (closest, pair) => Math.hypot(pair[1].x - point.x, pair[1].y - point.y) < Math.hypot(closest[1].x - point.x, closest[1].y - point.y) ? pair : closest
  );
  const remaining = new Set(sections);
  let current = null;
  while (remaining.size > 0) {
    const out = current === null ? [] : [current];
    let alreadyStitched = out.length;
    let section;
    let entry;
    if (current === null) {
      [section, entry] = from === null ? [sections[0], sections[0][0].a] : nearestEntry(toRowSpace(from), sections);
    } else {
      const { distance: distance4, previous } = shortestPaths(graph, current.id);
      let best = Infinity;
      [section, entry] = [sections[0], sections[0][0].a];
      for (const candidate of remaining) {
        for (const crossing of entries(candidate)) {
          const cost = distance4[crossing.id];
          if (cost < best) [best, section, entry] = [cost, candidate, crossing];
        }
      }
      if (Number.isFinite(best)) {
        const route = [];
        for (let node = entry.id; node !== -1; node = previous[node])
          route.unshift(nodes[node]);
        appendLine(out, route, travelLength);
      } else {
        [section, entry] = nearestEntry(current, remaining);
        emit([entry], EmbConstant.JUMP);
        out.length = 0;
        out.push(entry);
        alreadyStitched = 0;
      }
    }
    current = stitchSection(section, entry, out, stitchLength);
    remaining.delete(section);
    emit(out.slice(alreadyStitched), EmbConstant.STITCH);
  }
  return stitches;
}
function rowAngle(degrees) {
  const angle = (degrees % 180 + 180) % 180;
  return angle > 90 ? angle - 180 : angle;
}
function fillStitches(region, options, from = null) {
  const travelLength = options.runningStitchLength * UNITS_PER_MM;
  const fillRegion = offsetRegion(
    region,
    options.pullCompensation * UNITS_PER_MM
  );
  const rows = {
    angle: rowAngle(options.fillAngle),
    spacing: options.rowSpacing * UNITS_PER_MM,
    stitchLength: options.fillStitchLength * UNITS_PER_MM
  };
  const underlay = options.underlay ? tatami(
    offsetRegion(region, -UNDERLAY_INSET),
    travelLength,
    from,
    {
      angle: rowAngle(options.fillAngle + 90),
      spacing: UNDERLAY_SPACING,
      stitchLength: UNDERLAY_STITCH
    }
  ) : [];
  if (underlay.length === 0)
    return tatami(fillRegion, travelLength, from, rows);
  const [x, y] = underlay[underlay.length - 1];
  const fill = tatami(fillRegion, travelLength, { x, y }, rows);
  if (fill.length === 0) return underlay;
  const start = { x: fill[0][0], y: fill[0][1] };
  const inside = clipLines([{ points: [{ x, y }, start], closed: false }], fillRegion).length === 0;
  const link = inside ? resample([{ x, y }, start], false, UNDERLAY_STITCH).slice(1, -1).map((p) => [p.x, p.y, EmbConstant.STITCH]) : [[start.x, start.y, EmbConstant.JUMP]];
  return [...underlay, ...link, ...fill];
}

// src/svg/plan.ts
var distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function nearest(points, from) {
  return points.reduce((best, point, index) => distance3(point, from) < distance3(points[best], from) ? index : best, 0);
}
function strokeItem(part, color, settings) {
  const { points, closed } = part;
  const width = part.kind === "satin" ? part.width : 0;
  return {
    color,
    part,
    layer: width >= SATIN_MIN_WIDTH ? 0 : 1,
    starts: closed ? points : [points[0], points[points.length - 1]],
    stitch(from) {
      let ordered = points;
      if (from !== null && closed) {
        const start = nearest(points, from);
        ordered = [...points.slice(start), ...points.slice(0, start)];
      } else if (from !== null && distance3(points[points.length - 1], from) < distance3(points[0], from)) {
        ordered = [...points].reverse();
      }
      return strokePoints({ points: ordered, closed }, width, settings).map(({ x, y }) => [x, y, EmbConstant.STITCH]);
    }
  };
}
function fillItem(part, color, settings) {
  return {
    color,
    part,
    layer: 0,
    starts: part.rings.flat(),
    stitch: (from) => fillStitches(part.rings, settings, from)
  };
}
function partItem(part, color, settings) {
  return part.kind === "fill" ? fillItem(part, color, settings) : strokeItem(part, color, settings);
}
function linePart(line, width) {
  return width >= SATIN_MIN_WIDTH ? { kind: "satin", points: line.points, closed: line.closed, width } : { kind: "running", points: line.points, closed: line.closed };
}
function clipRegion(shape, tolerance) {
  let region = null;
  for (const parts of shape.clips) {
    const union = parts.reduce((sum, part) => {
      const subpaths = flattenSvgPath(part.d, tolerance, part.transform);
      return unite(sum, unionRings(subpaths.map((subpath) => subpath.points), part.rule));
    }, []);
    region = region === null ? union : intersect(region, union);
  }
  return region;
}
function visibleItems(shapes, settings, tolerance) {
  const items = [];
  let above = [];
  for (const shape of [...shapes].reverse()) {
    const clip = clipRegion(shape, tolerance);
    const clipped = (region) => clip === null ? region : intersect(region, clip);
    if (shape.outline !== null) {
      const { style } = shape.outline;
      const fullLines = flattenSvgPath(shape.outline.d, tolerance, shape.transform);
      const lines = clip === null ? fullLines : linesInside(fullLines, clip);
      const width = strokeWidth(shape);
      const outline = width >= SATIN_MIN_WIDTH ? clipped(strokeOutline(fullLines, width, style.linecap, style.linejoin)) : [];
      if (width > SATIN_MAX_WIDTH) {
        for (const island of islands(subtract(outline, above)).reverse()) {
          items.push(fillItem({ kind: "fill", rings: island }, style.color, settings));
        }
      } else {
        for (const line of clipLines(lines, above).reverse()) {
          items.push(partItem(linePart(line, width), style.color, settings));
        }
      }
      above = unite(above, outline);
    }
    if (shape.fill !== null && shape.fill.style.color !== null) {
      const subpaths = flattenSvgPath(shape.fill.d, tolerance, shape.transform);
      const region = clipped(unionRings(subpaths.map((subpath) => subpath.points), shape.fill.style.rule));
      for (const island of islands(subtract(region, above)).reverse()) {
        items.push(fillItem({ kind: "fill", rings: island }, shape.fill.style.color, settings));
      }
      above = unite(above, region);
    }
  }
  return items.reverse();
}
function orderItems(items, start) {
  const blocks = [];
  let position = start;
  let color = null;
  for (const layer of [0, 1]) {
    const pool = items.filter((item) => item.layer === layer);
    while (pool.length > 0) {
      const sameColor = pool.filter((item2) => item2.color === color);
      const candidates = sameColor.length > 0 ? sameColor : pool;
      const from = position;
      const item = from === null ? candidates[0] : candidates.reduce(
        (best, candidate) => distance3(candidate.starts[nearest(candidate.starts, from)], from) < distance3(best.starts[nearest(best.starts, from)], from) ? candidate : best
      );
      pool.splice(pool.indexOf(item), 1);
      const stitches = item.stitch(from);
      if (stitches.length === 0) continue;
      blocks.push({ stitches, thread: item.color, part: item.part });
      const [x, y] = stitches[stitches.length - 1];
      position = { x, y };
      color = item.color;
    }
  }
  return blocks;
}
function planStitches(shapes, settings, flattenTolerance) {
  return orderItems(visibleItems(shapes, settings, flattenTolerance * UNITS_PER_MM), null);
}
function planZone(zone, settings, from) {
  return orderItems(zone.map((part) => partItem(part, null, settings)), from);
}

// src/svg/zone.ts
function splitRuns(stitches) {
  const runs = [];
  for (const stitch of stitches) {
    if (stitch[2] === EmbConstant.JUMP || runs.length === 0) runs.push([]);
    if (stitch[2] === EmbConstant.STITCH) runs[runs.length - 1].push(stitch);
  }
  return runs.filter((run) => run.length > 0);
}
function tie(stitches, count) {
  if (count === 0 || stitches.length < 2) return stitches;
  const lock = ([x, y], [nx, ny]) => Array.from(
    { length: count },
    (_, i) => i % 2 === 0 ? [x + (nx - x) / 3, y + (ny - y) / 3, EmbConstant.STITCH] : [x, y, EmbConstant.STITCH]
  );
  const last = stitches.length - 1;
  return [
    stitches[0],
    ...lock(stitches[0], stitches[1]),
    ...stitches.slice(1),
    ...lock(stitches[last], stitches[last - 1])
  ];
}
var finitePoint = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y);
function checkZone(zone) {
  if (!Array.isArray(zone)) throw new TypeError("stitchZone: zone must be an array of parts");
  return zone.filter((part) => {
    if (part.kind === "fill") {
      if (!part.rings.every((ring) => ring.every(finitePoint))) {
        throw new RangeError("stitchZone: fill points must be finite numbers");
      }
      return part.rings.some((ring) => ring.length >= 3);
    }
    if (part.kind === "satin" || part.kind === "running") {
      if (!part.points.every(finitePoint)) {
        throw new RangeError(`stitchZone: ${part.kind} points must be finite numbers`);
      }
      if (part.kind === "satin" && !(Number.isFinite(part.width) && part.width >= 0)) {
        throw new RangeError("stitchZone: satin width must be a non-negative number");
      }
      return part.points.length > 0;
    }
    throw new TypeError(`stitchZone: unknown part kind ${String(part.kind)}`);
  });
}
function stitchZone(zone, settings = {}, from = null) {
  const resolved = resolveStitchSettings(settings);
  if (from !== null && !finitePoint(from)) {
    throw new RangeError("stitchZone: from must have finite x and y");
  }
  const stitches = [];
  for (const block2 of planZone(checkZone(zone), resolved, from)) {
    for (const run of splitRuns(block2.stitches)) {
      if (stitches.length > 0) {
        const [x, y] = stitches[stitches.length - 1];
        stitches.push([x, y, EmbConstant.SEQUENCE_BREAK]);
      }
      stitches.push(...tie(run, resolved.tieStitches));
    }
  }
  return stitches;
}

// src/readers/svg.ts
function decodeSvgInput(input) {
  let source;
  try {
    source = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    throw new Error("readSvg: input bytes are not valid UTF-8");
  }
  return source.replace(/^\uFEFF/, "");
}
function stitchExtents(pattern) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y, command] of pattern.stitches) {
    if (command !== EmbConstant.STITCH) continue;
    [minX, minY] = [Math.min(minX, x), Math.min(minY, y)];
    [maxX, maxY] = [Math.max(maxX, x), Math.max(maxY, y)];
  }
  return { minX, minY, maxX, maxY };
}
function fitInto(pattern, limit) {
  const { minX, minY, maxX, maxY } = stitchExtents(pattern);
  const scale = Math.min(1, limit / Math.max(maxX - minX, maxY - minY));
  const fit = (min, max) => {
    const half = (max - min) * scale / 2;
    return [
      (min + max) / 2,
      Math.min(Math.max((min + max) / 2, half), limit - half)
    ];
  };
  const [[cx, nx], [cy, ny]] = [fit(minX, maxX), fit(minY, maxY)];
  for (const stitch of pattern.stitches) {
    stitch[0] = nx + (stitch[0] - cx) * scale;
    stitch[1] = ny + (stitch[1] - cy) * scale;
  }
  return {
    scale,
    map: ({ x, y }) => ({ x: nx + (x - cx) * scale, y: ny + (y - cy) * scale })
  };
}
function mapZone(zone, map, scale) {
  return zone.map((part) => {
    if (part.kind === "fill")
      return { kind: "fill", rings: part.rings.map((ring) => ring.map(map)) };
    const points = part.points.map(map);
    return part.kind === "satin" ? { ...part, points, width: part.width * scale } : { ...part, points };
  });
}
var KINDS = ["fill", "satin", "running"];
function recordThreads(entries2, settings, map, scale) {
  for (const { thread, parts } of entries2) {
    const kinds = new Set(parts.map((part) => part.kind));
    const info = {
      kinds: KINDS.filter((kind) => kinds.has(kind)),
      settings: { ...settings },
      zone: mapZone(parts, map, scale)
    };
    thread.extras.svg = info;
  }
}
function cloneThread(thread) {
  return Object.assign(new EmbThread(), thread, { extras: {} });
}
function stitchSvg(input, settings = {}) {
  const stitchSettings = resolveStitchSettings({
    runningStitchLength: settings.runningStitchLength,
    fillStitchLength: settings.fillStitchLength,
    rowSpacing: settings.rowSpacing,
    pullCompensation: settings.pullCompensation,
    underlay: settings.underlay,
    fillAngle: settings.fillAngle,
    tieStitches: settings.tieStitches
  });
  const flattenTolerance = resolveFlattenTolerance(settings.flattenTolerance);
  const normalized = normalizeSvg(decodeSvgInput(input), settings);
  const warnings = [...new Set(normalized.warnings)];
  const fit = settings.fit ?? true;
  const pattern = new EmbPattern();
  const planned = planStitches(
    normalized.shapes,
    stitchSettings,
    flattenTolerance
  );
  const entries2 = [];
  const used = /* @__PURE__ */ new Set();
  let source = null;
  for (const { stitches, thread, part } of planned) {
    const runs = splitRuns(stitches);
    if (runs.length === 0) continue;
    if (thread !== source) {
      entries2.push({
        thread: used.has(thread) ? cloneThread(thread) : thread,
        parts: []
      });
      used.add(thread);
      source = thread;
    }
    const entry = entries2[entries2.length - 1];
    entry.parts.push(part);
    for (const run of runs)
      pattern.addStitchblock([tie(run, stitchSettings.tieStitches), entry.thread]);
  }
  if (entries2.length === 0) return { pattern, warnings };
  const [x, y] = pattern.stitches[pattern.stitches.length - 1];
  pattern.addCommand(EmbConstant.SEQUENCE_BREAK, x, y);
  const { scale, map } = fit ? fitInto(pattern, normalized.viewport.targetSize) : { scale: 1, map: (point) => ({ ...point }) };
  recordThreads(entries2, stitchSettings, map, scale);
  return { pattern, warnings };
}
function readSvg(input, settings = {}) {
  const result = stitchSvg(input, settings);
  const { pattern } = result;
  if (pattern.stitches.length > 0) {
    const { minX, minY, maxX, maxY } = stitchExtents(pattern);
    const [dx, dy] = [-(minX + maxX) / 2, -(minY + maxY) / 2];
    pattern.translate(dx, dy);
    const move = ({ x, y }) => ({ x: x + dx, y: y + dy });
    for (const thread of new Set(pattern.threadlist)) {
      const info = thread.extras.svg;
      if (info) info.zone = mapZone(info.zone, move, 1);
    }
  }
  return result;
}

// src/svg/outline.ts
var SIMPLIFY_TOLERANCE = 0.05;
function stitchOutline(stitches, threadWidthMm = 0.4) {
  if (!Number.isFinite(threadWidthMm) || threadWidthMm <= 0) {
    throw new RangeError("stitchOutline: thread width must be a positive finite number");
  }
  const lines = [];
  let line = [];
  for (const [x, y, command] of stitches) {
    if (command === EmbConstant.STITCH && Number.isFinite(x) && Number.isFinite(y)) {
      line.push({ x, y });
      continue;
    }
    if (line.length > 0) lines.push(line);
    line = [];
  }
  if (line.length > 0) lines.push(line);
  const width = threadWidthMm * UNITS_PER_MM;
  return coverage(lines, width, width, SIMPLIFY_TOLERANCE * UNITS_PER_MM).map((rings) => ({
    kind: "fill",
    rings
  }));
}

// src/writeSvg.ts
var { CONTINGENCY_SEQUIN_STITCH: CONTINGENCY_SEQUIN_STITCH2 } = EmbConstant;
function numStr(v) {
  if (Number.isFinite(v)) return String(v);
  if (Number.isNaN(v)) return "nan";
  return v > 0 ? "inf" : "-inf";
}
function serializeSvg(pattern) {
  const extents = pattern.extents();
  const width = extents.maxX - extents.minX;
  const height = extents.maxY - extents.minY;
  const viewBox = `${numStr(extents.minX)} ${numStr(extents.minY)} ${numStr(width)} ${numStr(height)}`;
  let out = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:ev="http://www.w3.org/2001/xml-events" width="${numStr(width)}" height="${numStr(height)}" viewBox="${viewBox}">`;
  for (const [block2, thread] of pattern.getAsStitchblock()) {
    let data = "M";
    for (const stitch of block2) {
      data += ` ${numStr(stitch[0])},${numStr(stitch[1])}`;
    }
    out += `<path d="${data}" fill="none" stroke="${thread.hexColor()}" stroke-width="3"/>`;
  }
  out += "</svg>";
  return out;
}
function writeSvg(pattern, settings) {
  const { stable = false, ...s } = { ...settings ?? {} };
  if (stable) pattern = pattern.getStablePattern();
  if (s.encode ?? true) {
    if (s.max_jump === void 0) s.max_jump = Infinity;
    if (s.max_stitch === void 0) s.max_stitch = Infinity;
    if (s.full_jump === void 0) s.full_jump = false;
    if (s.sequin_contingency === void 0) {
      s.sequin_contingency = CONTINGENCY_SEQUIN_STITCH2;
    }
    pattern = pattern.getNormalizedPattern(s);
  }
  return serializeSvg(pattern);
}
export {
  EmbConstant,
  EmbPattern,
  EmbThread,
  getJefThreadSet,
  getThreadSet,
  readDst,
  readExp,
  readJef,
  readPes,
  readSvg,
  readVp3,
  readXxx,
  resolveStitchSettings,
  stitchOutline,
  stitchZone,
  writeDst,
  writeExp,
  writeJef,
  writePes,
  writeSvg,
  writeVp3,
  writeXxx
};
//# sourceMappingURL=index.js.map