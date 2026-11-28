<script lang="ts">
  import { app, type AmmoSet } from '../lib/app.svelte';
  import { DEFAULT_AMMO_SETS } from '../lib/engine/frontend-data.generated';
  import { getLocale, t } from '../lib/i18n.svelte';
  import {
    AMMO_FIELDS,
    EDITABLE_WEAPONS,
    ammoNameProblem,
    ammoValue,
    copyName,
    setAmmoValue,
    weaponIcon,
    weaponName,
    type AmmoField,
  } from '../lib/weapons';
  import sheet from '../../../share/hedgewars/Data/Graphics/AmmoMenu/Ammos_base.png';

  const predefined = new Set(DEFAULT_AMMO_SETS.map((s) => s.name));
  let selected = $state(app.ammoSets[0]?.name ?? DEFAULT_AMMO_SETS[0]!.name);
  let field = $state<AmmoField>('count');
  let filter = $state('');
  let current = $derived(app.allAmmoSets.find((s) => s.name === selected) ?? DEFAULT_AMMO_SETS[0]!);
  let readOnly = $derived(predefined.has(current.name) || !app.ammoSets.includes(current));
  let draftName = $state('');
  let nameProblem = $state<string | null>(null);
  $effect(() => {
    draftName = current.name;
    nameProblem = null;
  });
  let fieldInfo = $derived(AMMO_FIELDS.find((f) => f.field === field)!);
  let weapons = $derived(
    EDITABLE_WEAPONS.filter((type) =>
      weaponName(type, getLocale()).toLowerCase().includes(filter.trim().toLowerCase()),
    ),
  );

  function taken(except?: string) {
    return app.allAmmoSets.map((s) => s.name).filter((n) => n !== except);
  }

  function addCopy(of: AmmoSet) {
    const set = { name: copyName(of.name, taken()), ammo: of.ammo };
    app.ammoSets = [...app.ammoSets, set];
    app.saveAmmoSets();
    selected = set.name;
  }

  function update(change: (s: AmmoSet) => AmmoSet) {
    const old = current;
    const next = change(old);
    app.ammoSets = app.ammoSets.map((s) => (s === old ? next : s));
    if (app.choice.ammoName === old.name) app.choice.ammoName = next.name;
    selected = next.name;
    app.saveAmmoSets();
  }

  function rename() {
    const name = draftName.trim();
    if (name === current.name) return;
    nameProblem = ammoNameProblem(name, taken(current.name));
    if (!nameProblem) update((s) => ({ ...s, name }));
  }

  function setValue(type: number, value: number) {
    update((s) => ({ ...s, ammo: setAmmoValue(s.ammo, field, type, value) }));
  }

  function remove() {
    const name = current.name;
    app.ammoSets = app.ammoSets.filter((s) => s.name !== name);
    if (app.choice.ammoName === name) app.choice.ammoName = DEFAULT_AMMO_SETS[0]!.name;
    app.saveAmmoSets();
    selected = app.ammoSets[0]?.name ?? DEFAULT_AMMO_SETS[0]!.name;
  }

  function show(value: number): string {
    return field === 'count' && value === 9 ? '∞' : String(value);
  }

  function iconStyle(type: number): string {
    const { x, y } = weaponIcon(type);
    return `background-image:url(${sheet});background-position:-${x}px -${y}px`;
  }
</script>

<div class="bar">
  <h2>{t('Weapon sets')}</h2>
  <button onclick={() => app.back()}>{t('Done')}</button>
</div>

<div class="layout">
  <section class="panel list" aria-label={t('Weapon sets')}>
    {#each app.allAmmoSets as s (s.name)}
      <button class:active={s.name === current.name} onclick={() => (selected = s.name)}>
        <span>{s.name}</span>
        {#if predefined.has(s.name)}<span class="tag" title={t('predefined')}>🔒</span>{/if}
      </button>
    {/each}
    <button class="new" onclick={() => addCopy(DEFAULT_AMMO_SETS[0]!)}
      >{t('+ New weapon set')}</button
    >
  </section>

  <section class="panel editor">
    <div class="head">
      <label class="name"
        >{t('Name')}
        <input
          bind:value={draftName}
          maxlength="40"
          disabled={readOnly}
          onchange={rename}
          onkeydown={(e) => e.key === 'Enter' && rename()}
        />
      </label>
      <button onclick={() => addCopy(current)}>{t('Copy')}</button>
      {#if !readOnly}
        <button class="danger" onclick={remove}>{t('Delete')}</button>
      {/if}
    </div>
    {#if nameProblem}<p class="problem" role="alert">{t(nameProblem)}</p>{/if}
    {#if readOnly}
      <p class="muted">
        {t('Predefined weapon sets cannot be changed. “Copy” makes your own set to edit.')}
      </p>
    {/if}

    <div class="tabs" role="tablist">
      {#each AMMO_FIELDS as f (f.field)}
        <button
          role="tab"
          aria-selected={f.field === field}
          class:active={f.field === field}
          onclick={() => (field = f.field)}>{t(f.label)}</button
        >
      {/each}
      <input class="filter" bind:value={filter} placeholder={t('Search…')} />
    </div>
    <p class="hint muted">{t(fieldInfo.hint)}</p>

    <div class="grid">
      {#each weapons as type (type)}
        {@const value = ammoValue(current.ammo, field, type)}
        <label class="weapon" class:off={value === 0}>
          <span class="icon" style={iconStyle(type)}></span>
          <span class="wname">{weaponName(type, getLocale())}</span>
          <span class="value">{show(value)}</span>
          <input
            type="range"
            min="0"
            max={fieldInfo.max}
            step="1"
            {value}
            disabled={readOnly}
            aria-label="{weaponName(type, getLocale())}: {t(fieldInfo.label)}"
            oninput={(e) => setValue(type, Number(e.currentTarget.value))}
          />
        </label>
      {/each}
    </div>
  </section>
</div>

<style>
  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .layout {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 800px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .list button {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    text-align: left;
  }
  .list button.active {
    background: var(--accent);
    color: #1a1040;
  }
  .tag {
    font-size: 12px;
  }
  .editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .head {
    display: flex;
    gap: 8px;
    align-items: end;
    flex-wrap: wrap;
  }
  .name {
    flex: 1 1 220px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 13px;
    color: var(--muted);
  }
  .name input {
    font-size: 15px;
    color: var(--text);
  }
  .danger {
    border-color: var(--danger);
    color: var(--danger);
  }
  .problem {
    color: var(--danger);
    margin: 0;
    font-weight: 600;
  }
  .muted {
    margin: 0;
  }
  .tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .tabs button.active {
    background: var(--accent);
    color: #1a1040;
  }
  .filter {
    margin-left: auto;
    min-width: 0;
    width: 180px;
  }
  .hint {
    font-size: 13px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 8px;
  }
  .weapon {
    display: grid;
    grid-template-columns: 32px 1fr auto;
    grid-template-rows: auto auto;
    gap: 2px 8px;
    align-items: center;
    padding: 6px 10px;
    border: 2px solid var(--line);
    border-radius: 12px;
    background: var(--field);
  }
  .weapon.off {
    opacity: 0.6;
  }
  .icon {
    grid-row: 1 / 3;
    width: 32px;
    height: 32px;
    background-repeat: no-repeat;
  }
  .wname {
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .value {
    color: var(--accent);
    font-weight: 800;
    min-width: 1.5em;
    text-align: right;
  }
  .weapon input[type='range'] {
    grid-column: 2 / 4;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    accent-color: var(--accent);
  }
</style>
