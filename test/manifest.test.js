// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest, but nothing there knows which
// handlers the code registers: these tests keep both sides in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS } from '../src/app.js';
import { SCENE_ACTIONS, SCENE_TRIGGER_KEYS, ALARM_KINDS } from '../src/capabilities/scenes.js';
import { WIDGETS } from '../src/capabilities/widget.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { SECURITY_LEVELS } from '../src/somfy/api.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);

const allFields = [
  ...manifest.config_schema,
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// The store schema is the admission authority.
const FIELD_TYPES = ['string', 'number', 'boolean', 'select', 'multi_select', 'secret', 'section'];

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

/** Every multi-language object of the manifest, with its path. */
function texts(node, path = '') {
  if (Array.isArray(node)) {
    return node.flatMap((child, i) => texts(child, `${path}[${i}]`));
  }
  if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      return [[path, node]];
    }
    return Object.entries(node).flatMap(([key, child]) => texts(child, `${path}.${key}`));
  }
  return [];
}

test('every text of the manifest is written in English, French, German and Spanish', () => {
  const found = texts(manifest);
  assert.ok(found.length > 50);
  for (const [path, text] of found) {
    for (const language of LANGUAGES) {
      assert.ok(
        typeof text[language] === 'string' && text[language].length > 0,
        `${path} has no "${language}" text`,
      );
    }
  }
});

test('labels and descriptions are never plain strings', () => {
  for (const field of allFields) {
    for (const key of ['label', 'description', 'placeholder']) {
      if (field[key] !== undefined) {
        assert.equal(typeof field[key], 'object', `field "${field.key}": ${key} must be an object`);
      }
    }
  }
});

test('every field uses a type the store accepts, with a snake_case key', () => {
  for (const field of allFields) {
    assert.ok(FIELD_TYPES.includes(field.type), `field "${field.key}": type "${field.type}"`);
    assert.match(field.key, /^[a-z0-9_]+$/);
    if (field.min !== undefined || field.max !== undefined) {
      assert.equal(field.type, 'number', `field "${field.key}": min/max are number-only`);
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      assert.ok(!(field.key in DEFAULT_CONFIG), `section "${field.key}" stores no value`);
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `"${field.key}" is missing from DEFAULT_CONFIG`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `default of "${field.key}"`);
    }
  }
});

test('the password is a secret field', () => {
  const password = manifest.config_schema.find((f) => f.key === 'password');
  assert.equal(password.type, 'secret');
});

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), Object.keys(ACTIONS).sort());
});

test('every scene_actions key has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every scene trigger the code fires is declared, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), [...SCENE_TRIGGER_KEYS].sort());
});

test('the trigger and action options are the values the code uses', () => {
  const trigger = manifest.scene_triggers.find((t) => t.key === 'alarm_triggered');
  const kinds = trigger.fields.find((f) => f.key === 'kind').options.map((o) => o.value);
  assert.deepEqual(kinds, ALARM_KINDS);
  const action = manifest.scene_actions.find((a) => a.key === 'set_security_level');
  const levels = action.fields.find((f) => f.key === 'level').options.map((o) => o.value);
  assert.deepEqual(levels, SECURITY_LEVELS);
});

test('every widgets key has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  assert.ok(manifest.widgets.length <= 5);
});

test('scene and widget capabilities require Gladys >= 5.1.0', () => {
  const [major, minor] = minGladysVersion();
  assert.ok(major > 5 || (major === 5 && minor >= 1), manifest.gladys_version);
});

test('keywords, countries and music require Gladys >= 5.3.0', () => {
  const [major, minor] = minGladysVersion();
  if (['keywords', 'countries', 'music'].some((key) => manifest[key] !== undefined)) {
    assert.ok(major > 5 || (major === 5 && minor >= 3), manifest.gladys_version);
  }
});

// The store vocabulary of the catalog shelves (2026-10: transport, vehicles,
// servers and leisure added). An unknown key is dropped by the indexer, silently.
const CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
  'transport',
  'vehicles',
  'servers',
  'leisure',
];

test('the integration is tagged cloud-only, in the security shelf', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.ok(manifest.categories.includes('security'));
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.equal(new Set(manifest.categories).size, manifest.categories.length);
  for (const category of manifest.categories) {
    assert.ok(CATEGORIES.includes(category), `unknown category "${category}"`);
  }
});

test('the search keywords are 1 to 10 unique strings of 2 to 30 characters', () => {
  const { keywords } = manifest;
  assert.ok(Array.isArray(keywords) && keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, keywords.length, 'duplicate keyword');
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, `keyword "${keyword}"`);
  }
});

test('countries, when declared, are 1 to 20 unique ISO 3166-1 alpha-2 codes', () => {
  // Somfy Protect is sold in several countries: no `countries`, the catalog
  // shows it everywhere (absent = worldwide).
  if (manifest.countries === undefined) {
    return;
  }
  assert.ok(manifest.countries.length >= 1 && manifest.countries.length <= 20);
  assert.equal(new Set(manifest.countries).size, manifest.countries.length);
  for (const country of manifest.countries) {
    assert.match(country, /^[A-Z]{2}$/);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-somfyprotect:${manifest.version}`);
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [language, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${language}: ${text.length}`);
  }
});

test('section links are https', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});
