// Translations of the web client, gettext style: the English text is the key.
// t() reads the current locale reactively, so views update when it changes.
// The engine has its own translations (Data/Locale/<locale>.txt).

export type Locale = 'en' | 'de';
export const LOCALES: { id: Locale; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'de', name: 'Deutsch' },
];

const DE: Record<string, string> = {
  // app frame
  Disconnect: 'Trennen',
  'Hedgewars is free software': 'Hedgewars ist freie Software',
  'data GFDL-1.2': 'Daten GFDL-1.2',
  'Source code': 'Quellcode',
  Settings: 'Einstellungen',
  Done: 'Fertig',
  Back: 'Zurück',
  // start
  'Hedgewars needs a keyboard and a mouse: please use a desktop browser.':
    'Hedgewars braucht Tastatur und Maus: Bitte nutze einen Desktop-Browser.',
  'Play online': 'Online spielen',
  Nickname: 'Spitzname',
  Server: 'Server',
  'WebSocket URL': 'WebSocket-URL',
  'Connecting…': 'Verbinde…',
  Connect: 'Verbinden',
  'Play offline': 'Offline spielen',
  'Hotseat with friends on this computer, or against the computer.':
    'Mit Freunden abwechselnd an diesem Computer oder gegen den Computer.',
  'Local game': 'Lokales Spiel',
  'Edit teams': 'Teams bearbeiten',
  // lobby
  Rooms: 'Räume',
  Refresh: 'Aktualisieren',
  Room: 'Raum',
  Players: 'Spieler',
  Teams: 'Teams',
  Owner: 'Besitzer',
  Map: 'Karte',
  Style: 'Spielstil',
  Watch: 'Zuschauen',
  Join: 'Beitreten',
  'No rooms yet. Create one!': 'Noch keine Räume. Erstelle einen!',
  'New room name': 'Name des neuen Raums',
  'Create room': 'Raum erstellen',
  'Players ({n})': 'Spieler ({n})',
  'in room': 'im Raum',
  playing: 'spielt',
  // room
  'Leave room': 'Raum verlassen',
  'bot {n}': 'Bot {n}',
  '{n} hogs': '{n} Igel',
  'colour {n}': 'Farbe {n}',
  Remove: 'Entfernen',
  'No teams yet.': 'Noch keine Teams.',
  '(bot)': '(Bot)',
  'Add team': 'Team hinzufügen',
  'room master': 'Raumleiter',
  'Not ready': 'Nicht bereit',
  Ready: 'Bereit',
  'Start game': 'Spiel starten',
  Game: 'Spiel',
  Scheme: 'Schema',
  Weapons: 'Waffen',
  Theme: 'Thema',
  // game settings
  'Random terrain': 'Zufälliges Gelände',
  Maze: 'Labyrinth',
  Perlin: 'Perlin',
  'Tiles (WFC)': 'Kacheln (WFC)',
  'Fixed map': 'Feste Karte',
  'Drawn map': 'Gezeichnete Karte',
  Forts: 'Festungen',
  'New map seed': 'Neue Karte',
  'Map preview': 'Kartenvorschau',
  'No preview': 'Keine Vorschau',
  'room for {n} hedgehogs': 'Platz für {n} Igel',
  // local
  'Pick at least two teams. Edit teams and bots under “Edit teams”.':
    'Wähle mindestens zwei Teams. Teams und Bots bearbeitest du unter „Teams bearbeiten“.',
  '(bot level {n})': '(Bot-Stufe {n})',
  '(human)': '(Mensch)',
  // teams
  '+ New team': '+ Neues Team',
  Name: 'Name',
  Player: 'Spieler',
  Human: 'Mensch',
  'Bot: beginner': 'Bot: Anfänger',
  'Bot: easy': 'Bot: leicht',
  'Bot: normal': 'Bot: normal',
  'Bot: hard': 'Bot: schwer',
  'Bot: expert': 'Bot: Experte',
  Grave: 'Grabstein',
  Fort: 'Festung',
  Voice: 'Stimme',
  Flag: 'Flagge',
  Hedgehogs: 'Igel',
  'Hedgehog {n} name': 'Name von Igel {n}',
  'Hedgehog {n} hat': 'Hut von Igel {n}',
  'Delete team': 'Team löschen',
  'Search…': 'Suchen…',
  'Random team': 'Zufälliges Team',
  'Random hats': 'Zufällige Hüte',
  'Random names': 'Zufällige Namen',
  'Play a sample of this voice': 'Hörprobe dieser Stimme abspielen',
  // chat
  'has left': 'ist gegangen',
  joined: 'ist da',
  'joined the room': 'hat den Raum betreten',
  'Connection error': 'Verbindungsfehler',
  'Too many connections from your address in a short time. Connecting again in {n} s…':
    'Zu viele Verbindungen von deiner Adresse in kurzer Zeit. Neuer Versuch in {n} s…',
  'This nickname is registered. Please choose another one.':
    'Dieser Spitzname ist registriert. Bitte wähle einen anderen.',
  'Unexpected message from server: {text}': 'Unerwartete Nachricht vom Server: {text}',
  'Say something…': 'Schreib etwas…',
  Send: 'Senden',
  // game
  starting: 'starte',
  'loading data': 'lade Daten',
  'loading data {n}%': 'lade Daten {n} %',
  'game over ({n})': 'Spiel beendet ({n})',
  'error: {text}': 'Fehler: {text}',
  'engine error: {text}': 'Engine-Fehler: {text}',
  'The game went out of sync with the other players and had to stop. This is a bug; please report it.':
    'Das Spiel ist mit den anderen Spielern aus dem Takt geraten und musste anhalten. Das ist ein Fehler; bitte melde ihn.',
  'The game engine stopped with an error ({n}): {text}':
    'Die Spiel-Engine wurde mit einem Fehler beendet ({n}): {text}',
  'The game could not start: {text}': 'Das Spiel konnte nicht starten: {text}',
  // settings
  Language: 'Sprache',
  Volume: 'Lautstärke',
  'Sound effects': 'Soundeffekte',
  Music: 'Musik',
  Controls: 'Steuerung',
  'Press a key…': 'Drücke eine Taste…',
  'Reset to defaults': 'Standard wiederherstellen',
  Movement: 'Bewegung',
  Camera: 'Kamera',
  Miscellaneous: 'Sonstiges',
  up: 'hoch',
  left: 'links',
  right: 'rechts',
  down: 'runter',
  'precise aim': 'genau zielen',
  'long jump': 'Weitsprung',
  'high jump': 'Hochsprung',
  'switch hedgehog': 'Igel wechseln',
  'ammo menu': 'Waffenmenü',
  'slot {n}': 'Fach {n}',
  'unselect weapon': 'Waffe abwählen',
  'timer {n} sec': 'Zünder {n} s',
  'change timer': 'Zünder ändern',
  attack: 'angreifen',
  put: 'platzieren',
  'find hedgehog': 'Igel finden',
  'camera up': 'Kamera hoch',
  'camera left': 'Kamera links',
  'camera right': 'Kamera rechts',
  'camera down': 'Kamera runter',
  'zoom in': 'hineinzoomen',
  'zoom out': 'herauszoomen',
  'reset zoom': 'Zoom zurücksetzen',
  chat: 'Chat',
  'clan chat': 'Clan-Chat',
  'chat history': 'Chatverlauf',
  'pause / auto skip': 'Pause / automatisch überspringen',
  quit: 'beenden',
  confirm: 'bestätigen',
  'volume down': 'leiser',
  'volume up': 'lauter',
  'mute audio': 'stumm schalten',
  screenshot: 'Bildschirmfoto',
  'speed up replay': 'Wiederholung beschleunigen',
  'mission information': 'Missionsinfo',
  'object information': 'Objektinfo',
  'toggle team bars': 'Teamleisten ein/aus',
  'toggle hedgehog tags': 'Igel-Namen ein/aus',
  'Click an action, then press the key for it.':
    'Klicke auf eine Aktion und drücke dann die gewünschte Taste.',
};

/** every translated text, for tests */
export const TRANSLATIONS: Record<Locale, Record<string, string>> = { en: {}, de: DE };

function detect(): Locale {
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return lang.toLowerCase().startsWith('de') ? 'de' : 'en';
}

let current = $state<Locale>(detect());

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale | undefined) {
  current = locale && LOCALES.some((l) => l.id === locale) ? locale : detect();
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

/** translate; {name} placeholders are replaced by params */
export function t(text: string, params?: Record<string, string | number>): string {
  const s = TRANSLATIONS[current][text] ?? text;
  return params ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : s;
}
