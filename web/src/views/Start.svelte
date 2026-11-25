<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { app } from '../lib/app.svelte';

  const touchOnly =
    typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
  let connecting = $derived(
    (app.tick, app.client.state === 'connecting' || app.client.state === 'login'),
  );

  function connect(e: Event) {
    e.preventDefault();
    app.connect();
  }
</script>

{#if touchOnly}
  <p class="panel">{t('Hedgewars needs a keyboard and a mouse: please use a desktop browser.')}</p>
{/if}

<div class="start">
  <form class="panel" onsubmit={connect}>
    <h2>{t('Play online')}</h2>
    <label
      >{t('Nickname')}
      <input
        bind:value={app.settings.nick}
        maxlength="40"
        required
        autocomplete="nickname"
      /></label
    >
    <details>
      <summary>{t('Server')}</summary>
      <label>{t('WebSocket URL')} <input bind:value={app.settings.server} /></label>
    </details>
    <button class="primary" disabled={connecting}
      >{connecting ? t('Connecting…') : t('Connect')}</button
    >
  </form>

  <div class="panel">
    <h2>{t('Play offline')}</h2>
    <p>{t('Hotseat with friends on this computer, or against the computer.')}</p>
    <button onclick={() => (app.screen = 'local')}>{t('Local game')}</button>
    <button onclick={() => app.open('teams')}>{t('Edit teams')}</button>
  </div>
</div>

<style>
  .start {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 18px;
  }
</style>
