import { joinRoom, selfId } from 'trystero';

// Serverless P2P: peers find each other through public Nostr relays, then talk over WebRTC.
// Every world code is its own room, so friends who open the same link share one world.
const APP_ID = 'sky-isles-cloudsea-v1';

export { selfId };

export function connect(worldCode, me, h) {
  let room;
  try {
    room = joinRoom({ appId: APP_ID }, worldCode);
  } catch (err) {
    console.warn('multiplayer unavailable', err);
    return null;
  }
  const hello = room.makeAction('hi');
  const state = room.makeAction('st');
  const collect = room.makeAction('col');
  const light = room.makeAction('lit');
  const sync = room.makeAction('sync');
  const emote = room.makeAction('emo');
  const quiet = (p) => p && p.catch && p.catch(() => {});

  room.onPeerJoin = (peerId) => {
    quiet(hello.send(me, { target: peerId }));
    quiet(sync.send(h.getSync(), { target: peerId }));
    h.onJoin(peerId);
  };
  room.onPeerLeave = (peerId) => h.onLeave(peerId);
  hello.onMessage = (data, { peerId }) => h.onHello(peerId, data);
  state.onMessage = (data, { peerId }) => h.onState(peerId, data);
  collect.onMessage = (id, { peerId }) => h.onCollect(peerId, id);
  light.onMessage = (id, { peerId }) => h.onLight(peerId, id);
  sync.onMessage = (data) => h.onSync(data);
  emote.onMessage = (data, { peerId }) => h.onEmote(peerId, data);

  return {
    sendState: (arr) => quiet(state.send(arr)),
    sendCollect: (id) => quiet(collect.send(id)),
    sendLight: (id) => quiet(light.send(id)),
    sendHello: (data) => quiet(hello.send(data)),
    sendEmote: (data) => quiet(emote.send(data)),
    leave: () => room.leave(),
  };
}
