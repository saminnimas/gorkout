import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout({ children }) {
  const { user, logout, profile } = useAuth()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur-sm">
        <Link
          to="/"
          className="text-sm font-medium tracking-tight text-zinc-100"
        >
          Workout
        </Link>
        {user ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/friends"
              className="text-xs font-medium text-zinc-400 hover:text-zinc-200"
            >
              Friends
            </Link>
            <span className="max-w-28 truncate text-xs text-zinc-500 sm:max-w-none">
              @{profile?.username ?? '…'}
            </span>
            <button
              type="button"
              onClick={() => logout()}
              className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-zinc-950 shadow-sm transition hover:bg-zinc-100"
            >
              Sign out
            </button>
          </div>
        ) : null}
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
