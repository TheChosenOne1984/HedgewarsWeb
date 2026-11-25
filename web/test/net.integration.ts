// NetClient against the real game server over WebSocket.
// Needs HW_SERVER_BIN: a hedgewars-server built with --features ws-connections.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NetClient, type ChatLine } from '../src/lib/net/client';
import type { TeamInfo } from '../src/lib/protocol/messages';

const serverBin = process.env.HW_SERVER_BIN;

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

async function until(cond: () => boolean, what: string, ms = 5000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

const team = (name: string): TeamInfo => ({
  owner: '',
  name,
  color: 0,
  grave: 'Statue',
  fort: 'Plane',
  voicePack: 'Default',
  flag: 'hedgewars',
  difficulty: 0,
  hedgehogs: Array.from({ length: 8 }, (_, i) => ({ name: `${name} ${i + 1}`, hat: 'NoHat' })),
});

describe.skipIf(!serverBin)('NetClient with the game server', () => {
  let server: ChildProcess;
  let wsUrl = '';

  beforeAll(async () => {
    const port = await freePort();
    const wsPort = await freePort();
    server = spawn(serverBin!, ['--port', String(port), '--ws-port', String(wsPort)], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    wsUrl = `ws://127.0.0.1:${wsPort}`;
    await new Promise<void>((resolve) => {
      server.stderr!.on('data', (d: Buffer) => {
        if (d.toString().includes('WebSocket')) resolve();
      });
      setTimeout(resolve, 2000);
    });
  });

  afterAll(() => {
    server?.kill();
  });

  it('logs in, shares a room, a team and chat', async () => {
    const alice = new NetClient();
    const bob = new NetClient();
    const bobChat: ChatLine[] = [];
    bob.on('chat', (l) => bobChat.push(l));

    alice.connect(wsUrl, 'alice');
    bob.connect(wsUrl, 'bob');
    await until(() => alice.state === 'lobby' && bob.state === 'lobby', 'lobby');
    expect(alice.nick).toBe('alice');
    await until(() => alice.players.has('bob'), 'bob in alice lobby');

    alice.createRoom('webroom');
    await until(() => alice.state === 'room' && alice.room?.isMaster === true, 'alice room');
    await until(() => bob.rooms.some((r) => r.name === 'webroom'), 'room in list');

    bob.joinRoom('webroom');
    await until(() => bob.state === 'room', 'bob room');
    await until(() => alice.room!.players.includes('bob'), 'bob joined');

    alice.addOwnTeam(team('Alpha'));
    await until(() => bob.room!.teams.some((t) => t.name === 'Alpha'), 'team at bob');
    const alpha = bob.room!.teams.find((t) => t.name === 'Alpha')!;
    expect(alpha.owner).toBe('alice');
    expect(alpha.hedgehogs[0]).toEqual({ name: 'Alpha 1', hat: 'NoHat' });
    // the server assigns colour and hedgehog number; both clients agree
    await until(() => alice.room!.teams[0]!.colorIndex === alpha.colorIndex, 'colour');
    expect(alice.room!.teams[0]!.hedgehogsNumber).toBe(alpha.hedgehogsNumber);

    // the room config the server sends on join
    expect(bob.room!.config.has('SEED')).toBe(true);
    expect(bob.room!.config.has('SCHEME')).toBe(true);

    // the master's config is the same on both sides (the server does not echo it)
    alice.setConfig({ type: 'Seed', args: ['{shared-seed}'] });
    alice.setConfig({ type: 'Theme', args: ['Bamboo'] });
    await until(() => bob.room!.config.get('SEED')?.[0] === '{shared-seed}', 'seed at bob');
    await until(() => bob.room!.config.get('THEME')?.[0] === 'Bamboo', 'theme at bob');
    expect(alice.room!.config.get('SEED')).toEqual(['{shared-seed}']);
    expect(alice.room!.config.get('THEME')).toEqual(['Bamboo']);

    alice.chat('hello bob');
    await until(() => bobChat.some((l) => l.nick === 'alice' && l.text === 'hello bob'), 'chat');

    alice.disconnect();
    bob.disconnect();
  });
});
