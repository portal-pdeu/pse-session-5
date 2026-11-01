import { Client, TablesDB, Query, Permission, Role } from 'node-appwrite'

// The Appwrite-backed store used by handlers.js. Only what flag checking needs.
// Ids match appwrite/schema.mjs (the Function is deployed on its own, so they
// are repeated here instead of imported).
const DATABASE_ID = process.env.DATABASE_ID || 'ctf'

const notFound = (err) => err?.code === 404

export function createStore({ endpoint, projectId, key }) {
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(key)
  const tables = new TablesDB(client)

  const getRow = async (tableId, rowId) => {
    try {
      return await tables.getRow({ databaseId: DATABASE_ID, tableId, rowId })
    } catch (err) {
      if (notFound(err)) return null
      throw err
    }
  }

  return {
    getModule: (n) => getRow('modules', `m${n}`),
    getPlayer: (id) => getRow('players', id),
    getSolve: (id) => getRow('solves', id),

    updatePlayer: (id, data) => tables.updateRow({ databaseId: DATABASE_ID, tableId: 'players', rowId: id, data }),

    // the player may read their own solve rows (the portal shows what is done)
    createSolve: (rowId, userId, data) =>
      tables.createRow({
        databaseId: DATABASE_ID,
        tableId: 'solves',
        rowId,
        data,
        permissions: [Permission.read(Role.user(userId))],
      }),

    async listSolves(userId) {
      const { rows } = await tables.listRows({
        databaseId: DATABASE_ID,
        tableId: 'solves',
        queries: [Query.equal('player_id', [userId]), Query.limit(100)],
      })
      return rows
    },
  }
}
