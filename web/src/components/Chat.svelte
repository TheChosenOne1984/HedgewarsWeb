<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { app } from '../lib/app.svelte';

  let { scope }: { scope: 'lobby' | 'room' } = $props();
  let text = $state('');
  let log: HTMLElement | undefined = $state();
  let lines = $derived(app.chat.filter((l) => l.scope === scope));

  $effect(() => {
    void lines.length;
    if (log) log.scrollTop = log.scrollHeight;
  });

  function send(e: Event) {
    e.preventDefault();
    if (text.trim()) app.client.chat(text.trim());
    text = '';
  }
</script>

<div class="chat panel">
  <div class="log" bind:this={log}>
    {#each lines as l, i (i)}
      <div class={l.kind}>
        {#if l.kind === 'chat'}<b>{l.nick}:</b> {l.text}
        {:else if l.kind === 'join'}<i>{l.nick} {t(l.text)}</i>
        {:else if l.kind === 'leave'}<i>{l.nick} {t('has left')}{l.text ? ` (${l.text})` : ''}</i>
        {:else}<i>{l.nick ? `${l.nick}: ` : ''}{l.text}</i>{/if}
      </div>
    {/each}
  </div>
  <form onsubmit={send}>
    <input bind:value={text} placeholder={t('Say something…')} maxlength="400" />
    <button>{t('Send')}</button>
  </form>
</div>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    min-height: 220px;
    max-height: 360px;
  }
  .log {
    flex: 1;
    overflow-y: auto;
    font-size: 14px;
    line-height: 1.4;
  }
  .server,
  .notice,
  .join,
  .leave {
    color: var(--muted);
  }
  form {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  input {
    flex: 1;
  }
</style>
