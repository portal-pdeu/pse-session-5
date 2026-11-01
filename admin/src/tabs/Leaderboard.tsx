import type { State } from '../api'

export default function Leaderboard({ state }: { state: State }) {
  return (
    <div>
      <div className="rules small">
        Points per flag: {state.modules.map((m) => `${String(m.number).padStart(2, '0')} = ${m.points}`).join(' · ')} (
        {state.modules.reduce((sum, m) => sum + m.points, 0)} in total). Ties go to whoever reached their score first.
      </div>
      <table className="board">
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Flags</th>
            <th>Points</th>
            <th>Last solve</th>
          </tr>
        </thead>
        <tbody>
          {state.players.map((p) => (
            <tr key={p.id}>
              <td>{p.rank}</td>
              <td>{p.email}</td>
              <td>{p.solved}</td>
              <td className="pts">{p.points}</td>
              <td className="dim">{p.last_solve_at ? new Date(p.last_solve_at).toLocaleTimeString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {state.players.length === 0 && <div className="loading">No players yet.</div>}
    </div>
  )
}
