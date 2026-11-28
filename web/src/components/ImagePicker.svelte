<script lang="ts">
  // A choice among pictures (hats, graves, flags): a button showing the
  // current picture; it opens a searchable grid of all of them.
  import { t } from '../lib/i18n.svelte';
  import { IMAGE_FRAME, type ImageKind, type TeamImages } from '../lib/images';

  let {
    value = $bindable(),
    options,
    kind,
    images,
    label,
    compact = false,
    onchange = () => {},
  }: {
    value: string;
    options: string[];
    kind: ImageKind;
    images: TeamImages | null;
    label: string;
    /** only the picture, no name */
    compact?: boolean;
    onchange?: () => void;
  } = $props();

  let open = $state(false);
  let filter = $state('');
  let root: HTMLElement | undefined = $state();
  let shown = $derived(
    options.filter((o) => o.toLowerCase().includes(filter.trim().toLowerCase())),
  );
  const frame = $derived(IMAGE_FRAME[kind]);

  function pick(name: string) {
    value = name;
    open = false;
    filter = '';
    onchange();
  }

  function onWindowPointer(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }

  /** the first frame of the picture, at twice its size for small flags */
  function style(name: string): string {
    const url = images?.(kind, name);
    const scale = kind === 'flag' ? 2 : 1;
    const w = frame.width * scale;
    const h = frame.height * scale;
    if (!url) return `width:${w}px;height:${h}px`;
    return (
      `width:${w}px;height:${h}px;background-image:url("${url}");` +
      `background-size:${kind === 'flag' ? `${w}px ${h}px` : 'auto'};`
    );
  }
</script>

<svelte:window
  onpointerdown={onWindowPointer}
  onkeydown={(e) => {
    if (open && e.key === 'Escape') open = false;
  }}
/>

<div class="picker" bind:this={root}>
  <button
    type="button"
    class="current"
    class:compact
    aria-label="{label}: {value}"
    aria-expanded={open}
    title={value}
    onclick={() => (open = !open)}
  >
    <span class="pic" style={style(value)}></span>
    {#if !compact}<span class="name">{value}</span>{/if}
  </button>
  {#if open}
    <div class="popup panel" role="dialog" aria-label={label}>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={filter} placeholder={t('Search…')} autofocus />
      <div class="grid" role="listbox" aria-label={label}>
        {#each shown as name (name)}
          <button
            type="button"
            role="option"
            aria-selected={name === value}
            class:selected={name === value}
            title={name}
            aria-label={name}
            onclick={() => pick(name)}
          >
            <span class="pic" style={style(name)}></span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
    min-width: 0;
  }
  .current {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 2px 8px;
    min-height: 44px;
    text-align: left;
  }
  .current.compact {
    width: auto;
    justify-content: center;
    padding: 2px 6px;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 15px;
    color: var(--text);
  }
  .pic {
    display: inline-block;
    flex: none;
    background-repeat: no-repeat;
    background-position: 0 0;
    image-rendering: auto;
  }
  .popup {
    position: absolute;
    z-index: 10;
    top: calc(100% + 4px);
    left: 0;
    width: min(420px, 90vw);
    box-shadow: 0 6px 24px rgb(0 0 0 / 50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
    gap: 4px;
    max-height: 300px;
    overflow-y: auto;
  }
  .grid button {
    display: grid;
    place-items: center;
    padding: 4px 0;
    min-height: 50px;
  }
  .grid button.selected {
    border-color: var(--accent);
    background: rgba(255, 204, 0, 0.22);
  }
</style>
