import crypto from 'node:crypto'

// flag = FLAG{ sha256(seed + ":" + moduleSalt).hex.slice(0..9) }
// The stage apps compute exactly this (see modules-source/.../flaglib.js).
export function deriveFlag(seed, salt) {
  const digest = crypto.createHash('sha256').update(`${seed}:${salt}`).digest('hex').slice(0, 10)
  return `FLAG{${digest}}`
}

// What a flag looks like once normalized: FLAG{ + 10 hex digits + }.
// The portal checks the same shape (portal/src/flag.ts) before it calls us.
export const FLAG_SHAPE = /^FLAG\{[0-9A-F]{10}\}$/

export function normalizeFlag(flag) {
  return String(flag || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}
