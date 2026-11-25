// Pictures of team items (hats, graves, flags) and the name lists (random
// names) for the team editor. They come
// from the core asset pack, which every game needs anyway and the browser
// keeps (content-addressed, cached as immutable), so showing them costs no
// extra download.

import { parsePack, type PackManifest } from './engine/host';
import { lines, parseTypes, type NameData } from './namegen';

export type ImageKind = 'hat' | 'grave' | 'flag';

const FOLDERS: Record<ImageKind, string> = {
  hat: 'Graphics/Hats/',
  grave: 'Graphics/Graves/',
  flag: 'Graphics/Flags/',
};

/** the part of the picture to show (sprite sheets: the first frame, like the Qt frontend) */
export const IMAGE_FRAME: Record<ImageKind, { width: number; height: number }> = {
  hat: { width: 32, height: 37 }, // a hedgehog wearing the hat (hatPicture)
  grave: { width: 32, height: 32 },
  flag: { width: 22, height: 15 },
};

export type TeamImages = (kind: ImageKind, name: string) => string | undefined;

export interface TeamData {
  image: TeamImages;
  names: NameData;
}

let loading: Promise<TeamData> | null = null;

/** the colour of team hats' colour layer in previews (the Qt frontend's first team colour) */
const HAT_PREVIEW_COLOR = '#ff0204';

/**
 * A hedgehog wearing a hat, like frontend-qt6 HatModel: the hedgehog's first
 * idle frame 5 px down, the hat's first frame on top, and for team hats
 * (64x32 or wider sheets) the colour layer multiplied with a team colour.
 */
function hatPicture(hedgehog: ImageBitmap, hat: ImageBitmap): string {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 37;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(hedgehog, 0, 0, 32, 32, 0, 5, 32, 32);
  ctx.drawImage(hat, 0, 0, 32, 32, 0, 0, 32, 32);
  const overlay = hat.height === 32 && hat.width === 64 ? 32 : hat.width > 64 ? 64 : -1;
  if (overlay >= 0) {
    const layer = document.createElement('canvas');
    layer.width = 32;
    layer.height = 32;
    const lc = layer.getContext('2d')!;
    lc.drawImage(hat, overlay, 0, 32, 32, 0, 0, 32, 32);
    lc.globalCompositeOperation = 'multiply';
    lc.fillStyle = HAT_PREVIEW_COLOR;
    lc.fillRect(0, 0, 32, 32);
    lc.globalCompositeOperation = 'destination-in'; // keep the layer's shape
    lc.drawImage(hat, overlay, 0, 32, 32, 0, 0, 32, 32);
    ctx.drawImage(layer, 0, 0);
  }
  return canvas.toDataURL();
}

/** The team item pictures and name lists of the core pack (loaded once). */
export function teamData(packsUrl: string): Promise<TeamData> {
  loading ??= (async () => {
    const base = packsUrl.endsWith('/') ? packsUrl : packsUrl + '/';
    const manifest = (await (await fetch(base + 'manifest.json')).json()) as PackManifest;
    const core = manifest.packs['core'];
    if (!core) throw new Error('no core pack');
    const response = await fetch(base + core.file);
    if (!response.ok) throw new Error(`core pack: HTTP ${response.status}`);
    const urls = new Map<string, string>();
    const hats: [string, Uint8Array][] = [];
    let hedgehog: ImageBitmap | null = null;
    const names: NameData = { types: [], files: new Map() };
    const text = new TextDecoder();
    for (const { path, data } of parsePack(await response.arrayBuffer())) {
      if (path === 'Names/types.ini') names.types = parseTypes(text.decode(data));
      else if (/^Names\/[^/]+\.(txt|cfg)$/.test(path))
        names.files.set(path.substring(6), lines(text.decode(data)));
      if (path === 'Graphics/Hedgehog/Idle.png')
        hedgehog = await createImageBitmap(new Blob([data.slice()], { type: 'image/png' }));
      if (!path.endsWith('.png') || !Object.values(FOLDERS).some((f) => path.startsWith(f)))
        continue;
      if (path.startsWith(FOLDERS.hat)) hats.push([path, data]);
      else urls.set(path, URL.createObjectURL(new Blob([data.slice()], { type: 'image/png' })));
    }
    for (const [path, data] of hats) {
      const blob = new Blob([data.slice()], { type: 'image/png' });
      urls.set(
        path,
        hedgehog ? hatPicture(hedgehog, await createImageBitmap(blob)) : URL.createObjectURL(blob),
      );
    }
    const image: TeamImages = (kind, name) => urls.get(`${FOLDERS[kind]}${name}.png`);
    return { image, names };
  })();
  loading.catch(() => (loading = null));
  return loading;
}
