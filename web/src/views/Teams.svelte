<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { onMount } from 'svelte';
  import { app, ASSETS, newTeam } from '../lib/app.svelte';
  import ImagePicker from '../components/ImagePicker.svelte';
  import { teamData, type TeamData } from '../lib/images';
  import { mathRandom, randomHats, randomHogNames, randomTeam } from '../lib/namegen';

  let index = $state(0);
  /** pictures of hats, graves and flags and the name lists (from the core pack) */
  let data = $state<TeamData | null>(null);
  let images = $derived(data?.image ?? null);
  /** the fort has no preview picture (Olympic) */
  let fortMissing = $state(false);
  onMount(() => {
    teamData(ASSETS.packs).then(
      (d) => (data = d),
      () => {}, // without them the pickers show names and the dice stay off
    );
  });

  function choices() {
    const c = app.catalog!;
    return { hats: c.hats, graves: c.graves, flags: c.flags, forts: c.forts, voices: c.voices };
  }

  function replace(changed: (typeof app.teams)[number]) {
    app.teams = app.teams.map((t, i) => (i === index ? changed : t));
    app.saveTeams();
  }

  function fortPicture(fort: string): string {
    return `${ASSETS.packs}previews/forts/${encodeURIComponent(fort)}.png`;
  }

  /** PageEditTeam::testSound: a random line of the voice */
  function playVoice(voice: string) {
    const samples = app.catalog?.voiceSamples?.[voice] ?? [];
    if (samples.length === 0) return;
    const line = samples[mathRandom(samples.length)]!;
    const audio = new Audio(
      `${ASSETS.packs}previews/voices/${encodeURIComponent(voice)}/${line}.ogg`,
    );
    audio.volume = Math.min(1, Math.max(0, app.settings.volume / 100));
    void audio.play().catch(() => {});
  }
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
        <div class="field">
          <label for="team-fort">{t('Fort')}</label>
          <div class="row">
            <select id="team-fort" bind:value={team.fort}
              >{#each app.catalog?.forts ?? [team.fort] as f (f)}<option>{f}</option>{/each}</select
            >
            <img
              class="fort"
              src={fortPicture(team.fort)}
              alt=""
              class:missing={fortMissing}
              onload={() => (fortMissing = false)}
              onerror={() => (fortMissing = true)}
            />
          </div>
        </div>
        <div class="field">
          <label for="team-voice">{t('Voice')}</label>
          <div class="row">
            <select id="team-voice" bind:value={team.voicePack}
              >{#each app.catalog?.voices ?? [team.voicePack] as v (v)}<option>{v}</option
                >{/each}</select
            >
            <button
              type="button"
              class="play"
              title={t('Play a sample of this voice')}
              aria-label={t('Play a sample of this voice')}
              disabled={!app.catalog?.voiceSamples?.[team.voicePack]?.length}
              onclick={() => playVoice(team!.voicePack)}>▶</button
            >
          </div>
        </div>
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

      <div class="hogbar">
        <h3>{t('Hedgehogs')}</h3>
        <div class="dice">
          <button
            type="button"
            disabled={!data || !app.catalog}
            onclick={() => replace(randomTeam(team!, data!.names, choices()))}
            >🎲 {t('Random team')}</button
          >
          <button
            type="button"
            disabled={!app.catalog}
            onclick={() => replace(randomHats(team!, choices()))}>{t('Random hats')}</button
          >
          <button
            type="button"
            disabled={!data}
            onclick={() => replace(randomHogNames(team!, data!.names))}>{t('Random names')}</button
          >
        </div>
      </div>
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
    margin: 0;
    font-size: 16px;
  }
  .hogbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 4px;
  }
  .dice {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .row select {
    flex: 1;
    min-width: 0;
  }
  .fort.missing {
    visibility: hidden;
  }
  .fort {
    width: 44px;
    height: 44px;
    flex: none;
    object-fit: contain;
  }
  .play {
    min-height: 44px;
    min-width: 44px;
    flex: none;
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
