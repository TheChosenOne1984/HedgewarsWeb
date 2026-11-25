// Key bindings (port of frontend-qt6/binds.cpp and the [Binds] part of
// GameUIConfig): the engine reads them from settings.ini in its user
// directory, "action=key" with the action percent-encoded like QSettings
// does; only bindings that differ from the engine's defaults are written
// (rebinding an action removes its default key in the engine).

export interface BindAction {
  action: string;
  /** the engine's default key ('' or 'none' for none) */
  key: string;
  /** English label, translated when shown; {n} is replaced by n */
  label: string;
  n?: number;
  category?: string;
}

export const BIND_ACTIONS: BindAction[] = [
  { action: '+up', key: 'up', label: 'up', category: 'Movement' },
  { action: '+left', key: 'left', label: 'left' },
  { action: '+right', key: 'right', label: 'right' },
  { action: '+down', key: 'down', label: 'down' },
  { action: '+precise', key: 'left_shift', label: 'precise aim' },
  { action: 'ljump', key: 'return', label: 'long jump' },
  { action: 'hjump', key: 'backspace', label: 'high jump' },
  { action: 'switch', key: 'tab', label: 'switch hedgehog' },
  { action: 'ammomenu', key: 'mouser', label: 'ammo menu', category: 'Weapons' },
  ...Array.from({ length: 9 }, (_, i) => ({
    action: `slot ${i + 1}`,
    key: `f${i + 1}`,
    label: 'slot {n}',
    n: i + 1,
  })),
  { action: 'slot :', key: 'f10', label: 'slot {n}', n: 10 },
  { action: 'setweap ~', key: 'none', label: 'unselect weapon' },
  ...Array.from({ length: 5 }, (_, i) => ({
    action: `timer ${i + 1}`,
    key: String(i + 1),
    label: 'timer {n} sec',
    n: i + 1,
  })),
  { action: 'timer_u', key: 'n', label: 'change timer' },
  { action: '+attack', key: 'space', label: 'attack' },
  { action: 'put', key: 'mousel', label: 'put' },
  { action: 'findhh', key: 'h', label: 'find hedgehog', category: 'Camera' },
  { action: '+cur_u', key: 'keypad_8', label: 'camera up' },
  { action: '+cur_l', key: 'keypad_4', label: 'camera left' },
  { action: '+cur_r', key: 'keypad_6', label: 'camera right' },
  { action: '+cur_d', key: 'keypad_2', label: 'camera down' },
  { action: 'zoomin', key: 'wheelup', label: 'zoom in' },
  { action: 'zoomout', key: 'wheeldown', label: 'zoom out' },
  { action: 'zoomreset', key: 'mousem', label: 'reset zoom' },
  { action: 'chat', key: 't', label: 'chat', category: 'Miscellaneous' },
  { action: 'chat team', key: 'u', label: 'clan chat' },
  { action: 'history', key: '`', label: 'chat history' },
  { action: 'pause', key: 'p', label: 'pause / auto skip' },
  { action: 'quit', key: 'escape', label: 'quit' },
  { action: 'confirm', key: 'y', label: 'confirm' },
  { action: '+voldown', key: '9', label: 'volume down' },
  { action: '+volup', key: '0', label: 'volume up' },
  { action: 'mute', key: '8', label: 'mute audio' },
  { action: 'capture', key: 'c', label: 'screenshot' },
  { action: '+speedup', key: 'f', label: 'speed up replay' },
  { action: '+mission', key: 'm', label: 'mission information' },
  { action: 'gearinfo', key: 'o', label: 'object information' },
  { action: 'rotmask', key: 'delete', label: 'toggle team bars' },
  { action: 'rottags', key: 'home', label: 'toggle hedgehog tags' },
];

const NAMED_CODES: Record<string, string> = {
  Enter: 'return',
  Escape: 'escape',
  Backspace: 'backspace',
  Tab: 'tab',
  Space: 'space',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  CapsLock: 'capslock',
  PrintScreen: 'printscreen',
  ScrollLock: 'scrolllock',
  Pause: 'pause',
  Insert: 'insert',
  Home: 'home',
  PageUp: 'pageup',
  Delete: 'delete',
  End: 'end',
  PageDown: 'pagedown',
  ArrowRight: 'right',
  ArrowLeft: 'left',
  ArrowDown: 'down',
  ArrowUp: 'up',
  NumLock: 'numlock',
  NumpadDivide: 'keypad_/',
  NumpadMultiply: 'keypad_*',
  NumpadSubtract: 'keypad_-',
  NumpadAdd: 'keypad_+',
  NumpadEnter: 'keypad_enter',
  NumpadDecimal: 'keypad_.',
  NumpadEqual: 'keypad_=',
  IntlBackslash: 'nonusbackslash',
  ContextMenu: 'menu',
  ControlLeft: 'left_ctrl',
  ShiftLeft: 'left_shift',
  AltLeft: 'left_alt',
  MetaLeft: 'left_gui',
  ControlRight: 'right_ctrl',
  ShiftRight: 'right_shift',
  AltRight: 'right_alt',
  MetaRight: 'right_gui',
};

/** the engine's name (Data/misc/keys.csv) of a physical key (KeyboardEvent.code) */
export function keyName(code: string): string | null {
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1]!.toLowerCase();
  m = /^Digit([0-9])$/.exec(code);
  if (m) return m[1]!;
  m = /^F([1-9]|1[0-9]|2[0-4])$/.exec(code);
  if (m) return `f${m[1]}`;
  m = /^Numpad([0-9])$/.exec(code);
  if (m) return `keypad_${m[1]}`;
  return NAMED_CODES[code] ?? null;
}

/** the engine's name of a mouse button (MouseEvent.button) */
export function mouseName(button: number): string | null {
  return ['mousel', 'mousem', 'mouser', 'mousex1', 'mousex2'][button] ?? null;
}

/** bindings in effect: the defaults with the user's changes */
export function effectiveBinds(changes: Record<string, string>): Record<string, string> {
  return Object.fromEntries(BIND_ACTIONS.map((b) => [b.action, changes[b.action] ?? b.key]));
}

function encodeAction(action: string): string {
  return Array.from(new TextEncoder().encode(action), (b) => {
    const c = String.fromCharCode(b);
    return /[A-Za-z0-9_]/.test(c) ? c : '%' + b.toString(16).toUpperCase().padStart(2, '0');
  }).join('');
}

function encodeKey(key: string): string {
  if (key === '\\') return '\\\\';
  return /^[a-z0-9_]+$/.test(key) ? key : `"${key}"`;
}

/** settings.ini for the engine (uInputHandler.loadBinds) */
export function settingsIni(changes: Record<string, string>): string {
  const lines = BIND_ACTIONS.filter(
    (b) => changes[b.action] !== undefined && changes[b.action] !== b.key,
  ).map((b) => `${encodeAction(b.action)}=${encodeKey(changes[b.action] || 'none')}`);
  return ['[Binds]', ...lines, ''].join('\n') + '\n';
}
