import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { AvisoParroquial, Lugar, Ministro, Perfil, Secretaria, TipoEventoGuardado } from '../types';

/** Ruta basada en el hash: '#/agenda/2030-03-05/ID' → ['agenda', '2030-03-05', 'ID'] */
export function useRuta(): string[] {
  const leer = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [ruta, setRuta] = useState(leer);
  useEffect(() => {
    const f = () => setRuta(leer());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return ruta.length ? ruta : ['agenda'];
}

export const ir = (ruta: string) => {
  location.hash = '#/' + ruta;
};

const SIN_LUGARES: Lugar[] = [];
const SIN_PERFILES: Perfil[] = [];

const SIN_TIPOS: TipoEventoGuardado[] = [];
const SIN_AVISOS: AvisoParroquial[] = [];
const SIN_MINISTROS: Ministro[] = [];
const SIN_SECRETARIAS: Secretaria[] = [];
const SIN_NOMBRES: Record<string, string> = {};
const SIN_INTENCIONES: Record<string, boolean> = {};

export const useLugares = () => useLiveQuery(() => db.lugares.toArray(), [], SIN_LUGARES);
export const useTiposEvento = () => useLiveQuery(() => db.tipos_evento.toArray(), [], SIN_TIPOS);
export const useSecretarias = () => useLiveQuery(() => db.secretarias.toArray(), [], SIN_SECRETARIAS);
/** Los nombres propios que la parroquia puso a los tipos de siempre (los demás usan el nombre de la lista). */
export const useIntencionesTipos = (parroquiaId: string | null | undefined) =>
  useLiveQuery(async () => (parroquiaId ? (await db.parroquias.get(parroquiaId))?.intenciones_tipos : undefined) ?? SIN_INTENCIONES, [parroquiaId], SIN_INTENCIONES);
export const useNombresTipos =(parroquiaId: string | null | undefined) =>
  useLiveQuery(async () => (parroquiaId ? (await db.parroquias.get(parroquiaId))?.nombres_tipos : undefined) ?? SIN_NOMBRES, [parroquiaId], SIN_NOMBRES);
export const useMinistros = () => useLiveQuery(() => db.ministros.toArray(), [], SIN_MINISTROS);
export const useAvisosParroquiales = () => useLiveQuery(() => db.avisos_parroquiales.toArray(), [], SIN_AVISOS);
/** La parroquia propia (nombre y si está suspendida); undefined mientras no se ha descargado. */
export const useParroquia = (id: string | null | undefined) =>
  useLiveQuery(() => (id ? db.parroquias.get(id) : undefined), [id]);
export const usePerfiles = () => useLiveQuery(() => db.perfiles.toArray(), [], SIN_PERFILES);

/** Ids de registros con cambios locales que aún no llegan al servidor. */
export const useIdsPendientes = () =>
  useLiveQuery(async () => new Set((await db.outbox.toArray()).map((o) => o.rowId)), [], new Set<string>());

/** Conflictos abiertos + cambios locales que requieren atención (para la insignia). */
export const useContadorConflictos = () =>
  useLiveQuery(async () => {
    const [abiertos, conProblema] = await Promise.all([
      db.conflictos.where('estado').equals('abierto').count(),
      db.outbox.where('estado').notEqual('pendiente').count(),
    ]);
    return abiertos + conProblema;
  }, [], 0);

export const useNoLeidas = () =>
  useLiveQuery(() => db.notificaciones.filter((n) => !n.leida).count(), [], 0);
