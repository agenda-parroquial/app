import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { avisosDisponibles, pedirPermisoAvisos } from '../lib/avisos';
import { fechaDe, fechaHoraCorta } from '../lib/fechas';
import { ir } from '../lib/hooks';
import { marcarLeida, marcarTodasLeidas } from '../lib/store';
import type { Notificacion } from '../types';

export async function abrirNotificacion(n: Notificacion) {
  await marcarLeida(n.id);
  if (n.tipo === 'conflicto') return ir('conflictos');
  const e = n.evento_id ? await db.eventos.get(n.evento_id) : undefined;
  ir(e ? `agenda/${fechaDe(e.inicio)}/${e.id}` : 'agenda');
}

const ICONO: Record<Notificacion['tipo'], string> = {
  evento_nuevo: '🆕', evento_editado: '✏️', evento_cancelado: '🚫', conflicto: '⚠️',
};
const SIN_NOTIFICACIONES: Notificacion[] = [];

export function Notificaciones({ usuarioId }: { usuarioId: string }) {
  const lista = useLiveQuery(() => db.notificaciones.orderBy('created_at').reverse().toArray(), [], SIN_NOTIFICACIONES);
  const [permiso, setPermiso] = useState<NotificationPermission | 'no'>(avisosDisponibles() ? Notification.permission : 'no');

  return (
    <>
      <div className="fila entre" style={{ marginBottom: 12 }}>
        <h2>Avisos</h2>
        {lista.some((n) => !n.leida) && (
          <button className="btn sec chico" onClick={() => void marcarTodasLeidas(usuarioId)}>Marcar todo como leído</button>
        )}
      </div>

      {permiso === 'default' && (
        <div className="aviso">
          Activa los avisos en este dispositivo para que te lleguen al instante.
          <div style={{ marginTop: 8 }}>
            <button className="btn chico" onClick={async () => setPermiso(await pedirPermisoAvisos())}>Activar avisos</button>
          </div>
        </div>
      )}
      {permiso === 'denied' && <div className="aviso">Los avisos están bloqueados en este dispositivo. Actívalos en los ajustes del navegador.</div>}
      {permiso === 'no' && (
        <div className="aviso">
          Este navegador no permite avisos. En iPhone, primero instala la app: Compartir → «Añadir a pantalla de inicio».
        </div>
      )}

      {lista.length === 0 && <div className="vacio">Todavía no hay avisos.</div>}
      <div className="lista">
        {lista.map((n) => (
          <div key={n.id} className={`item clic ${n.leida ? '' : 'noleida'}`} onClick={() => void abrirNotificacion(n)}>
            <span style={{ fontSize: '1.4rem' }}>{ICONO[n.tipo]}</span>
            <div>
              <div className="titulo">{n.mensaje}</div>
              <div className="ayuda">{fechaHoraCorta(n.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
