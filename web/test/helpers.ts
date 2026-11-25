import type { TeamInfo } from '../src/lib/protocol/messages';

export function newTeamInfo(hogs = 8): TeamInfo {
  return {
    owner: '',
    name: 'Team',
    color: 0,
    grave: 'Statue',
    fort: 'Plane',
    voicePack: 'Default',
    flag: 'hedgewars',
    difficulty: 0,
    hedgehogs: Array.from({ length: hogs }, (_, i) => ({ name: `hog ${i + 1}`, hat: 'NoHat' })),
  };
}
