// M1 harness: start a local game in the web engine with a hard-coded config.
// Query parameters: ?ai=1 (one AI team), ?bots=1 (two AI teams), ?theme=Name,
// ?autostart=1, ?nosound=1.

import { EngineHost } from './engine/engine-host.js';
import { buildGameConfig, randomSeed } from './engine/game-config.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const status = (text) => { $('status').textContent = text; };
const logLines = [];
const log = (line) => {
    logLines.push(line);
    if (logLines.length > 400) logLines.shift();
    $('log').textContent = logLines.join('\n');
    $('log').scrollTop = $('log').scrollHeight;
    console.log(line);
};

$('ai').checked = params.has('ai');
$('showlog').addEventListener('change', (e) => document.body.classList.toggle('showlog', e.target.checked));

function teams() {
    const bots = params.has('bots');
    const ai = $('ai').checked;
    const team = (name, color, botLevel) => ({
        name, color, botLevel,
        hogs: [1, 2, 3, 4].map((i) => ({ name: `${name} ${i}`, hat: 'NoHat' })),
    });
    return [
        team('Red', 0xff0000, bots ? 3 : 0),
        team('Blue', 0x4980c1, bots || ai ? 3 : 0),
    ];
}

let running = false;
async function start() {
    if (running) return;
    running = true;
    $('start').disabled = true;
    const theme = params.get('theme') || 'Nature';
    const host = new EngineHost({
        engineUrl: new URL('./engine/hwengine.mjs', location.href).href,
        packsUrl: new URL('./packs/', location.href).href,
        canvas: $('canvas'),
    });
    host.onLog = log;
    host.onExit = (code) => { status(`engine exited (${code})`); window.engineExitCode = code; };
    host.onMessage = () => {};
    window.engineHost = host;

    status('loading engine');
    await host.init();
    const packs = host.packsFor({ theme });
    status(`loading ${packs.length} packs`);
    await host.loadPacks(packs, (done, total) => status(`loading packs ${Math.round(100 * done / total)}%`));

    const config = buildGameConfig({ seed: randomSeed(), theme, teams: teams() });
    status('running');
    $('canvas').focus();
    const extra = ['--nomusic'];
    if (params.has('nosound')) extra.push('--nosound');
    window.engineStarted = true;
    await host.start(config, extra);
}

$('start').addEventListener('click', () => start().catch((e) => { status('error: ' + e.message); log(e.stack); }));
if (params.has('autostart')) start().catch((e) => { status('error: ' + e.message); log(e.stack); });
