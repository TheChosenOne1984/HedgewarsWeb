import { describe, expect, it } from 'vitest';
import { ipcFrame, type EngineHost } from '../src/lib/engine/host';
import { GameSession } from '../src/lib/game/session';
import type { NetClient } from '../src/lib/net/client';

/** an engine message as the engine sends it: <len><type + text><GameTicks u16> */
function engineMessage(text: string): Uint8Array {
  const body = new TextEncoder().encode(text);
  const msg = new Uint8Array(body.length + 2);
  msg.set(body);
  return ipcFrame(msg);
}

function setup() {
  const host = {
    onMessage: (() => {}) as (bytes: Uint8Array) => void,
    onExit: (() => {}) as (code: number) => void,
    push: () => {},
  };
  const sent: unknown[] = [];
  const net = {
    nick: 'me',
    on: () => () => {},
    sendEngineMessages: (b: Uint8Array) => sent.push(['EM', b.length]),
    roundFinished: (ok: boolean) => sent.push(['ROUNDFINISHED', ok]),
    chat: () => {},
    send: () => {},
  };
  const ended: unknown[] = [];
  new GameSession(
    host as unknown as EngineHost,
    { status: () => {}, stats: () => {}, ended: (...a) => ended.push(a) },
    net as unknown as NetClient,
  );
  return { host, sent, ended };
}

describe('GameSession', () => {
  it('reports the engine error of a desync and ends the round as unfinished', () => {
    const { host, sent, ended } = setup();
    host.onMessage(engineMessage('EDesync detected'));
    host.onExit(52);
    expect(ended).toEqual([[52, false, 'Desync detected']]);
    expect(sent).toContainEqual(['ROUNDFINISHED', false]);
  });

  it('ends a finished game without an error', () => {
    const { host, sent, ended } = setup();
    host.onMessage(engineMessage('q'));
    host.onExit(0);
    expect(ended).toEqual([[0, true, undefined]]);
    expect(sent).toContainEqual(['ROUNDFINISHED', true]);
  });

  it('relays game commands to the server', async () => {
    const { host, sent } = setup();
    host.onMessage(engineMessage('+'));
    await Promise.resolve();
    expect(sent).toContainEqual(['EM', 4]);
  });
});
