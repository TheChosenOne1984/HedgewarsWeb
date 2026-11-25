// Host for the web engine (hwengine.mjs + .wasm) in the browser: loads the
// asset packs a game needs into the engine's file system, queues the game
// config before the engine starts (the web engine cannot wait for its
// frontend), relays IPC and reports the engine's end.
//
// IPC wire format (the desktop engine's): <len:u8><payload>; engine messages
// end with the GameTicks as u16.

const PACK_MAGIC = 0x31505748; // "HWP1" little endian
export const DATA_PREFIX = '/data/Data';
const USER_PREFIX = '/user';

export interface PackManifest {
  version: number;
  cjkLocales: string[];
  packs: Record<string, { file: string; sha256: string; size: number; files: number }>;
}

/** <len><payload> for one IPC message, payload cut to 250 bytes */
export function ipcFrame(payload: string | Uint8Array): Uint8Array {
  const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
  const body = bytes.subarray(0, 250);
  const out = new Uint8Array(body.length + 1);
  out[0] = body.length;
  out.set(body, 1);
  return out;
}

/** <len><payload> without cutting the payload (relaying engine messages, up to 255 bytes) */
export function ipcRawFrame(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + 1);
  out[0] = payload.length;
  out.set(payload, 1);
  return out;
}

/** split an IPC byte stream into messages (without length byte); returns [messages, rest] */
export function ipcSplit(bytes: Uint8Array): [Uint8Array[], Uint8Array] {
  const messages: Uint8Array[] = [];
  let pos = 0;
  while (pos < bytes.length && pos + bytes[pos]! < bytes.length) {
    messages.push(bytes.subarray(pos + 1, pos + 1 + bytes[pos]!));
    pos += 1 + bytes[pos]!;
  }
  return [messages, bytes.subarray(pos)];
}

export function parsePack(buffer: ArrayBuffer): { path: string; data: Uint8Array }[] {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== PACK_MAGIC) throw new Error('not a hwpack');
  const headerLength = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, headerLength))) as {
    files: { path: string; size: number }[];
  };
  let pos = 8 + headerLength;
  return header.files.map(({ path, size }) => {
    const data = new Uint8Array(buffer, pos, size);
    pos += size;
    return { path, data };
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the Emscripten module object */
type EngineModule = any;

export interface PackRequest {
  theme?: string;
  map?: string;
  voices?: string[];
  music?: string[];
  locale?: string;
  cjk?: boolean;
  forts?: boolean;
  missions?: boolean;
}

export class EngineHost {
  onMessage: (bytes: Uint8Array) => void = () => {};
  onExit: (code: number) => void = () => {};
  onLog: (line: string) => void = (line) => console.log(line);
  /** campaign ('V') and mission ('v') variables, read by the engine synchronously */
  vars: Record<string, Map<string, string>> = { V: new Map(), v: new Map() };

  private module: EngineModule = null;
  private manifest: PackManifest | null = null;
  private loadedPacks = new Set<string>();
  private exited = false;
  /** raw engine output while a land preview runs */
  private capture: Uint8Array[] | null = null;

  constructor(
    private engineUrl: string,
    private packsUrl: string,
    private canvas?: HTMLCanvasElement,
  ) {
    if (!this.packsUrl.endsWith('/')) this.packsUrl += '/';
  }

  async init(): Promise<void> {
    const { default: createHwEngine } = await import(/* @vite-ignore */ this.engineUrl);
    const finish = (code: number) => {
      if (!this.exited) {
        this.exited = true;
        this.onExit(code);
      }
    };
    this.module = await createHwEngine({
      noInitialRun: true,
      canvas: this.canvas,
      print: (s: string) => this.onLog(s),
      printErr: (s: string) => this.onLog(s),
      onExit: finish,
      onEngineExit: finish,
      onIpcMessage: (bytes: Uint8Array) => this.fromEngine(bytes),
      getEngineVar: (kind: string, name: string) => this.vars[kind]?.get(name) ?? '',
      locateFile: (path: string) => new URL(path, this.engineUrl).href,
    });
    if (!this.canvas) {
      // without a canvas (land previews) the engine still makes a few GL
      // calls; give it a context that ignores them
      const nullGl = new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === 'canvas') return { width: 1, height: 1 };
            if (prop === 'drawingBufferWidth' || prop === 'drawingBufferHeight') return 1;
            return () => 0;
          },
        },
      );
      const gl = this.module.GL;
      gl.makeContextCurrent(gl.registerContext(nullGl, { majorVersion: 1, minorVersion: 0 }));
    }
    for (const dir of ['/data', DATA_PREFIX, USER_PREFIX]) this.module.FS.mkdir(dir);
    this.manifest = (await (await fetch(this.packsUrl + 'manifest.json')).json()) as PackManifest;
  }

  packsFor(req: PackRequest): string[] {
    const m = this.manifest!;
    const names = ['core'];
    if (req.theme) names.push('themes/' + req.theme);
    if (req.map) names.push('maps/' + req.map);
    for (const v of req.voices ?? []) names.push('voices/' + v);
    for (const t of req.music ?? []) names.push('music/' + t);
    if (req.locale && req.locale !== 'en') names.push('locale/' + req.locale);
    if (req.cjk || (req.locale && m.cjkLocales.includes(req.locale))) names.push('fonts-cjk');
    if (req.forts) names.push('forts');
    if (req.missions) names.push('missions');
    return [...new Set(names)].filter((n) => n in m.packs);
  }

  async loadPacks(names: string[], onProgress: (done: number, total: number) => void = () => {}) {
    const m = this.manifest!;
    const todo = names.filter((n) => !this.loadedPacks.has(n));
    const total = todo.reduce((s, n) => s + m.packs[n]!.size, 0);
    let done = 0;
    await Promise.all(
      todo.map(async (name) => {
        const pack = m.packs[name]!;
        const response = await fetch(this.packsUrl + pack.file);
        if (!response.ok) throw new Error(`pack ${name}: HTTP ${response.status}`);
        for (const { path, data } of parsePack(await response.arrayBuffer())) {
          const full = `${DATA_PREFIX}/${path}`;
          this.module.FS.mkdirTree(full.substring(0, full.lastIndexOf('/')));
          this.module.FS.writeFile(full, data);
        }
        this.loadedPacks.add(name);
        done += pack.size;
        onProgress(done, total);
      }),
    );
  }

  /** Start the engine with a complete config (IPC frames); resolves when it returns. */
  async start(config: Uint8Array, extraArgs: string[] = []): Promise<number> {
    this.push(config);
    this.push(ipcFrame('!')); // the pong for the engine's "C" + "?" request
    const width = this.canvas?.clientWidth || 1024;
    const height = this.canvas?.clientHeight || 768;
    return this.run(['--width', String(width & ~1), '--height', String(height & ~1), ...extraArgs]);
  }

  /**
   * Generate a land preview (HWMap): config holds the map parameters as IPC
   * frames ending with '!'. Returns the engine's raw answer: 256x128 alpha
   * values, then the hedgehog limit (1 byte); empty on failure. Previews run
   * one at a time; the engine instance can run any number of them.
   */
  async landPreview(config: Uint8Array): Promise<Uint8Array> {
    this.push(config);
    this.capture = [];
    try {
      await this.run(['--landpreview']);
      const total = this.capture.reduce((n, b) => n + b.length, 0);
      const out = new Uint8Array(total);
      let pos = 0;
      for (const b of this.capture) {
        out.set(b, pos);
        pos += b.length;
      }
      return out;
    } finally {
      this.capture = null;
    }
  }

  private async run(extraArgs: string[]): Promise<number> {
    const args = [
      'hwengine',
      '--internal',
      '--port',
      '0',
      '--prefix',
      DATA_PREFIX,
      '--user-prefix',
      USER_PREFIX,
      ...extraArgs,
    ];
    const M = this.module;
    const ptrs = args.map((a) => M.stringToNewUTF8(a) as number);
    const argv = M._malloc(4 * ptrs.length) as number;
    const view = new DataView(M.HEAPU8.buffer);
    ptrs.forEach((p, i) => view.setUint32(argv + 4 * i, p, true));
    // async: the AI fiber may switch stacks through Asyncify
    try {
      return await M.ccall(
        'hwengine_RunEngine',
        'number',
        ['number', 'number'],
        [args.length, argv],
        {
          async: true,
        },
      );
    } catch (e) {
      if (e && (e as { name?: string }).name === 'ExitStatus')
        return (e as { status: number }).status;
      throw e;
    } finally {
      for (const p of ptrs) M._free(p);
      M._free(argv);
    }
  }

  /** send bytes (one or more IPC frames) to the engine */
  push(bytes: Uint8Array) {
    const M = this.module;
    const p = M._malloc(bytes.length) as number;
    M.HEAPU8.set(bytes, p);
    M._hw_ipc_push(p, bytes.length);
    M._free(p);
  }

  private fromEngine(bytes: Uint8Array) {
    if (this.capture) {
      this.capture.push(new Uint8Array(bytes));
      return;
    }
    // remember saved campaign/mission variables: "V!name value\0"
    for (const msg of ipcSplit(bytes)[0]) {
      const kind = String.fromCharCode(msg[0] ?? 0);
      if ((kind === 'V' || kind === 'v') && msg[1] === 0x21) {
        const text = new TextDecoder().decode(msg.subarray(2)).replace(/\0[\s\S]*$/, '');
        const space = text.indexOf(' ');
        if (space > 0) this.vars[kind]!.set(text.substring(0, space), text.substring(space + 1));
      }
    }
    this.onMessage(bytes);
  }
}
