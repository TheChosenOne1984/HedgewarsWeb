#!/usr/bin/env node
// Run the web engine (hwengine.mjs) headless in node, with the same command
// line as the desktop engine. Used for tests: Lua engine tests and demo
// replays in --stats-only mode. The working directory is mounted unchanged,
// so relative paths work as with the desktop binary.
//
// Usage: node run-node.mjs <path/to/hwengine.mjs> <engine args...>

import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

const argv = ['hwengine', ...args];
const ptrs = argv.map((a) => Module.stringToNewUTF8(a));
const argvPtr = Module._malloc(4 * ptrs.length);
const view = new DataView(Module.HEAPU8.buffer);
ptrs.forEach((p, i) => view.setUint32(argvPtr + 4 * i, p, true));

try {
    const rc = Module._hwengine_RunEngine(argv.length, argvPtr);
    if (exitCode === null) exitCode = rc;
} catch (e) {
    if (e && e.name === 'ExitStatus') {
        exitCode = e.status;
    } else {
        throw e;
    }
}
process.exit(exitCode ?? 0);
