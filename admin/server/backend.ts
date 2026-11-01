import { Client, TablesDB, Storage, Users, Query, Permission, Role, ID } from 'node-appwrite'
import type { Backend, ModuleRow, PlayerRow } from './types.ts'

// The Appwrite-backed Backend. Ids match appwrite/schema.mjs (a test checks
// that they still do).
export const DATABASE_ID = 'ctf'
export const BUCKET_ID = 'stages'
export const moduleRowId = (n: number) => `m${n}`
export const stageFileId = (n: number) => `stage_${String(n).padStart(2, '0')}`

interface Options {
  endpoint: string
  projectId: string
  apiKey: string
}

export function createBackend({ endpoint, projectId, apiKey }: Options): Backend {
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
  const tables = new TablesDB(client)
  const storage = new Storage(client)
  const users = new Users(client)

  // every row of a table, 100 at a time
  async function allRows(tableId: string) {
    const out: Record<string, any>[] = []
    for (;;) {
      const queries = [Query.limit(100)]
      if (out.length) queries.push(Query.cursorAfter(out[out.length - 1].$id))
      const { rows } = await tables.listRows({ databaseId: DATABASE_ID, tableId, queries })
      out.push(...rows)
      if (rows.length < 100) return out
    }
  }

  // bulk delete is capped at 100 rows a request on the Free plan, so repeat
  async function deleteRowsWhere(tableId: string, filters: string[] = []) {
    for (;;) {
      const { rows } = await tables.deleteRows({ databaseId: DATABASE_ID, tableId, queries: [...filters, Query.limit(100)] })
      if (rows.length === 0) return
    }
  }

  const toPlayer = (r: Record<string, any>): PlayerRow => ({
    id: r.$id,
    email: r.email,
    seed: r.seed,
    points: r.points ?? 0,
    solved: r.solved ?? 0,
    wrong: r.wrong ?? [],
    last_solve_at: r.last_solve_at ?? null,
  })

  return {
    async listModules(): Promise<ModuleRow[]> {
      return (await allRows('modules')).map((r) => ({
        number: r.number,
        title: r.title,
        points: r.points,
        released: !!r.released,
      }))
    },

    async setModuleReleased(n, released) {
      await tables.updateRow({ databaseId: DATABASE_ID, tableId: 'modules', rowId: moduleRowId(n), data: { released } })
      // the zip opens to players with the module and closes with it
      await storage.updateFile({
        bucketId: BUCKET_ID,
        fileId: stageFileId(n),
        permissions: released ? [Permission.read(Role.label('player'))] : [],
      })
    },

    async listPlayers() {
      return (await allRows('players')).map(toPlayer)
    },

    async createPlayerRow(id, data) {
      await tables.createRow({
        databaseId: DATABASE_ID,
        tableId: 'players',
        rowId: id,
        data,
        permissions: [Permission.read(Role.user(id))],
      })
    },

    async updatePlayer(id, data) {
      await tables.updateRow({ databaseId: DATABASE_ID, tableId: 'players', rowId: id, data })
    },

    async deletePlayerRow(id) {
      await tables.deleteRow({ databaseId: DATABASE_ID, tableId: 'players', rowId: id }).catch((e) => {
        if (e?.code !== 404) throw e
      })
    },

    async createUser(email, password) {
      const user = await users.create({ userId: ID.unique(), email, password })
      return { id: user.$id }
    },

    async addPlayerLabel(id) {
      await users.updateLabels({ userId: id, labels: ['player'] })
    },

    async deleteUser(id) {
      await users.delete({ userId: id }).catch((e) => {
        if (e?.code !== 404) throw e
      })
    },

    async listPlayerUsers() {
      const out: { id: string; labels: string[] }[] = []
      let cursor: string | null = null
      for (;;) {
        const queries = [Query.limit(100)]
        if (cursor) queries.push(Query.cursorAfter(cursor))
        const { users: page } = await users.list({ queries })
        for (const u of page) if (u.labels.includes('player')) out.push({ id: u.$id, labels: u.labels })
        if (page.length < 100) return out
        cursor = page[page.length - 1].$id
      }
    },

    deleteSolvesFor: (playerId) => deleteRowsWhere('solves', [Query.equal('player_id', [playerId])]),
    deleteAllSolves: () => deleteRowsWhere('solves'),
    deleteAllPlayerRows: () => deleteRowsWhere('players'),
  }
}
