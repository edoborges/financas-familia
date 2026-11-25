const CACHE = 'financeiro-v5'
const ASSETS = ['/', '/style.css', '/visual.css', '/icones.js', '/app.js', '/manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  )
})

// Lembretes. Todo push precisa virar uma notificação visível: o iPhone revoga a permissão
// de quem recebe push e não mostra nada.
self.addEventListener('push', e => {
  let dados = {}
  try { dados = e.data ? e.data.json() : {} } catch (_) { dados = { body: e.data && e.data.text() } }
  e.waitUntil(self.registration.showNotification(dados.title || 'FinançasFamília', {
    body: dados.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: dados.tag,
    data: { url: dados.url || '/' }
  }))
})

// Toque na notificação: reaproveita o app aberto (indo para a tela certa) ou abre um novo.
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of janelas) {
      if (c.url.startsWith(self.location.origin)) {
        await c.focus()
        c.postMessage({ tipo: 'abrir-url', url })
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
