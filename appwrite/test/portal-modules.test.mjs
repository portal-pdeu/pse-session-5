import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MODULES as seeded } from '../schema.mjs'
import { MODULES as baked } from '../../portal/src/modules.ts'

// The portal bakes the module text in; the database is seeded from schema.mjs.
// If someone edits one and not the other, this fails.
test("the portal's baked-in modules match what the database is seeded with", () => {
  assert.deepEqual(baked, seeded)
})
