// Application state shared by the views.

import { defaultAmmo, defaultScheme, MAPGEN } from './engine/config';
import { DEFAULT_AMMO_SETS, DEFAULT_SCHEMES } from './engine/frontend-data.generated';
import { PreviewService, type PreviewParams } from './engine/preview';
import { NetClient, type ChatLine, type RoomSettings } from './net/client';
import type { TeamInfo } from './protocol/messages';
import { setLocale, t, type Locale } from './i18n.svelte';
import { load, save } from './storage';

export type Screen = 'start' | 'lobby' | 'room' | 'game' | 'teams' | 'local' | 'settings';

export interface Catalog {
  themes: string[];
  maps: string[];
  hats: string[];
  graves: string[];
  flags: string[];
  forts: string[];
  voices: string[];
  styles: string[];
}

export interface Settings {
  nick: string;
  server: string;
  volume: number;
  sound: boolean;
  music: boolean;
  /** user interface and engine language ('' = from the browser) */
  locale: Locale | '';
  /** key bindings that differ from the defaults (action -> engine key name) */
  binds: Record<string, string>;
}

/** where the static assets live (engine module and asset packs) */
export const ASSETS = {
  engine: new URL('engine/hwengine.mjs', document.baseURI).href,
  packs: new URL('packs/', document.baseURI).href,
};

/** renders map previews with a second engine instance */
export const previews = new PreviewService(ASSETS.engine, ASSETS.packs);

function defaultServer(): string {
  const param = new URLSearchParams(location.search).get('server');
  if (param) return param;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

export function newTeam(name: string): TeamInfo {
  return {
    owner: '',
    name,
    color: 0,
    grave: 'Statue',
    fort: 'Plane',
    voicePack: 'Default',
    flag: 'hedgewars',
    difficulty: 0,
    hedgehogs: Array.from({ length: 8 }, (_, i) => ({ name: `${name} ${i + 1}`, hat: 'NoHat' })),
  };
}

export function randomSeed(): string {
  const hex = (n: number) =>
    Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
  return `{${hex(4)}-${hex(2)}-${hex(2)}-${hex(2)}-${hex(6)}}`;
}

/** room settings the user picks (as room master or for a local game) */
export interface GameChoice {
  schemeName: string;
  ammoName: string;
  style: string;
  theme: string;
  mapType: 'random' | 'maze' | 'perlin' | 'wfc' | 'map';
  map: string;
  seed: string;
}

export function choiceToRoomSettings(c: GameChoice): RoomSettings {
  const mapgen = {
    random: MAPGEN.regular,
    maze: MAPGEN.maze,
    perlin: MAPGEN.perlin,
    wfc: MAPGEN.wfc,
    map: MAPGEN.map,
  }[c.mapType];
  return {
    scheme: defaultScheme(c.schemeName),
    ammoName: c.ammoName,
    ammo: defaultAmmo(c.ammoName),
    script: c.style,
    theme: c.theme,
    seed: c.seed,
    templateFilter: 0,
    mapgen,
    mazeSize: 0,
    featureSize: 12,
    staticMap: c.mapType === 'map' ? c.map : '',
  };
}

export function previewParamsFromSettings(s: RoomSettings): PreviewParams {
  return {
    mapgen: s.staticMap ? MAPGEN.map : s.mapgen,
    seed: s.seed,
    templateFilter: s.templateFilter,
    featureSize: s.featureSize,
    mazeSize: s.mazeSize,
    script: s.script,
    scriptParam: String(s.scheme[s.scheme.length - 1] ?? ''),
    staticMap: s.staticMap,
  };
}

class AppState {
  readonly client = new NetClient();
  screen = $state<Screen>('start');
  /** bumped whenever the client's state changes; views derive from it */
  tick = $state(0);
  chat = $state<ChatLine[]>([]);
  error = $state('');
  status = $state('');
  teams = $state<TeamInfo[]>([]);
  /** result of the last game: engine exit code and whether it reached its end */
  lastGame = $state<{ code: number; finished: boolean } | null>(null);
  /** teams of the local game about to start */
  localTeams = $state<TeamInfo[]>([]);
  catalog = $state<Catalog | null>(null);
  settings = $state<Settings>({
    nick: '',
    server: defaultServer(),
    volume: 70,
    sound: true,
    music: false,
    locale: '',
    binds: {},
  });
  /** the screen to return to from the settings and team editor */
  previousScreen = $state<Screen>('start');
  choice = $state<GameChoice>({
    schemeName: String(DEFAULT_SCHEMES[0]![0]),
    ammoName: DEFAULT_AMMO_SETS[0]!.name,
    style: 'Normal',
    theme: 'Nature',
    mapType: 'random',
    map: 'Bamboo',
    seed: randomSeed(),
  });

  constructor() {
    const c = this.client;
    c.on('changed', () => this.tick++);
    c.on('chat', (line) => {
      this.chat = [...this.chat.slice(-199), line];
    });
    c.on('error', (e) => {
      // the server limits reconnects per address; failed attempts do not
      // count, so try again until it lets us in
      if (e === 'Reconnected too fast') this.retryConnect();
      else this.error = e;
    });
    c.on('state', (s) => {
      if (s === 'lobby') {
        this.stopRetry();
        this.error = '';
        this.screen = 'lobby';
      } else if (s === 'room') this.screen = 'room';
      else if (s === 'game') this.screen = 'game';
      else if (s === 'disconnected' && ['lobby', 'room', 'game'].includes(this.screen))
        this.screen = 'start';
    });
  }

  async init() {
    this.settings = { ...this.settings, ...(await load<Partial<Settings>>('settings', {})) };
    setLocale(this.settings.locale || undefined);
    if (new URLSearchParams(location.search).get('server')) this.settings.server = defaultServer();
    // team names must be unique in a room: give the first-run teams a number
    const n = 100 + Math.floor(Math.random() * 900);
    this.teams = await load<TeamInfo[]>('teams', [
      newTeam(`Hedgehogs ${n}`),
      { ...newTeam(`Bots ${n}`), difficulty: 3 },
    ]);
    try {
      this.catalog = (await (await fetch(ASSETS.packs + 'catalog.json')).json()) as Catalog;
    } catch {
      this.catalog = null;
    }
  }

  saveTeams() {
    void save('teams', this.teams);
  }

  saveSettings() {
    void save('settings', $state.snapshot(this.settings));
  }

  /** open the settings or team editor, coming back to the current screen */
  open(screen: 'settings' | 'teams') {
    if (this.screen !== 'settings' && this.screen !== 'teams') this.previousScreen = this.screen;
    this.screen = screen;
  }

  back() {
    const s = this.previousScreen;
    const connected = this.client.state !== 'disconnected';
    this.screen = s === 'lobby' || s === 'room' ? (connected ? s : 'start') : s;
  }

  private retryTimer: ReturnType<typeof setInterval> | null = null;

  private retryConnect() {
    this.stopRetry();
    let seconds = 15;
    const show = () =>
      (this.error = t(
        'Too many connections from your address in a short time. Connecting again in {n} s…',
        { n: seconds },
      ));
    show();
    this.retryTimer = setInterval(() => {
      seconds--;
      if (seconds > 0) show();
      else {
        this.stopRetry();
        this.client.connect(this.settings.server, this.settings.nick || 'Guest');
      }
    }, 1000);
  }

  private stopRetry() {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = null;
  }

  /** close the error notice (and stop retrying to connect) */
  dismissError() {
    this.stopRetry();
    this.error = '';
  }

  connect() {
    this.stopRetry();
    this.error = '';
    this.chat = [];
    this.saveSettings();
    this.client.connect(this.settings.server, this.settings.nick || 'Guest');
  }
}

export const app = new AppState();
