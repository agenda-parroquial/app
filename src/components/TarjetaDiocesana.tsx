import { deClave, diaLargo, fechaDe, horaDe } from '../lib/fechas';
import { ocultarDiocesano } from '../lib/preferencias';
import type { EventoDiocesano } from '../types';
import { Icono } from './Iconos';

/** Evento de la diócesis: tarjeta con formato propio para distinguirlo de los de la parroquia. */
export function TarjetaDiocesana({ evento: e, onClick }: { evento: EventoDiocesano; onClick: () => void }) {
  return (
    <div className="tarjeta diocesana" onClick={onClick}>
      <div className="cuando">
        <span className="hora">{horaDe(e.inicio)}</span>
        <span className="hasta">{horaDe(e.fin)}</span>
      </div>
      <div className="cuerpo">
        <div className="titulo">{e.titulo}</div>
        {e.lugar && <div className="meta"><Icono n="ubicacion" size={15} />{e.lugar}</div>}
        <div className="etiquetas">
          <span className="etq diocesano"><Icono n="diocesis" size={12} strokeWidth={2.2} />Diocesano · informativo</span>
        </div>
      </div>
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
        <div className="etiquetas" style={{ marginTop: 6 }}>
          <span className="etq diocesano"><Icono n="diocesis" size={12} strokeWidth={2.2} />Evento diocesano</span>
        </div>
        <div className="lista" style={{ marginTop: 14 }}>
          <div className="item">
            <span className="ico dio"><Icono n="calendario" /></span>
            <div><b style={{ textTransform: 'capitalize' }}>{diaLargo(deClave(fechaDe(e.inicio)))}</b></div>
          </div>
          <div className="item">
            <span className="ico dio"><Icono n="reloj" /></span>
            <div>{horaDe(e.inicio)} – {horaDe(e.fin)}</div>
          </div>
          {e.lugar && (
            <div className="item">
              <span className="ico dio"><Icono n="ubicacion" /></span>
              <div>{e.lugar}</div>
            </div>
          )}
        </div>
        {e.notas && <p style={{ whiteSpace: 'pre-wrap', margin: '14px 2px 0' }}>{e.notas}</p>}
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
