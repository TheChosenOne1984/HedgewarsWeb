<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { app } from '../lib/app.svelte';
  import Chat from '../components/Chat.svelte';

  let roomName = $state('');
  /** generated maps by their room list names */
  const GENERATED: Record<string, string> = {
    '+rnd+': 'Random terrain',
    '+maze+': 'Maze',
    '+perlin+': 'Perlin',
    '+drawn+': 'Drawn map',
    '+forts+': 'Forts',
    '+wfc+': 'Tiles (WFC)',
  };
  const mapLabel = (map: string) => (GENERATED[map] ? t(GENERATED[map]) : map);

  let rooms = $derived((app.tick, [...app.client.rooms]));
  let players = $derived(
    (app.tick,
    [...app.client.players.values()]
      .map((p) => ({ nick: p.nick, flags: new Set(p.flags) }))
      .sort((a, b) => a.nick.localeCompare(b.nick))),
  );

  function create(e: Event) {
    e.preventDefault();
    if (roomName.trim()) app.client.createRoom(roomName.trim());
  }
</script>

{#if app.client.serverMessage}
  <div class="motd panel">{app.client.serverMessage.replace(/<[^>]+>/g, '')}</div>
{/if}

<div class="lobby">
  <section class="panel rooms">
    <div class="bar">
      <h2>{t('Rooms')}</h2>
      <button onclick={() => app.client.refreshRooms()}>{t('Refresh')}</button>
    </div>
    <table>
      <thead
        ><tr
          ><th>{t('Room')}</th><th>{t('Players')}</th><th>{t('Teams')}</th><th>{t('Owner')}</th><th
            >{t('Map')}</th
          ><th>{t('Style')}</th><th></th></tr
        ></thead
      >
      <tbody>
        {#each rooms as r (r.name)}
          <tr class:ingame={r.flags.includes('g')}>
            <td>{r.name}{r.flags.includes('p') ? ' 🔒' : ''}</td>
            <td>{r.players}</td>
            <td>{r.teams}</td>
            <td>{r.owner}</td>
            <td>{mapLabel(r.map)}</td>
            <td>{r.script}</td>
            <td
              ><button onclick={() => app.client.joinRoom(r.name)}
                >{r.flags.includes('g') ? t('Watch') : t('Join')}</button
              ></td
            >
          </tr>
        {:else}
          <tr><td colspan="7" class="muted">{t('No rooms yet. Create one!')}</td></tr>
        {/each}
      </tbody>
    </table>
    <form onsubmit={create}>
      <input bind:value={roomName} placeholder={t('New room name')} maxlength="40" />
      <button class="primary">{t('Create room')}</button>
    </form>
  </section>

  <section class="panel players">
    <h2>{t('Players ({n})', { n: players.length })}</h2>
    <ul>
      {#each players as p (p.nick)}
        <li>
          {p.nick}{p.flags.has('i') ? ` · ${t('in room')}` : ''}{p.flags.has('g')
            ? ` · ${t('playing')}`
            : ''}
        </li>
      {/each}
    </ul>
  </section>

  <div class="chat"><Chat scope="lobby" /></div>
</div>

<style>
  .lobby {
    display: grid;
    grid-template-columns: 1fr 240px;
    gap: 16px;
  }
  .chat {
    grid-column: 1 / -1;
  }
  @media (max-width: 760px) {
    .lobby {
      grid-template-columns: 1fr;
    }
  }
  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 17px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  th,
  td {
    text-align: left;
    padding: 4px 6px;
    border-bottom: 1px solid var(--line);
  }
  .ingame {
    color: var(--muted);
  }
  .muted {
    color: var(--muted);
  }
  form {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 360px;
    overflow-y: auto;
  }
  .motd {
    margin-bottom: 12px;
    color: var(--muted);
  }
</style>
