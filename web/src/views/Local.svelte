<script lang="ts">
  import { app } from '../lib/app.svelte';
  import GameSettings from '../components/GameSettings.svelte';

  let picked = $state<string[]>(app.teams.slice(0, 2).map((t) => t.name));
  let teams = $derived(app.teams.filter((t) => picked.includes(t.name)));

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
  <GameSettings bind:choice={app.choice} />
</section>

<button class="primary start" disabled={teams.length < 2} onclick={start}>Start game</button>

<style>
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
