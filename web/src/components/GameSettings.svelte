<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { app, randomSeed, type GameChoice } from '../lib/app.svelte';
  import { DEFAULT_SCHEMES } from '../lib/engine/frontend-data.generated';

  let {
    choice = $bindable(),
    disabled = false,
    onchange = () => {},
  }: {
    choice: GameChoice;
    disabled?: boolean;
    onchange?: () => void;
  } = $props();

  const schemes = DEFAULT_SCHEMES.map((s) => String(s[0]));
  let ammo = $derived(app.allAmmoSets.map((a) => a.name));
</script>

<div class="settings">
  <label
    >{t('Scheme')}
    <select bind:value={choice.schemeName} {disabled} {onchange}>
      {#each schemes as s (s)}<option>{s}</option>{/each}
    </select>
  </label>
  <label
    >{t('Weapons')}
    <select bind:value={choice.ammoName} {disabled} {onchange}>
      {#each ammo as a (a)}<option>{a}</option>{/each}
    </select>
  </label>
  <label
    >{t('Style')}
    <select bind:value={choice.style} {disabled} {onchange}>
      {#each app.catalog?.styles ?? ['Normal'] as s (s)}<option>{s}</option>{/each}
    </select>
  </label>
  <label
    >{t('Theme')}
    <select bind:value={choice.theme} {disabled} {onchange}>
      {#each app.catalog?.themes ?? ['Nature'] as t (t)}<option>{t}</option>{/each}
    </select>
  </label>
  <label
    >{t('Map')}
    <select bind:value={choice.mapType} {disabled} {onchange}>
      <option value="random">{t('Random terrain')}</option>
      <option value="maze">{t('Maze')}</option>
      <option value="perlin">{t('Perlin')}</option>
      <option value="wfc">{t('Tiles (WFC)')}</option>
      <option value="map">{t('Fixed map')}</option>
    </select>
  </label>
  {#if choice.mapType === 'map'}
    <label
      >{t('Fixed map')}
      <select bind:value={choice.map} {disabled} {onchange}>
        {#each app.catalog?.maps ?? [] as m (m)}<option>{m}</option>{/each}
      </select>
    </label>
  {/if}
  <button
    {disabled}
    onclick={() => {
      choice.seed = randomSeed();
      onchange();
    }}>{t('New map seed')}</button
  >
</div>

<style>
  .settings {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 8px;
    align-items: end;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 13px;
    color: var(--muted);
  }
</style>
