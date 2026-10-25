import Dexie, { type Table } from 'dexie';
import type { Conflicto, Evento, Lugar, MisaFija, Notificacion, OpPendiente, Perfil } from '../types';

/**
 * Copia local de la agenda. Toda la interfaz lee de aquí, así la app
 * funciona igual con o sin internet; la sincronización la mantiene al día.
 */
class AgendaDB extends Dexie {
  eventos!: Table<Evento, string>;
  lugares!: Table<Lugar, string>;
  misas_fijas!: Table<MisaFija, string>;
  perfiles!: Table<Perfil, string>;
  conflictos!: Table<Conflicto, string>;
  notificaciones!: Table<Notificacion, string>;
  outbox!: Table<OpPendiente, number>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('agenda-parroquial');
    this.version(1).stores({
      eventos: 'id, inicio, estado',
      lugares: 'id',
      misas_fijas: 'id',
      perfiles: 'id',
      conflictos: 'id, estado',
      notificaciones: 'id, created_at',
      outbox: '++seq, rowId, estado',
      meta: 'key',
    });
  }
}

export const db = new AgendaDB();

/** Borra todo lo local (al cerrar sesión o cambiar de usuario en el equipo). */
export async function vaciarLocal() {
  await Promise.all(db.tables.map((t) => t.clear()));
}
