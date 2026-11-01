import { Permission, Role } from 'node-appwrite'

// The shape of the Appwrite project. Everything here is created (or left
// alone if it already exists) by `npm run setup`.
//
// Who can do what:
// The admin never signs in to the portal: the local admin panel uses the
// server API key, which bypasses these permissions. So the only people any of
// this is for are players, i.e. users carrying the `player` label. Accounts are
// created by the admin, so anyone who signs up on their own has no label and
// sees nothing.
//
//   modules  players read.
//   players  one row per player (row id = user id): seed, running score and
//            wrong-flag counters. A player reads only their own row (row-level
//            permission); only the server key writes it.
//   solves   one row per captured flag, written by the Function; a player reads
//            their own.
//   stages   zip files, readable by nobody until the admin panel releases the
//            module, then by the `player` label.

export const DATABASE_ID = 'ctf'
export const BUCKET_ID = 'stages'

export const player = Role.label('player')

export const TABLES = [
  {
    id: 'modules',
    name: 'Modules',
    rowSecurity: false,
    permissions: [Permission.read(player)],
    columns: [
      { key: 'number', type: 'integer', required: true, min: 0, max: 99 },
      { key: 'title', type: 'string', size: 128, required: true },
      { key: 'description', type: 'string', size: 1000, required: true },
      { key: 'points', type: 'integer', required: true, min: 0, max: 100000 },
      { key: 'released', type: 'boolean', required: false, default: false },
    ],
    indexes: [{ key: 'by_number', type: 'key', columns: ['number'] }],
  },
  {
    id: 'players',
    name: 'Players',
    rowSecurity: true,
    permissions: [],
    columns: [
      { key: 'email', type: 'string', size: 320, required: true },
      { key: 'seed', type: 'string', size: 64, required: true },
      { key: 'points', type: 'integer', required: false, default: 0, min: 0, max: 10000000 },
      { key: 'solved', type: 'integer', required: false, default: 0, min: 0, max: 99 },
      { key: 'last_solve_at', type: 'datetime', required: false },
      // wrong flags so far, one counter per module (index = module number).
      // The Function refuses a module once its counter reaches the limit.
      { key: 'wrong', type: 'integer', array: true, required: false, min: 0, max: 1000 },
    ],
    indexes: [
      { key: 'unique_seed', type: 'unique', columns: ['seed'] },
      { key: 'by_points', type: 'key', columns: ['points'], orders: ['desc'] },
    ],
  },
  {
    id: 'solves',
    name: 'Solves',
    rowSecurity: true,
    permissions: [],
    columns: [
      { key: 'player_id', type: 'string', size: 36, required: true },
      { key: 'module', type: 'integer', required: true, min: 0, max: 99 },
      { key: 'points', type: 'integer', required: true, min: 0, max: 100000 },
    ],
    indexes: [{ key: 'by_player', type: 'key', columns: ['player_id'] }],
  },
]

// Stage files are stage_00.zip ... stage_05.zip, one per module.
export const stageFileId = (n) => `stage_${String(n).padStart(2, '0')}`
export const moduleRowId = (n) => `m${n}`

export const MODULES = [
  // points follow the difficulty and grow faster than linearly; the last, hardest module is worth a bit more again
  { number: 0, title: 'Project Scaffold', points: 50, description: 'The starting point, and your first flag. Run the app and open the root route - the build key it prints is your first capture. Learn the loop here: download, run, find the flag, submit it.' },
  { number: 1, title: 'Diagnostics', points: 100, description: 'The agents shipped a diagnostics service with the very first build, and nobody took it out of the public build. Run it and read what it prints - one of those fields should never be public.' },
  { number: 2, title: 'Support Tickets', points: 200, description: 'Users open tickets and staff reply. The list endpoint filters by owner - the detail endpoint was written earlier and never got the same treatment.' },
  { number: 3, title: 'Billing & Checkout', points: 350, description: 'The money path. The checkout takes the amount from the request, and support has an internal re-pricing path for broken orders.' },
  { number: 4, title: 'Profile & File Uploads', points: 500, description: 'Avatars, bio, and user-uploaded files. Approve the upload flow if you dare. The storage backend keeps a signed key outside the public folder.' },
  { number: 5, title: 'Sessions & Tokens', points: 700, description: 'Session handling and token issuance. Tokens carry a payload and a signature - but the internal staff panel only opens for staff sessions.' },
]
