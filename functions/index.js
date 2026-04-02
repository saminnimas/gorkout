import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'

initializeApp()
const db = getFirestore()

async function getTokensForUser(uid) {
  const snap = await db.collection('users').doc(uid).collection('devices').get()
  return snap.docs.map((d) => d.data().token).filter(Boolean)
}

async function sendPushToUser(uid, title, body) {
  const tokens = await getTokensForUser(uid)
  if (!tokens.length) return
  try {
    await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      webpush: {
        fcmOptions: { link: '/' },
      },
    })
  } catch (e) {
    console.error('FCM send error', e)
  }
}

export const onFriendRequestCreated = onDocumentCreated(
  'friendRequests/{id}',
  async (event) => {
    const data = event.data?.data()
    if (!data || data.status !== 'pending') return
    const { toUid, fromUsername } = data
    await sendPushToUser(
      toUid,
      'Friend request',
      `${fromUsername || 'Someone'} wants to be friends.`,
    )
  },
)

export const onFriendRequestUpdated = onDocumentUpdated(
  'friendRequests/{id}',
  async (event) => {
    const before = event.data.before.data()
    const after = event.data.after.data()
    if (!before || !after) return

    if (before.status === 'declined' && after.status === 'pending') {
      await sendPushToUser(
        after.toUid,
        'Friend request',
        `${after.fromUsername || 'Someone'} sent you a request.`,
      )
      return
    }

    if (before.status === 'pending' && after.status === 'accepted') {
      const { fromUid, toUsername } = after
      await sendPushToUser(
        fromUid,
        'Friend request accepted',
        `${toUsername || 'They'} accepted your request.`,
      )
    }
  },
)
