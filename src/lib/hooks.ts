import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { AvisoParroquial, Lugar, Perfil, TipoEventoGuardado } from '../types';

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

export const useLugares = () => useLiveQuery(() => db.lugares.toArray(), [], SIN_LUGARES);
export const useTiposEvento = () => useLiveQuery(() => db.tipos_evento.toArray(), [], SIN_TIPOS);
export const useAvisosParroquiales = () => useLiveQuery(() => db.avisos_parroquiales.toArray(), [], SIN_AVISOS);
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
