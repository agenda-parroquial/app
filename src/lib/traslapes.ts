import type { Evento } from '../types';

export interface Rango {
  id?: string;
  inicio: string;
  fin: string;
  lugar_id: string | null;
  asignado_a: string | null;
}

/**
 * Misma regla que `eventos_traslapan` en supabase/schema.sql: chocan si se
 * cruzan en el tiempo y comparten lugar (de la lista) o persona asignada.
 * El servidor es quien decide; aquí solo sirve para avisar al instante,
 * incluso sin internet.
 */
export function traslapan(a: Rango, b: Rango): boolean {
  const cruzan = Date.parse(a.inicio) < Date.parse(b.fin) && Date.parse(b.inicio) < Date.parse(a.fin);
  const mismoLugar = a.lugar_id !== null && a.lugar_id === b.lugar_id;
  const mismaPersona = a.asignado_a !== null && a.asignado_a === b.asignado_a;
  return cruzan && (mismoLugar || mismaPersona);
}

export function buscarTraslapes(r: Rango, candidatos: Evento[]): Evento[] {
  return candidatos.filter((e) => e.id !== r.id && e.estado !== 'cancelado' && traslapan(r, e));
}
