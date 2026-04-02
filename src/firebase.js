import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getMessaging, isSupported } from 'firebase/messaging'
import { firebaseConfig } from './firebase.config.js'

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

/** Set `VITE_FCM_VAPID_KEY` in `.env` (Firebase console → Cloud Messaging → Web push certificates). */
export const fcmVapidKey = import.meta.env.VITE_FCM_VAPID_KEY ?? ''

/** Resolve when browser supports FCM; null if unsupported. */
export async function getMessagingIfSupported() {
  try {
    if (await isSupported()) {
      return getMessaging(app)
    }
  } catch {
    /* ignore */
  }
  return null
}
