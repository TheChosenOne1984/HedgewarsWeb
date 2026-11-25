// Map previews (port of frontend-qt6/net/hwmap.cpp): generated maps are
// rendered by a second engine instance without a canvas ("--landpreview"),
// fixed maps use their preview.png.

import { EngineHost, ipcFrame } from './host';
import { MAPGEN } from './config';

export interface PreviewParams {
  mapgen: number;
  seed: string;
  templateFilter: number;
  featureSize: number;
  mazeSize: number;
  /** style (Scripts/Multiplayer/<name>.lua), 'Normal' for none */
  script: string;
  scriptParam: string;
  /** name of a fixed map (mapgen MAPGEN.map) */
  staticMap: string;
  /** decoded drawn map data (mapgen MAPGEN.drawn) */
  drawnMap?: Uint8Array;
}

export interface Preview {
  /** 256x128 land alpha values (0 = air) */
  alpha?: Uint8Array;
  /** URL of a ready-made image (fixed maps) */
  imageUrl?: string;
  /** most hedgehogs the map has room for */
  maxHedgehogs?: number;
}

export const PREVIEW_WIDTH = 256;
export const PREVIEW_HEIGHT = 128;

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** the IPC config of a land preview (HWMap::SendToClientFirst) */
export function previewConfig(p: PreviewParams): Uint8Array {
  const frames = [
    `eseed ${p.seed}`,
    `e$template_filter ${p.templateFilter}`,
    `e$mapgen ${p.mapgen}`,
    `e$feature_size ${p.featureSize}`,
  ].map((s) => ipcFrame(s));
  if (p.script && p.script !== 'Normal') {
    frames.push(ipcFrame(`escript Scripts/Multiplayer/${p.script.replace(/ /g, '_')}.lua`));
    frames.push(ipcFrame(`e$scriptparam ${p.scriptParam}`));
  }
  if (p.mapgen === MAPGEN.maze || p.mapgen === MAPGEN.perlin) {
    frames.push(ipcFrame(`e$maze_size ${p.mazeSize}`));
  } else if (p.mapgen === MAPGEN.drawn && p.drawnMap) {
    const prefix = new TextEncoder().encode('edraw ');
    for (let i = 0; i < p.drawnMap.length; i += 200)
      frames.push(ipcFrame(concat([prefix, p.drawnMap.subarray(i, i + 200)])));
  }
  frames.push(ipcFrame('!'));
  return concat(frames);
}

function cacheKey(p: PreviewParams): string {
  return JSON.stringify({ ...p, drawnMap: p.drawnMap ? Array.from(p.drawnMap).join(',') : '' });
}

export class PreviewService {
  private host: Promise<EngineHost> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private cache = new Map<string, Preview>();

  constructor(
    private engineUrl: string,
    private packsUrl: string,
  ) {
    if (!this.packsUrl.endsWith('/')) this.packsUrl += '/';
  }

  private engine(): Promise<EngineHost> {
    this.host ??= (async () => {
      const host = new EngineHost(this.engineUrl, this.packsUrl);
      host.onLog = () => {};
      await host.init();
      await host.loadPacks(['core']);
      return host;
    })();
    return this.host;
  }

  async get(p: PreviewParams): Promise<Preview> {
    if (p.mapgen === MAPGEN.map)
      return { imageUrl: `${this.packsUrl}previews/${encodeURIComponent(p.staticMap)}.png` };
    const key = cacheKey(p);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const run = this.queue.then(async () => {
      const raw = await (await this.engine()).landPreview(previewConfig(p));
      const size = PREVIEW_WIDTH * PREVIEW_HEIGHT;
      if (raw.length !== size + 1) throw new Error(`land preview: ${raw.length} bytes`);
      return { alpha: raw.slice(0, size), maxHedgehogs: raw[size] };
    });
    this.queue = run.catch(() => {});
    const preview = await run;
    if (this.cache.size > 50) this.cache.clear();
    this.cache.set(key, preview);
    return preview;
  }
}
