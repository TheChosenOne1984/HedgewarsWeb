<script lang="ts">
  import { t as tr } from '../lib/i18n.svelte';
  import { untrack } from 'svelte';
  import { app, choiceToRoomSettings, type GameChoice } from '../lib/app.svelte';
  import { TEAM_COLORS } from '../lib/engine/frontend-data.generated';
  import Chat from '../components/Chat.svelte';
  import GameSettings from '../components/GameSettings.svelte';
  import MapPreview from '../components/MapPreview.svelte';
  import type { PreviewParams } from '../lib/engine/preview';
  import { previewParamsFromRoom } from '../lib/game/session';

  let room = $derived((app.tick, app.client.room ? { ...app.client.room } : null));
  // The client mutates its room state in place; copy it on every change so
  // that keyed {#each} blocks see new values (same object = no update).
  let teams = $derived((app.tick, (app.client.room?.teams ?? []).map((t) => ({ ...t }))));
  let players = $derived(
    (app.tick,
    (app.client.room?.players ?? []).map((nick) => {
      const flags = app.client.players.get(nick)?.flags;
      return { nick, ready: flags?.has('r') ?? false, master: flags?.has('h') ?? false };
    })),
  );
  let isMaster = $derived((app.tick, app.client.room?.isMaster ?? false));
  let ready = $derived(
    (app.tick, app.client.players.get(app.client.nick)?.flags.has('r') ?? false),
  );
  // a copy, so that views and the map preview see changes (the client mutates the map)
  let config = $derived((app.tick, new Map(app.client.room?.config ?? [])));
  let addable = $derived(app.teams.filter((t) => !teams.some((rt) => rt.name === t.name)));
  let selected = $state('');
  let previewParams = $state<PreviewParams | null>(null);
  $effect(() => {
    void config;
    const r = app.client.room;
    if (r) void previewParamsFromRoom(r).then((p) => (previewParams = p));
  });
  let sentConfig = false;
  let wasGuest = false;

  // as the room's creator, publish the full room config once
  // (GameCFGWidget::fullNetConfig); as a player who takes over from a room
  // master who left, keep the room's settings and edit those
  $effect(() => {
    if (!isMaster) wasGuest = true;
    else if (!sentConfig) {
      sentConfig = true;
      if (wasGuest)
        app.choice = choiceFromConfig(
          untrack(() => config),
          app.choice,
        );
      else app.client.sendRoomConfig(choiceToRoomSettings(app.choice));
    }
  });

  /** the room's weapon set; one we do not have is kept for this session */
  function adoptAmmo(c: Map<string, string[]>): string | undefined {
    const [name, ammo] = c.get('AMMO') ?? [];
    if (name && ammo) app.noteRoomAmmo({ name, ammo });
    return name;
  }

  /** the settings of a room as the room master's choices (for the settings form) */
  function choiceFromConfig(c: Map<string, string[]>, current: GameChoice): GameChoice {
    const get = (k: string) => (c.get(k) ?? [])[0];
    const map = get('MAP') ?? '+rnd+';
    const mapTypes: Record<string, GameChoice['mapType']> = {
      '0': 'random',
      '1': 'maze',
      '2': 'perlin',
      '5': 'wfc',
    };
    return {
      ...current,
      schemeName: get('SCHEME') ?? current.schemeName,
      ammoName: adoptAmmo(c) ?? current.ammoName,
      style: get('SCRIPT') ?? current.style,
      theme: get('THEME') ?? current.theme,
      seed: get('SEED') ?? current.seed,
      mapType: !map.startsWith('+') ? 'map' : (mapTypes[get('MAPGEN') ?? '0'] ?? current.mapType),
      map: !map.startsWith('+') ? map : current.map,
    };
  }

  function publish() {
    app.client.sendRoomConfig(choiceToRoomSettings(app.choice));
  }

  function addTeam() {
    const t = app.teams.find((x) => x.name === (selected || addable[0]?.name));
    if (t) app.client.addOwnTeam({ ...t, owner: app.client.nick });
  }

  const color = (i: number) => '#' + (TEAM_COLORS[i] ?? 0).toString(16).padStart(6, '0');
  const cfg = (k: string) => (config.get(k) ?? [])[0] ?? '';
  /** the map as the room master chose it: a fixed map's name or the generator */
  function mapLabel(): string {
    const map = cfg('MAP');
    if (map && !map.startsWith('+')) return map;
    const generators = ['Random terrain', 'Maze', 'Perlin', 'Drawn map', 'Forts', 'Tiles (WFC)'];
    return tr(generators[Number(cfg('MAPGEN'))] ?? 'Random terrain');
  }
</script>

{#if room}
  <div class="bar">
    <h2>{room.name}</h2>
    <button onclick={() => app.client.leaveRoom()}>{tr('Leave room')}</button>
  </div>

  <div class="room">
    <section class="panel">
      <h3>{tr('Teams')}</h3>
      {#each teams as t (t.name)}
        <div class="team">
          <span class="swatch" style:background={color(t.colorIndex)}></span>
          <b>{t.name}</b>
          <span class="muted"
            >{t.owner}{t.difficulty ? ` · ${tr('bot {n}', { n: t.difficulty })}` : ''}</span
          >
          {#if isMaster}
            <select
              value={t.hedgehogsNumber}
              onchange={(e) => app.client.setHedgehogsNumber(t.name, Number(e.currentTarget.value))}
            >
              {#each [1, 2, 3, 4, 5, 6, 7, 8] as n (n)}<option value={n}
                  >{tr('{n} hogs', { n })}</option
                >{/each}
            </select>
            <select
              value={t.colorIndex}
              onchange={(e) => app.client.setTeamColor(t.name, Number(e.currentTarget.value))}
            >
              {#each TEAM_COLORS.keys() as i (i)}<option value={i}
                  >{tr('colour {n}', { n: i + 1 })}</option
                >{/each}
            </select>
          {:else}
            <span class="muted">{tr('{n} hogs', { n: t.hedgehogsNumber })}</span>
          {/if}
          {#if t.owner === app.client.nick}
            <button onclick={() => app.client.removeTeam(t.name)}>{tr('Remove')}</button>
          {/if}
        </div>
      {:else}
        <p class="muted">{tr('No teams yet.')}</p>
      {/each}
      {#if addable.length > 0}
        <div class="add">
          <select bind:value={selected}>
            {#each addable as t (t.name)}<option value={t.name}
                >{t.name}{t.difficulty ? ` ${tr('(bot)')}` : ''}</option
              >{/each}
          </select>
          <button onclick={addTeam}>{tr('Add team')}</button>
        </div>
      {/if}
    </section>

    <section class="panel">
      <h3>{tr('Players')}</h3>
      <ul>
        {#each players as p (p.nick)}
          <li>
            {p.ready ? '✔' : '·'}
            {p.nick}{p.master ? ` (${tr('room master')})` : ''}
          </li>
        {/each}
      </ul>
      <div class="actions">
        <button class:primary={!ready} onclick={() => app.client.toggleReady()}
          >{ready ? tr('Not ready') : tr('Ready')}</button
        >
        {#if isMaster}
          <button class="primary" disabled={teams.length < 2} onclick={() => app.client.startGame()}
            >{tr('Start game')}</button
          >
        {/if}
      </div>
    </section>

    <section class="panel settings">
      <h3>{tr('Game')}</h3>
      <div class="game">
        <MapPreview params={previewParams} />
        <div class="options">
          {#if isMaster}
            <GameSettings bind:choice={app.choice} onchange={publish} />
          {:else}
            <dl>
              <dt>{tr('Scheme')}</dt>
              <dd>{cfg('SCHEME')}</dd>
              <dt>{tr('Weapons')}</dt>
              <dd>{cfg('AMMO')}</dd>
              <dt>{tr('Style')}</dt>
              <dd>{cfg('SCRIPT')}</dd>
              <dt>{tr('Theme')}</dt>
              <dd>{cfg('THEME')}</dd>
              <dt>{tr('Map')}</dt>
              <dd>{mapLabel()}</dd>
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
