import type { CSSProperties, ReactNode } from 'react';
import { horaDe } from '../lib/fechas';
import { nombreCelebrante, nombreCreador, nombreEditor, nombreTipo, type Evento, type Lugar, type Ministro, type Perfil, type Secretaria } from '../types';
import { Icono } from './Iconos';

interface Props {
  evento: Evento;
  lugares: Lugar[];
  perfiles: Perfil[];
  /** Ministros y vicarios sin cuenta (para poner el nombre del celebrante). */
  ministros?: Ministro[];
  /** Personas de la Secretaría (para decir quién agendó el evento). */
  secretarias?: Secretaria[];
  /** Nombres propios que la parroquia puso a los tipos de siempre. */
  nombresTipos?: Record<string, string>;
  sinEnviar: boolean;
  onClick?: () => void;
  /** Si se pasa, la tarjeta muestra el botón de intenciones con su cantidad. */
  onIntenciones?: () => void;
  nIntenciones?: number;
  /** Color que la parroquia eligió para este tipo de evento (si hay). */
  color?: string;
  /** Solo en la agenda de hoy: el evento que está ocurriendo o el que sigue. */
  momento?: 'ahora' | 'siguiente';
  children?: ReactNode;
}

const SIN_MINISTROS: Ministro[] = [];
const SIN_SECRETARIAS: Secretaria[] = [];

export const nombreLugar = (e: Evento, lugares: Lugar[]) =>
  (e.lugar_id && lugares.find((l) => l.id === e.lugar_id)?.nombre) || e.lugar_texto || 'Sin lugar';

export function TarjetaEvento({
  evento: e, lugares, perfiles, ministros = SIN_MINISTROS, secretarias = SIN_SECRETARIAS, nombresTipos, sinEnviar, onClick, onIntenciones, nIntenciones = 0, color, momento, children,
}: Props) {
  const celebrante = nombreCelebrante(e, perfiles, ministros);
  const creador = !e.misa_fija_id ? nombreCreador(e, perfiles, secretarias) : null;
  const editor = nombreEditor(e, perfiles, secretarias);
  const tipo = nombreTipo(e, nombresTipos);
  const clases = ['tarjeta', e.misa_fija_id ? 'fija' : '', e.estado === 'en_conflicto' ? 'conflicto' : '', e.estado === 'cancelado' ? 'cancelado' : '']
    .filter(Boolean).join(' ');
  // El color solo se ve cuando el evento está normal: un conflicto o una cancelación mantienen su señal.
  const estilo = color && e.estado === 'confirmado' ? ({ '--tipo': color } as CSSProperties) : undefined;
  const hayEtiquetas = e.estado !== 'confirmado' || sinEnviar || !!momento || !!e.misa_fija_id;

  return (
    <div className={clases} onClick={onClick} style={estilo}>
      <div className="cuando">
        <span className="hora">{horaDe(e.inicio)}</span>
        <span className="hasta">{horaDe(e.fin)}</span>
      </div>
      <div className="cuerpo">
        <div className="titulo">{e.titulo || tipo}</div>
        {e.titulo && <div className="tipo">{tipo}</div>}
        {e.intencion && <div className="meta intencion"><Icono n="cruz" size={15} />{e.intencion}</div>}
        <div className="meta">
          <Icono n="ubicacion" size={15} />
          <span>{nombreLugar(e, lugares)}{celebrante ? ` · ${celebrante}` : ''}</span>
        </div>
        {(e.contacto_nombre || e.contacto_telefono) && (
          <div className="meta">
            <Icono n="telefono" size={15} />
            <span>
              {e.contacto_nombre}
              {e.contacto_telefono && (
                <>
                  {e.contacto_nombre ? ' · ' : ''}
                  <a href={`tel:${e.contacto_telefono}`} onClick={(ev) => ev.stopPropagation()}>{e.contacto_telefono}</a>
                </>
              )}
            </span>
          </div>
        )}
        {creador && <div className="meta"><Icono n="lapiz" size={15} />Creado por {creador}</div>}
        {editor && <div className="meta"><Icono n="lapiz" size={15} />Editado por {editor}</div>}
        {hayEtiquetas && (
          <div className="etiquetas">
            {momento === 'ahora' && <span className="etq ahora">En curso</span>}
            {momento === 'siguiente' && <span className="etq siguiente">Sigue</span>}
            {e.estado === 'en_conflicto' && <span className="etq conflicto">EN CONFLICTO</span>}
            {e.estado === 'cancelado' && <span className="etq cancelado">CANCELADO</span>}
            {e.misa_fija_id && <span className="etq fija"><Icono n="repetir" size={11} strokeWidth={2.4} />Misa fija</span>}
            {sinEnviar && <span className="etq pendiente">Sin enviar</span>}
          </div>
        )}
      </div>
      {(onIntenciones && e.estado !== 'cancelado') || children ? (
        <div className="pie">
          {onIntenciones && e.estado !== 'cancelado' && (
            <button
              className={`btn chico ${nIntenciones ? '' : 'sec'}`} style={{ marginTop: 10 }}
              onClick={(ev) => { ev.stopPropagation(); onIntenciones(); }}
            >
              <Icono n="cruz" size={15} />Intenciones{nIntenciones ? ` (${nIntenciones})` : ''}
            </button>
          )}
          {children}
        </div>
      ) : null}
    </div>
  );
}
