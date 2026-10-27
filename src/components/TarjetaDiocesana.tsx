import { deClave, diaLargo, fechaDe, horaDe } from '../lib/fechas';
import { ocultarDiocesano } from '../lib/preferencias';
import type { EventoDiocesano } from '../types';

/** Evento de la diócesis: tarjeta con formato propio para distinguirlo de los de la parroquia. */
export function TarjetaDiocesana({ evento: e, onClick }: { evento: EventoDiocesano; onClick: () => void }) {
  return (
    <div className="tarjeta diocesana" onClick={onClick}>
      <div className="etiquetas" style={{ marginTop: 0, marginBottom: 6 }}>
        <span className="etq diocesano">🏛 Diocesano · indicativo</span>
      </div>
      <div className="hora">{horaDe(e.inicio)} – {horaDe(e.fin)}</div>
      <div className="titulo">{e.titulo}</div>
      {e.lugar && <div className="meta">📍 {e.lugar}</div>}
    </div>
  );
}

/** Detalle de solo lectura; cada persona puede ignorar el evento en su agenda. */
export function DiocesanoDetalle({ evento: e, onCerrar }: { evento: EventoDiocesano; onCerrar: () => void }) {
  return (
    <div className="fondo" onMouseDown={(ev) => ev.target === ev.currentTarget && onCerrar()}>
      <div className="hoja">
        <div className="hoja-cab">
          <h2>{e.titulo}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <div className="etiquetas" style={{ marginTop: 0 }}>
          <span className="etq diocesano">🏛 Evento diocesano</span>
        </div>
        <p style={{ marginBottom: 4 }}>
          📅 <b>{diaLargo(deClave(fechaDe(e.inicio)))}</b><br />
          🕒 {horaDe(e.inicio)} – {horaDe(e.fin)}
        </p>
        {e.lugar && <p style={{ margin: '4px 0' }}>📍 {e.lugar}</p>}
        {e.notas && <p style={{ whiteSpace: 'pre-wrap' }}>{e.notas}</p>}
        <p className="ayuda">
          Lo publica la diócesis para todas las parroquias. Es solo informativo: no genera empalmes con tu agenda.
        </p>
        <div className="acciones">
          <button className="btn sec" onClick={() => { ocultarDiocesano(e.id); onCerrar(); }}>Ocultar de mi agenda</button>
          <button className="btn" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
