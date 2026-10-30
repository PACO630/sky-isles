// Progress lives in each player's browser. When friends meet in a room their
// collected shards and lit altars are merged, so a world remembers everyone's work.

const PROFILE_KEY = 'skyisles:profile';
const worldKey = (code) => 'skyisles:world:' + code;

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode or storage full: the game still runs, it just won't remember
  }
}

export function loadProfile() {
  return read(PROFILE_KEY) || {};
}

export function saveProfile(p) {
  write(PROFILE_KEY, p);
}

export function loadWorld(code) {
  const s = read(worldKey(code)) || {};
  return {
    shards: s.shards || 0,
    collected: new Set(s.collected || []),
    lit: new Set(s.lit || []),
    visited: new Set(s.visited || []),
    lore: new Set(s.lore || []),
    whales: new Set(s.whales || []),
    total: s.total || 0,
    stars: s.stars || 0,
    pos: s.pos || null,
  };
}

export function saveWorld(code, s, pos) {
  write(worldKey(code), {
    shards: s.shards,
    collected: [...s.collected],
    lit: [...s.lit],
    visited: [...s.visited],
    lore: [...s.lore],
    whales: [...s.whales],
    total: s.total,
    stars: s.stars,
    pos: pos ? [pos.x, pos.y, pos.z].map((v) => Math.round(v * 10) / 10) : null,
  });
}
