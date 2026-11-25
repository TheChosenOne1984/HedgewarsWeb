import { describe, expect, it } from 'vitest';
import { effectiveBinds, keyName, mouseName, settingsIni } from '../src/lib/binds';

describe('key bindings', () => {
  it('maps browser key codes to the engine key names (keys.csv)', () => {
    expect(keyName('KeyA')).toBe('a');
    expect(keyName('Digit7')).toBe('7');
    expect(keyName('F10')).toBe('f10');
    expect(keyName('Numpad8')).toBe('keypad_8');
    expect(keyName('Space')).toBe('space');
    expect(keyName('ShiftLeft')).toBe('left_shift');
    expect(keyName('Comma')).toBe(',');
    expect(keyName('Unknown')).toBeNull();
    expect(mouseName(2)).toBe('mouser');
  });

  it('writes only changed bindings, encoded like QSettings', () => {
    const ini = settingsIni({ '+attack': 'x', 'slot 1': ',', switch: 'tab', '+up': '\\' });
    expect(ini).toBe('[Binds]\n%2Bup=\\\\\nslot%201=","\n%2Battack=x\n\n');
  });

  it('applies changes over the defaults', () => {
    const b = effectiveBinds({ '+attack': 'x' });
    expect(b['+attack']).toBe('x');
    expect(b['+left']).toBe('left');
  });
});
