/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (PrecacheEntry | string)[] };

// ---- Modo sin conexión: la app se guarda al instalarse ----
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// La app avisa "hay versión nueva" y, al pulsar Actualizar, pide activarla.
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// ---- Avisos push (llegan aunque la app esté cerrada) ----
interface CargaPush {
  titulo?: string;
  cuerpo?: string;
  url?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  let c: CargaPush = {};
  try {
    c = (event.data?.json() as CargaPush) ?? {};
  } catch {
    c = { cuerpo: event.data?.text() };
  }
  // iPhone exige mostrar siempre un aviso por cada push recibido.
  event.waitUntil(
    self.registration.showNotification(c.titulo ?? 'Agenda Parroquial', {
      body: c.cuerpo,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      tag: c.tag, // un mismo tag reemplaza el aviso anterior en vez de apilarlos
      data: { url: c.url ?? '/#/avisos' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let destino = new URL((event.notification.data?.url as string | undefined) ?? '/#/avisos', self.location.origin);
  // Solo se abren destinos dentro de la propia app, nunca un sitio externo.
  if (destino.origin !== self.location.origin) destino = new URL('/#/avisos', self.location.origin);
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const abierta = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
      if (abierta) {
        await abierta.focus();
        abierta.postMessage({ tipo: 'IR', hash: destino.hash }); // la app cambia de pantalla sin recargar
      } else {
        await self.clients.openWindow(destino.href);
      }
    })(),
  );
});
