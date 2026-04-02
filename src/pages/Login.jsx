import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      nav('/', { replace: true })
    } catch (err) {
      setError(err.message ?? 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-12">
      <h1 className="text-xl font-medium tracking-tight">Sign in</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="block text-sm text-zinc-400">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
          />
        </label>
        <label className="block text-sm text-zinc-400">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
          />
        </label>
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
          {busy ? '…' : 'Sign in'}
        </button>
      </form>
      <p className="text-sm text-zinc-500">
        No account?{' '}
        <Link to="/register" className="text-zinc-300 underline">
          Register
        </Link>
      </p>
    </div>
  )
}
