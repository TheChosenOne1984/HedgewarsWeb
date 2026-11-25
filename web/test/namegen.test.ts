import { describe, expect, it } from 'vitest';
import { newTeamInfo } from './helpers';
import {
  parseTypes,
  randomHats,
  randomHogNames,
  randomTeam,
  type NameData,
  type Random,
} from '../src/lib/namegen';

/** a deterministic "random" source: returns the given values in turn, modulo n */
function sequence(...values: number[]): Random {
  let i = 0;
  return (n) => values[i++ % values.length]! % n;
}

const types = parseTypes(
  'Generic Team\nOther Team\n#####\nNoHat\n#####\nPirates\n#####\npirate_hat\npirate_jack\n*****\nignored',
);
const data: NameData = {
  types,
  files: new Map([
    ['pirate_hat.cfg', ['pirates']],
    ['pirates.txt', ['Blackbeard', 'Morgan', 'Kidd']],
    ['generic.txt', ['Alpha', 'Bravo']],
  ]),
};
const choices = {
  hats: ['NoHat', 'pirate_hat', 'chef'],
  graves: ['Statue', 'skull'],
  flags: ['hedgewars', 'germany'],
  forts: ['Plane', 'Castle'],
  voices: ['Default', 'Pirate'],
};

describe('namegen (port of frontend-qt6 namegen.cpp)', () => {
  it('reads types.ini: team names and hats in groups, up to *****', () => {
    expect(types).toEqual([
      { teamNames: ['Generic Team', 'Other Team'], hats: ['NoHat'] },
      { teamNames: ['Pirates'], hats: ['pirate_hat', 'pirate_jack'] },
    ]);
  });

  it('names hedgehogs from their hat dictionary, without duplicates while names last', () => {
    const team = {
      ...newTeamInfo(3),
      hedgehogs: newTeamInfo(3).hedgehogs.map((h) => ({ ...h, hat: 'pirate_hat' })),
    };
    const named = randomHogNames(team, data, sequence(0));
    expect(named.hedgehogs.map((h) => h.name)).toEqual(['Blackbeard', 'Morgan', 'Kidd']);
  });

  it('falls back to the generic dictionary for hats without a .cfg', () => {
    const named = randomHogNames(newTeamInfo(2), data, sequence(0));
    expect(named.hedgehogs.map((h) => h.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('gives all hedgehogs one hat or each its own', () => {
    const same = randomHats(newTeamInfo(4), choices, sequence(0, 2));
    expect(new Set(same.hedgehogs.map((h) => h.hat))).toEqual(new Set(['chef']));
    const each = randomHats(newTeamInfo(3), choices, sequence(1, 0, 1, 2));
    expect(each.hedgehogs.map((h) => h.hat)).toEqual(['NoHat', 'pirate_hat', 'chef']);
  });

  it('makes a themed team: hats and team name of one theme, names that suit the hats', () => {
    // kind 1 (pirates), mode r=0 (themed), every pick the first entry
    const team = randomTeam(newTeamInfo(2), data, choices, sequence(1, 0, 0, 0, 0, 0));
    expect(team.name).toBe('Pirates');
    expect(team.hedgehogs.every((h) => h.hat.startsWith('pirate_'))).toBe(true);
    expect(team.voicePack).toBe('Default');
    expect(team.hedgehogs.map((h) => h.name).every((n) => n.length > 0)).toBe(true);
  });
});
