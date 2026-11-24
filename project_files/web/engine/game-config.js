// Engine game config for local games.
//
// Port of HWGame::commonConfig, GameCFGWidget::getFullConfig and
// HWTeam::teamGameConfig (frontend-qt6) for the M1 harness. The complete,
// tested port follows in the web frontend (M3).

import { ipcFrames } from './engine-host.js';

// frontend-qt6/weapons.h, AMMOLINE_DEFAULT_*
export const DEFAULT_AMMO = {
    loadout: '939192942219912103223511100120000000021110010101111100010001',
    probability: '040504054160065554655446477657666666615551010111541111111073',
    delay: '000000000000020550000004000700400000000022000000060002000000',
    reinforcement: '131111031211111112311411111111111111121111111111111111111111',
};

// frontend-qt6/model/gameSchemeModel.cpp, "Default" scheme
export const DEFAULT_SCHEME = {
    gameFlags: 0x00002000, // random order
    damagePercent: 100,
    turnTime: 45,
    initHealth: 100,
    suddenDeathTurns: 15,
    caseFrequency: 5,
    minesTime: 3,
    minesNumber: 4,
    mineDudPercent: 0,
    explosives: 2,
    airMines: 0,
    sentries: 0,
    healthCasePercent: 35,
    healthCaseAmount: 25,
    waterRise: 47,
    healthDecrease: 5,
    ropePercent: 100,
    getAwayTime: 100,
    worldEdge: 0,
    scriptParam: '',
};

export const MAPGEN = { random: 0, maze: 1, perlin: 2, drawn: 3, forts: 4, wfc: 5 };

/**
 * @param {object} game
 * @param {string} game.seed
 * @param {string} game.theme
 * @param {number} [game.mapgen]
 * @param {string} [game.map]        name of a static map (Maps/<name>)
 * @param {string} [game.script]     multiplayer script (Scripts/Multiplayer/<name>.lua)
 * @param {object} [game.scheme]
 * @param {object} [game.ammo]
 * @param {object[]} game.teams      {name, color, botLevel (0 = human), hogs: [{name, hat}],
 *                                    grave, fort, voice, flag}
 * @returns {Uint8Array} IPC frames
 */
export function buildGameConfig(game) {
    const s = { ...DEFAULT_SCHEME, ...(game.scheme || {}) };
    const ammo = { ...DEFAULT_AMMO, ...(game.ammo || {}) };
    const mapgen = game.mapgen ?? MAPGEN.random;
    const cfg = ['TL'];
    if (game.script) cfg.push(`escript Scripts/Multiplayer/${game.script}.lua`);
    if (game.map) cfg.push(`emap ${game.map}`);
    cfg.push(
        `etheme ${game.theme}`,
        `eseed ${game.seed}`,
        `e$gmflags ${s.gameFlags}`,
        `e$damagepct ${s.damagePercent}`,
        `e$turntime ${s.turnTime * 1000}`,
        `e$inithealth ${s.initHealth}`,
        `e$sd_turns ${s.suddenDeathTurns}`,
        `e$casefreq ${s.caseFrequency}`,
        `e$minestime ${s.minesTime * 1000}`,
        `e$minesnum ${s.minesNumber}`,
        `e$minedudpct ${s.mineDudPercent}`,
        `e$explosives ${s.explosives}`,
        `e$airmines ${s.airMines}`,
        `e$sentries ${s.sentries}`,
        `e$healthprob ${s.healthCasePercent}`,
        `e$hcaseamount ${s.healthCaseAmount}`,
        `e$waterrise ${s.waterRise}`,
        `e$healthdec ${s.healthDecrease}`,
        `e$ropepct ${s.ropePercent}`,
        `e$getawaytime ${s.getAwayTime}`,
        `e$worldedge ${s.worldEdge}`,
        `e$template_filter ${game.templateFilter ?? 0}`,
        `e$feature_size ${game.featureSize ?? 12}`,
        `e$mapgen ${mapgen}`,
        `e$scriptparam ${s.scriptParam}`,
    );
    if (mapgen === MAPGEN.maze || mapgen === MAPGEN.perlin) cfg.push(`e$maze_size ${game.mazeSize ?? 0}`);

    const sharedAmmo = (s.gameFlags & 0x00010000) !== 0;
    const perHogAmmo = (s.gameFlags & 0x00400000) !== 0;
    for (const team of game.teams) {
        cfg.push(
            `eammloadt ${ammo.loadout}`,
            `eammprob ${ammo.probability}`,
            `eammdelay ${ammo.delay}`,
            `eammreinf ${ammo.reinforcement}`,
        );
        if (sharedAmmo || !perHogAmmo) cfg.push('eammstore');
        cfg.push(
            `eaddteam ${team.hash ?? '0'.repeat(32)} ${team.color & 0xffffff} ${team.name}`,
            `egrave ${team.grave ?? 'Statue'}`,
            `efort ${team.fort ?? 'Plane'}`,
            `evoicepack ${team.voice ?? 'Default'}`,
            `eflag ${team.flag ?? 'hedgewars'}`,
        );
        for (const hog of team.hogs) {
            cfg.push(`eaddhh ${team.botLevel ?? 0} ${s.initHealth} ${hog.name}`, `ehat ${hog.hat ?? 'NoHat'}`);
        }
    }
    return ipcFrames(cfg);
}

/** A random seed in the format the frontend uses ({uuid}). */
export function randomSeed() {
    const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
    return `{${hex(4)}-${hex(2)}-${hex(2)}-${hex(2)}-${hex(6)}}`;
}
