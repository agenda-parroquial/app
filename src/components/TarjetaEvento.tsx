import { horaDe } from '../lib/fechas';
import { TIPOS_EVENTO, type Evento, type Lugar, type Perfil } from '../types';

interface Props {
  evento: Evento;
  lugares: Lugar[];
  perfiles: Perfil[];
  sinEnviar: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}

export const nombreLugar = (e: Evento, lugares: Lugar[]) =>
  (e.lugar_id && lugares.find((l) => l.id === e.lugar_id)?.nombre) || e.lugar_texto || 'Sin lugar';

export function TarjetaEvento({ evento: e, lugares, perfiles, sinEnviar, onClick, children }: Props) {
  const asignado = e.asignado_a ? perfiles.find((p) => p.id === e.asignado_a)?.nombre : null;
  const clases = ['tarjeta', e.misa_fija_id ? 'fija' : '', e.estado === 'en_conflicto' ? 'conflicto' : '', e.estado === 'cancelado' ? 'cancelado' : '']
    .filter(Boolean).join(' ');

  return (
    <div className={clases} onClick={onClick}>
      <div className="hora">{horaDe(e.inicio)} – {horaDe(e.fin)}</div>
      <div className="titulo">{e.titulo || TIPOS_EVENTO[e.tipo]}{e.titulo ? ` · ${TIPOS_EVENTO[e.tipo]}` : ''}</div>
      {e.intencion && <div className="meta">🙏 {e.intencion}</div>}
      <div className="meta">📍 {nombreLugar(e, lugares)}{asignado ? ` · ${asignado}` : ''}</div>
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
      {(e.estado !== 'confirmado' || sinEnviar) && (
        <div className="etiquetas">
          {e.estado === 'en_conflicto' && <span className="etq conflicto">EN CONFLICTO</span>}
          {e.estado === 'cancelado' && <span className="etq cancelado">CANCELADO</span>}
          {sinEnviar && <span className="etq pendiente">Sin enviar</span>}
        </div>
      )}
      {children}
    </div>
  );
}
