<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { BIND_ACTIONS, effectiveBinds, keyName, mouseName } from '../lib/binds';
  import { LOCALES, setLocale, t, type Locale } from '../lib/i18n.svelte';

  let binds = $derived(effectiveBinds(app.settings.binds));
  /** the action waiting for its new key */
  let capturing = $state<string | null>(null);

  function save() {
    app.saveSettings();
  }

  function changeLocale(e: Event) {
    app.settings.locale = (e.currentTarget as HTMLSelectElement).value as Locale | '';
    setLocale(app.settings.locale || undefined);
    save();
  }

  function bind(action: string, key: string) {
    const changes = { ...app.settings.binds, [action]: key };
    // a key does one thing: unbind other actions on the same key
    for (const b of BIND_ACTIONS)
      if (b.action !== action && (changes[b.action] ?? b.key) === key) changes[b.action] = 'none';
    app.settings.binds = changes;
    capturing = null;
    save();
  }

  function onKey(e: KeyboardEvent) {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape' && !e.repeat) {
      capturing = null;
      return;
    }
    const name = keyName(e.code);
    if (name) bind(capturing, name);
  }

  function onMouse(e: MouseEvent) {
    if (!capturing) return;
    e.preventDefault();
    const name = mouseName(e.button);
    if (name) bind(capturing, name);
  }

  function onWheel(e: WheelEvent) {
    if (!capturing) return;
    e.preventDefault();
    bind(capturing, e.deltaY < 0 ? 'wheelup' : 'wheeldown');
  }

  function reset() {
    app.settings.binds = {};
    save();
  }

  const show = (key: string) => (!key || key === 'none' ? '—' : key);
</script>

<svelte:window onkeydowncapture={onKey} />

<div class="bar">
  <h2>{t('Settings')}</h2>
  <button onclick={() => app.back()}>{t('Done')}</button>
</div>

<div class="settings">
  <section class="panel">
    <label
      >{t('Language')}
      <select value={app.settings.locale} onchange={changeLocale}>
        <option value="">Browser</option>
        {#each LOCALES as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
      </select>
    </label>
    <label
      >{t('Volume')}
      <input
        type="range"
        min="0"
        max="100"
        bind:value={app.settings.volume}
        onchange={save}
      /></label
    >
    <label class="check"
      ><input type="checkbox" bind:checked={app.settings.sound} onchange={save} />
      {t('Sound effects')}</label
    >
    <label class="check"
      ><input type="checkbox" bind:checked={app.settings.music} onchange={save} />
      {t('Music')}</label
    >
  </section>

  <section class="panel controls">
    <div class="bar">
      <h3>{t('Controls')}</h3>
      <button onclick={reset}>{t('Reset to defaults')}</button>
    </div>
    <p class="muted">{t('Click an action, then press the key for it.')}</p>
    <table>
      <tbody>
        {#each BIND_ACTIONS as b (b.action)}
          {#if b.category}
            <tr><th colspan="2">{t(b.category)}</th></tr>
          {/if}
          <tr>
            <td>{t(b.label, { n: b.n ?? '' })}</td>
            <td>
              <button
                class="key"
                class:capturing={capturing === b.action}
                onclick={(e) => {
                  if (capturing === b.action) onMouse(e);
                  else capturing = b.action;
                }}
                onauxclick={onMouse}
                oncontextmenu={(e) => {
                  if (capturing) e.preventDefault();
                }}
                onwheel={onWheel}
                >{capturing === b.action ? t('Press a key…') : show(binds[b.action] ?? '')}</button
              >
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
</div>

<style>
  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  h2 {
    font-size: 19px;
  }
  h3 {
    margin: 0;
    font-size: 16px;
  }
  .settings {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 2fr;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 760px) {
    .settings {
      grid-template-columns: 1fr;
    }
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-bottom: 12px;
    font-size: 13px;
    color: var(--muted);
  }
  label.check {
    flex-direction: row;
    align-items: center;
    gap: 6px;
    color: inherit;
  }
  .muted {
    color: var(--muted);
    font-size: 13px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    text-align: left;
    padding: 12px 0 4px;
    font-size: 13px;
    color: var(--muted);
  }
  td {
    padding: 2px 0;
  }
  .key {
    min-width: 120px;
    font-family: monospace;
  }
  .key.capturing {
    outline: 2px solid var(--accent, #4a8fe7);
  }
</style>
