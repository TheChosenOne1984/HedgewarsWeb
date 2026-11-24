// Engine game config: port of HWGame::commonConfig, GameCFGWidget::getFullConfig
// and HWTeam::teamGameConfig (frontend-qt6).
//
// In a network game every client must send its engine exactly the same config
// (except "erdriven" for teams of other players), otherwise the games desync.
// Keep this a 1:1 port; test/config.test.ts pins the output.

import { md5Hex } from './md5';
import {
  DEFAULT_AMMO_SETS,
  DEFAULT_SCHEMES,
  TEAM_COLORS,
  type SchemeValue,
} from './frontend-data.generated';

export const MAPGEN = {
  regular: 0,
  maze: 1,
  perlin: 2,
  drawn: 3,
  forts: 4,
  wfc: 5,
  map: 6,
} as const;

/** a game scheme as the frontend sends it: name + 44 fields (SCHEME_FIELDS) */
export type Scheme = SchemeValue[];

export interface MapSetup {
  /** static or mission map name, or one of +rnd+, +maze+, +perlin+, +drawn+, +forts+, +wfc+ */
  name: string;
  /** whether `name` is a static or mission map (sent as "emap") */
  isStaticMap: boolean;
  generator: number;
  templateFilter: number;
  featureSize: number;
  mazeSize: number;
  seed: string;
  theme: string;
  /** decoded drawn map data (MAPGEN drawn) */
  drawnMap?: Uint8Array;
}

export interface HogSetup {
  name: string;
  hat: string;
}

export interface TeamSetup {
  name: string;
  /** index into TEAM_COLORS */
  colorIndex: number;
  /** bot level, 0 = human */
  difficulty: number;
  grave: string;
  fort: string;
  voicepack: string;
  flag: string;
  /** nick of the player owning the team (network games) */
  owner: string;
  hedgehogs: HogSetup[];
  hedgehogsNumber: number;
  /** a team of another player in a network game: driven by the network */
  isNetTeam: boolean;
}

export interface GameSetup {
  type: 'local' | 'net';
  scheme: Scheme;
  /** weapon set: 4 x ammo count characters */
  ammo: string;
  /** game style ("Normal" = no script) */
  script: string;
  map: MapSetup;
  teams: TeamSetup[];
  /** md5 of the local player's nick; used for local teams */
  playerHash: string;
}

const flagBits: [number, number][] = [
  [1, 0x00001000], // switch hog
  [2, 0x00000010], // divide teams
  [3, 0x00000004], // solid land
  [4, 0x00000008], // border
  [5, 0x00000020], // low gravity
  [6, 0x00000040], // laser sight
  [7, 0x00000080], // invulnerable
  [8, 0x00000100], // reset health
  [9, 0x00000200], // vampirism
  [10, 0x00000400], // karma
  [11, 0x00000800], // artillery
  [12, 0x00002000], // random order
  [13, 0x00004000], // king
  [14, 0x00008000], // place hogs
  [15, 0x00010000], // shared ammo
  [16, 0x00020000], // disable girders
  [17, 0x00040000], // disable land objects
  [18, 0x00080000], // AI survival
  [19, 0x00100000], // infinite attacks
  [20, 0x00200000], // reset weapons
  [21, 0x00400000], // per hog ammo
  [22, 0x00800000], // no wind
  [23, 0x01000000], // more wind
  [24, 0x02000000], // tag team
  [25, 0x04000000], // bottom border
];

/** QVariant::toBool on scheme data (bools, or "true"/"false" strings from the network) */
function toBool(v: SchemeValue | undefined): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v !== '' && v !== '0' && v.toLowerCase() !== 'false';
  return false;
}

/** QVariant::toInt on scheme data (0 if not a number) */
function toInt(v: SchemeValue | undefined): number {
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && /^\s*[-+]?\d+\s*$/.test(v)) return parseInt(v, 10);
  return 0;
}

export function gameFlags(scheme: Scheme): number {
  let result = 0;
  for (const [index, bit] of flagBits) if (toBool(scheme[index])) result |= bit;
  return result >>> 0;
}

export function initHealth(scheme: Scheme): number {
  return toInt(scheme[28]);
}

/** GameCFGWidget::getFullConfig: the game config lines (without the type) */
export function fullConfig(setup: GameSetup): Uint8Array[] {
  const s = setup.scheme;
  const map = setup.map;
  const text: string[] = [];
  if (setup.script !== 'Normal' && setup.script !== '')
    text.push(`escript Scripts/Multiplayer/${setup.script.replace(/ /g, '_')}.lua`);
  if (map.isStaticMap && map.name.length > 0) text.push(`emap ${map.name}`);
  text.push(
    `etheme ${map.theme}`,
    `eseed ${map.seed}`,
    `e$gmflags ${gameFlags(s)}`,
    `e$damagepct ${toInt(s[26])}`,
    `e$turntime ${toInt(s[27]) * 1000}`,
    `e$inithealth ${toInt(s[28])}`,
    `e$sd_turns ${toInt(s[29])}`,
    `e$casefreq ${toInt(s[30])}`,
    `e$minestime ${toInt(s[31]) * 1000}`,
    `e$minesnum ${toInt(s[32])}`,
    `e$minedudpct ${toInt(s[33])}`,
    `e$explosives ${toInt(s[34])}`,
    `e$airmines ${toInt(s[35])}`,
    `e$sentries ${toInt(s[36])}`,
    `e$healthprob ${toInt(s[37])}`,
    `e$hcaseamount ${toInt(s[38])}`,
    `e$waterrise ${toInt(s[39])}`,
    `e$healthdec ${toInt(s[40])}`,
    `e$ropepct ${toInt(s[41])}`,
    `e$getawaytime ${toInt(s[42])}`,
    `e$worldedge ${toInt(s[43])}`,
    `e$template_filter ${map.templateFilter}`,
    `e$feature_size ${map.featureSize}`,
    `e$mapgen ${map.generator}`,
    `e$scriptparam ${s[44] === null || s[44] === undefined ? '' : String(s[44])}`,
  );
  const lines = text.map((l) => utf8(l));
  if (map.generator === MAPGEN.maze || map.generator === MAPGEN.perlin) {
    lines.push(utf8(`e$maze_size ${map.mazeSize}`));
  } else if (map.generator === MAPGEN.drawn && map.drawnMap) {
    // "edraw " + up to 200 bytes of drawn map data per message
    for (let i = 0; i < map.drawnMap.length; i += 200) {
      const chunk = map.drawnMap.subarray(i, i + 200);
      const msg = new Uint8Array(6 + chunk.length);
      msg.set(utf8('edraw '));
      msg.set(chunk, 6);
      lines.push(msg);
    }
  }
  return lines;
}

/** HWTeam::teamGameConfig */
export function teamGameConfig(team: TeamSetup, health: number, playerHash: string): string[] {
  const color = (TEAM_COLORS[team.colorIndex] ?? TEAM_COLORS[0]!) & 0xffffff;
  const sl: string[] = [];
  if (team.isNetTeam) {
    sl.push(`eaddteam ${md5Hex(team.owner)} ${color} ${team.name}`, 'erdriven');
  } else {
    sl.push(`eaddteam ${playerHash} ${color} ${team.name}`);
  }
  sl.push(
    `egrave ${team.grave}`,
    `efort ${team.fort}`,
    `evoicepack ${team.voicepack}`,
    `eflag ${team.flag}`,
  );
  if (team.owner !== '') sl.push(`eowner ${team.owner}`);
  for (let i = 0; i < team.hedgehogsNumber; i++) {
    const hog = team.hedgehogs[i] ?? { name: `hog ${i + 1}`, hat: 'NoHat' };
    sl.push(`eaddhh ${team.difficulty} ${health} ${hog.name}`, `ehat ${hog.hat}`);
  }
  return sl;
}

/** HWGame::commonConfig: the complete config the frontend sends for "C" */
export function gameConfig(setup: GameSetup): Uint8Array {
  const messages: Uint8Array[] = [utf8(setup.type === 'net' ? 'TN' : 'TL'), ...fullConfig(setup)];
  const ammoNumber = setup.ammo.length / 4;
  const sharedAmmo = toBool(setup.scheme[15]);
  const perHogAmmo = toBool(setup.scheme[21]);
  for (const team of setup.teams) {
    messages.push(
      utf8(`eammloadt ${setup.ammo.substring(0, ammoNumber)}`),
      utf8(`eammprob ${setup.ammo.substring(ammoNumber, 2 * ammoNumber)}`),
      utf8(`eammdelay ${setup.ammo.substring(2 * ammoNumber, 3 * ammoNumber)}`),
      utf8(`eammreinf ${setup.ammo.substring(3 * ammoNumber, 4 * ammoNumber)}`),
    );
    if (sharedAmmo || !perHogAmmo) messages.push(utf8('eammstore'));
    for (const line of teamGameConfig(team, initHealth(setup.scheme), setup.playerHash))
      messages.push(utf8(line));
  }
  return frames(messages);
}

const encoder = new TextEncoder();

function utf8(s: string): Uint8Array {
  return encoder.encode(s);
}

/** HWProto::addByteArrayToBuffer: <len><payload>, payload cut to 250 bytes */
function frames(messages: Uint8Array[]): Uint8Array {
  const parts = messages.map((m) => m.subarray(0, 250));
  const out = new Uint8Array(parts.reduce((n, p) => n + 1 + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out[pos++] = p.length;
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** a predefined scheme by name (or the default scheme) */
export function defaultScheme(name = 'Default'): Scheme {
  return [...(DEFAULT_SCHEMES.find((s) => s[0] === name) ?? DEFAULT_SCHEMES[0]!)];
}

/** a predefined weapon set by name (or the default set) */
export function defaultAmmo(name = 'Default'): string {
  return (DEFAULT_AMMO_SETS.find((a) => a.name === name) ?? DEFAULT_AMMO_SETS[0]!).ammo;
}
