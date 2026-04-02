import { useEffect } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getToken, onMessage } from 'firebase/messaging'
import { db, fcmVapidKey, getMessagingIfSupported } from '../firebase'

const DEVICE_KEY = 'workout_fcm_device_id'

function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return `d_${Math.random().toString(36).slice(2)}`
  }
}

export function useFcmRegistration(user) {
  useEffect(() => {
    if (!user?.uid) return

    let cancelled = false
    let unsubscribeMessage = () => {}

    ;(async () => {
      const messaging = await getMessagingIfSupported()
      if (!messaging || cancelled) return
      if (!fcmVapidKey) {
        if (import.meta.env.DEV) {
          console.warn(
            '[FCM] Set VITE_FCM_VAPID_KEY in .env (Firebase → Cloud Messaging → Web push certificates).',
          )
        }
        return
      }

      try {
        const perm = await Notification.requestPermission()
        if (perm !== 'granted' || cancelled) return

        await navigator.serviceWorker.ready
        const reg = await navigator.serviceWorker.getRegistration()
        const token = await getToken(messaging, {
          vapidKey: fcmVapidKey,
          serviceWorkerRegistration: reg ?? undefined,
        })
        if (!token || cancelled) return

        const deviceId = getOrCreateDeviceId()
        await setDoc(doc(db, 'users', user.uid, 'devices', deviceId), {
          token,
          updatedAt: serverTimestamp(),
        })
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[FCM] registration skipped', e)
      }

      if (cancelled) return
      unsubscribeMessage = onMessage(messaging, (payload) => {
        const n = payload.notification
        if (n && Notification.permission === 'granted') {
          new Notification(n.title ?? 'Workout', {
            body: n.body,
            icon: '/pwa-icon.svg',
          })
        }
      })
    })()

    return () => {
      cancelled = true
      unsubscribeMessage()
    }
  }, [user?.uid])
}
