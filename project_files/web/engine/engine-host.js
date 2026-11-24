// Host for the web engine (hwengine.mjs) in the browser.
//
// - loads the asset packs a game needs into the engine's file system
// - queues the game config before the engine starts (the web engine cannot
//   wait for the frontend, see uIO.IPCWaitPongEvent)
// - relays IPC: engine messages to onMessage, push() to the engine
// - reports the end of the engine with onExit(code)
//
// The IPC wire format is the desktop engine's: <len:u8><payload>, engine
// messages end with the GameTicks as u16.

const PACK_MAGIC = 0x31505748; // "HWP1" little endian
const DATA_PREFIX = '/data/Data';
const USER_PREFIX = '/user';

/** Encode one IPC message (string or bytes) as <len><payload>. */
export function ipcFrame(payload) {
    const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
    const body = bytes.subarray(0, 250);
    const out = new Uint8Array(body.length + 1);
    out[0] = body.length;
    out.set(body, 1);
    return out;
}

/** Concatenate IPC frames. */
export function ipcFrames(payloads) {
    const frames = payloads.map(ipcFrame);
    const out = new Uint8Array(frames.reduce((n, f) => n + f.length, 0));
    let pos = 0;
    for (const f of frames) {
        out.set(f, pos);
        pos += f.length;
    }
    return out;
}

/** Split a byte stream into IPC messages; returns [messages, rest]. */
export function ipcSplit(bytes) {
    const messages = [];
    let pos = 0;
    while (pos < bytes.length && pos + bytes[pos] < bytes.length) {
        messages.push(bytes.subarray(pos + 1, pos + 1 + bytes[pos]));
        pos += 1 + bytes[pos];
    }
    return [messages, bytes.subarray(pos)];
}

/** Parse an .hwpack file into [{path, data}]. */
export function parsePack(buffer) {
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== PACK_MAGIC) throw new Error('not a hwpack');
    const headerLength = view.getUint32(4, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, headerLength)));
    let pos = 8 + headerLength;
    return header.files.map(({ path, size }) => {
        const data = new Uint8Array(buffer, pos, size);
        pos += size;
        return { path, data };
    });
}

export class EngineHost {
    /**
     * @param {object} opts
     * @param {string} opts.engineUrl  URL of hwengine.mjs
     * @param {string} opts.packsUrl   base URL of the asset packs (with manifest.json)
     * @param {HTMLCanvasElement} [opts.canvas]
     */
    constructor({ engineUrl, packsUrl, canvas }) {
        this.engineUrl = engineUrl;
        this.packsUrl = packsUrl.endsWith('/') ? packsUrl : packsUrl + '/';
        this.canvas = canvas;
        this.Module = null;
        this.manifest = null;
        this.loadedPacks = new Set();
        this.onMessage = () => {};
        this.onExit = () => {};
        this.onLog = (line) => console.log(line);
        // campaign/mission variables; the engine saves them over IPC ("V!"/"v!")
        // and reads them synchronously through Module.getEngineVar
        this.vars = { V: new Map(), v: new Map() };
        this.exited = false;
    }

    async init() {
        const { default: createHwEngine } = await import(this.engineUrl);
        const finish = (code) => {
            if (!this.exited) {
                this.exited = true;
                this.onExit(code);
            }
        };
        this.Module = await createHwEngine({
            noInitialRun: true,
            canvas: this.canvas,
            print: (s) => this.onLog(s),
            printErr: (s) => this.onLog(s),
            onExit: finish,
            onEngineExit: finish,
            onIpcMessage: (bytes) => this._fromEngine(bytes),
            getEngineVar: (kind, name) => this.vars[kind]?.get(name) ?? '',
            locateFile: (path) => new URL(path, this.engineUrl).href,
        });
        const FS = this.Module.FS;
        for (const dir of ['/data', DATA_PREFIX, USER_PREFIX]) FS.mkdir(dir);
        this.manifest = await (await fetch(this.packsUrl + 'manifest.json')).json();
    }

    /** Pack names needed for a game: core plus the given extras that exist. */
    packsFor({ theme, map, voices = [], music = [], locale = 'en', forts = false, missions = false }) {
        const names = ['core'];
        if (theme) names.push('themes/' + theme);
        if (map) names.push('maps/' + map);
        for (const v of voices) names.push('voices/' + v);
        for (const m of music) names.push('music/' + m);
        if (locale && locale !== 'en') names.push('locale/' + locale);
        if (this.manifest.cjkLocales.includes(locale)) names.push('fonts-cjk');
        if (forts) names.push('forts');
        if (missions) names.push('missions');
        return names.filter((n) => n in this.manifest.packs);
    }

    /** Download and unpack packs into the engine's file system. */
    async loadPacks(names, onProgress = () => {}) {
        const todo = names.filter((n) => !this.loadedPacks.has(n));
        const total = todo.reduce((s, n) => s + this.manifest.packs[n].size, 0);
        let done = 0;
        await Promise.all(todo.map(async (name) => {
            const pack = this.manifest.packs[name];
            const response = await fetch(this.packsUrl + pack.file);
            if (!response.ok) throw new Error(`pack ${name}: HTTP ${response.status}`);
            const files = parsePack(await response.arrayBuffer());
            for (const { path, data } of files) this._writeFile(DATA_PREFIX + '/' + path, data);
            this.loadedPacks.add(name);
            done += pack.size;
            onProgress(done, total);
        }));
    }

    _writeFile(path, data) {
        const FS = this.Module.FS;
        const dir = path.substring(0, path.lastIndexOf('/'));
        FS.mkdirTree(dir);
        FS.writeFile(path, data);
    }

    /**
     * Start the engine.
     * @param {Uint8Array} config  the complete game config as IPC frames
     * @param {string[]} [extraArgs] additional engine arguments
     */
    async start(config, extraArgs = []) {
        // queue config and the pong for the engine's "C" + "?" request
        this.push(config);
        this.push(ipcFrame('!'));
        const width = this.canvas ? this.canvas.clientWidth || 1024 : 1024;
        const height = this.canvas ? this.canvas.clientHeight || 768 : 768;
        const args = ['hwengine', '--internal', '--port', '0',
            '--prefix', DATA_PREFIX, '--user-prefix', USER_PREFIX,
            '--width', String(width & ~1), '--height', String(height & ~1),
            ...extraArgs];
        const M = this.Module;
        const ptrs = args.map((a) => M.stringToNewUTF8(a));
        const argv = M._malloc(4 * ptrs.length);
        const view = new DataView(M.HEAPU8.buffer);
        ptrs.forEach((p, i) => view.setUint32(argv + 4 * i, p, true));
        // async: the AI fiber may switch stacks through Asyncify
        const rc = await M.ccall('hwengine_RunEngine', 'number', ['number', 'number'],
                                 [args.length, argv], { async: true });
        // -1 is never returned; the browser-driven main loop reports through onExit
        return rc;
    }

    /** Send bytes (one or more IPC frames) to the engine. */
    push(bytes) {
        const M = this.Module;
        const p = M._malloc(bytes.length);
        M.HEAPU8.set(bytes, p);
        M._hw_ipc_push(p, bytes.length);
        M._free(p);
    }

    _fromEngine(bytes) {
        // remember saved campaign/mission variables: "V!name value"
        for (const msg of ipcSplit(bytes)[0]) {
            const kind = String.fromCharCode(msg[0]);
            if ((kind === 'V' || kind === 'v') && msg[1] === 0x21) {
                const text = new TextDecoder().decode(msg.subarray(2)).replace(/\0.*$/s, '');
                const space = text.indexOf(' ');
                if (space > 0) this.vars[kind].set(text.substring(0, space), text.substring(space + 1));
            }
        }
        this.onMessage(bytes);
    }
}
