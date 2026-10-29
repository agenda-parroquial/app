import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { diaBreve, fechaDe, horaDe } from '../lib/fechas';
import { useLugares } from '../lib/hooks';
import { guardarIntencion, quitarIntencion } from '../lib/store';
import { nombreTipo, TIPOS_INTENCION, type Evento, type Intencion, type TipoIntencion } from '../types';
import { Icono, type NombreIcono } from './Iconos';
import { nombreLugar } from './TarjetaEvento';

const SIN_INTENCIONES: Intencion[] = [];
const ORDEN: TipoIntencion[] = ['difunto', 'accion_gracias', 'salud'];
const ICONO_INTENCION: Record<TipoIntencion, NombreIcono> = { difunto: 'cruz', accion_gracias: 'sol', salud: 'corazon' };

/**
 * Intenciones de un evento: por los difuntos, acción de gracias y por la salud de.
 * `editable` = false: solo lectura (la lista del botón de cada tarjeta).
 * `editable` = true: capturar, editar y quitar (se abre desde «Editar evento»).
 */
export function Intenciones({ evento, onCerrar, editable = false }: { evento: Evento; onCerrar: () => void; editable?: boolean }) {
  const lugares = useLugares();
  const lista = useLiveQuery(
    () => db.intenciones.where('evento_id').equals(evento.id).filter((i) => i.activa).sortBy('created_at'),
    [evento.id], SIN_INTENCIONES,
  );
  const [tipo, setTipo] = useState<TipoIntencion>('difunto');
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [textoEdit, setTextoEdit] = useState('');
  const [copiado, setCopiado] = useState(false);

  const titulo = `${evento.titulo || nombreTipo(evento)} ·${diaBreve(fechaDe(evento.inicio))} · ${horaDe(evento.inicio)}`;

  async function agregar(e: FormEvent) {
    e.preventDefault();
    // Una intención por línea: se pueden pegar varios nombres de golpe.
    const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const t of lineas) await guardarIntencion({ evento_id: evento.id, tipo, texto: t, activa: true });
    setTexto('');
  }

  async function guardarEdicion(i: Intencion) {
    const t = textoEdit.trim();
    if (t && t !== i.texto) await guardarIntencion({ texto: t }, i.id);
    setEditando(null);
  }

  async function quitar(i: Intencion) {
    if (confirm(`¿Quitar «${i.texto}»?`)) await quitarIntencion(i.id);
  }

  async function copiar() {
    const bloques = ORDEN.map((t) => {
      const items = lista.filter((i) => i.tipo === t);
      return items.length ? `${TIPOS_INTENCION[t].icono} ${TIPOS_INTENCION[t].titulo}\n${items.map((i) => `• ${i.texto}`).join('\n')}` : '';
    }).filter(Boolean);
    const cuerpo = `Intenciones · ${titulo} · ${nombreLugar(evento, lugares)}\n\n${bloques.join('\n\n')}`;
    try {
      await navigator.clipboard.writeText(cuerpo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      alert(cuerpo); // sin permiso de portapapeles: se muestra para copiarlo a mano
    }
  }

  return (
    <div className="fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="hoja">
        <div className="hoja-cab">
          <div>
            <h2>{editable ? 'Editar intenciones' : 'Intenciones'}</h2>
            <div className="ayuda">{titulo} · {nombreLugar(evento, lugares)}</div>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>

        {!editable && (
          <p className="ayuda" style={{ marginBottom: 0 }}>
            Solo lectura. Las agrega la secretaria o quien celebra esta misa.
          </p>
        )}

        {editable && (
        <form onSubmit={agregar} className="grupo" style={{ marginTop: 14 }}>
          <label htmlFor="int-tipo" style={{ marginTop: 0 }}>Agregar intención</label>
          <select id="int-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoIntencion)}>
            {ORDEN.map((t) => <option key={t} value={t}>{TIPOS_INTENCION[t].titulo}</option>)}
          </select>
          <textarea
            style={{ marginTop: 8, minHeight: 64 }} value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder="Nombre o descripción. Una por línea."
          />
          <button className="btn ancho" style={{ marginTop: 8 }} disabled={!texto.trim()}>Agregar</button>
        </form>
        )}

        {lista.length === 0 && <div className="vacio" style={{ marginTop: 14 }}>Todavía no hay intenciones para esta fecha.</div>}

        {ORDEN.map((t) => {
          const items = lista.filter((i) => i.tipo === t);
          if (!items.length) return null;
          return (
            <section key={t}>
              <h3 className="dia-titulo"><Icono n={ICONO_INTENCION[t]} size={18} /><span>{TIPOS_INTENCION[t].titulo} ({items.length})</span></h3>
              <div className="lista">
                {items.map((i) => (
                  <div key={i.id} className="item">
                    {!editable ? (
                      <div style={{ fontSize: '1.08rem' }}>{i.texto}</div>
                    ) : editando === i.id ? (
                      <>
                        <input value={textoEdit} onChange={(e) => setTextoEdit(e.target.value)} autoFocus />
                        <button className="btn chico" onClick={() => void guardarEdicion(i)}>Guardar</button>
                        <button className="btn sec chico" aria-label="Cancelar" onClick={() => setEditando(null)}><Icono n="cerrar" size={15} /></button>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: '1.08rem' }}>{i.texto}</div>
                        <button className="btn sec chico" aria-label="Editar" onClick={() => { setEditando(i.id); setTextoEdit(i.texto); }}><Icono n="lapiz" size={15} /></button>
                        <button className="btn peligro chico" aria-label="Quitar" onClick={() => void quitar(i)}><Icono n="cerrar" size={15} /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <div className="acciones">
          <button className="btn sec" type="button" onClick={() => void copiar()} disabled={!lista.length}>
            <Icono n={copiado ? 'check' : 'copiar'} size={16} />{copiado ? 'Copiado' : 'Copiar lista'}
          </button>
          <button className="btn" type="button" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
