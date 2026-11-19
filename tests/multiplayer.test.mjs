import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import server from '../api/ws.js';

function client(url) {
  const socket = new WebSocket(url), inbox = [];
  socket.on('message', data => {
    try { inbox.push(JSON.parse(data.toString())); } catch {}
  });
  const send = message => socket.send(JSON.stringify(message));
  const next = async (type, timeout = 3000) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const i = inbox.findIndex(message => message.type === type);
      if (i !== -1) return inbox.splice(i, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Timeout waiting for ' + type);
  };
  return {socket, send, next};
}

test('two players can create/join a room, chat, sync combat and trade', async () => {
  // The test runs in single-instance development mode, without REDIS_URL.
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'ws://127.0.0.1:' + server.address().port + '/api/ws';
  const host = client(url), guest = client(url), stranger = client(url);
  try {
    await Promise.all([once(host.socket, 'open'), once(guest.socket, 'open'), once(stranger.socket, 'open')]);
    host.send({type:'create',name:'Host',hero:'wizard',private:false});
    const welcome = await host.next('welcome');
    assert.equal(welcome.role,'host');
    assert.match(welcome.code,/^[A-F0-9]{6}$/);

    guest.send({type:'join',name:'Guest',hero:'thief',code:welcome.code});
    const join = await guest.next('welcome');
    assert.equal(join.room.players,2);

    host.send({type:'chat',text:'hello'});
    assert.equal((await guest.next('chat')).text,'hello');

    host.send({type:'scene',scene:{area:'cave',floor:1,seed:13579}});
    assert.equal((await guest.next('scene')).scene.seed,13579);

    host.send({type:'snapshot',snapshot:{enemies:[{id:10,x:10,y:10,hp:99}],drops:[]}});
    assert.equal((await guest.next('snapshot')).snapshot.enemies[0].hp,99);

    guest.send({type:'position',player:{x:12,y:13,hp:30,maxHp:30,classId:'thief'}});
    assert.equal((await host.next('position')).player.x,12);

    guest.send({type:'hit',id:10,damage:12,kind:'slash'});
    assert.equal((await host.next('hit')).damage,12);

    host.send({type:'kill',xp:30});
    assert.equal((await guest.next('kill')).xp,30);

    host.send({type:'trade_offer',item:{mpTradeId:'x1',name:'Sword',slot:'weapon'}});
    const offer = await guest.next('trade_offer');
    guest.send({type:'trade_accept',id:offer.id});
    assert.equal((await host.next('trade_commit')).id,offer.id);

    stranger.send({type:'join',name:'Stranger',hero:'wizard',code:welcome.code});
    assert.match((await stranger.next('error')).message,/full/i);
  } finally {
    for (const peer of [host,guest,stranger]) peer.socket.terminate();
    await new Promise(resolve=>server.close(resolve));
  }
});
