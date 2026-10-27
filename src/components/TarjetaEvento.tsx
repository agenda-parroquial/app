import { horaDe } from '../lib/fechas';
import { nombrePerfil, nombreTipo, type Evento, type Lugar, type Perfil } from '../types';

interface Props {
  evento: Evento;
  lugares: Lugar[];
  perfiles: Perfil[];
  sinEnviar: boolean;
  onClick?: () => void;
  /** Si se pasa, la tarjeta muestra el botón de intenciones con su cantidad. */
  onIntenciones?: () => void;
  nIntenciones?: number;
  /** Color que la parroquia eligió para este tipo de evento (si hay). */
  color?: string;
  children?: React.ReactNode;
}

export const nombreLugar = (e: Evento, lugares: Lugar[]) =>
  (e.lugar_id && lugares.find((l) => l.id === e.lugar_id)?.nombre) || e.lugar_texto || 'Sin lugar';

export function TarjetaEvento({ evento: e, lugares, perfiles, sinEnviar, onClick, onIntenciones, nIntenciones = 0, color, children }: Props) {
  const celebrante = e.asignado_a ? nombrePerfil(perfiles.find((p) => p.id === e.asignado_a)) : null;
  const creador = !e.misa_fija_id && e.creado_por ? nombrePerfil(perfiles.find((p) => p.id === e.creado_por)) : null;
  const tipo = nombreTipo(e);
  const clases = ['tarjeta', e.misa_fija_id ? 'fija' : '', e.estado === 'en_conflicto' ? 'conflicto' : '', e.estado === 'cancelado' ? 'cancelado' : '']
    .filter(Boolean).join(' ');

  return (
    // El color solo se ve cuando el evento está normal: un conflicto o una cancelación mantienen su señal.
    <div className={clases} onClick={onClick} style={color && e.estado === 'confirmado' ? { borderLeftColor: color } : undefined}>
      <div className="hora">{horaDe(e.inicio)} – {horaDe(e.fin)}</div>
      <div className="titulo">{e.titulo || tipo}{e.titulo ? ` · ${tipo}` : ''}</div>
      {e.intencion && <div className="meta">🙏 {e.intencion}</div>}
      <div className="meta">📍 {nombreLugar(e, lugares)}{celebrante ? ` · Celebrante: ${celebrante}` : ''}</div>
      {(e.contacto_nombre || e.contacto_telefono) && (
        <div className="meta">
          👤 {e.contacto_nombre}
          {e.contacto_telefono && (
            <>
              {e.contacto_nombre ? ' · ' : ''}
              <a href={`tel:${e.contacto_telefono}`} onClick={(ev) => ev.stopPropagation()}>{e.contacto_telefono}</a>
            </>
          )}
        </div>
      )}
      {creador && <div className="meta">✍️ Creado por {creador}</div>}
      {(e.estado !== 'confirmado' || sinEnviar) && (
        <div className="etiquetas">
          {e.estado === 'en_conflicto' && <span className="etq conflicto">EN CONFLICTO</span>}
          {e.estado === 'cancelado' && <span className="etq cancelado">CANCELADO</span>}
          {sinEnviar && <span className="etq pendiente">Sin enviar</span>}
        </div>
      )}
      {onIntenciones && e.estado !== 'cancelado' && (
        <button
          className={`btn chico ${nIntenciones ? '' : 'sec'}`} style={{ marginTop: 10 }}
          onClick={(ev) => { ev.stopPropagation(); onIntenciones(); }}
        >
          🙏 Intenciones{nIntenciones ? ` (${nIntenciones})` : ''}
        </button>
      )}
      {children}
    </div>
  );
}
