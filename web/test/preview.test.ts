import { describe, expect, it } from 'vitest';
import { MAPGEN } from '../src/lib/engine/config';
import { ipcSplit } from '../src/lib/engine/host';
import { previewConfig, type PreviewParams } from '../src/lib/engine/preview';

const base: PreviewParams = {
  mapgen: MAPGEN.regular,
  seed: '{abc}',
  templateFilter: 2,
  featureSize: 12,
  mazeSize: 3,
  script: 'Normal',
  scriptParam: '',
  staticMap: '',
};

const frames = (p: PreviewParams) =>
  ipcSplit(previewConfig(p))[0].map((m) => new TextDecoder().decode(m));

describe('previewConfig (HWMap::SendToClientFirst)', () => {
  it('sends the map parameters and the pong', () => {
    expect(frames(base)).toEqual([
      'eseed {abc}',
      'e$template_filter 2',
      'e$mapgen 0',
      'e$feature_size 12',
      '!',
    ]);
  });

  it('adds the maze size for maze and perlin maps', () => {
    expect(frames({ ...base, mapgen: MAPGEN.maze })).toContain('e$maze_size 3');
    expect(frames({ ...base, mapgen: MAPGEN.perlin })).toContain('e$maze_size 3');
  });

  it('adds the style script with its parameter', () => {
    const f = frames({ ...base, script: 'Capture the Flag', scriptParam: 'x=1' });
    expect(f).toContain('escript Scripts/Multiplayer/Capture_the_Flag.lua');
    expect(f).toContain('e$scriptparam x=1');
  });

  it('sends drawn map data in chunks of 200 bytes', () => {
    const drawnMap = new Uint8Array(450).fill(7);
    const f = ipcSplit(previewConfig({ ...base, mapgen: MAPGEN.drawn, drawnMap }))[0];
    const draws = f.filter((m) => new TextDecoder().decode(m.subarray(0, 6)) === 'edraw ');
    expect(draws.map((m) => m.length - 6)).toEqual([200, 200, 50]);
  });
});
