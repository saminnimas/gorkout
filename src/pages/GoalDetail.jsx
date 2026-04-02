import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import {
  getWorkoutFields,
  leaderboardFieldTotals,
  leaderboardTotalReps,
  participantStatus,
} from '../lib/goalStatus'

export default function GoalDetail() {
  const { goalId } = useParams()
  const { user } = useAuth()
  const [goal, setGoal] = useState(undefined)
  const [logs, setLogs] = useState([])
  const [surrenderIds, setSurrenderIds] = useState(() => new Set())
  const [names, setNames] = useState(() => new Map())
  const [logFieldId, setLogFieldId] = useState('')
  const [logAmount, setLogAmount] = useState('')
  const [logBusy, setLogBusy] = useState(false)
  const [surrenderBusy, setSurrenderBusy] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!goalId) return
    return onSnapshot(doc(db, 'goals', goalId), (snap) => {
      setGoal(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  }, [goalId])

  useEffect(() => {
    if (!goalId) return
    return onSnapshot(collection(db, 'goals', goalId, 'logs'), (snap) => {
      const rows = snap.docs.map((d) => {
        const x = d.data()
        return {
          id: d.id,
          userId: x.userId,
          reps: x.reps,
          fieldId: x.fieldId,
          createdAt: x.createdAt,
        }
      })
      rows.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())
      setLogs(rows)
    })
  }, [goalId])

  useEffect(() => {
    if (!goalId) return
    return onSnapshot(collection(db, 'goals', goalId, 'surrenders'), (snap) => {
      setSurrenderIds(new Set(snap.docs.map((d) => d.id)))
    })
  }, [goalId])

  const workoutFields = goal ? getWorkoutFields(goal) : []

  useEffect(() => {
    if (!goal?.id) return
    const wf = getWorkoutFields(goal)
    if (!wf.length) return
    setLogFieldId((prev) =>
      prev && wf.some((f) => f.fieldId === prev) ? prev : wf[0].fieldId,
    )
  }, [goal?.id])

  const participantIds = goal?.participantIds ?? []

  useEffect(() => {
    if (!participantIds.length) return
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(
        participantIds.map(async (uid) => {
          const s = await getDoc(doc(db, 'users', uid))
          const u = s.exists() ? s.data().username : uid.slice(0, 6)
          return [uid, u]
        }),
      )
      if (!cancelled) {
        setNames(new Map(entries))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [participantIds.join(',')])

  const totals = useMemo(() => leaderboardTotalReps(logs), [logs])
  const byUserField = useMemo(() => leaderboardFieldTotals(logs), [logs])

  const rows = useMemo(() => {
    if (!goal?.deadline) return []
    return participantIds
      .map((uid) => ({
        uid,
        name: names.get(uid) ?? '…',
        total: totals.get(uid) ?? 0,
        status: participantStatus({
          userId: uid,
          goal,
          deadlineTs: goal.deadline,
          logs,
          surrenderedUserIds: surrenderIds,
          nowMs,
        }),
      }))
      .sort((a, b) => b.total - a.total)
  }, [goal, participantIds, names, totals, logs, surrenderIds, nowMs])

  const myStatus =
    user && goal?.deadline
      ? participantStatus({
          userId: user.uid,
          goal,
          deadlineTs: goal.deadline,
          logs,
          surrenderedUserIds: surrenderIds,
          nowMs,
        })
      : 'active'

  const showDeadlineInsult =
    Boolean(user && goal && myStatus === 'failed_deadline')
  const showQuitInsult = Boolean(user && goal && myStatus === 'failed_quit')

  function fieldProgressLine(uid) {
    const inner = byUserField.get(uid)
    if (!inner || !workoutFields.length) return null
    return workoutFields
      .map((f) => {
        const t = inner.get(f.fieldId) ?? 0
        return `${f.name}: ${t}/${f.targetReps}`
      })
      .join(' · ')
  }

  async function submitLog(e) {
    e.preventDefault()
    if (!goalId || !user) return
    const n = Number(logAmount)
    if (!Number.isFinite(n) || n <= 0) return
    if (!logFieldId && workoutFields.length) return
    setLogBusy(true)
    try {
      const entry = {
        userId: user.uid,
        reps: n,
        createdAt: serverTimestamp(),
      }
      if (workoutFields.length) {
        entry.fieldId = logFieldId
      }
      await addDoc(collection(db, 'goals', goalId, 'logs'), entry)
      setLogAmount('')
    } finally {
      setLogBusy(false)
    }
  }

  async function giveUp() {
    if (!goalId || !user) return
    if (
      !confirm(
        'End this goal for yourself early? You will see the quit insult.',
      )
    )
      return
    setSurrenderBusy(true)
    try {
      await setDoc(doc(db, 'goals', goalId, 'surrenders', user.uid), {
        at: serverTimestamp(),
      })
    } finally {
      setSurrenderBusy(false)
    }
  }

  if (goal === undefined) {
    return (
      <div className="px-4 py-12 text-center text-sm text-zinc-500">
        Loading…
      </div>
    )
  }

  if (goal === null) {
    return (
      <div className="px-4 py-12 text-center text-sm text-zinc-500">
        <p>Goal not found.</p>
        <Link to="/" className="mt-2 inline-block text-zinc-400 underline">
          Back
        </Link>
      </div>
    )
  }

  const canLog =
    user &&
    participantIds.includes(user.uid) &&
    myStatus === 'active'

  const quitInsultText =
    goal.quitInsult?.trim() || goal.customInsult || ''

  const subtitle =
    workoutFields.length > 0
      ? workoutFields.map((f) => `${f.name} (${f.targetReps})`).join(' · ')
      : goal.targetThreshold != null
        ? `${goal.targetThreshold} reps`
        : ''

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
      <Link
        to="/"
        className="inline-block text-xs text-zinc-500 underline"
      >
        ← Dashboard
      </Link>

      {showQuitInsult ? (
        <div className="rounded-xl border-2 border-amber-900/80 bg-amber-950/35 px-4 py-5">
          <p className="text-xs font-medium uppercase tracking-wider text-amber-400">
            You quit this goal
          </p>
          <p className="mt-2 text-lg font-medium leading-snug text-amber-100">
            {quitInsultText}
          </p>
        </div>
      ) : null}

      {showDeadlineInsult ? (
        <div className="rounded-xl border-2 border-red-900/80 bg-red-950/40 px-4 py-5">
          <p className="text-xs font-medium uppercase tracking-wider text-red-400">
            Deadline passed
          </p>
          <p className="mt-2 text-lg font-medium leading-snug text-red-100">
            {goal.customInsult}
          </p>
        </div>
      ) : null}

      {user && myStatus === 'achieved' ? (
        <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          You hit every workout target before the deadline. Nice work.
        </div>
      ) : null}

      <div>
        <h1 className="text-xl font-medium tracking-tight">{goal.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {subtitle ? (
            <span className="block">{subtitle}</span>
          ) : null}
          <span className="block">
            Deadline{' '}
            {goal.deadline?.toDate?.().toLocaleString?.() ?? '—'}
          </span>
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Leaderboard
        </h2>
        <ul className="divide-y divide-zinc-800/80 rounded-lg border border-zinc-800">
          {rows.map((r) => (
            <li key={r.uid} className="px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>
                  @{r.name}
                  {r.uid === user?.uid ? (
                    <span className="ml-1 text-zinc-600">(you)</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-zinc-300">{r.total}</span>
                  <span
                    className={
                      r.status === 'achieved'
                        ? 'text-xs text-emerald-500'
                        : r.status === 'failed_quit'
                          ? 'text-xs text-amber-400'
                          : r.status === 'failed_deadline'
                            ? 'text-xs text-red-400'
                            : 'text-xs text-zinc-600'
                    }
                  >
                    {r.status === 'achieved'
                      ? 'done'
                      : r.status === 'failed_quit'
                        ? 'quit'
                        : r.status === 'failed_deadline'
                          ? 'missed'
                          : 'active'}
                  </span>
                </span>
              </div>
              {fieldProgressLine(r.uid) ? (
                <p className="mt-1 text-xs text-zinc-600">
                  {fieldProgressLine(r.uid)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {canLog ? (
        <section className="space-y-2 rounded-lg border border-zinc-800 p-4">
          <h2 className="text-sm text-zinc-400">Log reps</h2>
          <form onSubmit={submitLog} className="flex flex-col gap-2 sm:flex-row">
            {workoutFields.length > 0 ? (
              <select
                value={logFieldId}
                onChange={(e) => setLogFieldId(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-600 sm:w-auto sm:min-w-[9rem]"
              >
                {workoutFields.map((f) => (
                  <option key={f.fieldId} value={f.fieldId}>
                    {f.name}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={logAmount}
              onChange={(e) => setLogAmount(e.target.value)}
              placeholder="Reps"
              className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-600"
            />
            <button
              type="submit"
              disabled={logBusy}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
            >
              Add
            </button>
          </form>
        </section>
      ) : null}

      {canLog ? (
        <button
          type="button"
          onClick={giveUp}
          disabled={surrenderBusy}
          className="w-full rounded-lg border border-zinc-800 py-2.5 text-sm text-zinc-400 disabled:opacity-50"
        >
          Give up (end early for me)
        </button>
      ) : null}
    </div>
  )
}
