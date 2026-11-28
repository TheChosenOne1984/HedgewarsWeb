<script lang="ts">
  import { t } from './lib/i18n.svelte';
  import { onMount } from 'svelte';
  import { app } from './lib/app.svelte';
  import Start from './views/Start.svelte';
  import Lobby from './views/Lobby.svelte';
  import Room from './views/Room.svelte';
  import Game from './views/Game.svelte';
  import Teams from './views/Teams.svelte';
  import Local from './views/Local.svelte';
  import Settings from './views/Settings.svelte';
  import WeaponSets from './views/WeaponSets.svelte';
  // the look of the Qt frontend: night sky, hills at the bottom, stars, the title
  import background from '../../frontend-qt6/res/Background.png';
  import star from '../../frontend-qt6/res/Star.png';
  import title from '../../frontend-qt6/res/HedgewarsTitle.png';

  const sourceUrl =
    import.meta.env.VITE_SOURCE_URL || 'https://github.com/TheChosenOne1984/HedgewarsWeb';

  // read app.tick first: a dependency read only behind && would be lost
  let connected = $derived((app.tick, app.client.state !== 'disconnected'));
  let nick = $derived((app.tick, app.client.nick));

  /** a few stars in the sky (fixed positions, gently twinkling) */
  const stars = [
    [6, 9, 0.9],
    [17, 22, 0.6],
    [29, 6, 0.8],
    [41, 17, 0.5],
    [55, 8, 1],
    [66, 25, 0.6],
    [78, 12, 0.8],
    [90, 20, 0.7],
    [94, 5, 0.5],
    [12, 38, 0.5],
    [48, 33, 0.6],
    [84, 40, 0.5],
  ];

  onMount(() => {
    void app.init();
  });
</script>

{#if app.screen === 'game'}
  <Game />
{:else}
  <div class="sky" style:--background="url({background})" aria-hidden="true">
    {#each stars as [x, y, scale], i (i)}
      <img
        class="star"
        src={star}
        alt=""
        style:left="{x}%"
        style:top="{y}%"
        style:--scale={scale}
        style:animation-delay="{(i * 0.7) % 4}s"
      />
    {/each}
  </div>
  <div class="page">
    <header>
      <button
        class="logo"
        title={t('Start page')}
        onclick={() => (app.screen = connected ? 'lobby' : 'start')}
      >
        <img src={title} alt="Hedgewars" />
      </button>
      <nav>
        <button class:active={app.screen === 'teams'} onclick={() => app.open('teams')}
          >{t('Teams')}</button
        >
        <button class:active={app.screen === 'weapons'} onclick={() => app.open('weapons')}
          >{t('Weapons')}</button
        >
        <button
          class="settings-link"
          class:active={app.screen === 'settings'}
          onclick={() => app.open('settings')}>{t('Settings')}</button
        >
        {#if connected}
          <span class="who">{nick}</span>
          <button class="disconnect" onclick={() => app.disconnect()}>{t('Disconnect')}</button>
        {/if}
      </nav>
    </header>
    {#if app.error}
      <div class="error" role="alert">
        <span>{app.error}</span>
        <button onclick={() => app.dismissError()} aria-label={t('Close')}>×</button>
      </div>
    {/if}
    <main>
      {#if app.screen === 'start'}
        <Start />
      {:else if app.screen === 'lobby'}
        <Lobby />
      {:else if app.screen === 'room'}
        <Room />
      {:else if app.screen === 'teams'}
        <Teams />
      {:else if app.screen === 'weapons'}
        <WeaponSets />
      {:else if app.screen === 'local'}
        <Local />
      {:else if app.screen === 'settings'}
        <Settings />
      {/if}
    </main>
    <footer>
      {t('Hedgewars is free software')} (<a
        href="https://www.gnu.org/licenses/old-licenses/gpl-2.0.html">GPL-2.0</a
      >, {t('data GFDL-1.2')}). <a href={sourceUrl}>{t('Source code')}</a>
    </footer>
  </div>
{/if}

<style>
  /* Colours and shapes of the Qt frontend (frontend-qt6/res/css/qt.css):
     dark blue sky, golden yellow borders and headings, round corners.
     Body text stays light for reading. */
  :global(:root) {
    color-scheme: dark;
    --bg: #141250;
    --panel: rgba(13, 5, 68, 0.82);
    --field: rgba(13, 5, 68, 0.75);
    --field-hover: rgba(30, 20, 110, 0.85);
    --line: #cca300;
    --text: #f4f1ff;
    --muted: #c8c8ff;
    --accent: #ffcc00;
    --accent-dark: #00351d;
    --danger: #ff6b5a;
    font-family: system-ui, 'Segoe UI', Roboto, 'DejaVu Sans', sans-serif;
    font-size: 15px;
  }
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }
  :global(h2),
  :global(h3) {
    color: var(--accent);
    font-weight: 800;
    letter-spacing: 0.02em;
    text-shadow:
      0 2px 0 rgba(0, 0, 0, 0.55),
      0 0 8px rgba(255, 204, 0, 0.25);
  }
  :global(h2) {
    font-size: 22px;
  }
  :global(h3) {
    font-size: 17px;
  }
  :global(input[type='checkbox']),
  :global(input[type='radio']),
  :global(input[type='range']) {
    accent-color: var(--accent);
  }
  :global(a) {
    color: var(--muted);
  }
  :global(button),
  :global(input),
  :global(select),
  :global(textarea) {
    font: inherit;
    color: inherit;
    background: var(--field);
    border: 2px solid var(--line);
    border-radius: 10px;
    padding: 6px 12px;
  }
  :global(input:focus-visible),
  :global(select:focus-visible),
  :global(textarea:focus-visible),
  :global(button:focus-visible) {
    outline: 3px solid #fff3b0;
    outline-offset: 1px;
  }
  :global(button) {
    font-weight: 700;
    color: var(--accent);
    border-width: 3px;
    border-color: var(--accent);
    border-radius: 12px;
    cursor: pointer;
    transition:
      transform 0.08s,
      background-color 0.15s,
      border-color 0.15s;
  }
  :global(button:hover:not(:disabled)) {
    background: var(--field-hover);
    border-color: #fff06a;
    color: #fff06a;
  }
  :global(button:active:not(:disabled)) {
    transform: translateY(1px);
  }
  :global(button:disabled) {
    opacity: 0.45;
    cursor: default;
  }
  :global(button.primary) {
    background: linear-gradient(#ffe25c, var(--accent) 45%, #e6a800);
    color: #1a1040;
    border-color: #fff3b0;
    text-shadow: none;
    box-shadow: 0 3px 0 #8a6200;
  }
  :global(button.primary:hover:not(:disabled)) {
    background: linear-gradient(#fff08a, #ffd633 45%, #f0b400);
    color: #1a1040;
  }
  :global(select option) {
    background: #1d1660;
    color: var(--text);
  }
  :global(.panel) {
    background: var(--panel);
    border: 3px solid var(--accent);
    border-radius: 18px;
    padding: 14px 16px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  }
  :global(.muted) {
    color: var(--muted);
  }

  .sky {
    position: fixed;
    inset: 0;
    z-index: -1;
    /* the picture's top edge is the sky colour, so it blends in (like qt.css) */
    background: var(--background) bottom center repeat-x var(--bg);
    pointer-events: none;
  }
  @media (max-height: 700px) {
    .sky {
      background-size: auto 100%;
    }
  }
  .star {
    position: absolute;
    width: calc(26px * var(--scale));
    animation: twinkle 4s ease-in-out infinite;
  }
  @keyframes twinkle {
    0%,
    100% {
      opacity: 0.9;
      transform: scale(1);
    }
    50% {
      opacity: 0.35;
      transform: scale(0.8);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .star {
      animation: none;
    }
  }

  .page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 16px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding: 10px 0 6px;
  }
  .logo {
    border: none;
    background: none;
    padding: 0;
    margin-right: auto;
    box-shadow: none;
  }
  .logo:hover:not(:disabled) {
    background: none;
  }
  .logo img {
    height: 64px;
    display: block;
    filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.5));
  }
  nav {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  nav button.active {
    background: var(--accent);
    color: #1a1040;
  }
  .who {
    color: var(--text);
    font-weight: 700;
    padding: 0 4px;
  }
  .disconnect {
    border-color: var(--danger);
    color: var(--danger);
  }
  main {
    flex: 1;
  }
  .error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: rgba(120, 20, 30, 0.88);
    border: 3px solid var(--danger);
    border-radius: 14px;
    padding: 8px 12px;
    margin-bottom: 12px;
    font-weight: 600;
  }
  .error button {
    color: #fff;
    border-color: #fff;
    padding: 2px 10px;
  }
  footer {
    color: var(--muted);
    font-size: 13px;
    padding: 18px 0;
    text-shadow: 0 1px 2px #000;
  }
  footer a {
    color: var(--muted);
  }
  @media (max-width: 600px) {
    .logo img {
      height: 48px;
    }
  }
</style>
