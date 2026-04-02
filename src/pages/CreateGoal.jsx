import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

function newField() {
  return {
    fieldId: crypto.randomUUID(),
    name: '',
    targetReps: '',
  }
}

export default function CreateGoal() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [friends, setFriends] = useState([])
  const [goalTitle, setGoalTitle] = useState('')
  const [fields, setFields] = useState(() => [newField()])
  const [deadline, setDeadline] = useState('')
  const [insult, setInsult] = useState('')
  const [quitInsult, setQuitInsult] = useState('')
  const [includeSelf, setIncludeSelf] = useState(true)
  const [selected, setSelected] = useState(() => new Set())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    return onSnapshot(collection(db, 'users', user.uid, 'friends'), (snap) => {
      setFriends(snap.docs.map((d) => ({ uid: d.id, ...d.data() })))
    })
  }, [user])

  function toggleFriend(uid) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  function updateField(index, patch) {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    )
  }

  function addFieldRow() {
    setFields((prev) => [...prev, newField()])
  }

  function removeFieldRow(index) {
    setFields((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((_, i) => i !== index)
    })
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!goalTitle.trim()) {
      setError('Goal title is required.')
      return
    }
    const workoutFields = []
    for (const f of fields) {
      const name = f.name.trim()
      const n = Number(f.targetReps)
      if (!name) {
        setError('Each workout needs a name.')
        return
      }
      if (!Number.isFinite(n) || n <= 0) {
        setError('Each workout needs a positive target rep count.')
        return
      }
      workoutFields.push({
        fieldId: f.fieldId,
        name,
        targetReps: n,
      })
    }
    if (workoutFields.length < 1) {
      setError('Add at least one workout.')
      return
    }
    if (!deadline) {
      setError('Pick a deadline.')
      return
    }
    const end = new Date(deadline)
    if (end.getTime() <= Date.now()) {
      setError('Deadline must be in the future.')
      return
    }
    if (!insult.trim()) {
      setError('Missed-deadline insult is required.')
      return
    }
    if (!quitInsult.trim()) {
      setError('Quit / terminate insult is required.')
      return
    }
    const parts = new Set()
    if (includeSelf) parts.add(user.uid)
    selected.forEach((id) => parts.add(id))
    if (parts.size === 0) {
      setError('Include yourself or at least one friend.')
      return
    }
    setBusy(true)
    try {
      const ref = await addDoc(collection(db, 'goals'), {
        title: goalTitle.trim(),
        workoutFields,
        deadline: end,
        customInsult: insult.trim(),
        quitInsult: quitInsult.trim(),
        creatorUid: user.uid,
        participantIds: [...parts],
        createdAt: serverTimestamp(),
      })
      nav(`/goals/${ref.id}`, { replace: true })
    } catch (err) {
      setError(err.message ?? 'Could not create goal')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-lg font-medium tracking-tight">New goal</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="text-sm text-zinc-400">
          Goal title
          <input
            value={goalTitle}
            onChange={(e) => setGoalTitle(e.target.value)}
            required
            placeholder="April challenge"
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
          />
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-zinc-400">Workouts</span>
            <button
              type="button"
              onClick={addFieldRow}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-600 text-lg font-medium leading-none text-zinc-200 hover:bg-zinc-800"
              title="Add workout"
              aria-label="Add workout"
            >
              +
            </button>
          </div>
          <p className="text-xs text-zinc-600">
            At least one workout. Each row is an exercise and its rep target.
          </p>
          <ul className="space-y-3">
            {fields.map((f, i) => (
              <li
                key={f.fieldId}
                className="flex flex-col gap-2 rounded-lg border border-zinc-800 p-3 sm:flex-row sm:items-end"
              >
                <label className="block min-w-0 flex-1 text-xs text-zinc-500">
                  Workout name
                  <input
                    value={f.name}
                    onChange={(e) => updateField(i, { name: e.target.value })}
                    placeholder="Pushups"
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
                  />
                </label>
                <label className="block w-full shrink-0 text-xs text-zinc-500 sm:w-28">
                  Target reps
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={f.targetReps}
                    onChange={(e) =>
                      updateField(i, { targetReps: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeFieldRow(i)}
                  disabled={fields.length <= 1}
                  className="rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-500 disabled:opacity-40"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>

        <label className="text-sm text-zinc-400">
          Deadline
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
          />
        </label>
        <label className="text-sm text-zinc-400">
          Insult if they miss the deadline
          <textarea
            value={insult}
            onChange={(e) => setInsult(e.target.value)}
            required
            rows={3}
            placeholder="Still soft after the cutoff…"
            className="mt-1 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
          />
        </label>
        <label className="text-sm text-zinc-400">
          Insult if someone quits / ends early
          <textarea
            value={quitInsult}
            onChange={(e) => setQuitInsult(e.target.value)}
            required
            rows={3}
            placeholder="Couldn’t even finish…"
            className="mt-1 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
          />
        </label>

        <fieldset className="space-y-2 rounded-lg border border-zinc-800 p-3">
          <legend className="px-1 text-xs text-zinc-500">Participants</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeSelf}
              onChange={(e) => setIncludeSelf(e.target.checked)}
            />
            Include me
          </label>
          {friends.length === 0 ? (
            <p className="text-xs text-zinc-600">
              Add friends from the Friends page first.
            </p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {friends.map((f) => (
                <li key={f.uid}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(f.uid)}
                      onChange={() => toggleFriend(f.uid)}
                    />
                    @{f.username}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-zinc-100 py-2.5 text-sm font-medium text-zinc-950 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Create goal'}
        </button>
      </form>
    </div>
  )
}
