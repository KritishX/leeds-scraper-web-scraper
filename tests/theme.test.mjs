import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEME_KEY, nextPreference, parsePreference, resolveTheme } from '../src/theme.ts';

test('theme preference parsing falls back to system for missing or unknown values', () => {
  assert.equal(parsePreference('light'), 'light');
  assert.equal(parsePreference('dark'), 'dark');
  assert.equal(parsePreference('system'), 'system');
  for (const value of [null, undefined, '', 'Light', 'blue', 1]) assert.equal(parsePreference(value), 'system');
});

test('system follows the OS; an explicit choice overrides it', () => {
  assert.equal(resolveTheme('system', true), 'light');
  assert.equal(resolveTheme('system', false), 'dark');
  assert.equal(resolveTheme('light', false), 'light');
  assert.equal(resolveTheme('dark', true), 'dark');
});

test('the toggle cycles system → light → dark → system', () => {
  assert.equal(nextPreference('system'), 'light');
  assert.equal(nextPreference('light'), 'dark');
  assert.equal(nextPreference('dark'), 'system');
});

test('the pre-paint script and the app agree on the storage key and page colours', () => {
  const init = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
  const theme = readFileSync(new URL('../src/theme.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.ok(init.includes(`"${THEME_KEY}"`));
  const bg = (selector) => css.slice(css.indexOf(selector)).match(/--bg: (#[0-9a-f]{6});/)[1];
  for (const colour of [bg(':root {'), bg(':root[data-theme="light"]')]) {
    assert.ok(init.includes(colour), `theme-init.js uses ${colour}`);
    assert.ok(theme.includes(colour), `theme.ts uses ${colour}`);
  }
});

test('styles use theme tokens instead of colour literals outside the token blocks', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const lightEnd = css.indexOf('\n}', css.indexOf(':root[data-theme="light"]'));
  const rules = css.slice(lightEnd);
  assert.deepEqual(rules.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) ?? [], []);
});
