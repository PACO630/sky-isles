import * as THREE from 'three';

// Shared low-poly geometry helpers used by islands, whales and effects.

const ni = (g) => (g.index ? g.toNonIndexed() : g);

export const BASE = {
  cone6: ni(new THREE.ConeGeometry(1, 1, 6)),
  cone5: ni(new THREE.ConeGeometry(1, 1, 5)),
  cyl6: ni(new THREE.CylinderGeometry(1, 1, 1, 6)),
  cyl5: ni(new THREE.CylinderGeometry(1, 1, 1, 5)),
  cyl8: ni(new THREE.CylinderGeometry(1, 1, 1, 8)),
  ico: ni(new THREE.IcosahedronGeometry(1, 0)),
  dodec: ni(new THREE.DodecahedronGeometry(1, 0)),
  octa: ni(new THREE.OctahedronGeometry(1, 0)),
  box: ni(new THREE.BoxGeometry(1, 1, 1)),
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

export function mat(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// Collects flat-shaded, vertex-coloured triangles so a whole island is one draw call.
export class GeoBuilder {
  constructor(rand) {
    this.rand = rand;
    this.pos = [];
    this.col = [];
  }
  _color(c, j) {
    _c.copy(c);
    if (j) _c.offsetHSL(0, 0, (this.rand() - 0.5) * j);
    return _c;
  }
  tri(a, b, c, color, j = 0.04) {
    const k = this._color(color, j);
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) this.col.push(k.r, k.g, k.b);
  }
  // color may be a THREE.Color or a function (centroid) => THREE.Color
  add(geo, matrix, color, j = 0.05) {
    const p = geo.attributes.position;
    const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (let i = 0; i < p.count; i += 3) {
      for (let n = 0; n < 3; n++) tri[n].fromBufferAttribute(p, i + n).applyMatrix4(matrix);
      const base = typeof color === 'function' ? color(_v.copy(tri[0]).add(tri[1]).add(tri[2]).divideScalar(3)) : color;
      const k = this._color(base, j);
      for (let n = 0; n < 3; n++) {
        this.pos.push(tri[n].x, tri[n].y, tri[n].z);
        this.col.push(k.r, k.g, k.b);
      }
    }
  }
  build() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

export function makeHaloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
