import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'
import { firebaseConfig } from './firebase.config.js'

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

const fbApp = initializeApp(firebaseConfig)
const messaging = getMessaging(fbApp)
onBackgroundMessage(messaging, (payload) => {
  const n = payload.notification
  self.registration.showNotification(n?.title ?? 'Workout', {
    body: n?.body ?? '',
    icon: '/pwa-icon.svg',
    tag: payload.data?.tag ?? 'workout',
  })
})

self.skipWaiting()
clientsClaim()
