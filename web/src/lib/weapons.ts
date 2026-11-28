// Weapon sets (port of frontend-qt6/ui/widget/selectWeapon.cpp): an ammo
// string holds one digit per weapon (ammo type - 1) for each of four
// fields, in this order: count (9 = infinite), probability in crates,
// delay in turns, amount in crates.

import { AMMO_MENU, DEFAULT_AMMO_SETS, WEAPON_NAMES } from './engine/frontend-data.generated';

export const WEAPON_COUNT = DEFAULT_AMMO_SETS[0]!.ammo.length / 4;

export type AmmoField = 'count' | 'probability' | 'delay' | 'crate';

export const AMMO_FIELDS: { field: AmmoField; max: number; label: string; hint: string }[] = [
  {
    field: 'count',
    max: 9,
    label: 'Starting ammo',
    hint: 'How many each team has at the start; ∞ is unlimited.',
  },
  {
    field: 'probability',
    max: 8,
    label: 'Crate probability',
    hint: 'How likely a crate contains this weapon.',
  },
  {
    field: 'delay',
    max: 8,
    label: 'Delay',
    hint: 'Turns before the weapon can be used.',
  },
  {
    field: 'crate',
    max: 8,
    label: 'Ammo in crates',
    hint: 'How many a crate gives.',
  },
];

/** ammo types the editor shows, in ammo menu order (no Skip, no unused Creeper, like Qt) */
export const EDITABLE_WEAPONS: number[] = AMMO_MENU.filter((t) => t !== 7 && t !== 58);

export function weaponName(type: number, locale: string): string {
  const names = WEAPON_NAMES[locale === 'de' ? 'de' : 'en'];
  return names[type - 1] || WEAPON_NAMES.en[type - 1] || `#${type}`;
}

function offset(field: AmmoField): number {
  return AMMO_FIELDS.findIndex((f) => f.field === field) * WEAPON_COUNT;
}

/** SelWeaponWidget::readWeaponValue: a digit, capped at the field's maximum */
export function ammoValue(ammo: string, field: AmmoField, type: number): number {
  const max = AMMO_FIELDS.find((f) => f.field === field)!.max;
  const v = Number(ammo[offset(field) + type - 1]);
  return Number.isInteger(v) ? Math.min(v, max) : 0;
}

export function setAmmoValue(ammo: string, field: AmmoField, type: number, value: number): string {
  const max = AMMO_FIELDS.find((f) => f.field === field)!.max;
  const i = offset(field) + type - 1;
  const v = Math.max(0, Math.min(max, Math.round(value)));
  return ammo.substring(0, i) + String(v) + ammo.substring(i + 1);
}

/** position of a weapon's icon in Ammos_base.png (columns of 16 icons of 32x32) */
export function weaponIcon(type: number): { x: number; y: number } {
  const i = type - 1;
  return { x: Math.floor(i / 16) * 32, y: (i % 16) * 32 };
}

/** why a name cannot be used, or null: not empty, one line, unique (ignoring case) */
export function ammoNameProblem(name: string, taken: string[]): string | null {
  const n = name.trim();
  if (n === '') return 'Enter a name.';
  if (/[\n\r]/.test(n) || n.length > 40) return 'At most 40 characters on one line.';
  if (taken.some((t) => t.toLowerCase() === n.toLowerCase()))
    return 'There is already a weapon set with this name.';
  return null;
}

/** a free name for a copy: "<name> 2", "<name> 3", ... */
export function copyName(name: string, taken: string[]): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  const base = name.replace(/ \d+$/, '');
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}
