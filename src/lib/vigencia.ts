import { diasDeVigencia, nombreParroquia, type ParroquiaAdmin } from '../types';
import { diaBreve } from './fechas';

/** Desde cuántos días antes del vencimiento se avisa que el acceso está por vencer. */
export const POR_VENCER = 30;

export type EstadoAcceso = 'suspendida' | 'vencida' | 'por-vencer' | 'al-dia' | 'sin-limite';

/** En qué punto está el acceso de una parroquia y cuántos días le quedan (negativo si ya venció; null si no vence). */
export function estadoDe(p: ParroquiaAdmin): { estado: EstadoAcceso; dias: number | null } {
  const dias = diasDeVigencia(p);
  if (!p.activa) return { estado: 'suspendida', dias };
  if (dias === null) return { estado: 'sin-limite', dias };
  if (dias < 0) return { estado: 'vencida', dias };
  return { estado: dias <= POR_VENCER ? 'por-vencer' : 'al-dia', dias };
}

export const ETIQUETA_ACCESO: Record<EstadoAcceso, string> = {
  suspendida: 'Suspendida', vencida: 'Vencida', 'por-vencer': 'Por vencer', 'al-dia': 'Al día', 'sin-limite': 'Sin límite',
};

export function textoTiempo(p: ParroquiaAdmin, estado: EstadoAcceso, dias: number | null) {
  if (estado === 'sin-limite' || dias === null || !p.vigente_hasta) return 'Sin fecha de vencimiento';
  const hasta = diaBreve(p.vigente_hasta);
  if (dias < 0) return `Venció el ${hasta} (hace ${-dias} día${dias === -1 ? '' : 's'})`;
  if (dias === 0) return `Vence hoy (${hasta})`;
  return `Quedan ${dias} día${dias === 1 ? '' : 's'} · hasta el ${hasta}`;
}

/** Porcentaje de la barra de tiempo: un año completo = barra llena; sin fecha de vencimiento, llena. */
export const porcentajeTiempo = (dias: number | null) => (dias === null ? 100 : Math.max(0, Math.min(100, (dias / 365) * 100)));

/** Lo más urgente primero: vencidas, por vencer, al día y, al final, las que no vencen. */
export const porUrgencia = (a: ParroquiaAdmin, b: ParroquiaAdmin) =>
  (estadoDe(a).dias ?? Infinity) - (estadoDe(b).dias ?? Infinity) || nombreParroquia(a).localeCompare(nombreParroquia(b), 'es');
