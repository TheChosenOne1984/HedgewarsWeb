<script lang="ts">
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
  <p class="panel">Hedgewars needs a keyboard and a mouse: please use a desktop browser.</p>
{/if}

<div class="start">
  <form class="panel" onsubmit={connect}>
    <h2>Play online</h2>
    <label
      >Nickname <input
        bind:value={app.settings.nick}
        maxlength="40"
        required
        autocomplete="nickname"
      /></label
    >
    <details>
      <summary>Server</summary>
      <label>WebSocket URL <input bind:value={app.settings.server} /></label>
    </details>
    <button class="primary" disabled={connecting}>{connecting ? 'Connecting…' : 'Connect'}</button>
  </form>

  <div class="panel">
    <h2>Play offline</h2>
    <p>Hotseat with friends on this computer, or against the computer.</p>
    <button onclick={() => (app.screen = 'local')}>Local game</button>
    <button onclick={() => (app.screen = 'teams')}>Edit teams</button>
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
