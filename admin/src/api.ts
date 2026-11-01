import type { AddEntry, AddResult, ModuleRow, PlayerRow } from '../server/types.ts'

export type RankedPlayer = PlayerRow & { rank: number }
export interface State {
  modules: ModuleRow[]
  players: RankedPlayer[]
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    // the server refuses requests without this header (see server/plugin.ts)
    headers: { 'content-type': 'application/json', 'x-admin-panel': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data as T
}

export const api = {
  state: () => call<State>('GET', '/state'),
  addPlayers: (players: AddEntry[]) => call<{ results: AddResult[] }>('POST', '/players', { players }),
  deletePlayer: (id: string) => call<{ ok: true }>('DELETE', `/players/${encodeURIComponent(id)}`),
  resetAttempts: (id: string, module?: number) =>
    call<{ ok: true }>('POST', `/players/${encodeURIComponent(id)}/reset-attempts`, { module }),
  setReleased: (n: number, released: boolean) => call<{ modules: ModuleRow[] }>('POST', `/modules/${n}/release`, { released }),
  reset: (mode: 'progress' | 'full', confirm: string) =>
    call<{ mode: string; players: number }>('POST', '/reset', { mode, confirm }),
}
