<script lang="ts">
  import { app, newTeam } from '../lib/app.svelte';

  let index = $state(0);
  let team = $derived(app.teams[index]);
  const levels = [
    [0, 'Human'],
    [5, 'Bot: beginner'],
    [4, 'Bot: easy'],
    [3, 'Bot: normal'],
    [2, 'Bot: hard'],
    [1, 'Bot: expert'],
  ] as const;

  function add() {
    let n = 1;
    while (app.teams.some((t) => t.name === `Team ${n}`)) n++;
    app.teams = [...app.teams, newTeam(`Team ${n}`)];
    index = app.teams.length - 1;
    app.saveTeams();
  }

  function remove() {
    app.teams = app.teams.filter((_, i) => i !== index);
    index = Math.max(0, index - 1);
    app.saveTeams();
  }
</script>

<div class="bar">
  <h2>Teams</h2>
  <button onclick={() => (app.screen = app.client.state === 'disconnected' ? 'start' : 'lobby')}
    >Done</button
  >
</div>

<div class="teams">
  <section class="panel list">
    {#each app.teams as t, i (i)}
      <button class:active={i === index} onclick={() => (index = i)}>{t.name}</button>
    {/each}
    <button onclick={add}>+ New team</button>
  </section>

  {#if team}
    <section class="panel editor" onchange={() => app.saveTeams()} oninput={() => app.saveTeams()}>
      <label>Name <input bind:value={team.name} maxlength="40" /></label>
      <label
        >Player
        <select bind:value={team.difficulty}>
          {#each levels as [v, label] (v)}<option value={v}>{label}</option>{/each}
        </select>
      </label>
      <label
        >Grave
        <select bind:value={team.grave}
          >{#each app.catalog?.graves ?? [team.grave] as g (g)}<option>{g}</option>{/each}</select
        >
      </label>
      <label
        >Fort
        <select bind:value={team.fort}
          >{#each app.catalog?.forts ?? [team.fort] as f (f)}<option>{f}</option>{/each}</select
        >
      </label>
      <label
        >Voice
        <select bind:value={team.voicePack}
          >{#each app.catalog?.voices ?? [team.voicePack] as v (v)}<option>{v}</option
            >{/each}</select
        >
      </label>
      <label
        >Flag
        <select bind:value={team.flag}
          >{#each app.catalog?.flags ?? [team.flag] as f (f)}<option>{f}</option>{/each}</select
        >
      </label>
      <h3>Hedgehogs</h3>
      {#each team.hedgehogs as hog, i (i)}
        <div class="hog">
          <input bind:value={hog.name} maxlength="40" aria-label="Hedgehog {i + 1} name" />
          <select bind:value={hog.hat} aria-label="Hedgehog {i + 1} hat">
            {#each app.catalog?.hats ?? [hog.hat] as h (h)}<option>{h}</option>{/each}
          </select>
        </div>
      {/each}
      <button onclick={remove} disabled={app.teams.length <= 1}>Delete team</button>
    </section>
  {/if}
</div>

<style>
  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .teams {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 16px;
  }
  @media (max-width: 760px) {
    .teams {
      grid-template-columns: 1fr;
    }
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .list .active {
    border-color: var(--accent);
  }
  .editor {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
  }
  .editor h3 {
    grid-column: 1 / -1;
    margin: 8px 0 0;
    font-size: 16px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 13px;
    color: var(--muted);
  }
  .hog {
    display: flex;
    gap: 6px;
  }
  .hog input {
    flex: 1;
    min-width: 0;
  }
</style>
