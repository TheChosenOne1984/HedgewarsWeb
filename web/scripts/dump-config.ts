// Print the engine config of a local AI-vs-AI game built by the web
// frontend's config builder, base64 encoded. Used to check the builder against
// the real engine: project_files/web/tools/hwipc.py record --config-b64 ...
// Run: npx vite-node scripts/dump-config.ts [seed]
import { defaultAmmo, defaultScheme, gameConfig, MAPGEN } from '../src/lib/engine/config';
import { md5Hex } from '../src/lib/engine/md5';

const seed = process.argv[2] ?? '{web-config-test}';
const hogs = (p: string) => Array.from({ length: 8 }, (_, i) => ({ name: `${p} ${i + 1}`, hat: 'NoHat' }));
// a non-default scheme and weapon set, shortened so the game ends quickly
const scheme = defaultScheme('Pro Mode');
scheme[26] = 300; // damage percent
scheme[28] = 30; // initial health
const bytes = gameConfig({
  type: 'local',
  scheme,
  ammo: defaultAmmo('Crazy'),
  script: 'Normal',
  map: { name: '+rnd+', isStaticMap: false, generator: MAPGEN.regular, templateFilter: 0, featureSize: 12, mazeSize: 0, seed, theme: 'Bamboo' },
  teams: ['Red', 'Blue'].map((name, i) => ({
    name, colorIndex: i, difficulty: 3, grave: 'Statue', fort: 'Plane', voicepack: 'Default',
    flag: 'hedgewars', owner: '', hedgehogs: hogs(name), hedgehogsNumber: 3, isNetTeam: false,
  })),
  playerHash: md5Hex('web'),
});
process.stdout.write(Buffer.from(bytes).toString('base64') + '\n');
