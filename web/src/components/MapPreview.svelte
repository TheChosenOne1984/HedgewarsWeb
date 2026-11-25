<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { previews } from '../lib/app.svelte';
  import {
    PREVIEW_HEIGHT,
    PREVIEW_WIDTH,
    type Preview,
    type PreviewParams,
  } from '../lib/engine/preview';

  let { params }: { params: PreviewParams | null } = $props();

  let canvas = $state<HTMLCanvasElement>();
  let preview = $state<Preview | null>(null);
  let failed = $state(false);
  let loading = $state(false);

  // render after the settings have settled; ignore answers to older requests
  let request = 0;
  $effect(() => {
    const p = params ? $state.snapshot(params) : null;
    const id = ++request;
    if (!p) return;
    const timer = setTimeout(async () => {
      loading = true;
      try {
        const result = await previews.get(p as PreviewParams);
        if (id === request) {
          preview = result;
          failed = false;
        }
      } catch {
        if (id === request) failed = true;
      } finally {
        if (id === request) loading = false;
      }
    }, 150);
    return () => clearTimeout(timer);
  });

  // HWMap::onClientDisconnect: yellow land on a blue gradient
  $effect(() => {
    const alpha = preview?.alpha;
    const ctx = canvas?.getContext('2d');
    if (!alpha || !ctx) return;
    const image = ctx.createImageData(PREVIEW_WIDTH, PREVIEW_HEIGHT);
    for (let y = 0; y < PREVIEW_HEIGHT; y++) {
      const t = y / (PREVIEW_HEIGHT - 1);
      const sky = [66 * (1 - t), 115 * (1 - t), 225 + (192 - 225) * t];
      for (let x = 0; x < PREVIEW_WIDTH; x++) {
        const i = y * PREVIEW_WIDTH + x;
        const a = alpha[i]! / 255;
        image.data[4 * i] = sky[0]! + (255 - sky[0]!) * a;
        image.data[4 * i + 1] = sky[1]! + (255 - sky[1]!) * a;
        image.data[4 * i + 2] = sky[2]! * (1 - a);
        image.data[4 * i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });
</script>

<figure class="preview" class:loading aria-busy={loading}>
  {#if failed}
    <div class="empty">{t('No preview')}</div>
  {:else if preview?.imageUrl}
    <img
      src={preview.imageUrl}
      alt={t('Map preview')}
      width={PREVIEW_WIDTH}
      height={PREVIEW_HEIGHT}
    />
  {:else}
    <canvas
      bind:this={canvas}
      width={PREVIEW_WIDTH}
      height={PREVIEW_HEIGHT}
      aria-label={t('Map preview')}
    ></canvas>
  {/if}
  {#if preview?.maxHedgehogs}
    <figcaption>{t('room for {n} hedgehogs', { n: preview.maxHedgehogs })}</figcaption>
  {/if}
</figure>

<style>
  .preview {
    margin: 0;
    width: 100%;
    max-width: 256px;
  }
  canvas,
  img,
  .empty {
    display: block;
    width: 100%;
    aspect-ratio: 2 / 1;
    border-radius: 6px;
    background: linear-gradient(rgb(66, 115, 225), rgb(0, 0, 192));
    transition: opacity 0.15s;
  }
  .loading canvas,
  .loading img {
    opacity: 0.6;
  }
  .empty {
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 13px;
  }
  figcaption {
    font-size: 12px;
    color: var(--muted);
    margin-top: 3px;
  }
</style>
