import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import FriendsPanel from '../components/FriendsPanel'
import { getWorkoutFields } from '../lib/goalStatus'

export default function Dashboard() {
  const { user } = useAuth()
  const [goals, setGoals] = useState([])

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'goals'),
      where('participantIds', 'array-contains', user.uid),
    )
    return onSnapshot(q, (snap) => {
      setGoals(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0
          const tb = b.createdAt?.toMillis?.() ?? 0
          return tb - ta
        }),
      )
    })
  }, [user])

  return (
    <div className="mx-auto max-w-lg space-y-10 px-4 py-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-zinc-400">Friends</h2>
          <Link
            to="/friends"
            className="text-xs font-medium text-zinc-300 underline"
          >
            View all
          </Link>
        </div>
        <FriendsPanel showHeading={false} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-zinc-400">Goals</h2>
          <Link
            to="/goals/new"
            className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-950"
          >
            New goal
          </Link>
        </div>
        <ul className="divide-y divide-zinc-800/80 rounded-lg border border-zinc-800">
          {goals.length === 0 ? (
            <li className="px-3 py-4 text-sm text-zinc-600">No goals yet.</li>
          ) : (
            goals.map((g) => {
              const wf = getWorkoutFields(g)
              const wc = wf.length
              return (
                <li key={g.id}>
                  <Link
                    to={`/goals/${g.id}`}
                    className="block px-3 py-3 text-sm hover:bg-zinc-900/50"
                  >
                    <span className="font-medium">{g.title}</span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {wc} workout{wc === 1 ? '' : 's'} · deadline{' '}
                      {g.deadline?.toDate?.().toLocaleString?.() ?? '—'}
                    </span>
                  </Link>
                </li>
              )
            })
          )}
        </ul>
      </section>
    </div>
  )
}
