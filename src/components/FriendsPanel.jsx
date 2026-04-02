import { useEffect, useRef, useState } from 'react'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'

export default function FriendsPanel({ showHeading = true }) {
  const { user, profile } = useAuth()
  const [friends, setFriends] = useState([])
  const [incoming, setIncoming] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [friendQuery, setFriendQuery] = useState('')
  const [friendMsg, setFriendMsg] = useState('')
  const [friendBusy, setFriendBusy] = useState(false)
  const repairedAcceptedRef = useRef(new Set())
  const repairInFlightRef = useRef(new Set())

  useEffect(() => {
    if (!user) return
    return onSnapshot(collection(db, 'users', user.uid, 'friends'), (snap) => {
      setFriends(snap.docs.map((d) => ({ uid: d.id, ...d.data() })))
    })
  }, [user])

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'friendRequests'),
      where('toUid', '==', user.uid),
      where('status', '==', 'pending'),
    )
    return onSnapshot(q, (snap) => {
      setIncoming(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [user])

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'friendRequests'),
      where('fromUid', '==', user.uid),
      where('status', '==', 'pending'),
    )
    return onSnapshot(q, (snap) => {
      setOutgoing(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [user])

  /** Fix rows that are "accepted" but never created friend edges (older bugs / rule ordering). */
  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'friendRequests'),
      where('toUid', '==', user.uid),
      where('status', '==', 'accepted'),
    )
    return onSnapshot(q, (snap) => {
      for (const reqDoc of snap.docs) {
        const id = reqDoc.id
        if (repairedAcceptedRef.current.has(id)) continue
        if (repairInFlightRef.current.has(id)) continue
        const d = reqDoc.data()
        const fromUid = d.fromUid
        const toUid = d.toUid
        if (!fromUid || toUid !== user.uid) continue
        repairInFlightRef.current.add(id)
        ;(async () => {
          try {
            const edge = await getDoc(doc(db, 'users', user.uid, 'friends', fromUid))
            if (edge.exists()) {
              repairedAcceptedRef.current.add(id)
              return
            }
            await runTransaction(db, async (tx) => {
              const rs = await tx.get(doc(db, 'friendRequests', id))
              if (!rs.exists()) return
              const x = rs.data()
              if (x.status !== 'accepted') return
              const fRecv = doc(db, 'users', toUid, 'friends', fromUid)
              const fSend = doc(db, 'users', fromUid, 'friends', toUid)
              const sRecv = await tx.get(fRecv)
              const sSend = await tx.get(fSend)
              if (!sRecv.exists()) {
                tx.set(fRecv, {
                  username: x.fromUsername ?? '',
                  addedAt: serverTimestamp(),
                })
              }
              if (!sSend.exists()) {
                tx.set(fSend, {
                  username: x.toUsername ?? '',
                  addedAt: serverTimestamp(),
                })
              }
            })
            repairedAcceptedRef.current.add(id)
          } catch {
            /* retry on next snapshot */
          } finally {
            repairInFlightRef.current.delete(id)
          }
        })()
      }
    })
  }, [user])

  async function sendRequest(e) {
    e.preventDefault()
    setFriendMsg('')
    const raw = friendQuery.trim()
    if (!raw) return
    if (!profile?.username) {
      setFriendMsg('Profile still loading.')
      return
    }
    setFriendBusy(true)
    try {
      const key = raw.toLowerCase()
      const uname = await getDoc(doc(db, 'usernames', key))
      if (!uname.exists()) {
        setFriendMsg('No user with that exact username.')
        return
      }
      const toUid = String(uname.data().uid ?? '')
      if (!toUid) {
        setFriendMsg('Invalid username mapping.')
        return
      }
      if (toUid === user.uid) {
        setFriendMsg("You can't request yourself.")
        return
      }
      const already = await getDoc(doc(db, 'users', user.uid, 'friends', toUid))
      if (already.exists()) {
        setFriendMsg('Already friends.')
        setFriendQuery('')
        return
      }

      const toProfile = await getDoc(doc(db, 'users', toUid))
      const toUsername = toProfile.exists()
        ? toProfile.data().username
        : key

      const reqId = `${user.uid}_${toUid}`
      const reqRef = doc(db, 'friendRequests', reqId)
      let existing = await getDoc(reqRef)

      if (existing.exists()) {
        const st = existing.data().status
        if (st === 'pending') {
          setFriendMsg('Request already sent.')
          return
        }
        if (st === 'accepted') {
          const edge = await getDoc(doc(db, 'users', user.uid, 'friends', toUid))
          if (edge.exists()) {
            setFriendMsg('Already friends.')
            setFriendQuery('')
            return
          }
          await updateDoc(reqRef, {
            status: 'pending',
            fromUsername: String(profile.username ?? ''),
            toUsername: String(toUsername ?? ''),
            createdAt: serverTimestamp(),
          })
          setFriendQuery('')
          setFriendMsg('Request sent (cleared a stuck “accepted” row).')
          return
        } else if (st === 'declined') {
          await updateDoc(reqRef, {
            status: 'pending',
            fromUsername: String(profile.username ?? ''),
            toUsername: String(toUsername ?? ''),
            createdAt: serverTimestamp(),
          })
          setFriendQuery('')
          setFriendMsg('Request sent.')
          return
        }
      }

      if (!existing.exists()) {
        await setDoc(reqRef, {
          fromUid: user.uid,
          toUid,
          fromUsername: String(profile.username ?? ''),
          toUsername: String(toUsername ?? ''),
          status: 'pending',
          createdAt: serverTimestamp(),
        })
      }
      setFriendQuery('')
      setFriendMsg('Request sent.')
    } catch (err) {
      const code = err?.code ?? ''
      setFriendMsg(
        code
          ? `${err.message ?? 'Request failed'} (${code})`
          : (err.message ?? 'Could not send request'),
      )
    } finally {
      setFriendBusy(false)
    }
  }

  async function acceptRequest(req) {
    setFriendMsg('')
    const rref = doc(db, 'friendRequests', req.id)
    const fromUid = req.fromUid
    const toUid = req.toUid
    if (toUid !== user.uid) return

    try {
      await runTransaction(db, async (tx) => {
        const rs = await tx.get(rref)
        if (!rs.exists()) throw new Error('Request not found')
        const d = rs.data()
        if (d.toUid !== user.uid || d.fromUid !== fromUid) {
          throw new Error('Invalid request')
        }

        const fRecv = doc(db, 'users', toUid, 'friends', fromUid)
        const fSend = doc(db, 'users', fromUid, 'friends', toUid)

        if (d.status === 'accepted') {
          const sRecv = await tx.get(fRecv)
          const sSend = await tx.get(fSend)
          if (sRecv.exists() && sSend.exists()) {
            throw new Error('Already friends')
          }
          if (!sRecv.exists()) {
            tx.set(fRecv, {
              username: d.fromUsername ?? '',
              addedAt: serverTimestamp(),
            })
          }
          if (!sSend.exists()) {
            tx.set(fSend, {
              username: d.toUsername ?? '',
              addedAt: serverTimestamp(),
            })
          }
          return
        }

        if (d.status !== 'pending') throw new Error('Already handled')

        tx.set(fRecv, {
          username: d.fromUsername ?? '',
          addedAt: serverTimestamp(),
        })
        tx.set(fSend, {
          username: d.toUsername ?? '',
          addedAt: serverTimestamp(),
        })
        tx.update(rref, {
          status: 'accepted',
          respondedAt: serverTimestamp(),
        })
      })
    } catch (err) {
      const code = err?.code ?? ''
      setFriendMsg(
        code
          ? `${err.message ?? 'Accept failed'} (${code})`
          : (err.message ?? 'Could not accept request'),
      )
    }
  }

  async function declineRequest(req) {
    await updateDoc(doc(db, 'friendRequests', req.id), {
      status: 'declined',
      respondedAt: serverTimestamp(),
    })
  }

  async function cancelOutgoing(req) {
    await updateDoc(doc(db, 'friendRequests', req.id), {
      status: 'declined',
      respondedAt: serverTimestamp(),
    })
  }

  return (
    <section className="space-y-4">
      {showHeading ? (
        <h2 className="text-sm font-medium text-zinc-400">Your friends</h2>
      ) : null}
      <p className="text-xs text-zinc-600">
        Send a request by exact username. They get a push notification; when
        they accept, you both appear in each other&apos;s list and a push is
        sent to you.
      </p>

      {incoming.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Incoming requests
          </h3>
          <ul className="divide-y divide-zinc-800/80 rounded-lg border border-zinc-800">
            {incoming.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <span>@{r.fromUsername}</span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => acceptRequest(r)}
                    className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-zinc-950"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => declineRequest(r)}
                    className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400"
                  >
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {outgoing.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Sent requests
          </h3>
          <ul className="divide-y divide-zinc-800/80 rounded-lg border border-zinc-800">
            {outgoing.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <span>
                  @{r.toUsername}{' '}
                  <span className="text-xs text-zinc-600">(pending)</span>
                </span>
                <button
                  type="button"
                  onClick={() => cancelOutgoing(r)}
                  className="text-xs text-zinc-500 underline"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={sendRequest} className="flex gap-2">
        <input
          value={friendQuery}
          onChange={(e) => setFriendQuery(e.target.value)}
          placeholder="Exact username"
          className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-600"
        />
        <button
          type="submit"
          disabled={friendBusy}
          className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm disabled:opacity-50"
        >
          Send request
        </button>
      </form>
      {friendMsg ? (
        <p className="text-xs text-zinc-500">{friendMsg}</p>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Friends
        </h3>
        <ul className="divide-y divide-zinc-800/80 rounded-lg border border-zinc-800">
          {friends.length === 0 ? (
            <li className="px-3 py-4 text-sm text-zinc-600">
              No friends yet. Send a request above.
            </li>
          ) : (
            friends.map((f) => (
              <li key={f.uid} className="flex items-center px-3 py-2.5 text-sm">
                <span className="font-medium text-zinc-200">@{f.username}</span>
              </li>
            ))
          )}
        </ul>
        {friends.length > 0 ? (
          <p className="text-xs text-zinc-600">
            {friends.length} friend{friends.length === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>
    </section>
  )
}
