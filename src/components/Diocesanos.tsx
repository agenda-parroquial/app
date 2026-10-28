import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { aISO, deClave, diaLargo, fechaDe, hoyClave, horaDe, sumarMinutos } from '../lib/fechas';
import { guardarDiocesano, listarDiocesanos, quitarDiocesano } from '../lib/store';
import { esErrorDeRed, mensajeDeError, useEstadoSync } from '../lib/sync';
import type { EventoDiocesano } from '../types';
import { Icono } from './Iconos';

function Formulario({ evento, onCerrar, onGuardado }: { evento?: EventoDiocesano; onCerrar: () => void; onGuardado: () => void }) {
  const [titulo, setTitulo] = useState(evento?.titulo ?? '');
  const [dia, setDia] = useState(evento ? fechaDe(evento.inicio) : hoyClave());
  const [horaIni, setHoraIni] = useState(evento ? horaDe(evento.inicio) : '10:00');
  const [horaFin, setHoraFin] = useState(evento ? horaDe(evento.fin) : '11:00');
  const [lugar, setLugar] = useState(evento?.lugar ?? '');
  const [notas, setNotas] = useState(evento?.notas ?? '');
  const [notificar, setNotificar] = useState(false);
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (horaFin <= horaIni) return setError('La hora de fin debe ser posterior a la de inicio.');
    setError('');
    setTrabajando(true);
    try {
      await guardarDiocesano(
        {
          titulo: titulo.trim(), inicio: aISO(dia, horaIni), fin: aISO(dia, horaFin),
          lugar: lugar.trim() || null, notas: notas.trim() || null,
          ...(evento ? {} : { notificar }),
        },
        evento?.id,
      );
      onGuardado();
    } catch (err) {
      setError(esErrorDeRed(err) ? 'Necesitas internet para guardar.' : mensajeDeError(err));
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="hoja" onSubmit={guardar}>
        <div className="hoja-cab">
          <h2>{evento ? 'Editar evento diocesano' : 'Nuevo evento diocesano'}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <label htmlFor="dt">Título</label>
        <input id="dt" value={titulo} onChange={(e) => setTitulo(e.target.value)} required placeholder="Ej.: Misa crismal" />
        <label htmlFor="dd">Día</label>
        <input id="dd" type="date" value={dia} onChange={(e) => setDia(e.target.value)} required />
        <div className="dos">
          <div>
            <label htmlFor="di">Inicio</label>
            <input id="di" type="time" value={horaIni} onChange={(e) => { setHoraIni(e.target.value); setHoraFin(sumarMinutos(e.target.value, 60)); }} required />
          </div>
          <div>
            <label htmlFor="df">Fin</label>
            <input id="df" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} required />
          </div>
        </div>
        <label htmlFor="dl">Lugar (opcional)</label>
        <input id="dl" value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Ej.: Catedral" />
        <label htmlFor="dn">Notas (opcional)</label>
        <textarea id="dn" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Indicaciones para los párrocos" />
        {!evento && (
          <label className="check">
            <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} />
            Avisar con una notificación a todos los usuarios
          </label>
        )}
        <p className="ayuda">La hora se guarda como la de este dispositivo; las parroquias la ven en su propia hora.</p>
        {error && <div className="aviso error">{error}</div>}
        <div className="acciones barra">
          <button className="btn" disabled={trabajando}>{trabajando ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" className="btn sec" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

/** Eventos de la diócesis: los sube el superadmin y se muestran a todas las parroquias (solo indicativos). */
export function Diocesanos() {
  const { enLinea } = useEstadoSync();
  const [lista, setLista] = useState<EventoDiocesano[] | null>(null);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState<EventoDiocesano | 'nuevo' | null>(null);
  const [verPasados, setVerPasados] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista(await listarDiocesanos());
      setError('');
    } catch (e) {
      setError(esErrorDeRed(e) ? 'Necesitas internet para ver los eventos diocesanos.' : mensajeDeError(e));
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const { proximos, pasados } = useMemo(() => {
    const ahora = new Date().toISOString();
    const todos = lista ?? [];
    return {
      proximos: todos.filter((e) => e.fin >= ahora).sort((a, b) => a.inicio.localeCompare(b.inicio)),
      pasados: todos.filter((e) => e.fin < ahora),
    };
  }, [lista]);

  async function quitar(e: EventoDiocesano) {
    if (!confirm(`¿Quitar «${e.titulo}»? Dejará de verse en todas las parroquias.`)) return;
    try {
      await quitarDiocesano(e.id);
      await cargar();
    } catch (err) {
      setError(esErrorDeRed(err) ? 'Necesitas internet para hacer esto.' : mensajeDeError(err));
    }
  }

  const tarjeta = (e: EventoDiocesano, atenuado = false) => (
    <div key={e.id} className="tarjeta diocesana" style={{ cursor: 'default', opacity: atenuado ? 0.65 : 1 }}>
      <div className="hora">{diaLargo(deClave(fechaDe(e.inicio)))} · {horaDe(e.inicio)} – {horaDe(e.fin)}</div>
      <div className="titulo">{e.titulo}</div>
      {e.lugar && <div className="meta">📍 {e.lugar}</div>}
      {e.notas && <div className="meta" style={{ whiteSpace: 'pre-wrap' }}>{e.notas}</div>}
      <div className="fila" style={{ marginTop: 10 }}>
        <button className="btn sec chico" onClick={() => setEditando(e)}><Icono n="lapiz" size={15} />Editar</button>
        <button className="btn peligro chico" onClick={() => void quitar(e)}>Quitar</button>
      </div>
    </div>
  );

  return (
    <>
      <div className="fila entre" style={{ marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>Eventos diocesanos</h3>
        <button className="btn chico" onClick={() => setEditando('nuevo')} disabled={!enLinea}><Icono n="mas" size={17} strokeWidth={2.4} />Nuevo</button>
      </div>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Los que subas aquí aparecen en la agenda de todas las parroquias con un formato distinto. Son solo informativos:
        cada usuario puede ocultarlos.
      </p>
      {!enLinea && <div className="aviso">Sin conexión: este panel requiere internet.</div>}
      {error && <div className="aviso error">{error}</div>}
      {lista && proximos.length === 0 && (
        <div className="vacio grande">
          <span className="vacio-ico" style={{ background: 'var(--dio-50)', color: 'var(--dio)' }}><Icono n="diocesis" size={26} /></span>
          <b>No hay eventos diocesanos próximos</b>
          <span>Los que subas aparecerán en la agenda de todas las parroquias.</span>
        </div>
      )}
      {proximos.map((e) => tarjeta(e))}
      {pasados.length > 0 && (
        <>
          <button className="enlace" onClick={() => setVerPasados(!verPasados)}>
            {verPasados ? 'Ocultar anteriores' : `Ver anteriores (${pasados.length})`}
          </button>
          {verPasados && pasados.map((e) => tarjeta(e, true))}
        </>
      )}
      {editando && (
        <Formulario
          evento={editando === 'nuevo' ? undefined : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); void cargar(); }}
        />
      )}
    </>
  );
}
