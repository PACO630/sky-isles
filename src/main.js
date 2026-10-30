import * as THREE from 'three';
import { World, LORE } from './world.js';
import { Sky } from './sky.js';
import { Input } from './input.js';
import { createAvatar, animateAvatar, LocalPlayer, makeShadow, placeShadow, makeLabel, playEmote, PLAYER_COLORS, EMOTES, EMOTE } from './player.js';
import { StarFall } from './events.js';
import { connect } from './net.js';
import { loadProfile, saveProfile, loadWorld, saveWorld } from './save.js';
import { initAudio, SFX } from './audio.js';
import { clamp } from './rng.js';
import { iconSvg } from './icons.js';

const $ = (id) => document.getElementById(id);
const ALTAR_COST = 3;

// ---------- renderer / scene ----------

const canvas = $('game');
const input = new Input(canvas, {
  jump: $('btnJump'),
  interact: $('btnInteract'),
  joyBase: $('joyBase'),
  knob: $('joyKnob'),
});
const isTouch = input.isTouch;
for (const node of document.querySelectorAll('[data-icon]')) node.innerHTML = iconSvg(node.dataset.icon);
if (isTouch) document.body.classList.add('is-touch');
const portrait = matchMedia('(orientation: portrait)');

// Phones play in landscape. Android can lock it from fullscreen; iOS can't, so the
// CSS overlay asks the player to turn the phone instead.
async function goLandscape() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch {
    // not supported (iOS Safari, desktop): the rotate overlay handles it
  }
}
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
const pixelRatio = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
const sky = new Sky(scene, renderer);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- UI helpers ----------

function toast(text, cls = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4300);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}

let nameTimer = 0;
function showIslandName(name, sub) {
  const el = $('islandName');
  el.innerHTML = '';
  el.append(name);
  if (sub) {
    const s = document.createElement('small');
    s.textContent = sub;
    el.append(s);
  }
  el.classList.add('show');
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function flash() {
  const f = $('fade');
  f.classList.add('on');
  setTimeout(() => f.classList.remove('on'), 380);
}

// ---------- title screen ----------

const profile = loadProfile();
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const randomCode = () => 'sky-' + Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const cleanCode = (s) => s.trim().replace(/\s+/g, '-').slice(0, 24);

let chosenColor = profile.color || PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
$('name').value = profile.name || '旅人' + Math.floor(100 + Math.random() * 900);
const hashCode = cleanCode(decodeURIComponent(location.hash.slice(1)));
$('world').value = hashCode || profile.lastWorld || randomCode();
if (hashCode) $('start').textContent = '加入朋友的世界';

for (const c of PLAYER_COLORS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'swatch' + (c === chosenColor ? ' on' : '');
  b.style.background = c;
  b.addEventListener('click', () => {
    chosenColor = c;
    for (const s of $('swatches').children) s.classList.toggle('on', s === b);
  });
  $('swatches').appendChild(b);
}
$('newWorld').addEventListener('click', () => ($('world').value = randomCode()));

$('start').addEventListener('click', () => {
  if (game) return;
  const cfg = {
    name: $('name').value.trim().slice(0, 12) || '旅人',
    color: chosenColor,
    world: cleanCode($('world').value) || randomCode(),
  };
  Object.assign(profile, { name: cfg.name, color: cfg.color, lastWorld: cfg.world });
  saveProfile(profile);
  history.replaceState(null, '', '#' + encodeURIComponent(cfg.world));
  initAudio();
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (isTouch) {
    $('touch').classList.remove('hidden');
    document.body.classList.add('touch-ui');
    goLandscape();
  }
  game = new Game(cfg);
  if (import.meta.env.DEV) window.__game = game;
});

// ---------- game ----------

class Game {
  constructor(cfg) {
    this.cfg = cfg;
    this.save = loadWorld(cfg.world);
    this.world = new World(scene, cfg.world, this.save);

    this.avatar = createAvatar(cfg.color);
    scene.add(this.avatar);
    this.shadow = makeShadow();
    scene.add(this.shadow);
    this.player = new LocalPlayer(this.avatar);
    this.player.onRespawn = () => {
      flash();
      toast('雲海把你溫柔地送了回來');
    };

    let start = this.world.spawnPoint();
    if (this.save.pos) {
      const p = new THREE.Vector3(...this.save.pos);
      const g = this.world.groundAt(p.x, p.z, p.y + 1);
      if (g !== null) start = p.set(p.x, g, p.z);
    }
    this.player.teleport(start);
    this.world.update(0, start, pixelRatio);

    this.cam = { yaw: 0.8, pitch: 0.3, dist: 8.5, target: start.clone().add(new THREE.Vector3(0, 1.5, 0)), fov: 62 };
    this.peers = new Map();
    this.sendTimer = 0;
    this.saveTimer = 0;
    this.listTimer = 0;
    this.dirty = false;
    this.currentIsland = null;
    this.currentWhale = null;
    this.pings = [];
    this.emoteCd = 0;
    this.compassTimer = 0;
    this.stars = new StarFall(scene, this.world);

    $('roomLabel').textContent = cfg.world;

    $('invite').addEventListener('click', () => this.invite());
    $('journalBtn').addEventListener('click', () => this.openJournal());
    $('modalClose').addEventListener('click', () => this.closeModal());
    $('modal').addEventListener('click', (e) => e.target === $('modal') && this.closeModal());
    EMOTES.forEach((e, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = e.name;
      b.innerHTML = `${iconSvg(e.icon)}<kbd>${i + 1}</kbd>`;
      b.addEventListener('click', () => {
        this.doEmote(i);
        $('emotes').classList.remove('open');
      });
      $('emoteRow').appendChild(b);
    });
    $('emoteToggle').addEventListener('click', () => $('emotes').classList.toggle('open'));
    // the friends panel stays folded into a small button until it's needed
    const setSocial = (open) => {
      $('socialPanel').classList.toggle('hidden', !open);
      $('socialBtn').classList.toggle('on', open);
      if (open) this.renderFriends();
    };
    $('socialBtn').addEventListener('click', () => setSocial($('socialPanel').classList.contains('hidden')));
    canvas.addEventListener('pointerdown', () => setSocial(false));

    this.net = connect(cfg.world, { name: cfg.name, color: cfg.color }, {
      getSync: () => ({ collected: [...this.save.collected], lit: [...this.save.lit] }),
      onJoin: (id) => {
        this.ensurePeer(id);
        this.updatePeerCount();
      },
      onLeave: (id) => this.removePeer(id),
      onHello: (id, d) => this.helloPeer(id, d),
      onState: (id, s) => this.statePeer(id, s),
      onCollect: (id, shardId) => {
        this.world.removeShard(shardId);
        this.dirty = true;
      },
      onLight: (id, altarId) => {
        if (this.save.lit.has(altarId)) return;
        this.world.lightAltar(altarId);
        const p = this.peers.get(id);
        toast(`${p ? p.name : '一位旅人'} 點亮了一座祭壇！遠方升起一道光柱`);
        SFX.altar();
        this.dirty = true;
        this.updateHud();
      },
      onEmote: (id, d) => this.peerEmote(id, d),
      onSync: (d) => {
        for (const s of d.collected || []) if (!this.save.collected.has(s)) this.world.removeShard(s);
        for (const a of d.lit || []) if (!this.save.lit.has(a)) this.world.lightAltar(a);
        this.dirty = true;
        this.updateHud();
      },
    });
    if (!this.net) toast('多人連線無法使用，目前為單人模式');

    window.addEventListener('pagehide', () => this.persist());
    document.addEventListener('visibilitychange', () => document.hidden && this.persist());

    this.updateHud();
    this.updatePeerCount();
    if (!profile.tutorialSeen) {
      this.openTutorial();
      profile.tutorialSeen = true;
      saveProfile(profile);
    } else {
      toast(this.save.visited.size ? '歡迎回來，旅人' : '收集 3 片星光碎片，點亮島上的古老祭壇');
    }
  }

  persist() {
    saveWorld(this.cfg.world, this.save, this.player.lastSafe);
    this.dirty = false;
  }

  updateHud() {
    $('sShards').textContent = this.save.shards;
    $('sIslands').textContent = this.save.visited.size;
    $('sAltars').textContent = this.save.lit.size;
  }

  updatePeerCount() {
    const n = this.peers.size;
    $('peerCount').textContent = `${n + 1} 人`;
    $('netDot').classList.toggle('on', n > 0);
    $('peerBadge').textContent = n;
    $('peerBadge').classList.toggle('hidden', n === 0);
  }

  async invite() {
    const url = location.origin + location.pathname + '#' + encodeURIComponent(this.cfg.world);
    if (isTouch && navigator.share) {
      try {
        await navigator.share({ title: '雲海群島', text: '來雲海群島和我一起探險！', url });
        return;
      } catch {
        // cancelled: fall through to copying
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('邀請連結已複製，傳給朋友就能一起玩');
    } catch {
      window.prompt('複製這個連結傳給朋友：', url);
    }
  }

  renderFriends() {
    const box = $('friends');
    if ($('socialPanel').classList.contains('hidden')) return;
    box.innerHTML = '';
    if (!this.peers.size) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = '還沒有隊友，按「邀請朋友」分享連結';
      box.appendChild(e);
      return;
    }
    for (const p of this.peers.values()) {
      const b = document.createElement('button');
      b.type = 'button';
      const d = Math.round(p.pos.distanceTo(this.player.pos));
      const name = document.createElement('span');
      name.textContent = p.name;
      name.style.color = p.color;
      const dist = document.createElement('span');
      dist.textContent = `${d}m · 前往`;
      b.append(name, dist);
      b.addEventListener('click', () => {
        this.player.teleport(p.pos.clone().add(new THREE.Vector3(1.2, 0.6, 1.2)), true);
        flash();
        SFX.whoosh();
      });
      box.appendChild(b);
    }
  }

  // ----- peers -----

  ensurePeer(id) {
    let p = this.peers.get(id);
    if (p) return p;
    p = { id, name: '旅人', color: '#cccccc', pos: new THREE.Vector3(), target: new THREE.Vector3(), yaw: 0, tyaw: 0, state: 0, hasPos: false };
    p.shadow = makeShadow();
    scene.add(p.shadow);
    this.peers.set(id, p);
    this.dressPeer(p);
    return p;
  }

  dressPeer(p) {
    if (p.avatar) scene.remove(p.avatar);
    if (p.label) scene.remove(p.label);
    p.avatar = createAvatar(p.color);
    p.avatar.visible = p.hasPos;
    p.label = makeLabel(p.name, p.color);
    p.label.visible = p.hasPos;
    scene.add(p.avatar, p.label);
  }

  helloPeer(id, d) {
    const p = this.ensurePeer(id);
    const fresh = p.name === '旅人' && p.color === '#cccccc';
    p.name = String(d.name || '旅人').slice(0, 12);
    p.color = PLAYER_COLORS.includes(d.color) ? d.color : '#cccccc';
    this.dressPeer(p);
    if (fresh) {
      toast(`${p.name} 加入了旅程`);
      SFX.join();
    }
    this.updatePeerCount();
    this.renderFriends();
  }

  statePeer(id, s) {
    if (!Array.isArray(s) || s.length < 5) return;
    const p = this.ensurePeer(id);
    p.target.set(+s[0] || 0, +s[1] || 0, +s[2] || 0);
    p.tyaw = +s[3] || 0;
    p.state = s[4] | 0;
    if (!p.hasPos) {
      p.hasPos = true;
      p.pos.copy(p.target);
      p.avatar.visible = p.label.visible = true;
    }
  }

  removePeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    scene.remove(p.avatar, p.label, p.shadow);
    this.peers.delete(id);
    toast(`${p.name} 暫時離開了`);
    this.updatePeerCount();
    this.renderFriends();
  }

  updatePeers(dt) {
    const k = 1 - Math.exp(-dt * 12);
    for (const p of this.peers.values()) {
      if (!p.hasPos) continue;
      const before = p.pos.clone();
      if (p.pos.distanceToSquared(p.target) > 900) p.pos.copy(p.target);
      else p.pos.lerp(p.target, k);
      let d = p.tyaw - p.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.yaw += d * k;
      p.avatar.position.copy(p.pos);
      p.avatar.rotation.y = p.yaw;
      const speed = before.distanceTo(p.pos) / Math.max(dt, 1e-3);
      animateAvatar(p.avatar, p.state, dt, speed);
      p.label.position.set(p.pos.x, p.pos.y + 2.75, p.pos.z);
      placeShadow(p.shadow, this.world, p.pos);
    }
  }

  // ----- gameplay -----

  collect(id) {
    this.world.removeShard(id);
    this.save.shards++;
    this.save.total++;
    this.dirty = true;
    this.net && this.net.sendCollect(id);
    SFX.shard();
    this.updateHud();
    if (this.save.shards === ALTAR_COST && this.save.lit.size === 0) toast('碎片足夠了！找一座祭壇把它點亮');
  }

  interact(altar) {
    if (this.save.lit.has(altar.id)) {
      this.openAltar(altar);
      return;
    }
    if (this.save.shards < ALTAR_COST) {
      toast(`祭壇需要 ${ALTAR_COST} 片星光碎片，你目前有 ${this.save.shards} 片`);
      SFX.deny();
      return;
    }
    this.save.shards -= ALTAR_COST;
    this.world.lightAltar(altar.id);
    this.net && this.net.sendLight(altar.id);
    this.dirty = true;
    SFX.altar();
    this.save.lore.add(altar.lore);
    toast('祭壇甦醒了！光柱會為所有旅人指引方向');
    setTimeout(() => toast(LORE[altar.lore], 'lore'), 900);
    if (this.save.lit.size === 1) setTimeout(() => toast('點亮的祭壇之間可以互相傳送，再按一次互動試試'), 4500);
    this.updateHud();
  }

  // ----- modal panels -----

  openModal(...nodes) {
    $('modalBody').replaceChildren(...nodes);
    $('modal').classList.remove('hidden');
    input.setEnabled(false);
  }

  closeModal() {
    $('modal').classList.add('hidden');
    input.setEnabled(true);
  }

  get modalOpen() {
    return !$('modal').classList.contains('hidden');
  }

  openAltar(altar) {
    const isl = this.world.islandAt(altar.x, altar.z);
    if (!this.save.lore.has(altar.lore)) {
      this.save.lore.add(altar.lore);
      this.dirty = true;
    }
    const list = el('div', 'list');
    const others = this.world.altarList()
      .filter((a) => a.id !== altar.id)
      .map((a) => ({ ...a, d: Math.hypot(a.altar.x - this.player.pos.x, a.altar.z - this.player.pos.z) }))
      .sort((a, b) => a.d - b.d);
    if (!others.length) list.append(el('div', 'empty', '點亮更多祭壇後，就能在祭壇之間瞬間移動。和隊友點亮的祭壇也算數！'));
    for (const a of others) {
      const b = el('button');
      b.type = 'button';
      const dir = bearingName(a.altar.x - this.player.pos.x, a.altar.z - this.player.pos.z);
      b.append(el('span', '', a.name), el('span', '', `${dir} ${fmtDist(a.d)} · 前往`));
      b.addEventListener('click', () => this.travel(a.altar));
      list.append(b);
    }
    this.openModal(
      el('h2', '', isl ? isl.name : '祭壇'),
      el('p', 'sub', '甦醒的祭壇'),
      el('div', 'lore-quote', LORE[altar.lore]),
      el('h3', '', '祭壇之門'),
      list,
    );
  }

  travel(altar) {
    const x = altar.x, z = altar.z + 2.6;
    const y = this.world.groundAt(x, z, altar.y + 3) ?? altar.y;
    this.player.teleport(new THREE.Vector3(x, y + 0.1, z));
    this.closeModal();
    flash();
    SFX.whoosh();
  }

  openJournal() {
    const s = this.save;
    const guideBtn = el('button', 'ghost-btn', '操作說明');
    guideBtn.type = 'button';
    guideBtn.addEventListener('click', () => this.openTutorial());
    const stats = el('div', 'stat-grid');
    for (const [v, label] of [
      [s.shards, '持有碎片'],
      [s.total, '累計收集'],
      [s.visited.size, '發現島嶼'],
      [s.lit.size, '點亮祭壇'],
      [s.whales.size, '登上雲鯨'],
      [s.stars, '接住流星'],
    ]) {
      const b = el('div', 'stat');
      b.append(el('b', '', String(v)), el('span', '', label));
      stats.append(b);
    }
    const lore = el('ul', 'lore-list');
    LORE.forEach((line, i) => lore.append(s.lore.has(i) ? el('li', '', line) : el('li', 'unknown', '？？？')));
    this.openModal(
      el('h2', '', '旅人日誌'),
      el('p', 'sub', `世界「${this.cfg.world}」`),
      stats,
      el('h3', '', `祭壇低語 ${s.lore.size} / ${LORE.length}`),
      lore,
      el('p', 'hint', '在點亮的祭壇前互動，可以聆聽低語。高空中的雲鯨背上也藏著碎片，乘著牠腹下的氣流就能登上去。'),
      guideBtn,
    );
  }

  // first-run guide: how to move, and what there is to do
  openTutorial() {
    const rows = isTouch
      ? [
          [keyCap(null, '左半邊拖曳'), '移動，推到底就會奔跑'],
          [keyCap(null, '右半邊拖曳'), '轉動視角'],
          [keyCap('jump', '', true), '跳躍；在空中再按住，展開滑翔翼'],
          [keyCap('touch', '', true), '靠近祭壇時出現，點一下互動'],
          [keyCap('smile', '', true), '表情，以及給隊友的「這裡！」標記'],
          [keyCap('book', '', true), '旅人日誌'],
        ]
      : [
          [keyCap(null, '', false, ['W', 'A', 'S', 'D']), '移動，按住 Shift 奔跑'],
          [keyCap(null, '', false, ['空白鍵']), '跳躍；在空中再按住，展開滑翔翼'],
          [keyCap(null, '拖曳滑鼠'), '轉動視角，滾輪縮放'],
          [keyCap(null, '', false, ['E']), '和祭壇互動'],
          [keyCap(null, '', false, ['1', '–', '4']), '表情，以及給隊友的「這裡！」標記'],
          [keyCap(null, '', false, ['J']), '旅人日誌'],
        ];
    const guide = el('div', 'guide');
    for (const [key, text] of rows) {
      const r = el('div', 'guide-row');
      r.append(key, el('span', '', text));
      guide.append(r);
    }
    const goals = el('ul', 'goals');
    for (const [b, t] of [
      ['星光碎片', '散落在島上，碰到就會撿起來'],
      ['祭壇', '用 3 片碎片點亮，點亮的祭壇之間可以互相傳送'],
      ['上升氣流', '島嶼邊緣的閃爍光點，滑翔進去就能飛得更高'],
      ['雲鯨', '在高空巡游，乘著牠腹下的氣流就能登上牠的背'],
    ]) {
      const li = el('li');
      li.append(el('b', '', b), '：' + t);
      goals.append(li);
    }
    const go = el('button', 'start-btn go-btn', '開始探索');
    go.type = 'button';
    go.addEventListener('click', () => {
      this.closeModal();
      toast('收集 3 片星光碎片，點亮島上的古老祭壇');
    });
    this.openModal(el('h2', '', '旅程指引'), el('p', 'sub', '歡迎來到雲端之上的群島'), guide, el('h3', '', '在這片天空裡'), goals, go);
  }

  // ----- emotes & pings -----

  doEmote(i) {
    if (this.emoteCd > 0) return;
    this.emoteCd = 1;
    playEmote(this.avatar, i);
    const data = { e: i };
    if (i === EMOTE.PING) {
      const p = this.player.pos;
      data.p = [p.x, p.y, p.z].map((v) => Math.round(v * 10) / 10);
      this.addPing(p, this.cfg.color, '你的標記');
      SFX.join();
    }
    this.net && this.net.sendEmote(data);
  }

  peerEmote(id, d) {
    const p = this.peers.get(id);
    const e = d && d.e | 0;
    if (!p || !p.avatar || e < 0 || e >= EMOTES.length) return;
    playEmote(p.avatar, e);
    if (e === EMOTE.PING && Array.isArray(d.p) && d.p.length === 3) {
      this.addPing(new THREE.Vector3(+d.p[0] || 0, +d.p[1] || 0, +d.p[2] || 0), p.color, p.name);
      toast(`${p.name}：這裡！`);
      SFX.join();
    }
  }

  addPing(pos, color, name) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(PING_BEAM, mat);
    const ring = new THREE.Mesh(PING_RING, mat);
    g.add(beam, ring);
    g.position.copy(pos);
    scene.add(g);
    this.pings.push({ mesh: g, mat, pos: pos.clone(), color, name, ttl: 25 });
    while (this.pings.length > 6) scene.remove(this.pings.shift().mesh);
  }

  updatePings(dt) {
    for (const p of this.pings) {
      p.ttl -= dt;
      p.mat.opacity = 0.55 * Math.min(1, p.ttl / 3);
      p.mesh.children[1].scale.setScalar(1 + ((performance.now() / 1000) % 1.5) * 0.8);
    }
    this.pings = this.pings.filter((p) => {
      if (p.ttl > 0) return true;
      scene.remove(p.mesh);
      return false;
    });
  }

  // ----- compass -----

  updateCompass() {
    const c = this.cam;
    const pos = this.player.pos;
    const heading = Math.atan2(-Math.sin(c.yaw), -Math.cos(c.yaw));
    const half = Math.PI / 2;
    const marks = [];
    const add = (dx, dz, html, cls = '') => {
      let r = Math.atan2(dx, dz) - heading;
      r = Math.atan2(Math.sin(r), Math.cos(r));
      if (Math.abs(r) > half) return;
      marks.push(`<div class="cmark ${cls}" style="left:${(50 - (r / half) * 50).toFixed(2)}%">${html}</div>`);
    };
    add(0, -1, '北', 'dir n');
    add(1, 0, '東', 'dir');
    add(0, 1, '南', 'dir');
    add(-1, 0, '西', 'dir');
    const altars = this.world.altarList()
      .map((a) => ({ a, d: Math.hypot(a.altar.x - pos.x, a.altar.z - pos.z) }))
      .sort((x, y) => x.d - y.d)
      .slice(0, 6);
    for (const { a, d } of altars) {
      if (d > 6) add(a.altar.x - pos.x, a.altar.z - pos.z, `<span style="color:#ffd98a">${ICON.altar}</span><small>${fmtDist(d)}</small>`);
    }
    const home = this.world.spawnPoint();
    const hd = Math.hypot(home.x - pos.x, home.z - pos.z);
    if (hd > 60) add(home.x - pos.x, home.z - pos.z, `${ICON.home}<small>${fmtDist(hd)}</small>`);
    for (const s of this.stars.landed) add(s.pos.x - pos.x, s.pos.z - pos.z, `<span style="color:#9fd0ff">${ICON.sparkle}</span><small>${fmtDist(Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z))}</small>`);
    for (const p of this.pings) add(p.pos.x - pos.x, p.pos.z - pos.z, `<span style="color:${p.color}">${ICON.ping}</span><small>${fmtDist(Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z))}</small>`);
    for (const p of this.peers.values()) {
      if (!p.hasPos) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      add(p.pos.x - pos.x, p.pos.z - pos.z, `<span class="dot" style="color:${p.color};background:${p.color}"></span><small>${escapeHtml(p.name)} ${fmtDist(d)}</small>`);
    }
    $('compassStrip').innerHTML = marks.join('');
  }

  updatePrompt(altar) {
    const el = $('prompt');
    const key = isTouch ? '點互動鈕' : '按 E ';
    let text = '';
    if (altar) {
      if (this.save.lit.has(altar.id)) text = `${key}聆聽祭壇的低語`;
      else if (this.save.shards >= ALTAR_COST) text = `${key}點亮祭壇（消耗 ${ALTAR_COST} 片碎片）`;
      else text = `沉睡的祭壇 · 需要 ${ALTAR_COST} 片碎片（你有 ${this.save.shards} 片）`;
    }
    if (text !== this._prompt) {
      this._prompt = text;
      el.textContent = text;
      el.classList.toggle('hidden', !text);
      $('btnInteract').classList.toggle('show', !!altar);
    }
  }

  updateCamera(dt, hs) {
    const c = this.cam;
    c.yaw -= input.lookX * 0.0055;
    c.pitch = clamp(c.pitch + input.lookY * 0.0045, -0.4, 1.25);
    c.dist = clamp(c.dist + input.zoom * 0.9, 3.5, 18);

    const goal = _v.copy(this.player.pos).add(_up);
    c.target.lerp(goal, 1 - Math.exp(-dt * 10));
    const cp = Math.cos(c.pitch);
    const dir = _v2.set(Math.sin(c.yaw) * cp, Math.sin(c.pitch), Math.cos(c.yaw) * cp);
    // pull the camera in front of trees, stones and hills between it and the player
    let dist = c.dist;
    const terrain = this.world.terrainNear(c.target.x, c.target.z);
    if (terrain) {
      _ray.set(c.target, dir);
      _ray.far = c.dist;
      const hit = _ray.intersectObject(terrain, false)[0];
      if (hit) dist = Math.max(1.2, hit.distance - 0.4);
    }
    c.curDist = dist < (c.curDist ?? dist) ? dist : (c.curDist ?? dist) + (dist - (c.curDist ?? dist)) * (1 - Math.exp(-dt * 4));
    const pos = dir.multiplyScalar(c.curDist).add(c.target);
    const g = this.world.groundAt(pos.x, pos.z, pos.y + 2);
    if (g !== null && pos.y < g + 0.7 && pos.y > g - 8) pos.y = g + 0.7;
    camera.position.copy(pos);
    camera.lookAt(c.target);

    const fov = 62 + (this.player.gliding ? clamp((hs - 8) * 1.1, 0, 12) : 0);
    c.fov += (fov - c.fov) * (1 - Math.exp(-dt * 3));
    if (Math.abs(camera.fov - c.fov) > 0.01) {
      camera.fov = c.fov;
      camera.updateProjectionMatrix();
    }
  }

  update(dt) {
    const pl = this.player;
    let hs = 0;
    // two physics substeps keep slow devices from tunnelling through islands
    const steps = dt > 1 / 45 ? 2 : 1;
    for (let i = 0; i < steps; i++) {
      hs = pl.update(dt / steps, input, this.cam.yaw, this.world);
      if (i === 0) input.jumpPressed = false;
    }
    this.world.update(dt, pl.pos, pixelRatio);
    this.world.setNight(sky.night);
    placeShadow(this.shadow, this.world, pl.pos);

    for (const id of this.world.shardsNear(pl.pos, 1.9)) this.collect(id);

    if (pl.grounded && pl.island && pl.island !== this.currentIsland) {
      this.currentIsland = pl.island;
      if (!this.save.visited.has(pl.island.key)) {
        this.save.visited.add(pl.island.key);
        this.dirty = true;
        this.updateHud();
        showIslandName(pl.island.name, '— 新的發現 —');
      } else {
        showIslandName(pl.island.name);
      }
    }

    if (pl.platform && pl.platform !== this.currentWhale) {
      const w = pl.platform;
      const first = !this.save.whales.has(w.key);
      showIslandName(w.name, first ? '— 你登上了雲鯨的背 —' : '');
      if (first) {
        this.save.whales.add(w.key);
        this.dirty = true;
        SFX.altar();
        toast('雲鯨會載著你在天空中慢慢旅行');
      }
    }
    if (pl.platform) this.currentWhale = pl.platform;
    else if (pl.grounded) this.currentWhale = null;

    const landed = this.stars.update(dt, pl.pos, sky.night);
    if (landed) {
      toast('一顆流星墜落在附近的島上！跟著指南針上的藍色星光去找它');
      SFX.whoosh();
    }
    const caught = this.stars.catchNear(pl.pos);
    if (caught) {
      this.save.shards += caught * 2;
      this.save.total += caught * 2;
      this.save.stars += caught;
      this.dirty = true;
      SFX.altar();
      toast('你接住了流星！獲得 2 片星光碎片');
      this.updateHud();
    }

    const altar = this.modalOpen ? null : this.world.altarNear(pl.pos);
    this.updatePrompt(altar);
    if (input.interactPressed && altar) this.interact(altar);
    if (input.escape && this.modalOpen) this.closeModal();
    if (input.journal) this.modalOpen ? this.closeModal() : this.openJournal();
    if (input.emote >= 0) this.doEmote(input.emote);
    this.emoteCd -= dt;
    this.updatePings(dt);
    this.compassTimer += dt;
    if (this.compassTimer > 1 / 20) {
      this.compassTimer = 0;
      this.updateCompass();
    }

    this.updatePeers(dt);

    this.sendTimer += dt;
    if (this.net && this.peers.size && this.sendTimer > 1 / 12) {
      this.sendTimer = 0;
      const r = (v) => Math.round(v * 100) / 100;
      this.net.sendState([r(pl.pos.x), r(pl.pos.y), r(pl.pos.z), r(pl.yaw), pl.state]);
    }
    this.saveTimer += dt;
    if (this.saveTimer > 5) {
      this.saveTimer = 0;
      this.persist();
    }
    this.listTimer += dt;
    if (this.listTimer > 1) {
      this.listTimer = 0;
      this.renderFriends();
    }

    this.updateCamera(dt, hs);
  }
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1.5, 0);
const _ray = new THREE.Raycaster();
const ICON = Object.fromEntries(['altar', 'home', 'sparkle', 'ping'].map((n) => [n, iconSvg(n)]));
const PING_BEAM = new THREE.CylinderGeometry(0.3, 0.3, 80, 8, 1, true).translate(0, 40, 0);
const PING_RING = new THREE.RingGeometry(0.8, 1.1, 24).rotateX(-Math.PI / 2).translate(0, 0.1, 0);

function el(tag, cls = '', text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

const BEARINGS = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
// north is -z, east is +x
function bearingName(dx, dz) {
  const a = Math.atan2(dx, -dz);
  return BEARINGS[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}

// a key or button picture for the guide: an icon, a label, or a row of keycaps
function keyCap(icon, label = '', round = false, keys = null) {
  const k = el('span', 'guide-key' + (round ? ' round' : ''));
  if (icon) k.innerHTML = iconSvg(icon);
  if (keys) for (const key of keys) key === '–' ? k.append('–') : k.append(el('kbd', '', key));
  if (label) k.append(label);
  return k;
}

function fmtDist(d) {
  return d >= 1000 ? (d / 1000).toFixed(1) + 'km' : Math.round(d) + 'm';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------- loop ----------

let game = null;
const clock = new THREE.Clock();
const titleFocus = new THREE.Vector3();
let titleT = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  // phone held upright: the rotate overlay is showing, so pause instead of rendering
  if (isTouch && portrait.matches) {
    input.endFrame();
    return;
  }
  input.poll();
  if (game) {
    game.update(dt);
    sky.update(dt, camera, game.player.pos, pixelRatio);
  } else {
    // slow drift above the cloud sea behind the title card
    titleT += dt * 0.03;
    camera.position.set(Math.sin(titleT) * 60, 70, Math.cos(titleT) * 60);
    camera.lookAt(Math.sin(titleT + 1.2) * 300, 40, Math.cos(titleT + 1.2) * 300);
    titleFocus.copy(camera.position);
    sky.update(dt, camera, titleFocus, pixelRatio);
  }
  renderer.render(scene, camera);
  input.endFrame();
}
frame();
