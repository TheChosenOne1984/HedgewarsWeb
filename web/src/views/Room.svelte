<script lang="ts">
  import { app, choiceToRoomSettings } from '../lib/app.svelte';
  import { TEAM_COLORS } from '../lib/engine/frontend-data.generated';
  import Chat from '../components/Chat.svelte';
  import GameSettings from '../components/GameSettings.svelte';
  import MapPreview from '../components/MapPreview.svelte';
  import type { PreviewParams } from '../lib/engine/preview';
  import { previewParamsFromRoom } from '../lib/game/session';

  let room = $derived((app.tick, app.client.room));
  let teams = $derived((app.tick, [...(app.client.room?.teams ?? [])]));
  let players = $derived((app.tick, [...(app.client.room?.players ?? [])]));
  let isMaster = $derived((app.tick, app.client.room?.isMaster ?? false));
  let ready = $derived(
    (app.tick, app.client.players.get(app.client.nick)?.flags.has('r') ?? false),
  );
  let config = $derived((app.tick, app.client.room?.config ?? new Map<string, string[]>()));
  let addable = $derived(app.teams.filter((t) => !teams.some((rt) => rt.name === t.name)));
  let selected = $state('');
  let previewParams = $state<PreviewParams | null>(null);
  $effect(() => {
    void config;
    const r = app.client.room;
    if (r) void previewParamsFromRoom(r).then((p) => (previewParams = p));
  });
  let sentConfig = false;

  // as room master, publish the full room config once (GameCFGWidget::fullNetConfig)
  $effect(() => {
    if (isMaster && !sentConfig) {
      sentConfig = true;
      app.client.sendRoomConfig(choiceToRoomSettings(app.choice));
    }
  });

  function publish() {
    app.client.sendRoomConfig(choiceToRoomSettings(app.choice));
  }

  function addTeam() {
    const t = app.teams.find((x) => x.name === (selected || addable[0]?.name));
    if (t) app.client.addOwnTeam({ ...t, owner: app.client.nick });
  }

  const color = (i: number) => '#' + (TEAM_COLORS[i] ?? 0).toString(16).padStart(6, '0');
  const flag = (nick: string, f: string) => app.client.players.get(nick)?.flags.has(f) ?? false;
  const cfg = (k: string) => (config.get(k) ?? [])[0] ?? '';
</script>

{#if room}
  <div class="bar">
    <h2>{room.name}</h2>
    <button onclick={() => app.client.leaveRoom()}>Leave room</button>
  </div>

  <div class="room">
    <section class="panel">
      <h3>Teams</h3>
      {#each teams as t (t.name)}
        <div class="team">
          <span class="swatch" style:background={color(t.colorIndex)}></span>
          <b>{t.name}</b>
          <span class="muted">{t.owner}{t.difficulty ? ` · bot ${t.difficulty}` : ''}</span>
          {#if isMaster}
            <select
              value={t.hedgehogsNumber}
              onchange={(e) => app.client.setHedgehogsNumber(t.name, Number(e.currentTarget.value))}
            >
              {#each [1, 2, 3, 4, 5, 6, 7, 8] as n (n)}<option value={n}>{n} hogs</option>{/each}
            </select>
            <select
              value={t.colorIndex}
              onchange={(e) => app.client.setTeamColor(t.name, Number(e.currentTarget.value))}
            >
              {#each TEAM_COLORS.keys() as i (i)}<option value={i}>colour {i + 1}</option>{/each}
            </select>
          {:else}
            <span class="muted">{t.hedgehogsNumber} hogs</span>
          {/if}
          {#if t.owner === app.client.nick}
            <button onclick={() => app.client.removeTeam(t.name)}>Remove</button>
          {/if}
        </div>
      {:else}
        <p class="muted">No teams yet.</p>
      {/each}
      {#if addable.length > 0}
        <div class="add">
          <select bind:value={selected}>
            {#each addable as t (t.name)}<option value={t.name}
                >{t.name}{t.difficulty ? ' (bot)' : ''}</option
              >{/each}
          </select>
          <button onclick={addTeam}>Add team</button>
        </div>
      {/if}
    </section>

    <section class="panel">
      <h3>Players</h3>
      <ul>
        {#each players as p (p)}
          <li>
            {flag(p, 'r') ? '✔' : '·'}
            {p}{flag(p, 'h') ? ' (room master)' : ''}
          </li>
        {/each}
      </ul>
      <div class="actions">
        <button class:primary={!ready} onclick={() => app.client.toggleReady()}
          >{ready ? 'Not ready' : 'Ready'}</button
        >
        {#if isMaster}
          <button class="primary" disabled={teams.length < 2} onclick={() => app.client.startGame()}
            >Start game</button
          >
        {/if}
      </div>
    </section>

    <section class="panel settings">
      <h3>Game</h3>
      <div class="game">
        <MapPreview params={previewParams} />
        <div class="options">
          {#if isMaster}
            <GameSettings bind:choice={app.choice} onchange={publish} />
          {:else}
            <dl>
              <dt>Scheme</dt>
              <dd>{cfg('SCHEME')}</dd>
              <dt>Weapons</dt>
              <dd>{cfg('AMMO')}</dd>
              <dt>Style</dt>
              <dd>{cfg('SCRIPT')}</dd>
              <dt>Theme</dt>
              <dd>{cfg('THEME')}</dd>
              <dt>Map</dt>
              <dd>{cfg('MAP')} (generator {cfg('MAPGEN')})</dd>
            </dl>
          {/if}
        </div>
      </div>
    </section>

    <div class="chat"><Chat scope="room" /></div>
  </div>
{/if}

<style>
  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .room {
    display: grid;
    grid-template-columns: 1fr 260px;
    gap: 16px;
  }
  .game {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .game > :global(.preview) {
    flex: 0 1 256px;
  }
  .options {
    flex: 1 1 300px;
    min-width: 0;
  }
  .settings,
  .chat {
    grid-column: 1 / -1;
  }
  @media (max-width: 760px) {
    .room {
      grid-template-columns: 1fr;
    }
  }
  h2 {
    font-size: 19px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 16px;
  }
  .team {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    flex-wrap: wrap;
  }
  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    display: inline-block;
  }
  .muted {
    color: var(--muted);
  }
  .add,
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 12px;
    margin: 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
</style>
