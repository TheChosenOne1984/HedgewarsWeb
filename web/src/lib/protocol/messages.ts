// Hedgewars network protocol: message types, client message serialisation
// and server message parsing.
//
// Port of rust/hedgewars-network-protocol (messages.rs, parser.rs), which is
// the reference; test/protocol.test.ts checks this module against golden
// vectors exported from it (test/protocol-golden.json).
//
// A message is a list of lines terminated by an empty line: "A\nB\n\n".

export const PROTOCOL_VERSION = 60;

export type ServerVar =
  | { type: 'MOTDNew'; args: [string] }
  | { type: 'MOTDOld'; args: [string] }
  | { type: 'LatestProto'; args: [number] };

export type VoteType =
  | { type: 'Kick'; args: [string] }
  | { type: 'Map'; args: [string | null] }
  | { type: 'Pause'; args: [] }
  | { type: 'NewSeed'; args: [] }
  | { type: 'HedgehogsPerTeam'; args: [number] };

export type GameCfg =
  | { type: 'FeatureSize'; args: [number] }
  | { type: 'MapType'; args: [string] }
  | { type: 'MapGenerator'; args: [number] }
  | { type: 'MazeSize'; args: [number] }
  | { type: 'Seed'; args: [string] }
  | { type: 'Template'; args: [number] }
  | { type: 'Ammo'; args: [string, string | null] }
  | { type: 'Scheme'; args: [string, string[]] }
  | { type: 'Script'; args: [string] }
  | { type: 'Theme'; args: [string] }
  | { type: 'DrawnMap'; args: [string] };

export interface HedgehogInfo {
  name: string;
  hat: string;
}

export interface TeamInfo {
  owner: string;
  name: string;
  color: number;
  grave: string;
  fort: string;
  voicePack: string;
  flag: string;
  difficulty: number;
  /** always 8 entries (MAX_HEDGEHOGS_PER_TEAM) */
  hedgehogs: HedgehogInfo[];
}

export const MAX_HEDGEHOGS_PER_TEAM = 8;

export type ClientMessage =
  | { type: 'Ping'; args: [] }
  | { type: 'Pong'; args: [] }
  | { type: 'Quit'; args: [string | null] }
  | { type: 'Global'; args: [string] }
  | { type: 'Watch'; args: [number] }
  | { type: 'ToggleServerRegisteredOnly'; args: [] }
  | { type: 'SuperPower'; args: [] }
  | { type: 'Info'; args: [string] }
  | { type: 'Help'; args: [] }
  | { type: 'Nick'; args: [string, string | null] }
  | { type: 'Proto'; args: [number] }
  | { type: 'Password'; args: [string, string] }
  | { type: 'LegacyPassword'; args: [string] }
  | { type: 'Checker'; args: [number, string, string] }
  | { type: 'List'; args: [] }
  | { type: 'Chat'; args: [string] }
  | { type: 'CreateRoom'; args: [string, string | null] }
  | { type: 'JoinRoom'; args: [string, string | null] }
  | { type: 'Follow'; args: [string] }
  | { type: 'Rnd'; args: [string[]] }
  | { type: 'Kick'; args: [string] }
  | { type: 'Ban'; args: [string, string, number] }
  | { type: 'BanIp'; args: [string, string, number] }
  | { type: 'BanNick'; args: [string, string, number] }
  | { type: 'RoomBan'; args: [string] }
  | { type: 'BanList'; args: [] }
  | { type: 'Unban'; args: [string] }
  | { type: 'SetServerVar'; args: [ServerVar] }
  | { type: 'GetServerVar'; args: [] }
  | { type: 'ClearAccountsCache'; args: [] }
  | { type: 'RestartServer'; args: [] }
  | { type: 'RestartServerConfirm'; args: [] }
  | { type: 'Stats'; args: [] }
  | { type: 'Part'; args: [string | null] }
  | { type: 'Cfg'; args: [GameCfg] }
  | { type: 'AddTeam'; args: [TeamInfo] }
  | { type: 'RemoveTeam'; args: [string] }
  | { type: 'SetHedgehogsNumber'; args: [string, number] }
  | { type: 'SetTeamColor'; args: [string, number] }
  | { type: 'ToggleReady'; args: [] }
  | { type: 'StartGame'; args: [] }
  | { type: 'EngineMessage'; args: [string] }
  | { type: 'RoundFinished'; args: [] }
  | { type: 'ToggleRestrictJoin'; args: [] }
  | { type: 'ToggleRestrictTeams'; args: [] }
  | { type: 'ToggleRegisteredOnly'; args: [] }
  | { type: 'RoomName'; args: [string] }
  | { type: 'Delegate'; args: [string] }
  | { type: 'TeamChat'; args: [string] }
  | { type: 'MaxTeams'; args: [number] }
  | { type: 'Fix'; args: [] }
  | { type: 'Unfix'; args: [] }
  | { type: 'Greeting'; args: [string | null] }
  | { type: 'CallVote'; args: [VoteType | null] }
  | { type: 'Vote'; args: [boolean] }
  | { type: 'ForceVote'; args: [boolean] }
  | { type: 'Save'; args: [string, string] }
  | { type: 'Delete'; args: [string] }
  | { type: 'SaveRoom'; args: [string] }
  | { type: 'LoadRoom'; args: [string] }
  | { type: 'CheckerReady'; args: [] }
  | { type: 'CheckedOk'; args: [string[]] }
  | { type: 'CheckedFail'; args: [string] }
  | { type: 'Malformed'; args: [string[]] };

export type ServerMessage =
  | { type: 'Connected'; args: [string, number] }
  | { type: 'Redirect'; args: [number] }
  | { type: 'Ping'; args: [] }
  | { type: 'Pong'; args: [] }
  | { type: 'Bye'; args: [string] }
  | { type: 'Nick'; args: [string] }
  | { type: 'Token'; args: [string] }
  | { type: 'Proto'; args: [number] }
  | { type: 'AskPassword'; args: [string] }
  | { type: 'ServerAuth'; args: [string] }
  | { type: 'AdminAccess'; args: [] }
  | { type: 'LogonPassed'; args: [] }
  | { type: 'LobbyLeft'; args: [string, string] }
  | { type: 'LobbyJoined'; args: [string[]] }
  | { type: 'ChatMsg'; args: [string, string] }
  | { type: 'ClientFlags'; args: [string, string[]] }
  | { type: 'Rooms'; args: [string[]] }
  | { type: 'RoomAdd'; args: [string[]] }
  | { type: 'RoomJoined'; args: [string[]] }
  | { type: 'RoomLeft'; args: [string, string] }
  | { type: 'RoomRemove'; args: [string] }
  | { type: 'RoomAbandoned'; args: [string] }
  | { type: 'RoomUpdated'; args: [string, string[]] }
  | { type: 'RoomControlAccess'; args: [boolean] }
  | { type: 'Joining'; args: [string] }
  | { type: 'TeamAdd'; args: [string[]] }
  | { type: 'TeamRemove'; args: [string] }
  | { type: 'TeamAccepted'; args: [string] }
  | { type: 'TeamColor'; args: [string, number] }
  | { type: 'HedgehogsNumber'; args: [string, number] }
  | { type: 'ConfigEntry'; args: [string, string[]] }
  | { type: 'Kicked'; args: [] }
  | { type: 'RunGame'; args: [] }
  | { type: 'ForwardEngineMessage'; args: [string[]] }
  | { type: 'RoundFinished'; args: [] }
  | { type: 'ReplayStart'; args: [] }
  | { type: 'Info'; args: [string[]] }
  | { type: 'ServerMessage'; args: [string] }
  | { type: 'ServerVars'; args: [string[]] }
  | { type: 'BanList'; args: [string[]] }
  | { type: 'Notice'; args: [string] }
  | { type: 'Warning'; args: [string] }
  | { type: 'Error'; args: [string] }
  | { type: 'Replay'; args: [string[]] }
  | { type: 'LegacyReady'; args: [boolean, string[]] };

/** Build a message from lines: "a\nb\n\n" */
function lines(...parts: (string | number)[]): string {
  return parts.map(String).join('\n') + '\n\n';
}

/** construct_message: header lines and argument lines; no arguments gives "H\n\n" */
function construct(header: string[], args: string[]): string {
  return [...header, ...args, '\n'].join('\n');
}

function serverVarToProtocol(v: ServerVar): string[] {
  switch (v.type) {
    case 'MOTDNew':
      return ['MOTD_NEW', v.args[0]];
    case 'MOTDOld':
      return ['MOTD_OLD', v.args[0]];
    case 'LatestProto':
      return ['LATEST_PROTO', String(v.args[0])];
  }
}

function voteToProtocol(v: VoteType): string[] {
  switch (v.type) {
    case 'Kick':
      return ['KICK', v.args[0]];
    case 'Map':
      return v.args[0] === null ? ['MAP'] : ['MAP', v.args[0]];
    case 'Pause':
      return ['PAUSE'];
    case 'NewSeed':
      return ['NEWSEED'];
    case 'HedgehogsPerTeam':
      return ['HEDGEHOGS', String(v.args[0])];
  }
}

/** GameCfg as (name, values), as sent with CFG */
export function gameCfgToProtocol(c: GameCfg): [string, string[]] {
  switch (c.type) {
    case 'FeatureSize':
      return ['FEATURE_SIZE', [String(c.args[0])]];
    case 'MapType':
      return ['MAP', [c.args[0]]];
    case 'MapGenerator':
      return ['MAPGEN', [String(c.args[0])]];
    case 'MazeSize':
      return ['MAZE_SIZE', [String(c.args[0])]];
    case 'Seed':
      return ['SEED', [c.args[0]]];
    case 'Template':
      return ['TEMPLATE', [String(c.args[0])]];
    case 'Ammo':
      return ['AMMO', c.args[1] === null ? [c.args[0]] : [c.args[0], c.args[1]]];
    case 'Scheme':
      return ['SCHEME', [c.args[0], ...c.args[1]]];
    case 'Script':
      return ['SCRIPT', [c.args[0]]];
    case 'Theme':
      return ['THEME', [c.args[0]]];
    case 'DrawnMap':
      return ['DRAWNMAP', [c.args[0]]];
  }
}

const yesNo = (b: boolean) => (b ? 'YES' : 'NO');

/** Serialise a client message (HwProtocolMessage::to_raw_protocol) */
export function clientToRaw(m: ClientMessage): string {
  switch (m.type) {
    case 'Ping':
      return lines('PING');
    case 'Pong':
      return lines('PONG');
    case 'Quit':
      return m.args[0] === null ? lines('QUIT') : lines('QUIT', m.args[0]);
    case 'Global':
      return lines('CMD', `GLOBAL ${m.args[0]}`);
    case 'Watch':
      return lines('CMD', `WATCH ${m.args[0]}`);
    case 'ToggleServerRegisteredOnly':
      return lines('CMD', 'REGISTERED_ONLY');
    case 'SuperPower':
      return lines('CMD', 'SUPER_POWER');
    case 'Info':
      return lines('CMD', `INFO ${m.args[0]}`);
    case 'Help':
      return lines('CMD', 'HELP');
    case 'Nick':
      return m.args[1] === null ? lines('NICK', m.args[0]) : lines('NICK', m.args[0], m.args[1]);
    case 'Proto':
      return lines('PROTO', m.args[0]);
    case 'Password':
      return lines('PASSWORD', m.args[0], m.args[1]);
    case 'LegacyPassword':
      return lines('PASSWORD', m.args[0]);
    case 'Checker':
      return lines('CHECKER', ...m.args);
    case 'List':
      return lines('LIST');
    case 'Chat':
      return lines('CHAT', m.args[0]);
    case 'CreateRoom':
      return m.args[1] === null
        ? lines('CREATE_ROOM', m.args[0])
        : lines('CREATE_ROOM', m.args[0], m.args[1]);
    case 'JoinRoom':
      return m.args[1] === null
        ? lines('JOIN_ROOM', m.args[0])
        : lines('JOIN_ROOM', m.args[0], m.args[1]);
    case 'Follow':
      return lines('FOLLOW', m.args[0]);
    case 'Rnd':
      return m.args[0].length === 0
        ? lines('CMD', 'RND')
        : lines('CMD', `RND ${m.args[0].join(' ')}`);
    case 'Kick':
      return lines('KICK', m.args[0]);
    case 'Ban':
      return lines('BAN', ...m.args);
    case 'BanIp':
      return lines('BAN_IP', ...m.args);
    case 'BanNick':
      return lines('BAN_NICK', ...m.args);
    case 'RoomBan':
      return lines('BAN', m.args[0]);
    case 'BanList':
      return lines('BANLIST');
    case 'Unban':
      return lines('UNBAN', m.args[0]);
    case 'SetServerVar':
      return construct(['SET_SERVER_VAR'], serverVarToProtocol(m.args[0]));
    case 'GetServerVar':
      return lines('GET_SERVER_VAR');
    case 'ClearAccountsCache':
      return lines('CLEAR_ACCOUNTS_CACHE');
    case 'RestartServer':
      return lines('CMD', 'RESTART_SERVER YES');
    case 'RestartServerConfirm':
      return lines('CMD', 'RESTART_SERVER');
    case 'Stats':
      return lines('CMD', 'STATS');
    case 'Part':
      return m.args[0] === null ? lines('PART') : lines('PART', m.args[0]);
    case 'Cfg': {
      const [name, values] = gameCfgToProtocol(m.args[0]);
      return lines('CFG', name, values.join('\n'));
    }
    case 'AddTeam': {
      const t = m.args[0];
      const hogs = t.hedgehogs.flatMap((h) => [h.name, h.hat]).join('\n');
      return lines(
        'ADD_TEAM',
        t.name,
        t.color,
        t.grave,
        t.fort,
        t.voicePack,
        t.flag,
        t.difficulty,
        hogs,
      );
    }
    case 'RemoveTeam':
      return lines('REMOVE_TEAM', m.args[0]);
    case 'SetHedgehogsNumber':
      return lines('HH_NUM', ...m.args);
    case 'SetTeamColor':
      return lines('TEAM_COLOR', ...m.args);
    case 'ToggleReady':
      return lines('TOGGLE_READY');
    case 'StartGame':
      return lines('START_GAME');
    case 'EngineMessage':
      return lines('EM', m.args[0]);
    case 'RoundFinished':
      return lines('ROUNDFINISHED');
    case 'ToggleRestrictJoin':
      return lines('TOGGLE_RESTRICT_JOINS');
    case 'ToggleRestrictTeams':
      return lines('TOGGLE_RESTRICT_TEAMS');
    case 'ToggleRegisteredOnly':
      return lines('TOGGLE_REGISTERED_ONLY');
    case 'RoomName':
      return lines('ROOM_NAME', m.args[0]);
    case 'Delegate':
      return lines('CMD', `DELEGATE ${m.args[0]}`);
    case 'TeamChat':
      return lines('TEAMCHAT', m.args[0]);
    case 'MaxTeams':
      return lines('CMD', `MAXTEAMS ${m.args[0]}`);
    case 'Fix':
      return lines('CMD', 'FIX');
    case 'Unfix':
      return lines('CMD', 'UNFIX');
    case 'Greeting':
      return m.args[0] === null ? lines('CMD', 'GREETING') : lines('CMD', `GREETING ${m.args[0]}`);
    case 'CallVote':
      return m.args[0] === null
        ? lines('CMD', 'CALLVOTE')
        : lines('CMD', `CALLVOTE ${voteToProtocol(m.args[0]).join(' ')}`);
    case 'Vote':
      return lines('CMD', `VOTE ${yesNo(m.args[0])}`);
    case 'ForceVote':
      return lines('CMD', `FORCE ${yesNo(m.args[0])}`);
    case 'Save':
      return lines('CMD', `SAVE ${m.args[0]} ${m.args[1]}`);
    case 'Delete':
      return lines('CMD', `DELETE ${m.args[0]}`);
    case 'SaveRoom':
      return lines('CMD', `SAVEROOM ${m.args[0]}`);
    case 'LoadRoom':
      return lines('CMD', `LOADROOM ${m.args[0]}`);
    case 'CheckerReady':
      return lines('READY');
    case 'CheckedOk':
      return lines('CHECKED', 'OK', m.args[0].join('\n'));
    case 'CheckedFail':
      return lines('CHECKED', 'FAIL', m.args[0]);
    case 'Malformed':
      return construct([], m.args[0]);
  }
}

export class ProtocolError extends Error {}

function int(s: string | undefined, max: number): number {
  if (s === undefined || !/^\d+$/.test(s)) throw new ProtocolError(`not a number: ${s}`);
  const n = Number(s);
  if (n > max) throw new ProtocolError(`number out of range: ${s}`);
  return n;
}

const U8 = 0xff;
const U16 = 0xffff;
const U32 = 0xffffffff;

/**
 * Parse one server message (without or with its terminating empty line).
 * Mirrors parser::server_message.
 */
export function parseServerMessage(raw: string): ServerMessage {
  const text = raw.replace(/^\n+/, '').replace(/\n\n$/, '');
  const l = text.split('\n');
  const [cmd = '', a1, a2] = l;
  const rest = (from: number) => l.slice(from);
  const exactly = (n: number) => {
    if (l.length !== n) throw new ProtocolError(`${cmd}: expected ${n - 1} arguments`);
  };
  /**
   * n fields, the last one free text: an empty last argument merges with the
   * message terminator on the wire ("LEFT\nnick\n\n\n" reads as one
   * argument), so a missing last field means ''. Returns that field.
   */
  const textLast = (n: number): string => {
    if (l.length !== n && l.length !== n - 1)
      throw new ProtocolError(`${cmd}: expected ${n - 1} arguments`);
    return l[n - 1] ?? '';
  };
  const str = (s: string | undefined) => {
    if (s === undefined) throw new ProtocolError(`${cmd}: missing argument`);
    return s;
  };
  switch (cmd) {
    case 'PING':
      exactly(1);
      return { type: 'Ping', args: [] };
    case 'PONG':
      exactly(1);
      return { type: 'Pong', args: [] };
    case 'LOGONPASSED':
      exactly(1);
      return { type: 'LogonPassed', args: [] };
    case 'ADMIN_ACCESS':
      exactly(1);
      return { type: 'AdminAccess', args: [] };
    case 'KICKED':
      exactly(1);
      return { type: 'Kicked', args: [] };
    case 'RUN_GAME':
      exactly(1);
      return { type: 'RunGame', args: [] };
    case 'ROUND_FINISHED':
      exactly(1);
      return { type: 'RoundFinished', args: [] };
    case 'REPLAY_START':
      exactly(1);
      return { type: 'ReplayStart', args: [] };
    case 'REDIRECT':
      exactly(2);
      return { type: 'Redirect', args: [int(a1, U16)] };
    case 'BYE':
      return { type: 'Bye', args: [textLast(2)] };
    case 'NICK':
      exactly(2);
      return { type: 'Nick', args: [str(a1)] };
    case 'TOKEN':
      exactly(2);
      return { type: 'Token', args: [str(a1)] };
    case 'PROTO':
      exactly(2);
      return { type: 'Proto', args: [int(a1, U16)] };
    case 'ASKPASSWORD':
      if (l.length > 2) throw new ProtocolError('ASKPASSWORD: too many arguments');
      return { type: 'AskPassword', args: [a1 ?? ''] };
    case 'SERVER_AUTH':
      exactly(2);
      return { type: 'ServerAuth', args: [str(a1)] };
    case 'ROOMABANDONED':
      return { type: 'RoomAbandoned', args: [textLast(2)] };
    case 'ROOM_CONTROL_ACCESS':
      exactly(2);
      return { type: 'RoomControlAccess', args: [int(a1, U8) !== 0] };
    case 'JOINING':
      exactly(2);
      return { type: 'Joining', args: [str(a1)] };
    case 'REMOVE_TEAM':
      exactly(2);
      return { type: 'TeamRemove', args: [str(a1)] };
    case 'TEAM_ACCEPTED':
      exactly(2);
      return { type: 'TeamAccepted', args: [str(a1)] };
    case 'SERVER_MESSAGE':
      return { type: 'ServerMessage', args: [textLast(2)] };
    case 'NOTICE':
      return { type: 'Notice', args: [textLast(2)] };
    case 'WARNING':
      return { type: 'Warning', args: [textLast(2)] };
    case 'ERROR':
      return { type: 'Error', args: [textLast(2)] };
    case 'LOBBY:LEFT':
      return { type: 'LobbyLeft', args: [str(a1), textLast(3)] };
    case 'CHAT':
      return { type: 'ChatMsg', args: [str(a1), textLast(3)] };
    case 'TEAM_COLOR':
      exactly(3);
      return { type: 'TeamColor', args: [str(a1), int(a2, U8)] };
    case 'HH_NUM':
      exactly(3);
      return { type: 'HedgehogsNumber', args: [str(a1), int(a2, U8)] };
    case 'CONNECTED':
      exactly(3);
      return { type: 'Connected', args: [str(a1), int(a2, U32)] };
    case 'LEFT':
      return { type: 'RoomLeft', args: [str(a1), textLast(3)] };
    case 'CLIENT_FLAGS':
      return { type: 'ClientFlags', args: [str(a1), rest(2)] };
    case 'CFG':
      return { type: 'ConfigEntry', args: [str(a1), rest(2)] };
    case 'LOBBY:JOINED':
      return { type: 'LobbyJoined', args: [rest(1)] };
    case 'ROOMS':
      return { type: 'Rooms', args: [rest(1)] };
    case 'JOINED':
      return { type: 'RoomJoined', args: [rest(1)] };
    case 'ADD_TEAM':
      return { type: 'TeamAdd', args: [rest(1)] };
    case 'EM':
      return { type: 'ForwardEngineMessage', args: [rest(1)] };
    case 'INFO':
      return { type: 'Info', args: [rest(1)] };
    case 'SERVER_VARS':
      return { type: 'ServerVars', args: [rest(1)] };
    case 'BANLIST':
      return { type: 'BanList', args: [rest(1)] };
    case 'REPLAY':
      return { type: 'Replay', args: [rest(1)] };
    case 'READY':
    case 'NOT_READY':
      return { type: 'LegacyReady', args: [cmd === 'READY', rest(1)] };
    case 'ROOM':
      switch (a1) {
        case 'ADD':
          return { type: 'RoomAdd', args: [rest(2)] };
        case 'DEL':
          exactly(3);
          return { type: 'RoomRemove', args: [str(a2)] };
        case 'UPD':
          return { type: 'RoomUpdated', args: [str(a2), rest(3)] };
      }
  }
  throw new ProtocolError(`unknown server message: ${JSON.stringify(text.slice(0, 40))}`);
}

/**
 * Splits the server's text stream into messages. Feed it decoded text in any
 * chunks; it returns the raw text of every complete message.
 */
export class MessageReader {
  private buffer = '';

  feed(chunk: string): string[] {
    this.buffer += chunk;
    const out: string[] = [];
    for (;;) {
      this.buffer = this.buffer.replace(/^\n+/, '');
      const end = this.buffer.indexOf('\n\n');
      if (end < 0) break;
      out.push(this.buffer.slice(0, end + 2));
      this.buffer = this.buffer.slice(end + 2);
    }
    return out;
  }
}
