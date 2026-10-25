import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { fechaDe, fechaHoraCorta } from '../lib/fechas';
import { ir, useIdsPendientes, useLugares, usePerfiles } from '../lib/hooks';
import { useEstadoSync, esErrorDeRed, mensajeDeError } from '../lib/sync';
import {
  cancelarEvento, conservarMiVersion, descartarOp, reintentarOp, resolverConflicto, usarVersionServidor,
} from '../lib/store';
import { TIPOS_EVENTO, type Evento, type Lugar, type OpPendiente, type Perfil } from '../types';
import { TarjetaEvento } from './TarjetaEvento';

const ETIQUETAS: Record<string, string> = {
  tipo: 'Tipo', titulo: 'Título', inicio: 'Inicio', fin: 'Fin', lugar_id: 'Lugar', lugar_texto: 'Lugar (texto)',
  asignado_a: 'Atiende', intencion: 'Intención', contacto_nombre: 'Contacto', contacto_telefono: 'Teléfono',
  notas: 'Notas', estado: 'Estado',
};

function valor(campo: string, v: unknown, lugares: Lugar[], perfiles: Perfil[]): string {
  if (v === null || v === undefined || v === '') return '—';
  if (campo === 'inicio' || campo === 'fin') return fechaHoraCorta(String(v));
  if (campo === 'lugar_id') return lugares.find((l) => l.id === v)?.nombre ?? '—';
  if (campo === 'asignado_a') return perfiles.find((p) => p.id === v)?.nombre ?? '—';
  if (campo === 'tipo') return TIPOS_EVENTO[v as Evento['tipo']] ?? String(v);
  return String(v);
}

export function Conflictos() {
  const lugares = useLugares();
  const perfiles = usePerfiles();
  const pendientes = useIdsPendientes();
  const { enLinea } = useEstadoSync();
  const [error, setError] = useState('');

  const traslapes = useLiveQuery(async () => {
    const abiertos = await db.conflictos.where('estado').equals('abierto').toArray();
    const filas = await Promise.all(
      abiertos.map(async (c) => {
        const [a, b] = await db.eventos.bulkGet([c.evento_a, c.evento_b]);
        return a && b && a.estado !== 'cancelado' && b.estado !== 'cancelado' ? { c, a, b } : null;
      }),
    );
    return filas.filter((f) => f !== null);
  }, [], []);

  const ops = useLiveQuery(() => db.outbox.where('estado').notEqual('pendiente').toArray(), [], [] as OpPendiente[]);
  const choques = ops.filter((o) => o.estado === 'choque');
  const errores = ops.filter((o) => o.estado === 'error');

  async function intentar(f: () => Promise<unknown>) {
    setError('');
    try {
      await f();
    } catch (e) {
      setError(esErrorDeRed(e) ? 'Necesitas internet para hacer esto.' : mensajeDeError(e));
    }
  }

  async function cancelar(e: Evento) {
    if (confirm('¿Cancelar este evento? Se avisará a los demás.')) await cancelarEvento(e.id);
  }

  const nada = !traslapes.length && !choques.length && !errores.length;

  return (
    <>
      <h2 style={{ marginBottom: 6 }}>Conflictos</h2>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Dos eventos que coinciden en horario y lugar (o con la misma persona) aparecen aquí hasta que se resuelvan.
      </p>
      {error && <div className="aviso error">{error}</div>}
      {nada && <div className="vacio">✔ No hay conflictos pendientes.</div>}

      {traslapes.map(({ c, a, b }) => (
        <div className="grupo" key={c.id}>
          <h3 style={{ marginBottom: 8 }}>Empalme de horario</h3>
          {[a, b].map((e, i) => (
            <div key={e.id}>
              {i === 1 && <div className="vs">⟷ choca con ⟷</div>}
              <TarjetaEvento evento={e} lugares={lugares} perfiles={perfiles} sinEnviar={pendientes.has(e.id)}>
                <div className="fila" style={{ marginTop: 10 }}>
                  <button className="btn chico" onClick={() => ir(`agenda/${fechaDe(e.inicio)}/${e.id}`)}>Cambiar horario o lugar</button>
                  <button className="btn peligro chico" onClick={() => void cancelar(e)}>Cancelar</button>
                </div>
              </TarjetaEvento>
            </div>
          ))}
          <button
            className="btn sec ancho" style={{ marginTop: 6 }} disabled={!enLinea}
            onClick={() => void intentar(() => resolverConflicto(c.id))}
          >
            Está bien: pueden coexistir
          </button>
          {!enLinea && <p className="ayuda">Necesitas internet para marcarlos como compatibles.</p>}
        </div>
      ))}

      {choques.map((op) => (
        <div className="grupo" key={op.seq}>
          <h3>Cambio que chocó</h3>
          <p className="ayuda">{op.mensaje}</p>
          <div className="comparar">
            <div>
              <b>Tu cambio</b>
              {Object.entries(op.datos).map(([k, v]) => (
                <div key={k}>{ETIQUETAS[k] ?? k}: {valor(k, v, lugares, perfiles)}</div>
              ))}
            </div>
            <div>
              <b>En el servidor</b>
              {op.servidor
                ? Object.keys(op.datos).map((k) => <div key={k}>{ETIQUETAS[k] ?? k}: {valor(k, op.servidor![k], lugares, perfiles)}</div>)
                : <div>El evento ya no existe.</div>}
            </div>
          </div>
          <div className="acciones">
            {op.servidor && <button className="btn" onClick={() => void conservarMiVersion(op)}>Conservar el mío</button>}
            <button className="btn sec" onClick={() => void usarVersionServidor(op)}>Usar el del servidor</button>
          </div>
        </div>
      ))}

      {errores.map((op) => (
        <div className="grupo" key={op.seq}>
          <h3>No se pudo enviar un cambio</h3>
          <p className="ayuda">{op.mensaje}</p>
          <div className="acciones">
            <button className="btn" onClick={() => void reintentarOp(op)}>Reintentar</button>
            <button className="btn peligro" onClick={() => void descartarOp(op)}>Descartar cambio</button>
          </div>
        </div>
      ))}
    </>
  );
}
