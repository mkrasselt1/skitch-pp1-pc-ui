// Sweep-line CDT — Domiter & Žalik 2008 (IJGIS 22:4, 449-462)
// DT engine from Žalik 2005 (Computer-Aided Design 37, 1027-1038).
// Edge insertion per Anglada 1997 (Computers & Graphics 21:2, 215-223).
//
// Triangle-based adjacency (3 vertices + 3 neighbor tris per triangle).
// Advancing front: doubly-linked list + hash table (Žalik §3.4, k=100).
// Zero allocations in the sweep loop.
import { orient2dSign, incircleSign } from './predicates.js';
// ---------------------------------------------------------------------------
// Triangle pool — SoA for cache-friendliness
// ---------------------------------------------------------------------------
//  tv[t*3+j]  = vertex index at local position j (CCW winding)
//  ta[t*3+j]  = neighbor triangle opposite vertex j (NONE if boundary)
//  tf[t] bits = fixed-edge flags, bit j ⇔ edge opposite vertex j is constrained
//  td[t]      = 1 if triangle is dead (removed during edge event)
const NONE = -1;
let tv;
let ta;
let tf;
let td;
let triCap = 0;
let triCount = 0;
function initTris(cap) {
    triCap = cap;
    triCount = 0;
    tv = new Int32Array(cap * 3);
    ta = new Int32Array(cap * 3).fill(NONE);
    tf = new Uint8Array(cap);
    td = new Uint8Array(cap);
}
function growTris() {
    const c = triCap << 1;
    const v2 = new Int32Array(c * 3);
    v2.set(tv);
    tv = v2;
    const a2 = new Int32Array(c * 3).fill(NONE);
    a2.set(ta);
    ta = a2;
    const f2 = new Uint8Array(c);
    f2.set(tf);
    tf = f2;
    const d2 = new Uint8Array(c);
    d2.set(td);
    td = d2;
    triCap = c;
}
function addTri(a, b, c) {
    if (triCount === triCap)
        growTris();
    const t = triCount++, t3 = t * 3;
    tv[t3] = a;
    tv[t3 + 1] = b;
    tv[t3 + 2] = c;
    ta[t3] = ta[t3 + 1] = ta[t3 + 2] = NONE;
    tf[t] = 0;
    td[t] = 0;
    return t;
}
function link(t1, j1, t2, j2) {
    ta[t1 * 3 + j1] = t2;
    ta[t2 * 3 + j2] = t1;
}
function localIdx(t, v) {
    const t3 = t * 3;
    if (tv[t3] === v)
        return 0;
    if (tv[t3 + 1] === v)
        return 1;
    if (tv[t3 + 2] === v)
        return 2;
    return -1;
}
function adjIdx(t, n) {
    const t3 = t * 3;
    if (ta[t3] === n)
        return 0;
    if (ta[t3 + 1] === n)
        return 1;
    if (ta[t3 + 2] === n)
        return 2;
    return -1;
}
function isFixed(t, j) {
    return (tf[t] & (1 << j)) !== 0;
}
function markFixed(t, j) {
    tf[t] |= (1 << j);
    const n = ta[t * 3 + j];
    if (n !== NONE) {
        const nj = adjIdx(n, t);
        if (nj >= 0)
            tf[n] |= (1 << nj);
    }
}
// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------
let px;
let py;
function orient(a, b, c) {
    return orient2dSign(px[a], py[a], px[b], py[b], px[c], py[c]);
}
function inCircle(a, b, c, d) {
    return incircleSign(px[a], py[a], px[b], py[b], px[c], py[c], px[d], py[d]);
}
// ---------------------------------------------------------------------------
// Advancing front — doubly-linked list + hash table (Žalik §3.4)
// ---------------------------------------------------------------------------
// Each AF node stores: vertex, triangle backing the AF edge to the right,
// prev/next pointers, hash-bucket chain pointer.
// Per Žalik Fig.14: key = x coordinate, vertex index v_i, triangle index t_i.
let afV; // vertex index
let afT; // triangle below AF edge (this node → next node)
let afP; // prev pointer
let afN; // next pointer
let afBk; // hash-bucket chain
let afCap = 0;
let afLen = 0;
let afHash;
let afHSize = 0;
let afXMin = 0;
let afXRng = 1;
function initAF(n, xmin, xmax) {
    afCap = Math.max(n + 4, 64);
    afLen = 0;
    afV = new Int32Array(afCap);
    afT = new Int32Array(afCap);
    afP = new Int32Array(afCap);
    afN = new Int32Array(afCap);
    afBk = new Int32Array(afCap).fill(NONE);
    afHSize = 1 + ((n / 100) | 0); // Žalik eq.(1), k=100
    afHash = new Int32Array(afHSize).fill(NONE);
    afXMin = xmin;
    afXRng = xmax - xmin || 1;
}
function afBucket(x) {
    let b = ((x - afXMin) / afXRng * (afHSize - 1)) | 0;
    if (b < 0)
        b = 0;
    else if (b >= afHSize)
        b = afHSize - 1;
    return b;
}
function growAF() {
    const c = afCap << 1;
    const g = (a) => { const b = new Int32Array(c); b.set(a); return b; };
    afV = g(afV);
    afT = g(afT);
    afP = g(afP);
    afN = g(afN);
    const bk = new Int32Array(c).fill(NONE);
    bk.set(afBk);
    afBk = bk;
    afCap = c;
}
function afNew(v, tri) {
    if (afLen === afCap)
        growAF();
    const id = afLen++;
    afV[id] = v;
    afT[id] = tri;
    afP[id] = afN[id] = NONE;
    const b = afBucket(px[v]);
    afBk[id] = afHash[b];
    afHash[b] = id;
    return id;
}
function afDel(id) {
    const p = afP[id], n = afN[id];
    if (p !== NONE)
        afN[p] = n;
    if (n !== NONE)
        afP[n] = p;
    const b = afBucket(px[afV[id]]);
    if (afHash[b] === id) {
        afHash[b] = afBk[id];
    }
    else {
        let c = afHash[b];
        while (c !== NONE && afBk[c] !== id)
            c = afBk[c];
        if (c !== NONE)
            afBk[c] = afBk[id];
    }
    afBk[id] = NONE;
}
function afIns(v, tri, left, right) {
    const id = afNew(v, tri);
    afP[id] = left;
    afN[id] = right;
    if (left !== NONE)
        afN[left] = id;
    if (right !== NONE)
        afP[right] = id;
    return id;
}
// Locate AF node whose segment [node, node.next] contains vertical
// projection of x. Returns the LEFT node. (Žalik §3.4)
function afLocate(x) {
    const b = afBucket(x);
    let best = NONE, bestX = -Infinity;
    for (let c = afHash[b]; c !== NONE; c = afBk[c]) {
        const nx = px[afV[c]];
        if (nx <= x && nx > bestX) {
            bestX = nx;
            best = c;
        }
    }
    if (best === NONE) {
        for (let d = 1; d < afHSize; d++) {
            for (const bb of [b - d, b + d]) {
                if (bb < 0 || bb >= afHSize)
                    continue;
                for (let c = afHash[bb]; c !== NONE; c = afBk[c]) {
                    const nx = px[afV[c]];
                    if (nx <= x && nx > bestX) {
                        bestX = nx;
                        best = c;
                    }
                }
            }
            if (best !== NONE)
                break;
        }
    }
    if (best !== NONE) {
        while (afN[best] !== NONE && px[afV[afN[best]]] <= x)
            best = afN[best];
    }
    return best;
}
// ---------------------------------------------------------------------------
// Lawson legalization — Domiter §3.1 / Žalik §2.1
// ---------------------------------------------------------------------------
function legalize(t, pi) {
    const j = localIdx(t, pi);
    if (j < 0)
        return;
    const n = ta[t * 3 + j];
    if (n === NONE)
        return;
    if (isFixed(t, j))
        return;
    const t3 = t * 3;
    const a = tv[t3 + (j + 1) % 3];
    const b = tv[t3 + (j + 2) % 3];
    const nj = adjIdx(n, t);
    if (nj < 0)
        return;
    const pk = tv[n * 3 + nj];
    if (inCircle(a, b, pi, pk) <= 0)
        return;
    // Flip edge a-b → pi-pk
    const j1 = (j + 1) % 3, j2 = (j + 2) % 3;
    const nj1 = (nj + 1) % 3, nj2 = (nj + 2) % 3;
    const n3 = n * 3;
    const tN_oppA = ta[t3 + j1];
    const tN_oppB = ta[t3 + j2];
    const vnj1 = tv[n3 + nj1], vnj2 = tv[n3 + nj2];
    const nN1 = ta[n3 + nj1];
    const nN2 = ta[n3 + nj2];
    let nN_bside, nN_aside;
    if (vnj1 === b) {
        nN_bside = nN2;
        nN_aside = nN1;
    }
    else {
        nN_bside = nN1;
        nN_aside = nN2;
    }
    // t = (pi, pk, b)
    tv[t3] = pi;
    tv[t3 + 1] = pk;
    tv[t3 + 2] = b;
    ta[t3] = nN_bside;
    ta[t3 + 1] = tN_oppA;
    ta[t3 + 2] = n;
    tf[t] = 0;
    // n = (pi, a, pk)
    tv[n3] = pi;
    tv[n3 + 1] = a;
    tv[n3 + 2] = pk;
    ta[n3] = nN_aside;
    ta[n3 + 1] = t;
    ta[n3 + 2] = tN_oppB;
    tf[n] = 0;
    if (nN_bside !== NONE) {
        const k = adjIdx(nN_bside, n);
        if (k >= 0)
            ta[nN_bside * 3 + k] = t;
    }
    if (tN_oppB !== NONE) {
        const k = adjIdx(tN_oppB, t);
        if (k >= 0)
            ta[tN_oppB * 3 + k] = n;
    }
    legalize(t, pi);
    legalize(n, pi);
}
// ---------------------------------------------------------------------------
// Helper: link new triangle to old triangle sharing edge (vA, vB)
// ---------------------------------------------------------------------------
function linkToOldTri(newTri, newOppJ, oldTri, vA, vB) {
    if (oldTri === NONE)
        return;
    const ai = localIdx(oldTri, vA);
    const bi = localIdx(oldTri, vB);
    if (ai < 0 || bi < 0)
        return;
    link(newTri, newOppJ, oldTri, 3 - ai - bi);
}
// ---------------------------------------------------------------------------
// Point event — Domiter §3.4.1
// ---------------------------------------------------------------------------
let vertAF; // vertex → AF node id
function pointEvent(pi) {
    const x = px[pi];
    const L = afLocate(x);
    if (L === NONE)
        return;
    const R = afN[L];
    if (R === NONE)
        return;
    const vL = afV[L], vR = afV[R];
    // Duplicate check (Žalik §3.2.4)
    if (px[pi] === px[vL] && py[pi] === py[vL])
        return;
    if (px[pi] === px[vR] && py[pi] === py[vR])
        return;
    // Check for left case: projection coincides with P_L (Domiter Fig.8)
    // This happens when px[pi] === px[vL]
    if (px[pi] === px[vL]) {
        // Left case: create two triangles (Domiter Fig.8)
        // Δ(vLL, vL, pi) and Δ(vL, vR, pi)
        const LL = afP[L];
        if (LL === NONE)
            return;
        const vLL = afV[LL];
        // Triangle 1: (vL, vR, pi) — same as middle case
        const t1 = addTri(vL, vR, pi);
        linkToOldTri(t1, 2, afT[L], vL, vR);
        legalize(t1, pi);
        // Triangle 2: (vLL, vL, pi)
        const t2 = addTri(vLL, vL, pi);
        linkToOldTri(t2, 2, afT[LL], vLL, vL);
        // Link t2's edge vL-pi (opposite vLL, local 0) with t1's edge vL-pi (opposite vR, local 1... no)
        // t1 = (vL, vR, pi): edge opposite vR at local 1 = vL-pi? No: edge opposite local 1 = (local2, local0) = (pi, vL)
        // t2 = (vLL, vL, pi): edge opposite vLL at local 0 = (local1, local2) = (vL, pi)
        // So t1 edge (pi, vL) at local 1 ↔ t2 edge (vL, pi) at local 0
        link(t1, 1, t2, 0);
        legalize(t2, pi);
        // Update AF: remove L, insert pi between LL and R
        afDel(L);
        const piNode = afIns(pi, t1, LL, R);
        vertAF[pi] = piNode;
        afT[LL] = t2;
        afT[piNode] = t1;
        fanRight(pi, piNode);
        fanLeft(pi, piNode);
        basinDetect(pi, piNode);
        return;
    }
    // -------------------------------------------------------
    // Middle case — Domiter Fig.7
    // -------------------------------------------------------
    // CCW triangle: (vL, vR, pi) — pi to left of vL→vR
    const t = addTri(vL, vR, pi);
    linkToOldTri(t, 2, afT[L], vL, vR);
    legalize(t, pi);
    const piNode = afIns(pi, t, L, R);
    vertAF[pi] = piNode;
    afT[L] = t;
    afT[piNode] = t;
    fanRight(pi, piNode);
    fanLeft(pi, piNode);
    basinDetect(pi, piNode);
}
// ---------------------------------------------------------------------------
// Fan right / fan left — Žalik §3.2.1, Domiter Fig.9
// ---------------------------------------------------------------------------
function fanRight(pi, piNode) {
    let cur = piNode;
    while (true) {
        const R = afN[cur];
        if (R === NONE)
            break;
        const RR = afN[R];
        if (RR === NONE)
            break;
        const vR = afV[R], vRR = afV[RR];
        // Angle at pi between rays pi→vR and pi→vRR: if cos > 0 then < π/2
        const dx1 = px[vR] - px[pi], dy1 = py[vR] - py[pi];
        const dx2 = px[vRR] - px[pi], dy2 = py[vRR] - py[pi];
        if (dx1 * dx2 + dy1 * dy2 <= 0)
            break;
        const t = addTri(vR, vRR, pi);
        linkToOldTri(t, 2, afT[R], vR, vRR);
        linkToOldTri(t, 1, afT[cur], vR, pi);
        legalize(t, pi);
        afDel(R);
        afN[cur] = RR;
        afP[RR] = cur;
        afT[cur] = t;
    }
}
function fanLeft(pi, piNode) {
    let cur = piNode;
    while (true) {
        const L = afP[cur];
        if (L === NONE)
            break;
        const LL = afP[L];
        if (LL === NONE)
            break;
        const vL = afV[L], vLL = afV[LL];
        const dx1 = px[vL] - px[pi], dy1 = py[vL] - py[pi];
        const dx2 = px[vLL] - px[pi], dy2 = py[vLL] - py[pi];
        if (dx1 * dx2 + dy1 * dy2 <= 0)
            break;
        const t = addTri(vLL, vL, pi);
        linkToOldTri(t, 0, afT[L], vL, pi);
        linkToOldTri(t, 2, afT[LL], vLL, vL);
        legalize(t, pi);
        afDel(L);
        afP[cur] = LL;
        afN[LL] = cur;
        afT[LL] = t;
    }
}
// ---------------------------------------------------------------------------
// Basin detection — Žalik Fig.10, Domiter Fig.10
// ---------------------------------------------------------------------------
// After inserting pi: check if the angle at vR between rays vR→pi and
// vR→vR+ is > 3π/4. If so, fill the basin.
function basinDetect(pi, piNode) {
    // Right side basin
    const R = afN[piNode];
    if (R !== NONE) {
        const RR = afN[R];
        if (RR !== NONE) {
            const vR = afV[R], vRR = afV[RR];
            // Slope of line pi→vR+: if angle > 3π/4, cos < -√2/2 ≈ -0.707
            // Actually Žalik says: "slope of line connecting v_i and v_{R+} is
            // determined as to whether it is smaller than 3π/4"
            // This means the angle at vR between AF segments is checked.
            // Basin condition: angle at vR (between vR→pi and vR→vRR) > 3π/4
            const dx1 = px[pi] - px[vR], dy1 = py[pi] - py[vR];
            const dx2 = px[vRR] - px[vR], dy2 = py[vRR] - py[vR];
            const dot = dx1 * dx2 + dy1 * dy2;
            const cross = dx1 * dy2 - dy1 * dx2;
            // angle > 3π/4 iff cos < cos(3π/4) = -√2/2 and the angle is reflex
            // cos(θ) = dot / (|a||b|); if dot < 0 and cross < 0 (reflex), it's a basin
            if (dot < 0 && cross < 0) {
                fillBasinRight(pi, piNode);
            }
        }
    }
    // Left side basin
    const L = afP[piNode];
    if (L !== NONE) {
        const LL = afP[L];
        if (LL !== NONE) {
            const vL = afV[L], vLL = afV[LL];
            const dx1 = px[pi] - px[vL], dy1 = py[pi] - py[vL];
            const dx2 = px[vLL] - px[vL], dy2 = py[vLL] - py[vL];
            const dot = dx1 * dx2 + dy1 * dy2;
            const cross = dx1 * dy2 - dy1 * dx2;
            if (dot < 0 && cross > 0) {
                fillBasinLeft(pi, piNode);
            }
        }
    }
}
function fillBasinRight(pi, piNode) {
    // Find basin bottom: walk right from piNode until y starts increasing
    let R = afN[piNode];
    if (R === NONE)
        return;
    let RR = afN[R];
    while (RR !== NONE) {
        const vR = afV[R], vRR = afV[RR];
        if (py[vRR] > py[vR])
            break; // bottom found at R
        R = RR;
        RR = afN[RR];
    }
    // Now fill: fan from pi to everything between piNode and the basin right border
    // Use the same fan-right logic but without the π/2 angle limit
    let cur = piNode;
    while (true) {
        const rn = afN[cur];
        if (rn === NONE)
            break;
        const rnn = afN[rn];
        if (rnn === NONE)
            break;
        const vR = afV[rn], vRR = afV[rnn];
        // Only fill while the triple (pi, vR, vRR) is CCW
        if (orient(pi, vR, vRR) <= 0)
            break;
        const t = addTri(vR, vRR, pi);
        linkToOldTri(t, 2, afT[rn], vR, vRR);
        linkToOldTri(t, 1, afT[cur], vR, pi);
        legalize(t, pi);
        afDel(rn);
        afN[cur] = rnn;
        afP[rnn] = cur;
        afT[cur] = t;
        // Stop once we've passed the bottom
        if (rn === R)
            break;
    }
}
function fillBasinLeft(pi, piNode) {
    let L = afP[piNode];
    if (L === NONE)
        return;
    let LL = afP[L];
    while (LL !== NONE) {
        const vL = afV[L], vLL = afV[LL];
        if (py[vLL] > py[vL])
            break;
        L = LL;
        LL = afP[LL];
    }
    let cur = piNode;
    while (true) {
        const ln = afP[cur];
        if (ln === NONE)
            break;
        const lnn = afP[ln];
        if (lnn === NONE)
            break;
        const vL = afV[ln], vLL = afV[lnn];
        if (orient(pi, vLL, vL) <= 0)
            break;
        const t = addTri(vLL, vL, pi);
        linkToOldTri(t, 0, afT[ln], vL, pi);
        linkToOldTri(t, 2, afT[lnn], vLL, vL);
        legalize(t, pi);
        afDel(ln);
        afP[cur] = lnn;
        afN[lnn] = cur;
        afT[lnn] = t;
        if (ln === L)
            break;
    }
}
// ---------------------------------------------------------------------------
// Edge event — Domiter §3.4.2, Anglada §4
// ---------------------------------------------------------------------------
// Pre-allocated scratch arrays for pseudo-polygon vertices.
// Max size bounded by number of vertices.
let scrU; // upper pseudo-polygon
let scrL; // lower pseudo-polygon
let scrBndT; // boundary tri for each removed tri
let scrBndJ; // boundary local idx for each removed tri
let scrRm; // removed triangle indices
function edgeEvent(a, b) {
    // Check if edge already exists in the triangulation
    if (markExisting(a, b))
        return;
    // Domiter §3.4.2: three cases based on position of edge vs AF.
    //
    // Locate first crossed triangle (Domiter Fig.11): walk triangles around
    // vertex a using cross-product to find which triangle's opposite edge
    // is pierced by ray a→b.
    // First, find any triangle around vertex a.
    const startT = findTriAround(a);
    if (startT === NONE)
        return;
    // Check if edge is entirely along the AF (Domiter Fig.13: no triangles crossed).
    // If a and b are both on the AF and the AF path from a to b doesn't dip below
    // the edge, we only need AF traversal.
    const aNode = vertAF[a], bNode = vertAF[b];
    // Try to find the first crossed triangle by walking the one-ring around a.
    const first = findFirstCrossed(a, b, startT);
    if (first === NONE) {
        // No triangle is crossed — Domiter Fig.13: edge lies along/above AF.
        // AF traversal only: lower pseudo-polygon from AF vertices a→b.
        if (aNode !== NONE && bNode !== NONE) {
            edgeEventAFOnly(a, b, aNode, bNode);
        }
        return;
    }
    // Case 1 (Domiter Fig.12): edge entirely below AF — triangle traversal.
    // Case 3 (Domiter Fig.14): edge crosses AF — mixed traversal.
    // We handle both with the same traversal that switches between triangle
    // and AF traversal as described in Domiter §3.4.2.
    edgeEventTraversal(a, b, first);
}
// Edge insertion with no triangle crossing — Domiter Fig.13.
// Only a lower pseudo-polygon exists, formed by AF vertices from a to b.
function edgeEventAFOnly(a, b, aNode, bNode) {
    // Collect AF vertices between a and b (exclusive) into lower pseudo-polygon.
    let nL = 0;
    let nd = afN[aNode];
    while (nd !== NONE && afV[nd] !== b) {
        scrL[nL++] = afV[nd];
        nd = afN[nd];
    }
    if (nL === 0) {
        // Edge a→b is already an AF edge. Just mark it.
        // Find the triangle backing this AF edge and mark it fixed.
        const t = afT[aNode];
        if (t !== NONE) {
            const ai = localIdx(t, a), bi = localIdx(t, b);
            if (ai >= 0 && bi >= 0)
                markFixed(t, 3 - ai - bi);
        }
        return;
    }
    // Remove AF nodes between a and b, and triangulate the lower pseudo-polygon.
    // The AF triangles along this stretch become the boundary.
    // Collect removed AF nodes and their backing triangles.
    // Also need to remove the AF nodes and relink a→b.
    // Remove AF nodes between a and b
    nd = afN[aNode];
    while (nd !== NONE && afV[nd] !== b) {
        const next = afN[nd];
        afDel(nd);
        nd = next;
    }
    // Relink: aNode→bNode
    afN[aNode] = bNode;
    afP[bNode] = aNode;
    // Triangulate lower pseudo-polygon (vertices below edge a→b)
    // These are the vertices we collected in scrL[0..nL).
    // Use Anglada's recursive pseudo-polygon triangulation.
    const t = triPseudoPoly(a, b, scrL, 0, nL);
    // Mark edge a-b as fixed on the resulting triangle
    if (t !== NONE) {
        const ai = localIdx(t, a), bi = localIdx(t, b);
        if (ai >= 0 && bi >= 0)
            markFixed(t, 3 - ai - bi);
    }
    // Update AF triangle pointer for a
    if (t !== NONE)
        afT[aNode] = t;
}
// Edge insertion with triangle traversal — Domiter Fig.12/14, Anglada §4.
function edgeEventTraversal(a, b, first) {
    // Walk through triangles pierced by edge a→b (Anglada's AddEdgeCDT).
    // Collect upper and lower pseudo-polygon vertices.
    let nU = 0, nL = 0, nRm = 0;
    let t = first;
    let v = a; // vertex we entered from
    while (true) {
        scrRm[nRm++] = t;
        td[t] = 1; // mark dead
        const t3 = t * 3;
        const v0 = tv[t3], v1 = tv[t3 + 1], v2 = tv[t3 + 2];
        // Check if b is a vertex of this triangle
        if (v0 === b || v1 === b || v2 === b) {
            // Classify remaining non-{a,b} vertices
            for (let j = 0; j < 3; j++) {
                const vj = tv[t3 + j];
                if (vj === a || vj === b)
                    continue;
                const o = orient(a, b, vj);
                if (o > 0)
                    scrU[nU++] = vj;
                else if (o < 0)
                    scrL[nL++] = vj;
            }
            break;
        }
        // Find the opposed triangle and vertex (Anglada):
        // t_seq = OpposedTriangle(t, v) — the adjacent triangle of t opposite v
        // v_seq = OpposedVertex(t_seq, t) — the vertex of t_seq not in t
        const vi = localIdx(t, v);
        if (vi < 0)
            break;
        const tSeq = ta[t3 + vi];
        if (tSeq === NONE)
            break;
        const vSeqJ = adjIdx(tSeq, t);
        if (vSeqJ < 0)
            break;
        const vSeq = tv[tSeq * 3 + vSeqJ];
        // Classify v_seq
        const oSeq = orient(a, b, vSeq);
        if (oSeq > 0) {
            // v_seq above edge ab
            scrU[nU++] = vSeq;
            // v = vertex shared by t and t_seq above ab
            // The two vertices shared by t and t_seq are the edge opposite v in t
            // and opposite vSeq in tSeq. These are the same two vertices.
            // We need the one that's above ab.
            const e1 = tv[t3 + (vi + 1) % 3], e2 = tv[t3 + (vi + 2) % 3];
            const o1 = (e1 === a || e1 === b) ? 0 : orient(a, b, e1);
            const o2 = (e2 === a || e2 === b) ? 0 : orient(a, b, e2);
            v = (o1 >= 0 && o1 >= o2) ? e1 : e2;
        }
        else if (oSeq < 0) {
            // v_seq below edge ab
            scrL[nL++] = vSeq;
            const e1 = tv[t3 + (vi + 1) % 3], e2 = tv[t3 + (vi + 2) % 3];
            const o1 = (e1 === a || e1 === b) ? 0 : orient(a, b, e1);
            const o2 = (e2 === a || e2 === b) ? 0 : orient(a, b, e2);
            v = (o1 <= 0 && o1 <= o2) ? e1 : e2;
        }
        else {
            // v_seq is ON the edge — split into two sub-edges (Domiter)
            // Retriangulate what we have so far, then recurse.
            retriangulateRemoved(a, b, nU, nL, nRm);
            edgeEvent(a, vSeq);
            edgeEvent(vSeq, b);
            return;
        }
        t = tSeq;
    }
    retriangulateRemoved(a, b, nU, nL, nRm);
}
// Retriangulate the region left by removed triangles.
// Upper pseudo-polygon P_U = scrU[0..nU) with edge (a, b)
// Lower pseudo-polygon P_L = scrL[0..nL) with edge (b, a)
function retriangulateRemoved(a, b, nU, nL, nRm) {
    // Save boundary adjacencies from removed triangles.
    // For each removed triangle, check its 3 neighbors. If a neighbor is alive
    // (not dead), record that boundary edge for later linking.
    // We use a simple flat array: for each boundary edge, store [extTri, extJ, e0, e1].
    let nBnd = 0;
    for (let i = 0; i < nRm; i++) {
        const rt = scrRm[i], rt3 = rt * 3;
        for (let j = 0; j < 3; j++) {
            const nb = ta[rt3 + j];
            if (nb === NONE || td[nb])
                continue;
            // This edge is a boundary edge. Get its vertices.
            const e0 = tv[rt3 + (j + 1) % 3], e1 = tv[rt3 + (j + 2) % 3];
            const ej = adjIdx(nb, rt);
            if (ej < 0)
                continue;
            // Store in scratch: [extTri, extJ, e0, e1]
            scrBndT[nBnd] = nb;
            scrBndJ[nBnd] = ej;
            // Encode edge as min/max pair for matching
            // We'll store e0, e1 directly and match by checking both orientations
            scrBndT[nBnd + nRm * 3] = e0; // reuse space after nRm*3
            scrBndJ[nBnd + nRm * 3] = e1;
            nBnd++;
            // Unlink the neighbor's pointer to the dead triangle
            ta[nb * 3 + ej] = NONE;
        }
    }
    // Triangulate upper and lower pseudo-polygons
    const tU = triPseudoPoly(a, b, scrU, 0, nU);
    const tL = triPseudoPoly(b, a, scrL, 0, nL);
    // Link tU and tL across edge a-b if both exist
    if (tU !== NONE && tL !== NONE) {
        const ui = localIdx(tU, a), uj = localIdx(tU, b);
        const li = localIdx(tL, b), lj = localIdx(tL, a);
        if (ui >= 0 && uj >= 0 && li >= 0 && lj >= 0) {
            link(tU, 3 - ui - uj, tL, 3 - li - lj);
        }
    }
    // Reconstitute boundary adjacencies (Anglada §4 last step).
    // For each new triangle, check its unlinked edges against boundary edges.
    // Since the number of boundary edges is small (bounded by the removed region),
    // a nested scan is fast enough.
    reconstituteBoundary(nBnd, nRm);
    // Mark edge a-b as fixed
    if (tU !== NONE) {
        const ai = localIdx(tU, a), bi = localIdx(tU, b);
        if (ai >= 0 && bi >= 0)
            markFixed(tU, 3 - ai - bi);
    }
    // Update AF triangle pointers that may have referenced removed triangles.
    updateAFAfterRemoval(nRm);
}
function reconstituteBoundary(nBnd, nRm) {
    // Walk all triangles created since the removal started and link their
    // unconnected edges to boundary neighbors.
    // New triangles were appended starting from triCount - (number created).
    // But we don't track that precisely. Instead, walk new tris by checking
    // triangles from the end that are alive and have NONE adjacencies.
    //
    // Actually, simpler: iterate boundary edges and find which new triangle
    // has that edge.
    for (let i = 0; i < nBnd; i++) {
        const extT = scrBndT[i], extJ = scrBndJ[i];
        const e0 = scrBndT[i + nRm * 3], e1 = scrBndJ[i + nRm * 3];
        // Find the new (alive) triangle that has edge (e0, e1)
        // Walk from extT's perspective: the new triangle should be linkable.
        // Since triPseudoPoly creates new triangles, search backward from triCount.
        for (let t = triCount - 1; t >= 0; t--) {
            if (td[t])
                continue;
            const i0 = localIdx(t, e0), i1 = localIdx(t, e1);
            if (i0 >= 0 && i1 >= 0) {
                const oj = 3 - i0 - i1;
                if (ta[t * 3 + oj] === NONE) {
                    link(t, oj, extT, extJ);
                    break;
                }
            }
        }
    }
}
function updateAFAfterRemoval(nRm) {
    // For each removed triangle, any AF node referencing it needs updating.
    // Walk AF and fix stale triangle pointers.
    for (let nd = 0; nd < afLen; nd++) {
        if (afP[nd] === NONE && afN[nd] === NONE && nd > 0)
            continue; // orphan
        const t = afT[nd];
        if (t === NONE || !td[t])
            continue;
        // This AF node's triangle was removed. Find a live replacement.
        const v = afV[nd];
        const nn = afN[nd];
        if (nn === NONE)
            continue;
        const vn = afV[nn];
        // Find a live triangle containing both v and vn.
        for (let i = triCount - 1; i >= 0; i--) {
            if (td[i])
                continue;
            if (localIdx(i, v) >= 0 && localIdx(i, vn) >= 0) {
                afT[nd] = i;
                break;
            }
        }
    }
}
// ---------------------------------------------------------------------------
// Pseudo-polygon triangulation — Anglada §4, Fig.8
// ---------------------------------------------------------------------------
// Recursive Delaunay triangulation of pseudo-polygon.
//   edge (a, b), vertices P[off..off+len)
// Returns the triangle on edge a-b, or NONE if empty.
//
// The recursion returns the last triangle created (the one on edge ab),
// and we link children to parents as we go — no Map needed.
function triPseudoPoly(a, b, P, off, len) {
    if (len === 0)
        return NONE;
    // Find c = vertex in P that maximizes Delaunay criterion
    let ci = 0;
    for (let i = 1; i < len; i++) {
        const oa = orient(a, P[off + ci], b);
        if (oa > 0) {
            if (inCircle(a, P[off + ci], b, P[off + i]) > 0)
                ci = i;
        }
        else if (oa < 0) {
            if (inCircle(a, b, P[off + ci], P[off + i]) > 0)
                ci = i;
        }
        else {
            ci = i;
        }
    }
    const c = P[off + ci];
    // Recurse on P_E = P[off..off+ci) with edge (a, c)
    const tE = triPseudoPoly(a, c, P, off, ci);
    // Recurse on P_D = P[off+ci+1..off+len) with edge (c, b)
    const tD = triPseudoPoly(c, b, P, off + ci + 1, len - ci - 1);
    // Create triangle (a, c, b) — ensure CCW
    const o = orient(a, c, b);
    if (o === 0)
        return NONE; // degenerate
    let t;
    if (o > 0) {
        t = addTri(a, c, b);
    }
    else {
        t = addTri(a, b, c);
    }
    // Link to child triangles:
    // tE is on edge a-c → find its local edge a-c and link
    if (tE !== NONE) {
        const ei0 = localIdx(tE, a), ei1 = localIdx(tE, c);
        if (ei0 >= 0 && ei1 >= 0) {
            const ti0 = localIdx(t, a), ti1 = localIdx(t, c);
            if (ti0 >= 0 && ti1 >= 0) {
                link(t, 3 - ti0 - ti1, tE, 3 - ei0 - ei1);
            }
        }
    }
    if (tD !== NONE) {
        const di0 = localIdx(tD, c), di1 = localIdx(tD, b);
        if (di0 >= 0 && di1 >= 0) {
            const ti0 = localIdx(t, c), ti1 = localIdx(t, b);
            if (ti0 >= 0 && ti1 >= 0) {
                link(t, 3 - ti0 - ti1, tD, 3 - di0 - di1);
            }
        }
    }
    return t;
}
// ---------------------------------------------------------------------------
// markExisting / findTriAround / findFirstCrossed
// ---------------------------------------------------------------------------
function markExisting(a, b) {
    const start = findTriAround(a);
    if (start === NONE)
        return false;
    // Walk one-ring around a in both directions
    let t = start;
    for (let i = 0; i < triCount; i++) {
        if (td[t])
            break;
        const ai = localIdx(t, a);
        if (ai < 0)
            break;
        const t3 = t * 3;
        if (tv[t3 + (ai + 1) % 3] === b) {
            markFixed(t, (ai + 2) % 3);
            return true;
        }
        if (tv[t3 + (ai + 2) % 3] === b) {
            markFixed(t, (ai + 1) % 3);
            return true;
        }
        t = ta[t3 + (ai + 1) % 3]; // CW
        if (t === NONE || t === start)
            break;
    }
    t = start;
    for (let i = 0; i < triCount; i++) {
        if (td[t])
            break;
        const ai = localIdx(t, a);
        if (ai < 0)
            break;
        const t3 = t * 3;
        if (tv[t3 + (ai + 1) % 3] === b) {
            markFixed(t, (ai + 2) % 3);
            return true;
        }
        if (tv[t3 + (ai + 2) % 3] === b) {
            markFixed(t, (ai + 1) % 3);
            return true;
        }
        t = ta[t3 + (ai + 2) % 3]; // CCW
        if (t === NONE || t === start)
            break;
    }
    return false;
}
// Find any live triangle containing vertex v.
// AF node for v stores the triangle backing the AF edge.
// After flips, that triangle may no longer contain v, but a neighbor will.
function findTriAround(v) {
    const nd = vertAF[v];
    if (nd === NONE || nd >= afLen)
        return NONE;
    // Check afT[nd] and afT[prev]
    let t = afT[nd];
    if (t !== NONE && !td[t] && localIdx(t, v) >= 0)
        return t;
    const p = afP[nd];
    if (p !== NONE) {
        t = afT[p];
        if (t !== NONE && !td[t] && localIdx(t, v) >= 0)
            return t;
    }
    // Walk neighbors of those triangles (max 2 hops covers all flip cases)
    for (const seed of [afT[nd], p !== NONE ? afT[p] : NONE]) {
        if (seed === NONE || seed >= triCount)
            continue;
        if (!td[seed]) {
            for (let j = 0; j < 3; j++) {
                const nb = ta[seed * 3 + j];
                if (nb !== NONE && !td[nb] && localIdx(nb, v) >= 0)
                    return nb;
            }
        }
    }
    return NONE;
}
// Find first triangle around vertex a whose opposite edge is crossed by a→b.
// Domiter Fig.11: walk triangles around a using cross-product.
function findFirstCrossed(a, b, start) {
    // Walk one-ring around a in CW direction
    let t = start;
    for (let i = 0; i < triCount; i++) {
        if (td[t]) {
            t = NONE;
            break;
        }
        const ai = localIdx(t, a);
        if (ai < 0)
            break;
        const t3 = t * 3;
        const v1 = tv[t3 + (ai + 1) % 3], v2 = tv[t3 + (ai + 2) % 3];
        if (v1 === b || v2 === b)
            return NONE; // edge already exists
        const o1 = orient(a, b, v1), o2 = orient(a, b, v2);
        if ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0))
            return t;
        t = ta[t3 + (ai + 1) % 3]; // CW step
        if (t === NONE || t === start)
            break;
    }
    // Try CCW direction
    t = start;
    for (let i = 0; i < triCount; i++) {
        if (td[t]) {
            t = NONE;
            break;
        }
        const ai = localIdx(t, a);
        if (ai < 0)
            break;
        const t3 = t * 3;
        const v1 = tv[t3 + (ai + 1) % 3], v2 = tv[t3 + (ai + 2) % 3];
        if (v1 === b || v2 === b)
            return NONE;
        const o1 = orient(a, b, v1), o2 = orient(a, b, v2);
        if ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0))
            return t;
        t = ta[t3 + (ai + 2) % 3]; // CCW step
        if (t === NONE || t === start)
            break;
    }
    return NONE;
}
// ---------------------------------------------------------------------------
// Finalization — Domiter §3.5
// ---------------------------------------------------------------------------
// (i) Remove triangles with artificial points
// (ii) Add bordering triangles to complete the convex hull
//
// Walk the AF from right of P_{-1} to P_{-2}, taking triples of consecutive
// AF points. If signed area > 0, add triangle and legalize. (Domiter Fig.15a)
// Then follow artificial triangles from P_{-2} to P_{-1}, deleting them and
// adding triangles where signed area < 0. (Domiter Fig.15b/c)
function finalize(A1, A2) {
    // Upper convex hull: walk AF from first real point to A2
    let nd = afN[vertAF[A1]]; // first real point (right of A1)
    if (nd === NONE)
        return;
    while (true) {
        const nn = afN[nd];
        if (nn === NONE)
            break;
        if (afV[nn] === A2)
            break;
        const nnn = afN[nn];
        if (nnn === NONE)
            break;
        const v1 = afV[nd], v2 = afV[nn], v3 = afV[nnn];
        if (v2 === A2 || v3 === A2)
            break;
        const o = orient(v1, v2, v3);
        if (o > 0) {
            // Create triangle and remove middle vertex from AF
            const t = addTri(v1, v2, v3);
            linkToOldTri(t, 2, afT[nd], v1, v2);
            linkToOldTri(t, 0, afT[nn], v2, v3);
            legalize(t, v1);
            legalize(t, v3);
            afDel(nn);
            afN[nd] = nnn;
            afP[nnn] = nd;
            afT[nd] = t;
            // Step back to check the new triple
            const pp = afP[nd];
            if (pp !== NONE && afV[pp] !== A1)
                nd = pp;
        }
        else {
            nd = nn;
        }
    }
    // Lower convex hull: follow artificial triangles from A2 to A1.
    // (Domiter Fig.15b/c) — These are triangles that include A1 or A2.
    // The simplest approach: after the upper hull is done, just mark all
    // triangles containing A1 or A2 as dead.
}
// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export function sweepTriangulate(coords, edges, holes) {
    const n = coords.length >> 1;
    if (n < 3)
        return { triangles: new Uint32Array(0), triCount: 0, coords };
    // Build coordinate arrays with 2 extra artificial points
    const nv = n + 2;
    px = new Float64Array(nv);
    py = new Float64Array(nv);
    for (let i = 0; i < n; i++) {
        px[i] = coords[i * 2];
        py[i] = coords[i * 2 + 1];
    }
    let xmin = px[0], xmax = px[0], ymin = py[0], ymax = py[0];
    for (let i = 1; i < n; i++) {
        if (px[i] < xmin)
            xmin = px[i];
        if (px[i] > xmax)
            xmax = px[i];
        if (py[i] < ymin)
            ymin = py[i];
        if (py[i] > ymax)
            ymax = py[i];
    }
    // Artificial points P_{-1}, P_{-2} — Domiter §3.3, α=0.3
    const dx = 0.3 * (xmax - xmin + 1);
    const dy = 0.3 * (ymax - ymin + 1);
    const A1 = n, A2 = n + 1;
    px[A1] = xmin - dx;
    py[A1] = ymin - dy;
    px[A2] = xmax + dx;
    py[A2] = ymin - dy;
    // Sort points by y then x — Domiter §3.3
    const order = new Uint32Array(n);
    for (let i = 0; i < n; i++)
        order[i] = i;
    order.sort((a, b) => { const d = py[a] - py[b]; return d !== 0 ? d : px[a] - px[b]; });
    // Build edge info: upper endpoint → list of lower endpoints
    // Pre-count edges per vertex to avoid dynamic arrays
    let edgeLo = null;
    let edgeOff = null;
    if (edges !== null && edges.length > 0) {
        const ne = edges.length >> 1;
        const cnt = new Int32Array(n);
        for (let i = 0; i < ne; i++) {
            let ea = edges[i * 2], eb = edges[i * 2 + 1];
            if (py[ea] < py[eb] || (py[ea] === py[eb] && px[ea] < px[eb])) {
                cnt[eb]++;
            }
            else {
                cnt[ea]++;
            }
        }
        edgeOff = new Int32Array(n + 1);
        for (let i = 0; i < n; i++)
            edgeOff[i + 1] = edgeOff[i] + cnt[i];
        edgeLo = new Int32Array(edgeOff[n]);
        cnt.fill(0);
        for (let i = 0; i < ne; i++) {
            let ea = edges[i * 2], eb = edges[i * 2 + 1];
            let upper;
            let lower;
            if (py[ea] < py[eb] || (py[ea] === py[eb] && px[ea] < px[eb])) {
                upper = eb;
                lower = ea;
            }
            else {
                upper = ea;
                lower = eb;
            }
            edgeLo[edgeOff[upper] + cnt[upper]++] = lower;
        }
    }
    // Initialize triangle pool
    const estTris = Math.max(n * 3, 64);
    initTris(estTris);
    // Scratch arrays for edge events
    scrU = new Int32Array(n);
    scrL = new Int32Array(n);
    scrRm = new Int32Array(estTris);
    scrBndT = new Int32Array(estTris * 4);
    scrBndJ = new Int32Array(estTris * 4);
    // Initialize AF
    initAF(n, xmin - dx, xmax + dx);
    // vertAF: vertex → AF node id
    vertAF = new Int32Array(nv).fill(NONE);
    // Initial triangle: (A1, P0, A2) — Domiter Fig.6
    const p0 = order[0];
    const t0 = addTri(A1, p0, A2);
    // Initial advancing front: A1 → P0 → A2
    const nd1 = afNew(A1, t0);
    const nd0 = afNew(p0, t0);
    const nd2 = afNew(A2, NONE);
    afN[nd1] = nd0;
    afP[nd0] = nd1;
    afN[nd0] = nd2;
    afP[nd2] = nd0;
    vertAF[A1] = nd1;
    vertAF[p0] = nd0;
    vertAF[A2] = nd2;
    // Sweep remaining points
    for (let i = 1; i < n; i++) {
        const pi = order[i];
        pointEvent(pi);
        // Edge events
        if (edgeLo !== null && edgeOff !== null) {
            const start = edgeOff[pi], end = edgeOff[pi + 1];
            for (let e = start; e < end; e++) {
                edgeEvent(pi, edgeLo[e]);
            }
        }
    }
    // Finalization — Domiter §3.5
    finalize(A1, A2);
    // ----- Output -----
    // Filter out dead triangles and those with artificial points.
    let dead = null;
    let outCount = 0;
    if (holes !== null && holes.length >= 2) {
        dead = new Uint8Array(triCount);
        for (let t = 0; t < triCount; t++) {
            const t3 = t * 3;
            if (td[t] || tv[t3] >= n || tv[t3 + 1] >= n || tv[t3 + 2] >= n)
                dead[t] = 1;
        }
        const nh = holes.length >> 1;
        for (let h = 0; h < nh; h++) {
            const hx = holes[h * 2], hy = holes[h * 2 + 1];
            const seed = findTriContaining(hx, hy, n, dead);
            if (seed === NONE)
                continue;
            const q = [seed];
            dead[seed] = 1;
            while (q.length) {
                const ct = q.pop();
                for (let j = 0; j < 3; j++) {
                    if (isFixed(ct, j))
                        continue;
                    const nb = ta[ct * 3 + j];
                    if (nb === NONE || dead[nb])
                        continue;
                    dead[nb] = 1;
                    q.push(nb);
                }
            }
        }
        for (let t = 0; t < triCount; t++) {
            if (!dead[t])
                outCount++;
        }
    }
    else {
        for (let t = 0; t < triCount; t++) {
            if (td[t])
                continue;
            const t3 = t * 3;
            if (tv[t3] < n && tv[t3 + 1] < n && tv[t3 + 2] < n)
                outCount++;
        }
    }
    const out = new Uint32Array(outCount * 3);
    let idx = 0;
    for (let t = 0; t < triCount; t++) {
        if (td[t])
            continue;
        const t3 = t * 3;
        if (tv[t3] >= n || tv[t3 + 1] >= n || tv[t3 + 2] >= n) {
            if (dead === null)
                continue;
        }
        if (dead !== null && dead[t])
            continue;
        out[idx++] = tv[t3];
        out[idx++] = tv[t3 + 1];
        out[idx++] = tv[t3 + 2];
    }
    return { triangles: out, triCount: outCount, coords };
}
function findTriContaining(hx, hy, nReal, dead) {
    for (let t = 0; t < triCount; t++) {
        if (dead[t])
            continue;
        const t3 = t * 3;
        const a = tv[t3], b = tv[t3 + 1], c = tv[t3 + 2];
        if (a >= nReal || b >= nReal || c >= nReal)
            continue;
        const o1 = orient2dSign(px[a], py[a], px[b], py[b], hx, hy);
        const o2 = orient2dSign(px[b], py[b], px[c], py[c], hx, hy);
        const o3 = orient2dSign(px[c], py[c], px[a], py[a], hx, hy);
        if (o1 >= 0 && o2 >= 0 && o3 >= 0)
            return t;
        if (o1 <= 0 && o2 <= 0 && o3 <= 0)
            return t;
    }
    return NONE;
}
//# sourceMappingURL=SweepCDT.js.map