export type Rol = 'parroco' | 'vicario' | 'secretaria';
export type TipoLugar = 'templo' | 'capilla' | 'oficina' | 'otro';
export type TipoEvento = 'misa' | 'bautizo' | 'boda' | 'confesion' | 'uncion' | 'reunion' | 'otro';
export type EstadoEvento = 'confirmado' | 'en_conflicto' | 'cancelado';

export interface Perfil {
  id: string;
  email: string | null;
  nombre: string;
  rol: Rol;
  activo: boolean;
  parroquia_id: string | null; // null = superadmin sin parroquia propia
  created_at: string;
  updated_at: string;
}

/** La parroquia a la que pertenece el usuario (la copia local solo tiene la suya). */
export interface Parroquia {
  id: string;
  nombre: string;
  zona_horaria: string;
  activa: boolean; // false = suspendida por el superadmin
  created_at: string;
  updated_at: string;
}

/** Fila del panel del superadmin (función `listar_parroquias`). */
export interface ParroquiaAdmin extends Parroquia {
  usuarios: number;
  pendientes: number;
  parrocos: { nombre: string; email: string }[];
  invitaciones: { id: string; email: string; nombre: string; codigo: string }[];
}

export interface Lugar {
  id: string;
  nombre: string;
  tipo: TipoLugar;
  direccion: string | null;
  lat: number | null;
  lng: number | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface MisaFija {
  id: string;
  dia_semana: number; // 0 = domingo
  hora: string; // 'HH:MM:SS'
  duracion_min: number;
  lugar_id: string;
  asignado_a: string | null;
  intencion: string | null;
  activo: boolean;
  cada_semanas: number; // 1 = todas las semanas; 2 = una sí y una no...
  desde: string | null; // 'YYYY-MM-DD': primera fecha (obligatoria si cada_semanas > 1)
  created_at: string;
  updated_at: string;
}

/** Invitación del párroco: nombre, correo y rol; la persona se registra con el código. */
export interface Invitacion {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  codigo: string;
  activa: boolean;
  usada_por: string | null;
  created_at: string;
}

/** Tipo de evento que la parroquia creó con «Otro» + guardar. */
export interface TipoEventoGuardado {
  id: string;
  nombre: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

/** Aviso parroquial: un anuncio que se lee en misa. */
export interface AvisoParroquial {
  id: string;
  titulo: string;
  texto: string;
  desde: string; // 'YYYY-MM-DD'
  hasta: string | null;
  notificar: boolean;
  activo: boolean;
  creado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface Evento {
  id: string;
  tipo: TipoEvento;
  tipo_texto: string | null; // nombre del tipo cuando tipo = 'otro'
  titulo: string | null;
  inicio: string; // ISO
  fin: string; // ISO
  lugar_id: string | null;
  lugar_texto: string | null;
  asignado_a: string | null;
  intencion: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  notas: string | null;
  estado: EstadoEvento;
  misa_fija_id: string | null;
  fecha_origen: string | null;
  creado_por: string | null;
  modificado_por: string | null;
  version: number; // 0 = aún no existe en el servidor
  created_at: string;
  updated_at: string;
}

export interface Conflicto {
  id: string;
  evento_a: string;
  evento_b: string;
  estado: 'abierto' | 'resuelto';
  resolucion: 'coexisten' | 'cancelado' | 'movido' | null;
  resuelto_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notificacion {
  id: string;
  usuario_id: string;
  tipo: 'evento_nuevo' | 'evento_editado' | 'evento_cancelado' | 'conflicto' | 'aviso_parroquial' | 'prueba';
  evento_id: string | null;
  conflicto_id: string | null;
  mensaje: string;
  leida: boolean;
  created_at: string;
}

/** Campos de un evento que edita el usuario (lo único que viaja al servidor). */
export type DatosEvento = Pick<
  Evento,
  | 'tipo' | 'tipo_texto' | 'titulo' | 'inicio' | 'fin' | 'lugar_id' | 'lugar_texto' | 'asignado_a'
  | 'intencion' | 'contacto_nombre' | 'contacto_telefono' | 'notas'
>;

export type TipoIntencion = 'difunto' | 'accion_gracias' | 'salud';

export interface Intencion {
  id: string;
  evento_id: string;
  tipo: TipoIntencion;
  texto: string; // nombre(s) o descripción
  activa: boolean; // false = quitada
  creado_por: string | null;
  created_at: string;
  updated_at: string;
}

export type Tabla = 'eventos' | 'lugares' | 'misas_fijas' | 'intenciones' | 'tipos_evento' | 'avisos_parroquiales';

/** Un cambio hecho en este dispositivo que aún no llega al servidor. */
export interface OpPendiente {
  seq?: number;
  tabla: Tabla;
  rowId: string;
  tipo: 'crear' | 'editar';
  datos: Record<string, unknown>;
  baseVersion: number; // versión del servidor sobre la que se editó
  estado: 'pendiente' | 'choque' | 'error';
  mensaje?: string;
  servidor?: Record<string, unknown> | null; // fila del servidor cuando hubo choque
}

// ---------- Etiquetas y permisos --------------------------------------
export const TIPOS_EVENTO: Record<TipoEvento, string> = {
  misa: 'Misa',
  bautizo: 'Bautizo',
  boda: 'Boda',
  confesion: 'Confesiones',
  uncion: 'Unción de enfermos',
  reunion: 'Reunión',
  otro: 'Otro',
};

export const TIPOS_LUGAR: Record<TipoLugar, string> = {
  templo: 'Templo',
  capilla: 'Capilla',
  oficina: 'Oficina',
  otro: 'Otro',
};

export const TIPOS_INTENCION: Record<TipoIntencion, { titulo: string; icono: string }> = {
  difunto: { titulo: 'Por los difuntos', icono: '✝️' },
  accion_gracias: { titulo: 'Acción de gracias', icono: '🙏' },
  salud: { titulo: 'Por la salud de', icono: '❤️' },
};

export const ROLES: Record<Rol, string> = {
  parroco: 'Párroco',
  vicario: 'Vicario',
  secretaria: 'Secretaria',
};

export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const puedeEditarCatalogos = (rol: Rol | undefined) => rol === 'parroco' || rol === 'secretaria';
export const esSacerdote = (p: Perfil) => p.rol === 'parroco' || p.rol === 'vicario';

/** Nombre a mostrar de una persona (si aún no puso el suyo, el inicio de su correo). */
export const nombrePerfil = (p: Perfil | undefined) => p?.nombre?.trim() || p?.email?.split('@')[0] || 'alguien';

/** Nombre del tipo de un evento: el escrito a mano si es «Otro», o el de la lista. */
export const nombreTipo = (e: Pick<Evento, 'tipo' | 'tipo_texto'>) =>
  e.tipo === 'otro' && e.tipo_texto?.trim() ? e.tipo_texto.trim() : TIPOS_EVENTO[e.tipo];

/**
 * Quién captura o edita las intenciones de un evento: la secretaria en todos, y el párroco o
 * el vicario solo en los que tienen asignados. (Todos pueden verlas.) Misma regla que en la base de datos.
 */
export const puedeEditarIntenciones = (perfil: Perfil | undefined, evento: Pick<Evento, 'asignado_a'>) =>
  !!perfil && (perfil.rol === 'secretaria' || (evento.asignado_a !== null && evento.asignado_a === perfil.id));
