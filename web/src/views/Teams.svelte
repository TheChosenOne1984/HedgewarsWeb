<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { onMount } from 'svelte';
  import { app, ASSETS, newTeam } from '../lib/app.svelte';
  import ImagePicker from '../components/ImagePicker.svelte';
  import { teamImages, type TeamImages } from '../lib/images';

  let index = $state(0);
  /** pictures of hats, graves and flags (from the core pack) */
  let images = $state<TeamImages | null>(null);
  onMount(() => {
    teamImages(ASSETS.packs).then(
      (i) => (images = i),
      () => {}, // without pictures the pickers show names
    );
  });
  let team = $derived(app.teams[index]);
  const levels = [
    [0, 'Human'],
    [5, 'Bot: beginner'],
    [4, 'Bot: easy'],
    [3, 'Bot: normal'],
    [2, 'Bot: hard'],
    [1, 'Bot: expert'],
  ] as const; // translated when shown

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
  <h2>{t('Teams')}</h2>
  <button onclick={() => app.back()}>{t('Done')}</button>
</div>

<div class="teams">
  <section class="panel list">
    {#each app.teams as tm, i (i)}
      <button class:active={i === index} onclick={() => (index = i)}>{tm.name}</button>
    {/each}
    <button onclick={add}>{t('+ New team')}</button>
  </section>

  {#if team}
    <section class="panel editor" onchange={() => app.saveTeams()} oninput={() => app.saveTeams()}>
      <div class="fields">
        <label>{t('Name')} <input bind:value={team.name} maxlength="40" /></label>
        <label
          >{t('Player')}
          <select bind:value={team.difficulty}>
            {#each levels as [v, label] (v)}<option value={v}>{t(label)}</option>{/each}
          </select>
        </label>
        <label
          >{t('Fort')}
          <select bind:value={team.fort}
            >{#each app.catalog?.forts ?? [team.fort] as f (f)}<option>{f}</option>{/each}</select
          >
        </label>
        <label
          >{t('Voice')}
          <select bind:value={team.voicePack}
            >{#each app.catalog?.voices ?? [team.voicePack] as v (v)}<option>{v}</option
              >{/each}</select
          >
        </label>
        <div class="field">
          <span>{t('Grave')}</span>
          <ImagePicker
            bind:value={team.grave}
            options={app.catalog?.graves ?? [team.grave]}
            kind="grave"
            {images}
            label={t('Grave')}
            onchange={() => app.saveTeams()}
          />
        </div>
        <div class="field">
          <span>{t('Flag')}</span>
          <ImagePicker
            bind:value={team.flag}
            options={app.catalog?.flags ?? [team.flag]}
            kind="flag"
            {images}
            label={t('Flag')}
            onchange={() => app.saveTeams()}
          />
        </div>
      </div>

      <h3>{t('Hedgehogs')}</h3>
      <div class="hogs">
        {#each team.hedgehogs as hog, i (i)}
          <div class="hog">
            <ImagePicker
              bind:value={hog.hat}
              options={app.catalog?.hats ?? [hog.hat]}
              kind="hat"
              {images}
              compact
              label={t('Hedgehog {n} hat', { n: i + 1 })}
              onchange={() => app.saveTeams()}
            />
            <input
              bind:value={hog.name}
              maxlength="40"
              aria-label={t('Hedgehog {n} name', { n: i + 1 })}
            />
          </div>
        {/each}
      </div>

      <div class="actions">
        <button onclick={remove} disabled={app.teams.length <= 1}>{t('Delete team')}</button>
      </div>
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
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .editor h3 {
    margin: 4px 0 0;
    font-size: 16px;
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
    align-items: end;
  }
  label,
  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 13px;
    color: var(--muted);
    min-width: 0;
  }
  .fields select,
  .fields input {
    min-height: 44px;
    box-sizing: border-box;
    font-size: 15px;
    color: var(--text);
  }
  .hogs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 8px;
  }
  .hog {
    display: flex;
    gap: 6px;
    align-items: stretch;
  }
  .hog input {
    flex: 1;
    min-width: 0;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
