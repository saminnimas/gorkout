import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useFcmRegistration } from '../hooks/useFcmRegistration'

const AuthContext = createContext(null)

function FcmBridge({ user }) {
  useFcmRegistration(user)
  return null
}

function normalizeUsername(raw) {
  return raw.trim().toLowerCase()
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (!u) {
        setProfile(null)
        setLoading(false)
        return
      }
      const snap = await getDoc(doc(db, 'users', u.uid))
      setProfile(snap.exists() ? snap.data() : null)
      setLoading(false)
    })
  }, [])

  const register = useCallback(async (email, password, usernameRaw) => {
    const username = normalizeUsername(usernameRaw)
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      throw new Error(
        'Username must be 3–20 characters: lowercase letters, numbers, underscore.',
      )
    }
    const cred = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    )
    const uid = cred.user.uid
    const unameRef = doc(db, 'usernames', username)
    const userRef = doc(db, 'users', uid)
    try {
      await runTransaction(db, async (tx) => {
        const existing = await tx.get(unameRef)
        if (existing.exists()) {
          throw new Error('That username is already taken.')
        }
        tx.set(unameRef, { uid })
        tx.set(userRef, {
          username,
          email,
          createdAt: serverTimestamp(),
        })
      })
    } catch (e) {
      await deleteUser(cred.user)
      throw e
    }
    setProfile({ username, email })
  }, [])

  const login = useCallback(async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password)
  }, [])

  const logout = useCallback(async () => {
    await signOut(auth)
  }, [])

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      register,
      login,
      logout,
    }),
    [user, profile, loading, register, login, logout],
  )

  return (
    <AuthContext.Provider value={value}>
      <FcmBridge user={user} />
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
