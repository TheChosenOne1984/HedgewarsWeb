import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BIND_ACTIONS } from '../src/lib/binds';
import { setLocale, t, TRANSLATIONS } from '../src/lib/i18n.svelte';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : /\.(svelte|ts)$/.test(f) ? [p] : [];
  });
}

/** texts passed to t()/tr() as string literals */
function usedTexts(): Set<string> {
  const used = new Set<string>();
  for (const file of sources(join(__dirname, '../src'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\bt[r]?\(\s*'((?:[^'\\]|\\.)*)'/g))
      used.add(m[1]!.replace(/\\'/g, "'"));
  }
  for (const b of BIND_ACTIONS) {
    used.add(b.label);
    if (b.category) used.add(b.category);
  }
  return used;
}

describe('translations', () => {
  it('has a German text for every text the client shows', () => {
    const missing = [...usedTexts()].filter((s) => !(s in TRANSLATIONS.de));
    expect(missing).toEqual([]);
  });

  it('keeps the placeholders', () => {
    for (const [en, de] of Object.entries(TRANSLATIONS.de)) {
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(names(de), en).toEqual(names(en));
    }
  });

  it('replaces placeholders and switches the language', () => {
    setLocale('de');
    expect(t('Players ({n})', { n: 3 })).toBe('Spieler (3)');
    setLocale('en');
    expect(t('Players ({n})', { n: 3 })).toBe('Players (3)');
    expect(t('not translated')).toBe('not translated');
  });
});
