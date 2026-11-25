// A game in the web engine: local, or a network game relayed through the
// server. Port of the engine message handling of frontend-qt6/game.cpp
// (HWGame::ParseMessage, FromNet, FromNetChat, flushNetBuffer).

import { defaultAmmo, defaultScheme, MAPGEN, type GameSetup, type Scheme } from '../engine/config';
import { gameConfig } from '../engine/config';
import { EngineHost, ipcFrame, ipcRawFrame, ipcSplit } from '../engine/host';
import { md5Hex } from '../engine/md5';
import { t } from '../i18n.svelte';
import type { PreviewParams } from '../engine/preview';
import type { NetClient, Room } from '../net/client';

/** map names that stand for a generated map */
const GENERATED_MAPS = new Set(['+rnd+', '+maze+', '+perlin+', '+drawn+', '+forts+', '+wfc+']);

/** engine messages the frontend handles itself; all others are game commands */
const LOCAL_MESSAGES = new Set('?CEiQqmHsbVvW~');

/** qUncompress: 4-byte big-endian size, then a zlib stream */
export async function qUncompress(data: Uint8Array): Promise<Uint8Array> {
  if (data.length < 4) return new Uint8Array();
  const stream = new Blob([data.subarray(4)])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function cfg(room: Room, key: string): string[] {
  return room.config.get(key) ?? [];
}

function num(room: Room, key: string, fallback: number): number {
  const v = Number(cfg(room, key)[0]);
  return Number.isFinite(v) ? v : fallback;
}

/** the network scheme: name + 44 values, the last one sent with a '!' prefix */
export function schemeFromRoom(values: string[]): Scheme {
  if (values.length < 2) return defaultScheme(values[0]);
  const scheme: Scheme = [...values];
  const last = scheme.length - 1;
  scheme[last] = String(scheme[last]).replace(/^!/, '');
  return scheme;
}

/** The engine config of a network game (HWGame::SendNetConfig). */
export async function roomToGameSetup(room: Room, nick: string): Promise<GameSetup> {
  const mapName = cfg(room, 'MAP')[0] ?? '+rnd+';
  const ammo = cfg(room, 'AMMO');
  const drawn = cfg(room, 'DRAWNMAP')[0];
  return {
    type: 'net',
    scheme: schemeFromRoom(cfg(room, 'SCHEME')),
    ammo: ammo[1] ?? defaultAmmo(ammo[0]),
    script: cfg(room, 'SCRIPT')[0] ?? 'Normal',
    map: {
      name: mapName,
      isStaticMap: !GENERATED_MAPS.has(mapName),
      generator: num(room, 'MAPGEN', MAPGEN.regular),
      templateFilter: num(room, 'TEMPLATE', 0),
      featureSize: num(room, 'FEATURE_SIZE', 12),
      mazeSize: num(room, 'MAZE_SIZE', 0),
      seed: cfg(room, 'SEED')[0] ?? '',
      theme: cfg(room, 'THEME')[0] ?? 'Nature',
      drawnMap: drawn
        ? await qUncompress(Uint8Array.from(atob(drawn), (c) => c.charCodeAt(0)))
        : undefined,
    },
    teams: room.teams.map((t) => ({
      name: t.name,
      colorIndex: t.colorIndex,
      difficulty: t.difficulty,
      grave: t.grave,
      fort: t.fort,
      voicepack: t.voicepack,
      flag: t.flag,
      owner: t.owner,
      hedgehogs: t.hedgehogs,
      hedgehogsNumber: t.hedgehogsNumber,
      isNetTeam: t.owner !== nick,
    })),
    playerHash: md5Hex(nick),
  };
}

/** the map preview parameters of a room (what HWMap gets from the room's config) */
export async function previewParamsFromRoom(room: Room): Promise<PreviewParams> {
  const mapName = cfg(room, 'MAP')[0] ?? '+rnd+';
  const scheme = cfg(room, 'SCHEME');
  const drawn = cfg(room, 'DRAWNMAP')[0];
  const isStatic = !GENERATED_MAPS.has(mapName);
  return {
    mapgen: isStatic ? MAPGEN.map : num(room, 'MAPGEN', MAPGEN.regular),
    seed: cfg(room, 'SEED')[0] ?? '',
    templateFilter: num(room, 'TEMPLATE', 0),
    featureSize: num(room, 'FEATURE_SIZE', 12),
    mazeSize: num(room, 'MAZE_SIZE', 0),
    script: cfg(room, 'SCRIPT')[0] ?? 'Normal',
    scriptParam: String(scheme[scheme.length - 1] ?? '').replace(/^!/, ''),
    staticMap: isStatic ? mapName : '',
    drawnMap: drawn
      ? await qUncompress(Uint8Array.from(atob(drawn), (c) => c.charCodeAt(0)))
      : undefined,
  };
}

export interface SessionEvents {
  status: (text: string) => void;
  /**
   * the engine has ended; finished: the game reached its end ('q');
   * error: the engine's last fatal error message ('E'), if any
   */
  ended: (code: number, finished: boolean, error?: string) => void;
  stats: (kind: string, text: string) => void;
}

export class GameSession {
  private netBuffer: Uint8Array[] = [];
  private flushQueued = false;
  private finished = false;
  private error: string | undefined;
  private unsubscribe: (() => void)[] = [];

  constructor(
    private host: EngineHost,
    private events: SessionEvents,
    private net: NetClient | null = null,
  ) {
    host.onMessage = (bytes) => this.fromEngine(bytes);
    host.onExit = (code) => this.engineExited(code);
    if (net) {
      this.unsubscribe.push(
        net.on('engineMessages', (msgs) => {
          for (const m of msgs) {
            for (const inner of ipcSplit(m)[0])
              if (inner[0] === 0x4d)
                this.debug(`land digest (net): ${new TextDecoder().decode(inner.subarray(1))}`);
            this.host.push(m);
          }
        }),
        // FromNet("\x01o"): the round is over for everyone
        net.on('roundFinished', () => this.host.push(ipcFrame('o'))),
        // HWGame::FromNetChat: shown in the game's chat
        net.on('chat', (line) => {
          if (line.kind === 'chat' && line.nick !== net.nick)
            this.host.push(ipcFrame(`s\x01${line.nick}: ${line.text}  `));
        }),
      );
    }
  }

  private debug(text: string) {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug'))
      console.log(text);
  }

  /** packs for a game setup */
  packs(setup: GameSetup, locale = 'en'): string[] {
    const cjk = setup.teams.some((t) => /[ᄀ-ᇿ⺀-鿿가-힯＀-￯]/.test(t.name));
    return this.host.packsFor({
      theme: setup.map.theme,
      map: setup.map.isStaticMap ? setup.map.name : undefined,
      voices: setup.teams.map((t) => t.voicepack),
      forts: setup.map.generator === MAPGEN.forts,
      locale,
      cjk,
    });
  }

  async run(setup: GameSetup, extraArgs: string[] = [], locale = 'en'): Promise<void> {
    this.events.status(t('loading data'));
    await this.host.loadPacks(this.packs(setup, locale), (done, total) =>
      this.events.status(t('loading data {n}%', { n: Math.round((100 * done) / total) })),
    );
    this.events.status('running');
    await this.host.start(gameConfig(setup), extraArgs);
  }

  private fromEngine(bytes: Uint8Array) {
    for (const msg of ipcSplit(bytes)[0]) {
      const type = String.fromCharCode(msg[0] ?? 0);
      const text = () => new TextDecoder().decode(msg.subarray(1, msg.length - 2));
      if (!LOCAL_MESSAGES.has(type)) {
        if (type === 'M') this.debug(`land digest (own): ${text()}`);
        if (this.net) this.netBuffer.push(ipcRawFrame(msg));
        continue;
      }
      switch (type) {
        case 's':
          this.net?.chat(text());
          break;
        case 'b':
          this.net?.send({ type: 'TeamChat', args: [text()] });
          break;
        case 'q':
          this.finished = true;
          break;
        case 'E':
          this.error = text();
          this.events.status(t('engine error: {text}', { text: this.error }));
          break;
        case 'i':
          this.events.stats(
            String.fromCharCode(msg[1] ?? 0),
            new TextDecoder().decode(msg.subarray(2)),
          );
          break;
      }
    }
    // flushNetBuffer: one EM per batch of engine output
    if (this.net && this.netBuffer.length > 0 && !this.flushQueued) {
      this.flushQueued = true;
      queueMicrotask(() => this.flush());
    }
  }

  private flush() {
    this.flushQueued = false;
    const total = this.netBuffer.reduce((n, b) => n + b.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const b of this.netBuffer) {
      out.set(b, pos);
      pos += b.length;
    }
    this.netBuffer = [];
    this.net?.sendEngineMessages(out);
  }

  private engineExited(code: number) {
    if (this.netBuffer.length > 0) this.flush();
    for (const u of this.unsubscribe) u();
    this.net?.roundFinished(this.finished);
    this.events.ended(code, this.finished, this.error);
  }
}
