/** Aviso del sistema (el que aparece fuera de la app). Requiere permiso del usuario. */
export const avisosDisponibles = () => typeof window !== 'undefined' && 'Notification' in window;

export async function pedirPermisoAvisos(): Promise<NotificationPermission> {
  if (!avisosDisponibles()) return 'denied';
  return Notification.requestPermission();
}

export async function avisoDelSistema(titulo: string, cuerpo: string) {
  if (!avisosDisponibles() || Notification.permission !== 'granted') return;
  const opciones = { body: cuerpo, icon: '/pwa-192x192.png', badge: '/pwa-64x64.png', tag: 'agenda-parroquial' };
  try {
    // En Android/iOS solo funciona a través del service worker.
    const reg = await navigator.serviceWorker?.ready;
    if (reg) {
      await reg.showNotification(titulo, opciones);
      return;
    }
  } catch {
    /* se intenta el método de escritorio */
  }
  try {
    new Notification(titulo, opciones);
  } catch {
    /* sin soporte */
  }
}
