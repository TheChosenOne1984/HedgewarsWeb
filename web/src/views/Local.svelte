<script lang="ts">
  import { app, choiceToRoomSettings, previewParamsFromSettings } from '../lib/app.svelte';
  import GameSettings from '../components/GameSettings.svelte';
  import MapPreview from '../components/MapPreview.svelte';

  let picked = $state<string[]>(app.teams.slice(0, 2).map((t) => t.name));
  let teams = $derived(app.teams.filter((t) => picked.includes(t.name)));
  let previewParams = $derived(previewParamsFromSettings(choiceToRoomSettings(app.choice)));

  function start() {
    app.localTeams = teams;
    app.screen = 'game';
  }
</script>

<div class="bar">
  <h2>Local game</h2>
  <button onclick={() => (app.screen = 'start')}>Back</button>
</div>

<section class="panel">
  <h3>Teams</h3>
  {#each app.teams as t (t.name)}
    <label
      ><input type="checkbox" value={t.name} bind:group={picked} />
      {t.name}
      {t.difficulty ? `(bot level ${t.difficulty})` : '(human)'}</label
    >
  {/each}
  <p class="muted">Pick at least two teams. Edit teams and bots under “Edit teams”.</p>
  <button onclick={() => (app.screen = 'teams')}>Edit teams</button>
</section>

<section class="panel">
  <h3>Game</h3>
  <div class="game">
    <MapPreview params={previewParams} />
    <div class="options"><GameSettings bind:choice={app.choice} /></div>
  </div>
</section>

<button class="primary start" disabled={teams.length < 2} onclick={start}>Start game</button>

<style>
  .game {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .game > :global(.preview) {
    flex: 0 1 256px;
  }
  .options {
    flex: 1 1 300px;
    min-width: 0;
  }
  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  section {
    margin-bottom: 16px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 16px;
  }
  label {
    display: block;
    padding: 2px 0;
  }
  .muted {
    color: var(--muted);
  }
  .start {
    font-size: 17px;
    padding: 8px 24px;
  }
</style>
