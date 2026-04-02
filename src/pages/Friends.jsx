import { Link } from 'react-router-dom'
import FriendsPanel from '../components/FriendsPanel'

export default function Friends() {
  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <Link
        to="/"
        className="inline-block text-xs text-zinc-500 underline"
      >
        ← Dashboard
      </Link>
      <FriendsPanel showHeading />
    </div>
  )
}
