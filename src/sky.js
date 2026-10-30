import * as THREE from 'three';
import { mulberry32, smoothstep } from './rng.js';

// Day/night is derived from the wall clock, so every player in a room sees the same sky
// without any network traffic.
const CYCLE = 720; // seconds per full day

const C = (h) => new THREE.Color(h);
const PAL = {
  dayTop: C('#79b4ff'), dayHorizon: C('#e6e6ff'),
  duskTop: C('#5b62b8'), duskHorizon: C('#ffb4a2'),
  nightTop: C('#070a26'), nightHorizon: C('#2b2560'),
  dayBottom: C('#c9cff7'), nightBottom: C('#1a1846'),
  cloudDay: C('#ffffff'), cloudDayShade: C('#c5c9f2'),
  cloudDusk: C('#ffd2c2'), cloudNight: C('#454a8c'), cloudNightShade: C('#1d1b48'),
  sunDay: C('#fff6e0'), sunDusk: C('#ffb27a'),
  hemiDay: C('#d9ecff'), hemiNight: C('#5560b0'),
};

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.fog = new THREE.Fog(0xe6e6ff, 90, 310);
    scene.fog = this.fog;

    this.uniforms = {
      topColor: { value: new THREE.Color() },
      horizonColor: { value: new THREE.Color() },
      bottomColor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() },
      night: { value: 0 },
      time: { value: 0 },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.stars = makeStars();
    this.dome.add(this.stars);

    // cloud sea below the islands
    this.seaUniforms = {
      time: { value: 0 },
      light: { value: new THREE.Color() },
      shade: { value: new THREE.Color() },
      fogColor: { value: new THREE.Color() },
      camPos: { value: new THREE.Vector3() },
    };
    this.sea = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400, 1, 1).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: this.seaUniforms, vertexShader: SEA_VS, fragmentShader: SEA_FS, fog: false }),
    );
    this.sea.frustumCulled = false;
    scene.add(this.sea);

    this.clouds = makeClouds();
    scene.add(this.clouds.mesh);

    this.motes = makeMotes();
    scene.add(this.motes.points);

    this.hemi = new THREE.HemisphereLight(0xd9ecff, 0xb9b3e8, 1.4);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.night = 0;
    this.renderer = renderer;
  }

  update(dt, camera, focus, pixelRatio) {
    const now = Date.now() / 1000;
    const phase = (now % CYCLE) / CYCLE;
    const ang = phase * Math.PI * 2;
    const sunDir = this.uniforms.sunDir.value.set(Math.cos(ang) * 0.8, Math.sin(ang), 0.45).normalize();
    const day = smoothstep(-0.1, 0.35, sunDir.y);
    const night = smoothstep(0.05, -0.25, sunDir.y);
    const dusk = 1 - smoothstep(0.0, 0.4, Math.abs(sunDir.y + 0.05));
    this.night = night;

    const u = this.uniforms;
    u.topColor.value.copy(PAL.nightTop).lerp(PAL.dayTop, day).lerp(PAL.duskTop, dusk * 0.5);
    u.horizonColor.value.copy(PAL.nightHorizon).lerp(PAL.dayHorizon, day).lerp(PAL.duskHorizon, dusk * 0.75);
    u.bottomColor.value.copy(PAL.nightBottom).lerp(PAL.dayBottom, day);
    u.sunColor.value.copy(PAL.sunDay).lerp(PAL.sunDusk, dusk);
    u.night.value = night;
    u.time.value = now % 10000;

    this.fog.color.copy(u.horizonColor.value);
    this.renderer.setClearColor(this.fog.color);

    this.dome.position.copy(camera.position);
    this.stars.material.uniforms.opacity.value = night;
    this.stars.material.uniforms.time.value = now % 10000;

    const s = this.seaUniforms;
    s.time.value = now % 10000;
    s.light.value.copy(PAL.cloudNight).lerp(PAL.cloudDay, day).lerp(PAL.cloudDusk, dusk * 0.6);
    s.shade.value.copy(PAL.cloudNightShade).lerp(PAL.cloudDayShade, day);
    s.fogColor.value.copy(u.horizonColor.value);
    s.camPos.value.copy(camera.position);
    this.sea.position.set(Math.round(focus.x / 50) * 50, 0, Math.round(focus.z / 50) * 50);

    this.hemi.color.copy(PAL.hemiNight).lerp(PAL.hemiDay, day);
    this.hemi.groundColor.copy(s.shade.value);
    this.hemi.intensity = 1.35 + day * 0.25;
    this.sun.color.copy(u.sunColor.value);
    const lightDir = sunDir.y > -0.05 ? sunDir : _moon.copy(sunDir).negate();
    this.sun.intensity = sunDir.y > -0.05 ? 0.3 + day * 1.9 : 0.35;
    if (sunDir.y <= -0.05) this.sun.color.set('#9fb0ff');
    this.sun.position.copy(focus).addScaledVector(lightDir, 100);
    this.sun.target.position.copy(focus);

    this.clouds.update(dt, focus, s.light.value);
    this.motes.update(dt, camera.position, night, pixelRatio);
  }
}

const _moon = new THREE.Vector3();

function makeStars() {
  const n = 1400;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  const rand = mulberry32(99);
  for (let i = 0; i < n; i++) {
    const u = rand() * 2 - 1, a = rand() * Math.PI * 2;
    const y = Math.abs(u) * 0.95 + 0.05;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r * 850, y * 850, Math.sin(a) * r * 850], i * 3);
    seed[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 0 }, time: { value: 0 } },
    vertexShader: `attribute float seed; uniform float time; varying float vA;
      void main(){ vA = 0.6 + 0.4 * sin(time * (1.0 + seed * 3.0) + seed * 50.0);
      vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = 1.0 + seed * 2.2; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float opacity; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA * opacity;
      gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * a, a);
      #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

// low-poly puffs drifting around the player, wrapped so they never run out
function makeClouds() {
  const rand = mulberry32(7);
  const nClouds = 46;
  const puffs = [];
  for (let i = 0; i < nClouds; i++) {
    const cx = (rand() * 2 - 1) * 450, cz = (rand() * 2 - 1) * 450, cy = 12 + rand() * 140;
    const size = 4 + rand() * 8;
    const n = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      puffs.push({
        x: cx + (k - n / 2) * size * 0.9 + (rand() - 0.5) * size,
        y: cy + (rand() - 0.5) * size * 0.4,
        z: cz + (rand() - 0.5) * size,
        s: size * (0.6 + rand() * 0.6),
        r: rand() * 6,
      });
    }
  }
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0xffffff, emissiveIntensity: 0.35 });
  const mesh = new THREE.InstancedMesh(geo, mat, puffs.length);
  mesh.frustumCulled = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let drift = 0;
  return {
    mesh,
    update(dt, focus, light) {
      drift += dt * 2.2;
      mat.emissive.copy(light);
      for (let i = 0; i < puffs.length; i++) {
        const c = puffs[i];
        let x = c.x + drift, z = c.z;
        x = focus.x + ((((x - focus.x + 450) % 900) + 900) % 900) - 450;
        z = focus.z + ((((z - focus.z + 450) % 900) + 900) % 900) - 450;
        e.set(0, c.r, 0);
        q.setFromEuler(e);
        m4.compose(p.set(x, c.y, z), q, s.set(c.s, c.s * 0.6, c.s));
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// floating fireflies / spirit motes near the camera
function makeMotes() {
  const n = 160;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  const rand = mulberry32(42);
  for (let i = 0; i < n; i++) {
    pos.set([rand() * 80, rand() * 40, rand() * 80], i * 3);
    seed[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const uniforms = { time: { value: 0 }, origin: { value: new THREE.Vector3() }, night: { value: 0 }, pr: { value: 1 } };
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `attribute float seed; uniform float time; uniform vec3 origin; uniform float pr; varying float vA; varying float vS;
      void main(){
        vec3 p = position;
        p += vec3(sin(time*0.3+seed*20.0)*3.0, sin(time*0.5+seed*9.0)*2.0 + time*0.4, cos(time*0.25+seed*13.0)*3.0);
        vec3 box = vec3(80.0, 40.0, 80.0);
        p = mod(p - origin + box * 0.5, box) - box * 0.5 + origin;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = (0.5 + 0.5 * sin(time * 2.0 + seed * 30.0)) * smoothstep(40.0, 10.0, -mv.z);
        vS = seed;
        gl_PointSize = (3.0 + seed * 4.0) * pr * (30.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float night; varying float vA; varying float vS;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA * (0.25 + night * 0.75);
      vec3 c = mix(vec3(1.0, 0.85, 0.5), vec3(0.55, 0.95, 1.0), step(0.5, vS));
      gl_FragColor = vec4(c * a, a);
      #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  return {
    points,
    update(dt, camPos, night, pr) {
      uniforms.time.value += dt;
      uniforms.origin.value.copy(camPos);
      uniforms.night.value = night;
      uniforms.pr.value = pr;
    },
  };
}

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FS = /* glsl */ `
uniform vec3 topColor, horizonColor, bottomColor, sunDir, sunColor;
uniform float night, time;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(horizonColor, topColor, pow(h, 0.55)) : mix(horizonColor, bottomColor, pow(-h, 0.5));
  float s = max(dot(d, sunDir), 0.0);
  col += sunColor * (smoothstep(0.9985, 0.9992, s) * 1.5 + pow(s, 14.0) * 0.25) * (1.0 - night);
  float m = max(dot(d, -sunDir), 0.0);
  col += vec3(0.85, 0.88, 1.0) * (smoothstep(0.9988, 0.9994, m) * 1.2 + pow(m, 30.0) * 0.08) * night;
  // faint aurora ribbons at night
  float band = smoothstep(0.12, 0.35, h) * smoothstep(0.75, 0.35, h);
  float wave = 0.5 + 0.5 * sin(atan(d.z, d.x) * 5.0 + time * 0.15 + sin(h * 12.0 + time * 0.2) * 1.5);
  col += vec3(0.25, 0.95, 0.75) * band * wave * night * 0.18;
  col += vec3(0.6, 0.35, 1.0) * band * (1.0 - wave) * night * 0.08;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const SEA_VS = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SEA_FS = /* glsl */ `
uniform float time;
uniform vec3 light, shade, fogColor, camPos;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = vWorld.xz * 0.012 + vec2(time * 0.01, time * 0.004);
  float n = fbm(p + fbm(p * 0.5 + time * 0.005));
  vec3 col = mix(shade, light, smoothstep(0.35, 0.75, n));
  float dist = length(vWorld.xz - camPos.xz);
  col = mix(col, fogColor, smoothstep(150.0, 900.0, dist));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
