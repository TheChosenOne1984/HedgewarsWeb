// Engine config builder (port of frontend-qt6 commonConfig/getFullConfig/
// teamGameConfig). Expected values follow the Qt frontend's code.
import { describe, expect, it } from 'vitest';
import {
  defaultAmmo,
  defaultScheme,
  gameConfig,
  gameFlags,
  MAPGEN,
  type GameSetup,
  type TeamSetup,
} from '../src/lib/engine/config';
import { md5Hex } from '../src/lib/engine/md5';
import {
  DEFAULT_SCHEMES,
  SCHEME_FIELDS,
  TEAM_COLORS,
} from '../src/lib/engine/frontend-data.generated';

function decode(bytes: Uint8Array): string[] {
  const out: string[] = [];
  for (let pos = 0; pos < bytes.length; pos += 1 + bytes[pos]!) {
    out.push(new TextDecoder().decode(bytes.subarray(pos + 1, pos + 1 + bytes[pos]!)));
  }
  return out;
}

const hogs = (prefix: string) =>
  Array.from({ length: 8 }, (_, i) => ({
    name: `${prefix}${i + 1}`,
    hat: i === 0 ? 'Crown' : 'NoHat',
  }));

const team = (over: Partial<TeamSetup>): TeamSetup => ({
  name: 'Team',
  colorIndex: 0,
  difficulty: 0,
  grave: 'Statue',
  fort: 'Plane',
  voicepack: 'Default',
  flag: 'hedgewars',
  owner: '',
  hedgehogs: hogs('h'),
  hedgehogsNumber: 2,
  isNetTeam: false,
  ...over,
});

const baseSetup = (over: Partial<GameSetup> = {}): GameSetup => ({
  type: 'local',
  scheme: defaultScheme(),
  ammo: defaultAmmo(),
  script: 'Normal',
  map: {
    name: '+rnd+',
    isStaticMap: false,
    generator: MAPGEN.regular,
    templateFilter: 0,
    featureSize: 12,
    mazeSize: 0,
    seed: '{seed}',
    theme: 'Nature',
  },
  teams: [team({ name: 'Red' })],
  playerHash: md5Hex('alice'),
  ...over,
});

describe('md5', () => {
  it('matches RFC 1321 test vectors', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5Hex('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0');
    expect(md5Hex('1234567890'.repeat(8))).toBe('57edf4a22be3c955ac49da2e2107b67a');
  });
  it('hashes UTF-8', () => {
    expect(md5Hex('é')).toBe('66ddcd97cfdeabb2f6fb8a999b4bc76f');
    expect(md5Hex('Team Ü 🦔')).toBe('d41343da14ad3e76024b1c498ee0de16');
  });
});

describe('frontend data', () => {
  it('has 44 scheme fields plus the name and complete schemes', () => {
    expect(SCHEME_FIELDS.length).toBe(45);
    for (const s of DEFAULT_SCHEMES) expect(s.length).toBe(45);
    expect(TEAM_COLORS[0]).toBe(0xff0204);
    expect(TEAM_COLORS[1]).toBe(0x4980c1);
  });
});

describe('game config', () => {
  it('builds a local game like HWGame::commonConfig', () => {
    const lines = decode(gameConfig(baseSetup()));
    const ammo = defaultAmmo();
    const n = ammo.length / 4;
    expect(lines).toEqual([
      'TL',
      'etheme Nature',
      'eseed {seed}',
      'e$gmflags 8192',
      'e$damagepct 100',
      'e$turntime 45000',
      'e$inithealth 100',
      'e$sd_turns 15',
      'e$casefreq 5',
      'e$minestime 3000',
      'e$minesnum 4',
      'e$minedudpct 0',
      'e$explosives 2',
      'e$airmines 0',
      'e$sentries 0',
      'e$healthprob 35',
      'e$hcaseamount 25',
      'e$waterrise 47',
      'e$healthdec 5',
      'e$ropepct 100',
      'e$getawaytime 100',
      'e$worldedge 0',
      'e$template_filter 0',
      'e$feature_size 12',
      'e$mapgen 0',
      'e$scriptparam ',
      `eammloadt ${ammo.substring(0, n)}`,
      `eammprob ${ammo.substring(n, 2 * n)}`,
      `eammdelay ${ammo.substring(2 * n, 3 * n)}`,
      `eammreinf ${ammo.substring(3 * n)}`,
      'eammstore',
      `eaddteam ${md5Hex('alice')} ${0xff0204} Red`,
      'egrave Statue',
      'efort Plane',
      'evoicepack Default',
      'eflag hedgewars',
      'eaddhh 0 100 h1',
      'ehat Crown',
      'eaddhh 0 100 h2',
      'ehat NoHat',
    ]);
  });

  it('marks teams of other players in a network game', () => {
    const lines = decode(
      gameConfig(
        baseSetup({
          type: 'net',
          script: 'Balanced Random Weapon',
          map: { ...baseSetup().map, name: 'Bamboo', isStaticMap: true, generator: MAPGEN.map },
          teams: [
            team({ name: 'Mine', owner: 'alice', colorIndex: 2, difficulty: 3 }),
            team({
              name: 'Theirs',
              owner: 'bob',
              colorIndex: 1,
              isNetTeam: true,
              hedgehogsNumber: 1,
            }),
          ],
        }),
      ),
    );
    expect(lines[0]).toBe('TN');
    expect(lines[1]).toBe('escript Scripts/Multiplayer/Balanced_Random_Weapon.lua');
    expect(lines[2]).toBe('emap Bamboo');
    expect(lines).toContain('e$mapgen 6');
    const mine = lines.indexOf(`eaddteam ${md5Hex('alice')} ${TEAM_COLORS[2]} Mine`);
    expect(mine).toBeGreaterThan(0);
    expect(lines[mine + 5]).toBe('eowner alice');
    expect(lines[mine + 6]).toBe('eaddhh 3 100 h1');
    const theirs = lines.indexOf(`eaddteam ${md5Hex('bob')} ${TEAM_COLORS[1]} Theirs`);
    expect(lines[theirs + 1]).toBe('erdriven');
    expect(lines[theirs + 6]).toBe('eowner bob');
    expect(lines.filter((l) => l.startsWith('eaddhh')).length).toBe(3);
  });

  it('takes scheme values from the network as strings', () => {
    const net = defaultScheme('Pro Mode').map((v) => (v === null ? '' : String(v)));
    expect(gameFlags(net)).toBe(gameFlags(defaultScheme('Pro Mode')));
    const lines = decode(gameConfig(baseSetup({ scheme: net })));
    expect(lines).toEqual(decode(gameConfig(baseSetup({ scheme: defaultScheme('Pro Mode') }))));
  });

  it('adds maze size and drawn map data', () => {
    const maze = decode(
      gameConfig(baseSetup({ map: { ...baseSetup().map, generator: MAPGEN.maze, mazeSize: 3 } })),
    );
    expect(maze).toContain('e$maze_size 3');
    const drawn = new Uint8Array(450).map((_, i) => i & 0xff);
    const bytes = gameConfig(
      baseSetup({ map: { ...baseSetup().map, generator: MAPGEN.drawn, drawnMap: drawn } }),
    );
    const msgs = decode(bytes).filter((l) => l.startsWith('edraw '));
    expect(msgs.length).toBe(3);
  });

  it('omits the ammo store with per-hedgehog ammo', () => {
    const scheme = defaultScheme();
    scheme[21] = true;
    expect(decode(gameConfig(baseSetup({ scheme })))).not.toContain('eammstore');
    scheme[15] = true; // shared ammo wins
    expect(decode(gameConfig(baseSetup({ scheme })))).toContain('eammstore');
  });
});
