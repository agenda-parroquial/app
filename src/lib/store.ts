import { db } from './db';
import { supabase } from './supabase';
import { sincronizar } from './sync';
import type {
  AvisoParroquial, DatosEvento, Evento, Intencion, Invitacion, Lugar, MisaFija, OpPendiente, ParroquiaAdmin, Perfil, Rol,
  Tabla, TipoEventoGuardado,
} from '../types';

/**
 * Operaciones de escritura "local primero": se aplican de inmediato en la
 * copia local (la pantalla cambia al instante) y se encolan para enviarse
 * al servidor en cuanto haya internet.
 */

async function encolar(op: Omit<OpPendiente, 'seq' | 'estado'>) {
  const previa = await db.outbox.where('rowId').equals(op.rowId).first();
  if (previa) {
    // Varias ediciones seguidas del mismo registro se funden en una sola.
    await db.outbox.update(previa.seq!, { datos: { ...previa.datos, ...op.datos } });
  } else {
    await db.outbox.add({ ...op, estado: 'pendiente' });
  }
}

const ahora = () => new Date().toISOString();

async function usuarioId() {
  return ((await db.meta.get('usuarioId'))?.value as string | undefined) ?? null;
}

// ---------- Eventos ----------------------------------------------------
export async function crearEvento(datos: DatosEvento): Promise<string> {
  const id = crypto.randomUUID();
  const fila: Evento = {
    ...datos,
    id,
    estado: 'confirmado',
    misa_fija_id: null,
    fecha_origen: null,
    creado_por: await usuarioId(),
    modificado_por: null,
    version: 0,
    created_at: ahora(),
    updated_at: ahora(),
  };
  await db.transaction('rw', db.eventos, db.outbox, async () => {
    await db.eventos.put(fila);
    await encolar({ tabla: 'eventos', rowId: id, tipo: 'crear', datos: { ...datos }, baseVersion: 0 });
  });
  void sincronizar();
  return id;
}

export async function editarEvento(id: string, cambios: Partial<DatosEvento> & { estado?: Evento['estado'] }) {
  await db.transaction('rw', db.eventos, db.outbox, async () => {
    const actual = await db.eventos.get(id);
    if (!actual) return;
    await db.eventos.put({ ...actual, ...cambios });
    await encolar({ tabla: 'eventos', rowId: id, tipo: 'editar', datos: { ...cambios }, baseVersion: actual.version });
  });
  void sincronizar();
}

export const cancelarEvento = (id: string) => editarEvento(id, { estado: 'cancelado' });
export const reactivarEvento = (id: string) => editarEvento(id, { estado: 'confirmado' });

// ---------- Lugares y misas fijas -------------------------------------
async function guardarCatalogo<T extends { id: string }>(tabla: Tabla, datos: Partial<T>, id?: string) {
  const rowId = id ?? crypto.randomUUID();
  await db.transaction('rw', db.table(tabla), db.outbox, async () => {
    const actual = id ? await db.table(tabla).get(id) : undefined;
    await db.table(tabla).put({ ...(actual ?? { created_at: ahora() }), ...datos, id: rowId, updated_at: ahora() });
    await encolar({ tabla, rowId, tipo: actual ? 'editar' : 'crear', datos: { ...datos }, baseVersion: 0 });
  });
  void sincronizar();
}

export const guardarLugar = (datos: Partial<Lugar>, id?: string) => guardarCatalogo<Lugar>('lugares', datos, id);
export const guardarMisaFija = (datos: Partial<MisaFija>, id?: string) =>
  guardarCatalogo<MisaFija>('misas_fijas', datos, id);

// ---------- Intenciones ------------------------------------------------
export const guardarIntencion = (datos: Partial<Intencion>, id?: string) =>
  guardarCatalogo<Intencion>('intenciones', datos, id);
/** Quitar = desactivar (queda en la base de datos, pero ya no se muestra). */
export const quitarIntencion = (id: string) => guardarIntencion({ activa: false }, id);

// ---------- Tipos de evento guardados y avisos parroquiales ------------
export const guardarTipoEvento = (datos: Partial<TipoEventoGuardado>, id?: string) =>
  guardarCatalogo<TipoEventoGuardado>('tipos_evento', datos, id);

export const guardarAviso = (datos: Partial<AvisoParroquial>, id?: string) =>
  guardarCatalogo<AvisoParroquial>('avisos_parroquiales', datos, id);
/** Quitar = desactivar (queda en la base de datos, pero ya no se muestra). */
export const quitarAviso = (id: string) => guardarAviso({ activo: false }, id);

// ---------- Choques de edición ----------------------------------------
/** "Conservar la mía": se vuelve a intentar sobre la versión actual del servidor. */
export async function conservarMiVersion(op: OpPendiente) {
  const version = (op.servidor?.version as number | undefined) ?? op.baseVersion;
  await db.outbox.update(op.seq!, { estado: 'pendiente', baseVersion: version, servidor: undefined, mensaje: undefined });
  void sincronizar();
}

/** "Usar la del servidor": se descarta el cambio local. */
export async function usarVersionServidor(op: OpPendiente) {
  await db.transaction('rw', db.eventos, db.outbox, async () => {
    if (op.servidor) await db.eventos.put(op.servidor as unknown as Evento);
    else await db.eventos.delete(op.rowId);
    await db.outbox.delete(op.seq!);
  });
}

export async function descartarOp(op: OpPendiente) {
  await db.transaction('rw', db.table(op.tabla), db.outbox, async () => {
    if (op.tipo === 'crear') await db.table(op.tabla).delete(op.rowId);
    await db.outbox.delete(op.seq!);
  });
  void sincronizar();
}

export async function reintentarOp(op: OpPendiente) {
  await db.outbox.update(op.seq!, { estado: 'pendiente', mensaje: undefined });
  void sincronizar();
}

// ---------- Acciones que requieren internet ---------------------------
export async function resolverConflicto(id: string) {
  const { error } = await supabase.rpc('resolver_conflicto', { p_id: id });
  if (error) throw error;
  await sincronizar();
}

export async function actualizarPerfil(id: string, cambios: Partial<Pick<Perfil, 'rol' | 'activo' | 'nombre'>>) {
  const { data, error } = await supabase.from('perfiles').update(cambios).eq('id', id).select().single();
  if (error) throw error;
  await db.perfiles.put(data as Perfil);
}

/** Cada quien pone su propio nombre (el que aparece como «creado por»). */
export async function actualizarMiNombre(nombre: string) {
  const limpio = nombre.trim();
  const { error } = await supabase.rpc('actualizar_mi_nombre', { p_nombre: limpio });
  if (error) throw error;
  const id = (await db.meta.get('usuarioId'))?.value as string | undefined;
  if (id) await db.perfiles.update(id, { nombre: limpio });
}

// ---------- Invitaciones (solo el párroco; requieren internet) --------------
export async function invitarUsuario(d: { email: string; nombre: string; rol: Rol }): Promise<Invitacion> {
  const { data, error } = await supabase
    .from('invitaciones').insert({ email: d.email.trim(), nombre: d.nombre.trim(), rol: d.rol }).select().single();
  if (error) throw error;
  return data as Invitacion;
}

export async function listarInvitaciones(): Promise<Invitacion[]> {
  const { data, error } = await supabase
    .from('invitaciones').select('*').eq('activa', true).is('usada_por', null).order('created_at', { ascending: false });
  if (error) throw error;
  return data as Invitacion[];
}

export async function cancelarInvitacion(id: string) {
  const { error } = await supabase.from('invitaciones').update({ activa: false }).eq('id', id);
  if (error) throw error;
}

// ---------- Superadmin: parroquias y accesos de los párrocos (requieren internet) ----
export async function listarParroquias(): Promise<ParroquiaAdmin[]> {
  const { data, error } = await supabase.rpc('listar_parroquias');
  if (error) throw error;
  return data as ParroquiaAdmin[];
}

/** Crea la parroquia y la invitación de su primer párroco; devuelve el código para dárselo. */
export async function crearParroquia(d: { nombre: string; zona: string; email: string; nombreParroco: string }) {
  const { data, error } = await supabase.rpc('crear_parroquia', {
    p_nombre: d.nombre, p_zona: d.zona, p_email: d.email, p_nombre_parroco: d.nombreParroco,
  });
  if (error) throw error;
  return data as { parroquia_id: string; codigo: string };
}

export async function invitarParroco(parroquia: string, email: string, nombre: string) {
  const { data, error } = await supabase.rpc('invitar_parroco', { p_parroquia: parroquia, p_email: email, p_nombre: nombre });
  if (error) throw error;
  return data as string;
}

export async function cancelarInvitacionParroco(id: string) {
  const { error } = await supabase.rpc('cancelar_invitacion_parroco', { p_id: id });
  if (error) throw error;
}

/** Renombra, cambia la zona horaria o suspende/reactiva (lo que no se pasa no cambia). */
export async function editarParroquia(id: string, cambios: { nombre?: string; activa?: boolean; zona?: string }) {
  const { error } = await supabase.rpc('editar_parroquia', {
    p_id: id, p_nombre: cambios.nombre ?? null, p_activa: cambios.activa ?? null, p_zona: cambios.zona ?? null,
  });
  if (error) throw error;
}

/** Para un superadmin sin parroquia propia: pasar a ser párroco de una. */
export async function asignarmeComoParroco(parroquia: string) {
  const { error } = await supabase.rpc('asignarme_como_parroco', { p_parroquia: parroquia });
  if (error) throw error;
}

// Las consultas de supabase-js no se envían hasta que se les hace await/then.
const enSegundoPlano = (q: PromiseLike<unknown>) => void q.then(undefined, () => {});

export async function marcarLeida(id: string) {
  await db.notificaciones.update(id, { leida: true });
  enSegundoPlano(supabase.from('notificaciones').update({ leida: true }).eq('id', id));
}

export async function marcarTodasLeidas(usuario: string) {
  await db.notificaciones.toCollection().modify({ leida: true });
  enSegundoPlano(supabase.from('notificaciones').update({ leida: true }).eq('usuario_id', usuario).eq('leida', false));
}
