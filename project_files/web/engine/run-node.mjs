#!/usr/bin/env node
// Run the web engine (hwengine.mjs) headless in node, with the same command
// line as the desktop engine. Used for tests: Lua engine tests and demo
// replays in --stats-only mode. The working directory is mounted unchanged,
// so relative paths work as with the desktop binary.
//
// Usage: node run-node.mjs <path/to/hwengine.mjs> <engine args...>

import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// print engine crashes as a stack trace (node would also print the
// offending line of the minified module, which is one huge line)
const onFatal = (e) => {
    process.stderr.write((e && e.stack ? e.stack : String(e)) + '\n');
    process.exit(1);
};
process.on('uncaughtException', onFatal);
process.on('unhandledRejection', onFatal);

const [enginePath, ...args] = process.argv.slice(2);
const { default: createHwEngine } = await import(pathToFileURL(path.resolve(enginePath)).href);

let exitCode = null;
const Module = await createHwEngine({
    noInitialRun: true,
    print: (s) => process.stdout.write(s + '\n'),
    printErr: (s) => process.stderr.write(s + '\n'),
    onExit: (code) => { exitCode = code; },
    onEngineExit: (code) => { exitCode = code; },
});

// Headless runs (--stats-only, --lua-test) create no window, but the engine
// still issues a few GL calls, which are no-ops without a context on desktop.
// Give the GL emulation a context that ignores everything.
const nullGl = new Proxy({}, {
    get: (target, prop) => {
        if (prop === 'canvas') return { width: 1, height: 1 };
        if (prop === 'drawingBufferWidth' || prop === 'drawingBufferHeight') return 1;
        return () => 0;
    },
});
const glHandle = Module.GL.registerContext(nullGl, { majorVersion: 1, minorVersion: 0 });
Module.GL.makeContextCurrent(glHandle);

// mount the host's working directory and temp directory at the same paths
function mountHostDir(hostDir) {
    let dir = '';
    for (const part of hostDir.split('/').filter(Boolean)) {
        dir += '/' + part;
        try { Module.FS.mkdir(dir); } catch (e) { /* exists */ }
    }
    Module.FS.mount(Module.FS.filesystems.NODEFS, { root: hostDir }, hostDir);
}
const cwd = process.cwd();
mountHostDir(cwd);
const tmp = os.tmpdir();
if (!cwd.startsWith(tmp + '/') && cwd !== tmp) mountHostDir(tmp);
Module.FS.chdir(cwd);

// IPC bridge: with "--internal --port N" the desktop engine connects to the
// frontend over TCP. The web engine exchanges the same bytes through its
// in-memory queue, so bridge them. The web engine cannot wait for replies,
// so the frontend has to send the complete config and the pong ('!') right
// away; we start the engine once the pong has arrived.
let ipcSocket = null;
const portIndex = args.indexOf('--port');
if (args[0] === '--internal' && portIndex >= 0) {
    ipcSocket = net.connect(Number(args[portIndex + 1]), '127.0.0.1');
    await new Promise((resolve, reject) => {
        ipcSocket.once('connect', resolve);
        ipcSocket.once('error', reject);
    });
    Module.onIpcMessage = (bytes) => ipcSocket.write(bytes);
    const pushToEngine = (bytes) => {
        const p = Module._malloc(bytes.length);
        Module.HEAPU8.set(bytes, p);
        Module._hw_ipc_push(p, bytes.length);
        Module._free(p);
    };
    await new Promise((resolve) => {
        let buf = Buffer.alloc(0);
        let ponged = false;
        ipcSocket.on('data', (data) => {
            pushToEngine(data);
            if (ponged) return;
            buf = Buffer.concat([buf, data]);
            while (buf.length > 0 && buf.length > buf[0]) {
                const frame = buf.subarray(1, 1 + buf[0]);
                buf = buf.subarray(1 + buf[0]);
                if (frame.length === 1 && frame[0] === 0x21) { ponged = true; resolve(); }
            }
        });
    });
}

const argv = ['hwengine', ...args];
const ptrs = argv.map((a) => Module.stringToNewUTF8(a));
const argvPtr = Module._malloc(4 * ptrs.length);
const view = new DataView(Module.HEAPU8.buffer);
ptrs.forEach((p, i) => view.setUint32(argvPtr + 4 * i, p, true));

try {
    // async: the AI fiber switches stacks through Asyncify, which may unwind
    // to JavaScript; ccall resolves once the engine call has really finished
    const rc = await Module.ccall('hwengine_RunEngine', 'number', ['number', 'number'],
                                  [argv.length, argvPtr], { async: true });
    if (exitCode === null) exitCode = rc;
} catch (e) {
    if (e && e.name === 'ExitStatus') {
        exitCode = e.status;
    } else {
        throw e;
    }
}
if (ipcSocket) {
    await new Promise((resolve) => ipcSocket.end(resolve));
}
process.exit(exitCode ?? 0);
