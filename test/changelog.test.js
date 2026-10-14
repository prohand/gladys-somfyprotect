// The Release workflow rolls CHANGELOG.md with .github/scripts/changelog-release.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const SAMPLE = `# Changelog

## [Unreleased]

### Added

- Something.

[Unreleased]: https://github.com/prohand/gladys-somfyprotect/commits/main
`;

test('moves the Unreleased section under the version', () => {
  const rolled = rollChangelog(SAMPLE, '1.0.1', '2026-10-14');
  assert.match(
    rolled,
    /## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-10-14\n\n### Added\n\n- Something\./,
  );
  assert.match(
    rolled,
    /\[Unreleased\]: https:\/\/github\.com\/prohand\/gladys-somfyprotect\/compare\/v1\.0\.1\.\.\.HEAD/,
  );
  assert.match(
    rolled,
    /\[1\.0\.1\]: https:\/\/github\.com\/prohand\/gladys-somfyprotect\/releases\/tag\/v1\.0\.1/,
  );
});

test('rolling the same version twice changes nothing', () => {
  const once = rollChangelog(SAMPLE, '1.0.1', '2026-10-14');
  assert.equal(rollChangelog(once, '1.0.1', '2026-10-14'), once);
});

test('the repository changelog has an Unreleased section and its link', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(text, /^## \[Unreleased\]$/m);
  assert.match(text, /^\[Unreleased\]: https:\/\/github\.com\/prohand\/gladys-somfyprotect\//m);
});
