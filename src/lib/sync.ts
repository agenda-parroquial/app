import { useSyncExternalStore } from 'react';
import { db } from './db';
import { supabase } from './supabase';
import { hoyClave } from './fechas';
import type { Evento, Notificacion, OpPendiente } from '../types';

// ---------------------------------------------------------------------
//  Estado observable (para el indicador de conexión)
// ---------------------------------------------------------------------
export interface EstadoSync {
  enLinea: boolean;
  sincronizando: boolean;
  ultimaSync: number | null;
  error: string | null;
}

let estado: EstadoSync = {
  enLinea: typeof navigator === 'undefined' ? true : navigator.onLine,
  sincronizando: false,
  ultimaSync: null,
  error: null,
};
const oyentes = new Set<() => void>();
const poner = (p: Partial<EstadoSync>) => {
  estado = { ...estado, ...p };
  oyentes.forEach((f) => f());
};
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};
export const useEstadoSync = () => useSyncExternalStore(suscribir, () => estado);

// ---------------------------------------------------------------------
//  Utilidades
// ---------------------------------------------------------------------
export function esErrorDeRed(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = (e as { code?: string } | null)?.code;
  const msg = String((e as { message?: string } | null)?.message ?? e);
  return !code && /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out|abort/i.test(msg);
}

export const mensajeDeError = (e: unknown) => String((e as { message?: string } | null)?.message ?? e);

// Postgres devuelve '2030-03-05T16:00:00+00:00'; localmente guardamos
// siempre toISOString() para poder comparar y consultar por rango.
export function normalizarEvento(r: Evento): Evento {
  return {
    ...r,
    inicio: new Date(r.inicio).toISOString(),
    fin: new Date(r.fin).toISOString(),
    created_at: new Date(r.created_at).toISOString(),
    updated_at: new Date(r.updated_at).toISOString(),
  };
}
const normalizar = (tabla: string, fila: { id: string }) =>
  tabla === 'eventos' ? normalizarEvento(fila as Evento) : fila;

const idsPendientes = async () => new Set((await db.outbox.toArray()).map((o) => o.rowId));

// ---------------------------------------------------------------------
//  1. Enviar al servidor lo hecho en este dispositivo
// ---------------------------------------------------------------------
async function enviarOp(op: OpPendiente) {
  const seq = op.seq!;

  if (op.tabla === 'eventos' && op.tipo === 'editar') {
    // Edición con control de versión: solo se aplica si nadie más cambió el evento.
    const { data, error } = await supabase
      .from('eventos').update(op.datos).eq('id', op.rowId).eq('version', op.baseVersion).select();
    if (error) throw error;
    if (data.length) {
      await db.eventos.put(normalizarEvento(data[0] as Evento));
      await db.outbox.delete(seq);
    } else {
      const { data: servidor, error: e2 } = await supabase.from('eventos').select('*').eq('id', op.rowId).maybeSingle();
      if (e2) throw e2;
      await db.outbox.update(seq, {
        estado: 'choque',
        servidor: servidor ? { ...normalizarEvento(servidor as Evento) } : null,
        mensaje: servidor ? 'Alguien más cambió este evento mientras tú lo editabas.' : 'Este evento ya no existe en el servidor.',
      });
    }
    return;
  }

  if (op.tipo === 'crear') {
    const { data, error } = await supabase.from(op.tabla).insert({ id: op.rowId, ...op.datos }).select().single();
    // 23505 = ya existía (se envió antes pero no llegó la respuesta): se corrige en el siguiente pull
    if (error && error.code !== '23505') throw error;
    if (data) await db.table(op.tabla).put(normalizar(op.tabla, data));
    await db.outbox.delete(seq);
    return;
  }

  // lugares / misas_fijas (edición): sobrescribe, se editan rara vez
  const { data, error } = await supabase.from(op.tabla).update(op.datos).eq('id', op.rowId).select();
  if (error) throw error;
  if (data.length) await db.table(op.tabla).put(data[0]);
  await db.outbox.delete(seq);
}

async function enviarPendientes() {
  const ops = await db.outbox.where('estado').equals('pendiente').sortBy('seq');
  for (const op of ops) {
    try {
      await enviarOp(op);
    } catch (e) {
      if (esErrorDeRed(e)) throw e; // sin internet: se reintenta luego, en orden
      await db.outbox.update(op.seq!, { estado: 'error', mensaje: mensajeDeError(e) });
    }
  }
}

// ---------------------------------------------------------------------
//  2. Traer del servidor lo que cambió
// ---------------------------------------------------------------------
const INCREMENTALES = [
  'perfiles', 'lugares', 'misas_fijas', 'tipos_evento', 'avisos_parroquiales', 'eventos', 'conflictos', 'intenciones',
] as const;
const PAGINA = 1000;
const MARGEN_MS = 120_000; // se vuelve a pedir 2 min hacia atrás por si alguna transacción se confirmó tarde

async function traerTabla(tabla: (typeof INCREMENTALES)[number], pendientes: Set<string>) {
  const clave = `cursor:${tabla}`;
  const cursor = (await db.meta.get(clave))?.value as string | undefined;
  const desde = cursor ? new Date(Date.parse(cursor) - MARGEN_MS).toISOString() : '1970-01-01T00:00:00Z';
  let ultimo = cursor;

  for (let pagina = 0; ; pagina++) {
    const { data, error } = await supabase
      .from(tabla).select('*').gt('updated_at', desde)
      .order('updated_at', { ascending: true }).order('id', { ascending: true })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
    if (error) throw error;
    if (!data.length) break;
    const filas = data.filter((r) => !pendientes.has(r.id)).map((r) => normalizar(tabla, r));
    await db.table(tabla).bulkPut(filas);
    ultimo = data[data.length - 1].updated_at as string;
    if (data.length < PAGINA) break;
  }
  if (ultimo && ultimo !== cursor) await db.meta.put({ key: clave, value: ultimo });
}

async function traerNotificaciones(usuarioId: string) {
  const { data, error } = await supabase
    .from('notificaciones').select('*').eq('usuario_id', usuarioId)
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  await db.notificaciones.bulkPut(data as Notificacion[]);
}

async function traer(usuarioId: string) {
  const pendientes = await idsPendientes();
  for (const t of INCREMENTALES) await traerTabla(t, pendientes);
  await traerNotificaciones(usuarioId);
}

/** Quita de la copia local los eventos que el servidor ya no tiene (misas fijas regeneradas). */
async function conciliar() {
  const limite = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const enServidor = new Set<string>();
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await supabase
      .from('eventos').select('id').gte('inicio', limite).order('id')
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
    if (error) throw error;
    data.forEach((r) => enServidor.add(r.id as string));
    if (data.length < PAGINA) break;
  }
  const pendientes = await idsPendientes();
  const sobrantes = (await db.eventos.where('inicio').aboveOrEqual(limite).primaryKeys())
    .filter((id) => !enServidor.has(id) && !pendientes.has(id));
  if (sobrantes.length) {
    await db.eventos.bulkDelete(sobrantes);
    await db.intenciones.where('evento_id').anyOf(sobrantes).delete(); // se borran en cascada en el servidor
  }
}

/** Una vez al día pide al servidor que genere las misas fijas de los próximos 90 días. */
async function generarMisasFijas() {
  const hoy = hoyClave();
  if ((await db.meta.get('misasGeneradasEl'))?.value === hoy) return;
  const { error } = await supabase.rpc('generar_misas_fijas', { p_dias: 90 });
  if (error) throw error;
  await db.meta.put({ key: 'misasGeneradasEl', value: hoy });
}

// ---------------------------------------------------------------------
//  Ciclo de sincronización
// ---------------------------------------------------------------------
let usuarioActual: string | null = null;
let corriendo = false;
let repetir = false;
let conciliarPendiente = true;

export async function sincronizar() {
  if (!usuarioActual) return;
  if (corriendo) {
    repetir = true;
    return;
  }
  corriendo = true;
  poner({ sincronizando: true });
  try {
    do {
      repetir = false;
      await enviarPendientes();
      await generarMisasFijas();
      await traer(usuarioActual);
      if (conciliarPendiente) {
        await conciliar();
        conciliarPendiente = false;
      }
    } while (repetir);
    poner({ enLinea: true, ultimaSync: Date.now(), error: null });
  } catch (e) {
    if (esErrorDeRed(e)) {
      poner({ enLinea: false });
      conciliarPendiente = true;
    } else {
      poner({ error: mensajeDeError(e) });
    }
  } finally {
    corriendo = false;
    poner({ sincronizando: false });
  }
}

type Cambio = { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown>; old: Record<string, unknown> };

async function aplicarCambio(tabla: string, p: Cambio) {
  if (p.eventType === 'DELETE') {
    const id = p.old.id as string | undefined;
    if (id) await db.table(tabla).delete(id);
    return;
  }
  const fila = p.new as { id: string };
  if ((await idsPendientes()).has(fila.id)) return; // lo local pendiente manda hasta enviarse
  await db.table(tabla).put(normalizar(tabla, fila));
}

/** Arranca la sincronización: tiempo real + reintentos automáticos. Devuelve la función para detenerla. */
export function iniciarSync(usuarioId: string, alNotificar: (n: Notificacion) => void) {
  usuarioActual = usuarioId;
  conciliarPendiente = true;

  const canal = supabase.channel('agenda');
  for (const tabla of ['perfiles', 'lugares', 'misas_fijas', 'tipos_evento', 'avisos_parroquiales', 'eventos', 'conflictos', 'intenciones']) {
    canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla },
      (p) => void aplicarCambio(tabla, p as unknown as Cambio));
  }
  canal.on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${usuarioId}` },
    (p) => {
      const n = p.new as Notificacion;
      void db.notificaciones.put(n);
      alNotificar(n);
    });
  // Al (re)conectar el canal se ponen al día los cambios que pudieron perderse.
  canal.subscribe((s) => {
    if (s === 'SUBSCRIBED') void sincronizar();
  });

  const alVolverInternet = () => {
    conciliarPendiente = true;
    void sincronizar();
  };
  const alVolverVisible = () => {
    if (document.visibilityState === 'visible') void sincronizar();
  };
  const alPerderInternet = () => poner({ enLinea: false });
  window.addEventListener('online', alVolverInternet);
  window.addEventListener('offline', alPerderInternet);
  document.addEventListener('visibilitychange', alVolverVisible);
  const reloj = window.setInterval(() => {
    if (document.visibilityState === 'visible') void sincronizar();
  }, 60_000);

  void sincronizar();

  return () => {
    usuarioActual = null;
    void supabase.removeChannel(canal);
    window.removeEventListener('online', alVolverInternet);
    window.removeEventListener('offline', alPerderInternet);
    document.removeEventListener('visibilitychange', alVolverVisible);
    window.clearInterval(reloj);
  };
}
