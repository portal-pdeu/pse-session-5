import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLocalRequest, isLoopbackAddress } from '../server/plugin.ts'

test('loopback addresses are recognised, everything else is not', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(isLoopbackAddress(a), true, a)
  for (const a of ['0.0.0.0', '::', '192.168.1.20', '10.0.0.5', '127.0.0.2', '', undefined]) assert.equal(isLoopbackAddress(a), false, String(a))
})

test('a request needs a local connection and a local Host header', () => {
  assert.equal(isLocalRequest('127.0.0.1', 'localhost:5175'), true)
  assert.equal(isLocalRequest('127.0.0.1', '127.0.0.1:5175'), true)
  assert.equal(isLocalRequest('::1', '[::1]:5175'), true)
  assert.equal(isLocalRequest('127.0.0.1', 'LOCALHOST:5175'), true)
})

test('other machines and rebinding hostnames are refused', () => {
  assert.equal(isLocalRequest('192.168.1.20', 'localhost:5175'), false, 'a LAN client')
  assert.equal(isLocalRequest('127.0.0.1', 'evil.com'), false, 'DNS rebinding')
  assert.equal(isLocalRequest('127.0.0.1', 'localhost.evil.com:5175'), false)
  assert.equal(isLocalRequest('127.0.0.1', undefined), false)
})
