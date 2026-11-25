// Random teams, hats and hedgehog names: port of frontend-qt6/util/namegen.cpp.
// Data/Names: types.ini groups team names with hats ("themes"),
// <hat>.cfg lists the name dictionaries for a hat (default "generic"),
// <dict>.txt the names.

import type { TeamInfo } from './protocol/messages';

export interface NameData {
  /** types.ini: groups of team names and the hats that go with them */
  types: { teamNames: string[]; hats: string[] }[];
  /** Names/<file> -> its non-empty lines (.txt dictionaries, .cfg hat dictionaries) */
  files: Map<string, string[]>;
}

export interface TeamChoices {
  hats: string[];
  graves: string[];
  flags: string[];
  forts: string[];
  voices: string[];
}

/** a random integer in [0, n) */
export type Random = (n: number) => number;
export const mathRandom: Random = (n) => Math.floor(Math.random() * n);

export function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l !== '');
}

/** HWNamegen::loadTypes: "#####" switches between team names and hats, "*****"/"*END*" ends */
export function parseTypes(text: string): NameData['types'] {
  const types: NameData['types'] = [{ teamNames: [], hats: [] }];
  let counter = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line === '#####') {
      counter++;
      if (counter % 2 === 0) types.push({ teamNames: [], hats: [] });
    } else if (line === '*****' || line === '*END*') {
      break;
    } else if (line !== '') {
      const group = types[Math.floor(counter / 2)]!;
      if (counter % 2 === 0) group.teamNames.push(line);
      else group.hats.push(line);
    }
  }
  return types;
}

function pick<T>(list: readonly T[], rand: Random): T {
  return list[rand(list.length)]!;
}

function dictsForHat(data: NameData, hat: string): string[] {
  const dicts = data.files.get(`${hat}.cfg`);
  return dicts && dicts.length > 0 ? dicts : ['generic'];
}

function dictContents(data: NameData, dict: string): string[] {
  const names = data.files.get(`${dict}.txt`);
  return names && names.length > 0 ? names : [dict];
}

function withHog(team: TeamInfo, i: number, change: Partial<TeamInfo['hedgehogs'][0]>) {
  const hedgehogs = team.hedgehogs.map((h, j) => (j === i ? { ...h, ...change } : h));
  return { ...team, hedgehogs };
}

/** teamRandomHogName: a name from dict that no other hedgehog of the team has */
function randomHogName(team: TeamInfo, i: number, dict: string[], rand: Random): TeamInfo {
  const taken = new Set(team.hedgehogs.map((h) => h.name));
  const fresh = dict.filter((n) => !taken.has(n));
  return withHog(team, i, { name: pick(fresh.length > 0 ? fresh : dict, rand) });
}

/** teamRandomHogNames: names that suit each hedgehog's hat */
export function randomHogNames(team: TeamInfo, data: NameData, rand: Random = mathRandom) {
  let dict: string[] = [];
  team.hedgehogs.forEach((hog, i) => {
    if (i === 0 || hog.hat !== team.hedgehogs[i - 1]!.hat)
      dict = dictContents(data, pick(dictsForHat(data, hog.hat), rand));
    team = randomHogName(team, i, dict, rand);
  });
  return team;
}

/** teamRandomHats: 50 %: one hat for all, 50 %: a hat each */
export function randomHats(team: TeamInfo, choices: TeamChoices, rand: Random = mathRandom) {
  const same = rand(2) === 0;
  team.hedgehogs.forEach((_, i) => {
    const hat = same && i > 0 ? team.hedgehogs[i - 1]!.hat : pick(choices.hats, rand);
    team = withHog(team, i, { hat });
  });
  return team;
}

/** teamRandomEverything: grave, fort, flag, voice, themed or random hats, names, team name */
export function randomTeam(
  team: TeamInfo,
  data: NameData,
  choices: TeamChoices,
  rand: Random = mathRandom,
): TeamInfo {
  const themes = data.types.filter((t) => t.hats.length > 0);
  if (themes.length === 0) return team;
  const kind = rand(themes.length);
  team = {
    ...team,
    grave: pick(choices.graves, rand),
    fort: pick(choices.forts, rand),
    flag: pick(choices.flags, rand),
    voicePack: pick(choices.voices, rand),
  };
  // 50 %: themed hats, 40 %: one hat for all, 10 %: a hat each
  const r = rand(10);
  const mode = r <= 4 ? 'themed' : r <= 8 ? 'same' : 'each';
  let dict: string[] = [];
  team.hedgehogs.forEach((_, i) => {
    const hat =
      mode === 'themed'
        ? pick(themes[kind]!.hats, rand)
        : mode === 'same' && i > 0
          ? team.hedgehogs[i - 1]!.hat
          : pick(choices.hats, rand);
    team = withHog(team, i, { hat });
    if (i === 0 || hat !== team.hedgehogs[i - 1]!.hat)
      dict = dictContents(data, pick(dictsForHat(data, hat), rand));
    team = randomHogName(team, i, dict, rand);
  });
  // themed hats: a team name of the theme; otherwise a generic one (the first group)
  const names = (mode === 'themed' ? themes[kind]! : data.types[0]!).teamNames;
  return names.length > 0 ? { ...team, name: pick(names, rand) } : team;
}
