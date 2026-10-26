import { supabase } from './supabase';

/**
 * Notificaciones push (llegan con la app cerrada). Cada teléfono se "suscribe" una vez; la
 * suscripción se guarda en Supabase y la función `enviar-push` manda los avisos.
 * En iPhone solo funciona con la app instalada en la pantalla de inicio (iOS 16.4+).
 */
const FUNCION = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/enviar-push`;

export type EstadoPush = 'no-soportado' | 'denegado' | 'inactivo' | 'activo';

export const pushSoportado = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const esIPhone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const estaInstalada = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

function aBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function suscripcionActual() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg?.pushManager.getSubscription() ?? null;
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!pushSoportado()) return 'no-soportado';
  if (Notification.permission === 'denied') return 'denegado';
  const sub = await suscripcionActual();
  return sub && Notification.permission === 'granted' ? 'activo' : 'inactivo';
}

async function clavePublica(): Promise<string> {
  const r = await fetch(FUNCION);
  if (!r.ok) throw new Error('El servidor de avisos no respondió. Intenta de nuevo en un momento.');
  return ((await r.json()) as { publica: string }).publica;
}

async function guardarSuscripcion(sub: PushSubscription) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc('registrar_push', {
    p_endpoint: j.endpoint,
    p_p256dh: j.keys?.p256dh,
    p_auth_secret: j.keys?.auth,
    p_user_agent: navigator.userAgent.slice(0, 200),
  });
  if (error) throw error;
}

/** Debe llamarse directamente desde un clic (iPhone exige que el permiso se pida así). */
export async function activarPush(): Promise<void> {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('No diste permiso para las notificaciones.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(await clavePublica()) });
  }
  await guardarSuscripcion(sub);
}

/** Al abrir la app: si este teléfono ya tiene avisos, se vuelve a registrar a nombre de quien entró. */
export async function sincronizarPush(): Promise<void> {
  if (!pushSoportado() || Notification.permission !== 'granted') return;
  const sub = await suscripcionActual();
  if (sub) await guardarSuscripcion(sub);
}

export async function desactivarPush(): Promise<void> {
  const sub = pushSoportado() ? await suscripcionActual() : null;
  if (!sub) return;
  try {
    await supabase.rpc('quitar_push', { p_endpoint: sub.endpoint });
  } finally {
    await sub.unsubscribe();
  }
}

export async function avisoDePrueba(): Promise<void> {
  const { error } = await supabase.rpc('enviar_aviso_de_prueba');
  if (error) throw error;
}
