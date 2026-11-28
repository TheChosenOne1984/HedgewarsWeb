import { describe, expect, it } from 'vitest';
import { DEFAULT_AMMO_SETS } from '../src/lib/engine/frontend-data.generated';
import {
  EDITABLE_WEAPONS,
  WEAPON_COUNT,
  ammoNameProblem,
  ammoValue,
  copyName,
  setAmmoValue,
  weaponIcon,
  weaponName,
} from '../src/lib/weapons';

const ammo = DEFAULT_AMMO_SETS[0]!.ammo;

describe('weapon sets (port of selectWeapon.cpp)', () => {
  it('knows 60 weapons and shows all but Skip and the unused Creeper', () => {
    expect(WEAPON_COUNT).toBe(60);
    expect(EDITABLE_WEAPONS).toHaveLength(58);
    expect(EDITABLE_WEAPONS).not.toContain(7);
    expect(EDITABLE_WEAPONS).not.toContain(58);
  });

  it('names weapons in the engine locale order (TAmmoStrId via Ammoz)', () => {
    expect(weaponName(1, 'en')).toBe('Grenade');
    expect(weaponName(1, 'de')).toBe('Granate');
    expect(weaponName(56, 'en')).toBe('Rubber');
    expect(weaponName(58, 'en')).toBe('Creeper');
    expect(weaponName(60, 'en')).toBe('Sentry Bot');
  });

  it('reads and writes the four fields of the ammo string', () => {
    // grenade: 9 (infinite) at the start in the default set
    expect(ammoValue(ammo, 'count', 1)).toBe(9);
    const changed = setAmmoValue(ammo, 'delay', 3, 4);
    expect(ammoValue(changed, 'delay', 3)).toBe(4);
    expect(changed.length).toBe(ammo.length);
    expect(changed.substring(0, 60)).toBe(ammo.substring(0, 60));
    // probability, delay and crate amount stop at 8
    expect(ammoValue(setAmmoValue(ammo, 'probability', 2, 9), 'probability', 2)).toBe(8);
  });

  it('finds icons in columns of 16 in Ammos_base.png', () => {
    expect(weaponIcon(1)).toEqual({ x: 0, y: 0 });
    expect(weaponIcon(17)).toEqual({ x: 32, y: 0 });
    expect(weaponIcon(18)).toEqual({ x: 32, y: 32 });
  });

  it('checks names and finds free names for copies', () => {
    expect(ammoNameProblem('  ', [])).not.toBeNull();
    expect(ammoNameProblem('crazy', ['Crazy'])).not.toBeNull();
    expect(ammoNameProblem('Mine', ['Crazy'])).toBeNull();
    expect(copyName('Default', ['Default', 'Default 2'])).toBe('Default 3');
  });
});
