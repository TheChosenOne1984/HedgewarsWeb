<script lang="ts">
  import { getLocale, t } from '../lib/i18n.svelte';
  import { onMount } from 'svelte';
  import { app, ASSETS, choiceToRoomSettings } from '../lib/app.svelte';
  import { EngineHost } from '../lib/engine/host';
  import { md5Hex } from '../lib/engine/md5';
  import { settingsIni } from '../lib/binds';
  import { roomToGameSetup, GameSession } from '../lib/game/session';
  import type { GameSetup } from '../lib/engine/config';

  let canvas: HTMLCanvasElement | undefined = $state();
  let status = $state(t('starting'));
  let log: string[] = $state([]);
  let showLog = $state(false);
  const net = app.client.state === 'game';

  function localSetup(): GameSetup {
    const r = choiceToRoomSettings(app.choice);
    return {
      type: 'local',
      scheme: r.scheme,
      ammo: r.ammo,
      script: r.script,
      map: {
        name: r.staticMap || '+rnd+',
        isStaticMap: r.staticMap !== '',
        generator: r.mapgen,
        templateFilter: r.templateFilter,
        featureSize: r.featureSize,
        mazeSize: r.mazeSize,
        seed: r.seed,
        theme: r.theme,
      },
      teams: app.localTeams.map((t, i) => ({
        name: t.name,
        colorIndex: i % 9,
        difficulty: t.difficulty,
        grave: t.grave,
        fort: t.fort,
        voicepack: t.voicePack,
        flag: t.flag,
        owner: '',
        hedgehogs: t.hedgehogs,
        hedgehogsNumber: 4,
        isNetTeam: false,
      })),
      playerHash: md5Hex(app.settings.nick || 'Guest'),
    };
  }

  onMount(() => {
    const host = new EngineHost(ASSETS.engine, ASSETS.packs, canvas);
    const echo = new URLSearchParams(location.search).has('debug');
    host.onLog = (line) => {
      log = [...log.slice(-300), line];
      if (echo) console.log(line);
    };
    const session = new GameSession(
      host,
      {
        status: (s) => (status = s),
        stats: () => {},
        ended: (code, finished) => {
          status = t('game over ({n})', { n: code });
          app.lastGame = { code, finished };
          app.screen = net ? (app.client.room ? 'room' : 'lobby') : 'local';
        },
      },
      net ? app.client : null,
    );
    (async () => {
      await host.init();
      const setup =
        net && app.client.room
          ? await roomToGameSetup(app.client.room, app.client.nick)
          : localSetup();
      host.writeUserFile('settings.ini', settingsIni(app.settings.binds));
      const locale = getLocale();
      const args = [`--volume`, String(app.settings.volume)];
      if (locale !== 'en') args.push('--locale', `${locale}.txt`);
      if (!app.settings.sound) args.push('--nosound');
      if (!app.settings.music) args.push('--nomusic');
      canvas?.focus();
      await session.run(setup, args, locale);
    })().catch((e: Error) => {
      status = t('error: {text}', { text: e.message });
      app.error = t('The game could not start: {text}', { text: e.message });
      app.screen = net ? 'room' : 'local';
    });
  });
</script>

<div class="game">
  <canvas bind:this={canvas} id="canvas" tabindex="0" oncontextmenu={(e) => e.preventDefault()}
  ></canvas>
  {#if status !== 'running'}
    <div class="status">{status}</div>
  {/if}
  <button class="logtoggle" onclick={() => (showLog = !showLog)}>log</button>
  {#if showLog}
    <pre class="log">{log.join('\n')}</pre>
  {/if}
</div>

<style>
  .game {
    position: fixed;
    inset: 0;
    background: #000;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    outline: none;
  }
  .status {
    position: absolute;
    top: 45%;
    width: 100%;
    text-align: center;
    color: #ddd;
    font-size: 18px;
    pointer-events: none;
  }
  .logtoggle {
    position: absolute;
    right: 6px;
    top: 6px;
    opacity: 0.4;
    font-size: 11px;
  }
  .log {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 45%;
    max-height: 45%;
    overflow: auto;
    margin: 0;
    padding: 6px;
    background: rgba(0, 0, 0, 0.7);
    font-size: 11px;
  }
</style>
