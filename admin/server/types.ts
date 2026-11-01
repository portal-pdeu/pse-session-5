export interface ModuleRow {
  number: number
  title: string
  points: number
  released: boolean
}

export interface PlayerRow {
  id: string
  email: string
  seed: string
  points: number
  solved: number
  // wrong flags so far, one counter per module
  wrong: number[]
  last_solve_at: string | null
}

export interface PlayerUser {
  id: string
  labels: string[]
}

// Everything the operations need from Appwrite. backend.ts implements it with
// the server SDK; the tests implement it in memory.
export interface Backend {
  listModules(): Promise<ModuleRow[]>
  // flips `released` on the module row and opens / closes its stage zip
  setModuleReleased(n: number, released: boolean): Promise<void>

  listPlayers(): Promise<PlayerRow[]>
  createPlayerRow(id: string, data: Omit<PlayerRow, 'id'>): Promise<void>
  updatePlayer(id: string, data: Partial<Omit<PlayerRow, 'id'>>): Promise<void>
  deletePlayerRow(id: string): Promise<void>

  createUser(email: string, password: string): Promise<{ id: string }>
  addPlayerLabel(id: string): Promise<void>
  deleteUser(id: string): Promise<void>
  listPlayerUsers(): Promise<PlayerUser[]>

  deleteSolvesFor(playerId: string): Promise<void>
  deleteAllSolves(): Promise<void>
  deleteAllPlayerRows(): Promise<void>
}

export interface AddEntry {
  email: string
  password: string
}

export interface AddResult {
  email: string
  ok: boolean
  error?: string
}
