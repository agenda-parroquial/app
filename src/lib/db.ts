import Dexie, { type Table } from 'dexie';
import type {
  AvisoParroquial, Conflicto, Evento, EventoDiocesano, Intencion, Lugar, MisaFija, Ministro, Notificacion, OpPendiente, Parroquia, Perfil,
  Secretaria, SecretariaPin, TipoEventoGuardado,
} from '../types';

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
  intenciones!: Table<Intencion, string>;
  tipos_evento!: Table<TipoEventoGuardado, string>;
  avisos_parroquiales!: Table<AvisoParroquial, string>;
  parroquias!: Table<Parroquia, string>;
  ministros!: Table<Ministro, string>;
  secretarias!: Table<Secretaria, string>;
  secretarias_pin!: Table<SecretariaPin, string>;
  eventos_diocesanos!: Table<EventoDiocesano, string>;
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
    // v2: intenciones de cada evento (las tablas existentes se conservan).
    this.version(2).stores({ intenciones: 'id, evento_id' });
    // v3: tipos de evento personalizados y avisos parroquiales.
    this.version(3).stores({ tipos_evento: 'id', avisos_parroquiales: 'id, desde' });
    // v4: la parroquia del usuario (nombre y si está suspendida).
    this.version(4).stores({ parroquias: 'id' });
    // v5: eventos diocesanos (los sube el superadmin y los ven todas las parroquias).
    this.version(5).stores({ eventos_diocesanos: 'id, inicio' });
    // v6: ministros y vicarios sin cuenta (celebrantes).
    this.version(6).stores({ ministros: 'id' });
    // v7: personas de la Secretaría y las huellas de sus PIN.
    this.version(7).stores({ secretarias: 'id', secretarias_pin: 'id' });
  }
}

export const db = new AgendaDB();

/** Borra todo lo local (al cerrar sesión o cambiar de usuario en el equipo). */
export async function vaciarLocal() {
  await Promise.all(db.tables.map((t) => t.clear()));
}
