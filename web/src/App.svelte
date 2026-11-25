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

  const sourceUrl =
    import.meta.env.VITE_SOURCE_URL || 'https://github.com/TheChosenOne1984/HedgewarsWeb';

  onMount(() => {
    void app.init();
  });
</script>

{#if app.screen === 'game'}
  <Game />
{:else}
  <div class="page">
    <header>
      <h1>Hedgewars</h1>
      {#if app.screen !== 'settings'}
        <button class="settings-link" onclick={() => app.open('settings')}>{t('Settings')}</button>
      {/if}
      {#if app.client.state !== 'disconnected' && (app.tick, true)}
        <span class="who">{app.client.nick}</span>
        <button onclick={() => app.client.disconnect()}>{t('Disconnect')}</button>
      {/if}
    </header>
    {#if app.error}
      <div class="error" role="alert">
        {app.error} <button onclick={() => app.dismissError()}>×</button>
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
  :global(:root) {
    color-scheme: dark;
    --bg: #14161a;
    --panel: #1f232a;
    --line: #333a44;
    --text: #e6e6e6;
    --muted: #9aa3ad;
    --accent: #f5c542;
    font-family: system-ui, sans-serif;
    font-size: 15px;
  }
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--text);
  }
  :global(button),
  :global(input),
  :global(select) {
    font: inherit;
    color: inherit;
    background: #2a2f37;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 4px 10px;
  }
  :global(button:hover:not(:disabled)) {
    border-color: var(--accent);
  }
  :global(button.primary) {
    background: var(--accent);
    color: #111;
    border-color: var(--accent);
  }
  :global(.panel) {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 12px;
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
  }
  header h1 {
    font-size: 22px;
    margin: 12px auto 12px 0;
  }
  .who {
    color: var(--muted);
  }
  main {
    flex: 1;
  }
  .error {
    background: #5a1f1f;
    border: 1px solid #a33;
    padding: 8px 12px;
    border-radius: 4px;
    margin-bottom: 12px;
  }
  footer {
    color: var(--muted);
    font-size: 13px;
    padding: 16px 0;
  }
  footer a {
    color: var(--muted);
  }
</style>
