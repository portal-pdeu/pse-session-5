import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadTestSalts } from '../config.mjs'
import { deriveFlag } from '../functions/ctf/src/flags.js'
import { isFlagShape, sanitizeFlag } from '../../portal/src/flag.ts'

const salts = loadTestSalts()

test('every flag the platform can generate passes the portal check', () => {
  for (const n of Object.keys(salts)) {
    for (const seed of ['abc123', 'a7ab8187792d6a3c5f14bcb549e6e89b', 'ffffffffffffffff']) {
      const flag = deriveFlag(seed, salts[n])
      assert.equal(isFlagShape(flag), true, flag)
      assert.equal(isFlagShape(flag.toLowerCase()), true, 'case does not matter')
    }
  }
})

test('pasted whitespace is stripped', () => {
  const flag = deriveFlag('abc123', salts[0])
  assert.equal(isFlagShape(`  ${flag}\n`), true)
  assert.equal(sanitizeFlag(` FLAG{ab12 cd34ef}\t`), 'FLAG{ab12cd34ef}')
})

test('anything not shaped like a flag is rejected', () => {
  for (const bad of [
    '',
    '   ',
    'hello',
    'FLAG',
    'FLAG{}',
    'FLAG{abc}',
    'FLAG{0123456789',
    '0123456789}',
    'flag 0123456789',
    'FLAG{0123456789}}',
    'xFLAG{0123456789}',
    'FLAG{0123456789} extra',
    'FLAG{012345678g}', // g is not hex
    'FLAG{01234567890}', // 11 characters
    'FLAG{012345678}', // 9 characters
    'FLAG(0123456789)',
    "FLAG{0123456789}'; DROP TABLE players;--",
    '<script>alert(1)</script>',
  ]) {
    assert.equal(isFlagShape(bad), false, JSON.stringify(bad))
  }
})
