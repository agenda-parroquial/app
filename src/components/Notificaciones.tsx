import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { fechaDe, fechaHoraCorta } from '../lib/fechas';
import { ir } from '../lib/hooks';
import { marcarLeida, marcarTodasLeidas } from '../lib/store';
import type { Notificacion } from '../types';
import { AvisosPush } from './AvisosPush';
import { Icono, type NombreIcono } from './Iconos';

export async function abrirNotificacion(n: Notificacion) {
  await marcarLeida(n.id);
  if (n.tipo === 'prueba') return;
  if (n.tipo === 'conflicto') return ir('conflictos');
  if (n.tipo === 'aviso_parroquial') return ir('parroquiales');
  const e = n.evento_id ? await db.eventos.get(n.evento_id) : undefined;
  ir(e ? `agenda/${fechaDe(e.inicio)}/${e.id}` : 'agenda');
}

const ICONO: Record<Notificacion['tipo'], { n: NombreIcono; tono: string }> = {
  evento_nuevo: { n: 'mas', tono: 'ok' },
  evento_editado: { n: 'lapiz', tono: '' },
  evento_cancelado: { n: 'cerrar', tono: 'gris' },
  conflicto: { n: 'alerta', tono: '' },
  aviso_parroquial: { n: 'megafono', tono: 'oro' },
  evento_diocesano: { n: 'diocesis', tono: 'dio' },
  prueba: { n: 'campana', tono: 'gris' },
};
const SIN_NOTIFICACIONES: Notificacion[] = [];

export function Notificaciones({ usuarioId }: { usuarioId: string }) {
  const lista = useLiveQuery(() => db.notificaciones.orderBy('created_at').reverse().toArray(), [], SIN_NOTIFICACIONES);

  return (
    <>
      <div className="fila entre" style={{ marginBottom: 12 }}>
        <h2>Notificaciones</h2>
        {lista.some((n) => !n.leida) && (
          <button className="btn sec chico" onClick={() => void marcarTodasLeidas(usuarioId)}>Marcar todo como leído</button>
        )}
      </div>

      <AvisosPush />

      {lista.length === 0 && (
        <div className="vacio grande">
          <span className="vacio-ico"><Icono n="campana" size={26} /></span>
          <b>Sin notificaciones</b>
          <span>Aquí verás los eventos nuevos, cambios, cancelaciones y conflictos.</span>
        </div>
      )}
      <div className="lista">
        {lista.map((n) => (
          <div key={n.id} className={`item clic ${n.leida ? '' : 'noleida'}`} onClick={() => void abrirNotificacion(n)}>
            <span className={`ico ${ICONO[n.tipo].tono}`}><Icono n={ICONO[n.tipo].n} /></span>
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
