// Lobby/room client for the game server: login, lobby, rooms, chat, teams,
// room config and the engine message relay of a network game.
// Port of the relevant parts of frontend-qt6/net/newnetclient.cpp.

import { t } from '../i18n.svelte';
import {
  clientToRaw,
  gameCfgToProtocol,
  MessageReader,
  parseServerMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type GameCfg,
  type ServerMessage,
  type TeamInfo,
} from '../protocol/messages';

export type ClientState = 'disconnected' | 'connecting' | 'login' | 'lobby' | 'room' | 'game';

/** ROOMS / ROOM ADD: flags, name, players, teams, owner, map, script, scheme,
 * weapons and (protocol >= 60) the room's protocol version */
export interface RoomInfo {
  flags: string;
  name: string;
  players: number;
  teams: number;
  owner: string;
  map: string;
  script: string;
  scheme: string;
  weapons: string;
  protocol: number;
}

/** fields per room in ROOMS, for PROTOCOL_VERSION >= 60 */
export const ROOM_INFO_FIELDS = 10;

export interface RoomTeam {
  name: string;
  owner: string;
  grave: string;
  fort: string;
  voicepack: string;
  flag: string;
  difficulty: number;
  hedgehogs: { name: string; hat: string }[];
  hedgehogsNumber: number;
  colorIndex: number;
}

/** what a room master configures (sendRoomConfig) */
export interface RoomSettings {
  /** name + 44 scheme fields */
  scheme: (string | number | boolean | null)[];
  ammoName: string;
  ammo: string;
  script: string;
  theme: string;
  seed: string;
  templateFilter: number;
  mapgen: number;
  mazeSize: number;
  featureSize: number;
  /** a static map, or '' for a generated one */
  staticMap: string;
}

export interface Player {
  nick: string;
  /** server flags: i in room, h room master, r ready, g in game, u registered, a admin, c contributor */
  flags: Set<string>;
}

export interface ChatLine {
  nick: string;
  text: string;
  /** where it was said */
  scope: 'lobby' | 'room';
  kind: 'chat' | 'server' | 'notice' | 'join' | 'leave';
}

export interface Room {
  name: string;
  players: string[];
  teams: RoomTeam[];
  /** CFG entries as received: name -> values */
  config: Map<string, string[]>;
  isMaster: boolean;
}

export interface NetClientEvents {
  state: (state: ClientState) => void;
  changed: () => void;
  chat: (line: ChatLine) => void;
  /** RUN_GAME: start the engine for the network game */
  runGame: (room: Room) => void;
  /** engine messages from other players (decoded EM payloads) */
  engineMessages: (messages: Uint8Array[]) => void;
  /** ROUND_FINISHED: the game is over for everyone */
  roundFinished: () => void;
  error: (message: string) => void;
  /** the server's BYE, or the connection closed */
  disconnected: (reason: string) => void;
}

const BASE64 = {
  encode(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  decode(text: string): Uint8Array {
    return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  },
};

export function parseRoomInfo(fields: string[]): RoomInfo {
  const [
    flags = '',
    name = '',
    players = '0',
    teams = '0',
    owner = '',
    map = '',
    script = '',
    scheme = '',
    weapons = '',
    protocol = String(PROTOCOL_VERSION),
  ] = fields;
  return {
    flags,
    name,
    players: Number(players),
    teams: Number(teams),
    owner,
    map,
    script,
    scheme,
    weapons,
    protocol: Number(protocol),
  };
}

/** ADD_TEAM fields: name grave fort voicepack flag owner difficulty (hog hat) x 8 */
export function parseTeam(fields: string[]): RoomTeam {
  const [
    name = '',
    grave = '',
    fort = '',
    voicepack = '',
    flag = '',
    owner = '',
    difficulty = '0',
  ] = fields;
  const hedgehogs = [];
  for (let i = 0; i < 8; i++) {
    const hat = fields[8 + 2 * i] ?? '';
    hedgehogs.push({ name: fields[7 + 2 * i] ?? '', hat: hat === '' ? 'NoHat' : hat });
  }
  return {
    name,
    grave,
    fort,
    voicepack,
    flag,
    owner,
    difficulty: Number(difficulty),
    hedgehogs,
    hedgehogsNumber: 4,
    colorIndex: 0,
  };
}

type Listeners = { [K in keyof NetClientEvents]: NetClientEvents[K][] };

export class NetClient {
  state: ClientState = 'disconnected';
  nick = '';
  serverMessage = '';
  players = new Map<string, Player>();
  rooms: RoomInfo[] = [];
  room: Room | null = null;

  private socket: WebSocket | null = null;
  private reader = new MessageReader();
  private decoder = new TextDecoder();
  private wantedNick = '';
  private pendingRoomName = '';
  /** own teams sent with ADD_TEAM, waiting for TEAM_ACCEPTED */
  private pendingTeams = new Map<string, RoomTeam>();
  private listeners: Listeners = {
    state: [],
    changed: [],
    chat: [],
    runGame: [],
    engineMessages: [],
    roundFinished: [],
    error: [],
    disconnected: [],
  };

  on<K extends keyof NetClientEvents>(event: K, fn: NetClientEvents[K]): () => void {
    this.listeners[event].push(fn);
    return () => {
      this.listeners[event] = this.listeners[event].filter((f) => f !== fn) as Listeners[K];
    };
  }

  private emit<K extends keyof NetClientEvents>(event: K, ...args: Parameters<NetClientEvents[K]>) {
    for (const fn of this.listeners[event])
      (fn as (...a: Parameters<NetClientEvents[K]>) => void)(...args);
  }

  private setState(state: ClientState) {
    if (this.state !== state) {
      this.state = state;
      this.emit('state', state);
    }
    this.emit('changed');
  }

  /** Connect to the server's WebSocket listener and log in with `nick`. */
  connect(
    url: string,
    nick: string,
    socketFactory: (url: string) => WebSocket = (u) => new WebSocket(u),
  ) {
    this.wantedNick = nick;
    this.reader = new MessageReader();
    this.decoder = new TextDecoder();
    const ws = socketFactory(url);
    ws.binaryType = 'arraybuffer';
    this.socket = ws;
    this.setState('connecting');
    ws.onmessage = (e) => {
      const text =
        typeof e.data === 'string'
          ? e.data
          : this.decoder.decode(new Uint8Array(e.data), { stream: true });
      for (const raw of this.reader.feed(text)) this.receive(raw);
    };
    ws.onclose = () => this.closed('Connection closed');
    ws.onerror = () => this.emit('error', t('Connection error'));
  }

  disconnect(reason = 'bye') {
    if (this.socket && this.socket.readyState === 1) this.send({ type: 'Quit', args: [reason] });
    this.socket?.close();
    this.closed('Disconnected');
  }

  private closed(reason: string) {
    if (this.state === 'disconnected') return;
    this.socket = null;
    this.room = null;
    this.setState('disconnected');
    this.emit('disconnected', reason);
  }

  send(message: ClientMessage) {
    if (!this.socket || this.socket.readyState !== 1) return;
    this.socket.send(new TextEncoder().encode(clientToRaw(message)));
  }

  // lobby
  chat(text: string) {
    this.send({ type: 'Chat', args: [text] });
    // the server does not echo our own chat; show it like the Qt frontend does
    this.chatLine(this.nick, text);
  }
  createRoom(name: string, password: string | null = null) {
    this.pendingRoomName = name;
    this.send({ type: 'CreateRoom', args: [name, password] });
  }
  joinRoom(name: string, password: string | null = null) {
    this.pendingRoomName = name;
    this.send({ type: 'JoinRoom', args: [name, password] });
  }
  refreshRooms() {
    this.send({ type: 'List', args: [] });
  }

  // room
  leaveRoom(message: string | null = null) {
    this.send({ type: 'Part', args: [message] });
    this.leftRoom();
    this.setState('lobby');
    this.refreshRooms();
  }

  /** room flags (master, ready, ...) belong to the room we are leaving */
  private leftRoom() {
    this.room = null;
    for (const f of ['h', 'r', 'g']) this.player(this.nick).flags.delete(f);
  }

  addTeam(team: TeamInfo) {
    this.send({ type: 'AddTeam', args: [team] });
  }
  removeTeam(name: string) {
    this.send({ type: 'RemoveTeam', args: [name] });
    if (this.room) {
      this.room.teams = this.room.teams.filter((t) => t.name !== name);
      this.emit('changed');
    }
  }
  setHedgehogsNumber(team: string, count: number) {
    this.send({ type: 'SetHedgehogsNumber', args: [team, count] });
    this.updateTeam(team, (t) => (t.hedgehogsNumber = count));
  }
  setTeamColor(team: string, colorIndex: number) {
    this.send({ type: 'SetTeamColor', args: [team, colorIndex] });
    this.updateTeam(team, (t) => (t.colorIndex = colorIndex));
  }
  toggleReady() {
    this.send({ type: 'ToggleReady', args: [] });
  }
  startGame() {
    this.send({ type: 'StartGame', args: [] });
  }
  /**
   * Change a room config entry (room master). The server only sends it to
   * the other players, so keep it in our own room state too, as the Qt
   * frontend keeps its own settings.
   */
  setConfig(cfg: GameCfg) {
    this.send({ type: 'Cfg', args: [cfg] });
    if (this.room) {
      const [name, values] = gameCfgToProtocol(cfg);
      this.room.config.set(name, values);
      this.emit('changed');
    }
  }

  /**
   * Send the complete room config as room master, in the order of
   * GameCFGWidget::fullNetConfig. The map name is only sent for static maps;
   * generated maps are described by MAPGEN.
   */
  sendRoomConfig(c: RoomSettings) {
    const values = c.scheme.slice(1).map((v) => (v === null ? '' : String(v)));
    if (values.length > 0) values[values.length - 1] = '!' + values[values.length - 1];
    const cfgs: GameCfg[] = [
      { type: 'Ammo', args: [c.ammoName, c.ammo] },
      { type: 'Seed', args: [c.seed] },
      { type: 'Template', args: [c.templateFilter] },
      { type: 'Theme', args: [c.theme] },
      { type: 'Scheme', args: [String(c.scheme[0]), values] },
      { type: 'Script', args: [c.script] },
      { type: 'MapGenerator', args: [c.mapgen] },
      { type: 'MazeSize', args: [c.mazeSize] },
      { type: 'FeatureSize', args: [c.featureSize] },
    ];
    if (c.staticMap) cfgs.push({ type: 'MapType', args: [c.staticMap] });
    for (const cfg of cfgs) this.setConfig(cfg);
  }

  /** relay engine output to the other players */
  sendEngineMessages(bytes: Uint8Array) {
    if (bytes.length > 0) this.send({ type: 'EngineMessage', args: [BASE64.encode(bytes)] });
  }

  /** the local engine finished the round */
  roundFinished(correctly: boolean) {
    if (this.state === 'game') {
      this.socket?.send(new TextEncoder().encode(`ROUNDFINISHED\n${correctly ? '1' : '0'}\n\n`));
      this.setState('room');
    }
  }

  private updateTeam(name: string, fn: (t: RoomTeam) => void) {
    const t = this.room?.teams.find((x) => x.name === name);
    if (t) {
      fn(t);
      this.emit('changed');
    }
  }

  private player(nick: string): Player {
    let p = this.players.get(nick);
    if (!p) {
      p = { nick, flags: new Set() };
      this.players.set(nick, p);
    }
    return p;
  }

  private chatLine(nick: string, text: string, kind: ChatLine['kind'] = 'chat') {
    this.emit('chat', { nick, text, kind, scope: this.room ? 'room' : 'lobby' });
  }

  receive(raw: string) {
    let msg: ServerMessage;
    try {
      msg = parseServerMessage(raw);
    } catch (e) {
      this.emit(
        'error',
        t('Unexpected message from server: {text}', { text: (e as Error).message }),
      );
      return;
    }
    this.handle(msg);
  }

  private handle(msg: ServerMessage) {
    switch (msg.type) {
      case 'Connected':
        this.setState('login');
        this.send({ type: 'Nick', args: [this.wantedNick, null] });
        this.send({ type: 'Proto', args: [PROTOCOL_VERSION] });
        return;
      case 'Nick':
        this.nick = msg.args[0];
        return;
      case 'Proto':
        return;
      case 'AskPassword':
        // registered accounts are not supported yet
        this.emit('error', t('This nickname is registered. Please choose another one.'));
        this.disconnect('registered nick');
        return;
      case 'Ping':
        this.send({ type: 'Pong', args: [] });
        return;
      case 'Bye':
        this.emit('error', msg.args[0]);
        this.socket?.close();
        this.closed(msg.args[0]);
        return;
      case 'LobbyJoined':
        for (const nick of msg.args[0]) {
          this.player(nick);
          if (nick === this.nick && this.state === 'login') {
            this.setState('lobby');
            this.refreshRooms();
          } else if (this.state === 'lobby') this.chatLine(nick, 'joined', 'join');
        }
        this.emit('changed');
        return;
      case 'LobbyLeft':
        this.players.delete(msg.args[0]);
        if (!this.room) this.chatLine(msg.args[0], msg.args[1], 'leave');
        this.emit('changed');
        return;
      case 'ChatMsg':
        this.chatLine(msg.args[0], msg.args[1], msg.args[0].startsWith('[') ? 'server' : 'chat');
        return;
      case 'ServerMessage':
        this.serverMessage = msg.args[0];
        this.emit('changed');
        return;
      case 'Notice':
      case 'Warning':
      case 'Error':
        this.chatLine('', msg.args[0], 'notice');
        // errors and warnings answer something the player did (a rejected
        // team, a game that cannot start): show them, not only in the chat
        if (msg.type !== 'Notice') this.emit('error', msg.args[0]);
        return;
      case 'ClientFlags': {
        const [spec, nicks] = msg.args;
        const add = spec.startsWith('+');
        for (const nick of nicks) {
          const p = this.player(nick);
          for (const f of spec.slice(1)) {
            if (add) p.flags.add(f);
            else p.flags.delete(f);
          }
          if (nick === this.nick && this.room && spec.includes('h')) this.room.isMaster = add;
        }
        this.emit('changed');
        return;
      }
      case 'Rooms': {
        const fields = msg.args[0];
        this.rooms = [];
        for (let i = 0; i + ROOM_INFO_FIELDS <= fields.length; i += ROOM_INFO_FIELDS)
          this.rooms.push(parseRoomInfo(fields.slice(i, i + ROOM_INFO_FIELDS)));
        this.emit('changed');
        return;
      }
      case 'RoomAdd':
        this.rooms.push(parseRoomInfo(msg.args[0]));
        this.emit('changed');
        return;
      case 'RoomRemove':
        this.rooms = this.rooms.filter((r) => r.name !== msg.args[0]);
        this.emit('changed');
        return;
      case 'RoomUpdated': {
        const info = parseRoomInfo(msg.args[1]);
        const i = this.rooms.findIndex((r) => r.name === msg.args[0]);
        if (i >= 0) this.rooms[i] = info;
        if (this.room && this.room.name === msg.args[0]) this.room.name = info.name;
        this.emit('changed');
        return;
      }
      case 'Joining':
        this.room = {
          name: msg.args[0],
          players: [],
          teams: [],
          config: new Map(),
          isMaster: false,
        };
        this.setState('room');
        return;
      case 'RoomJoined':
        if (!this.room) {
          // the server sends no JOINING: JOINED with our own nick puts us into
          // the room we asked to create or join
          if (!msg.args[0].includes(this.nick)) return;
          this.room = {
            name: this.pendingRoomName,
            players: [],
            teams: [],
            config: new Map(),
            isMaster: false,
          };
          this.setState('room');
        }
        for (const nick of msg.args[0]) {
          if (!this.room.players.includes(nick)) this.room.players.push(nick);
          if (nick !== this.nick) this.chatLine(nick, 'joined the room', 'join');
        }
        this.room.isMaster = this.player(this.nick).flags.has('h');
        this.emit('changed');
        return;
      case 'RoomLeft':
        if (!this.room) return;
        this.room.players = this.room.players.filter((n) => n !== msg.args[0]);
        this.chatLine(msg.args[0], msg.args[1], 'leave');
        this.emit('changed');
        return;
      case 'RoomAbandoned':
      case 'Kicked':
        this.leftRoom();
        this.setState('lobby');
        this.chatLine(
          '',
          msg.type === 'Kicked' ? 'You were kicked from the room' : 'Room destroyed',
          'notice',
        );
        this.refreshRooms();
        return;
      case 'TeamAdd':
        this.room?.teams.push(parseTeam(msg.args[0]));
        this.emit('changed');
        return;
      case 'TeamAccepted': {
        const team = this.pendingTeams.get(msg.args[0]);
        this.pendingTeams.delete(msg.args[0]);
        if (team && this.room) this.room.teams.push(team);
        this.emit('changed');
        return;
      }
      case 'TeamRemove':
        if (this.room) this.room.teams = this.room.teams.filter((t) => t.name !== msg.args[0]);
        this.emit('changed');
        return;
      case 'TeamColor':
        this.updateTeam(msg.args[0], (t) => (t.colorIndex = msg.args[1]));
        return;
      case 'HedgehogsNumber':
        this.updateTeam(msg.args[0], (t) => (t.hedgehogsNumber = msg.args[1]));
        return;
      case 'ConfigEntry': {
        const [name, values] = msg.args;
        if (name === 'FULLMAPCONFIG') {
          // feature size, map, map generator, maze size, seed, template
          // (GameCFGWidget::setParam / HWMapContainer::setAllMapParameters)
          const keys = ['FEATURE_SIZE', 'MAP', 'MAPGEN', 'MAZE_SIZE', 'SEED', 'TEMPLATE'];
          keys.forEach((k, i) => this.room?.config.set(k, [values[i] ?? '']));
        } else {
          this.room?.config.set(name, values);
        }
        this.emit('changed');
        return;
      }
      case 'RoomControlAccess':
        return;
      case 'RunGame':
        if (!this.room) return;
        this.setState('game');
        this.emit('runGame', this.room);
        return;
      case 'ForwardEngineMessage':
        this.emit(
          'engineMessages',
          msg.args[0].map((b) => BASE64.decode(b)),
        );
        return;
      case 'RoundFinished':
        this.emit('roundFinished');
        return;
      default:
        return;
    }
  }

  /**
   * Add our own team. It joins the room's team list when the server accepts
   * it (TEAM_ACCEPTED), not before: by then all teams added earlier have
   * arrived, so every client has the same team order (as frontend-qt6 does).
   * The server assigns colour and hedgehog number (TEAM_COLOR, HH_NUM).
   */
  addOwnTeam(team: TeamInfo) {
    if (!this.room) return;
    this.pendingTeams.set(team.name, {
      name: team.name,
      owner: this.nick,
      grave: team.grave,
      fort: team.fort,
      voicepack: team.voicePack,
      flag: team.flag,
      difficulty: team.difficulty,
      hedgehogs: team.hedgehogs.map((h) => ({ ...h })),
      hedgehogsNumber: 4,
      colorIndex: 0,
    });
    this.addTeam(team);
  }
}
