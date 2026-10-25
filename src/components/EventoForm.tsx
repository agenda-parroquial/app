import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { aISO, deClave, fechaDe, horaDe, sumarDias, sumarMinutos } from '../lib/fechas';
import { useLugares, usePerfiles } from '../lib/hooks';
import { cancelarEvento, crearEvento, editarEvento, reactivarEvento } from '../lib/store';
import { buscarTraslapes } from '../lib/traslapes';
import { esSacerdote, TIPOS_EVENTO, type DatosEvento, type Evento, type TipoEvento } from '../types';
import { nombreLugar } from './TarjetaEvento';

interface Props {
  evento?: Evento;
  fecha: string; // día sugerido para un evento nuevo
  onCerrar: () => void;
}

const minutos = (h: string) => {
  const [a, b] = h.split(':').map(Number);
  return a * 60 + b;
};
const limpio = (s: string) => s.trim() || null;

export function EventoForm({ evento, fecha, onCerrar }: Props) {
  const lugares = useLugares();
  const perfiles = usePerfiles();
  const sacerdotes = useMemo(() => perfiles.filter((p) => p.activo && esSacerdote(p)), [perfiles]);

  const [tipo, setTipo] = useState<TipoEvento>(evento?.tipo ?? 'misa');
  const [titulo, setTitulo] = useState(evento?.titulo ?? '');
  const [dia, setDia] = useState(evento ? fechaDe(evento.inicio) : fecha);
  const [horaIni, setHoraIni] = useState(evento ? horaDe(evento.inicio) : '10:00');
  const [horaFin, setHoraFin] = useState(evento ? horaDe(evento.fin) : '11:00');
  const [lugarSel, setLugarSel] = useState(evento ? evento.lugar_id ?? 'otro' : '');
  const [lugarTexto, setLugarTexto] = useState(evento?.lugar_texto ?? '');
  const [asignado, setAsignado] = useState(evento?.asignado_a ?? '');
  const [intencion, setIntencion] = useState(evento?.intencion ?? '');
  const [contactoNombre, setContactoNombre] = useState(evento?.contacto_nombre ?? '');
  const [contactoTel, setContactoTel] = useState(evento?.contacto_telefono ?? '');
  const [notas, setNotas] = useState(evento?.notas ?? '');
  const [error, setError] = useState('');

  // Al cambiar la hora de inicio se conserva la duración.
  function cambiarInicio(nueva: string) {
    const duracion = Math.max(minutos(horaFin) - minutos(horaIni), 15);
    setHoraIni(nueva);
    setHoraFin(sumarMinutos(nueva, duracion));
  }

  const lugarId = lugarSel && lugarSel !== 'otro' ? lugarSel : null;
  const horasValidas = horaFin > horaIni;

  // Aviso inmediato de empalme (funciona sin internet; el servidor confirma al sincronizar).
  const delDia = useLiveQuery(
    () => {
      const d = deClave(dia);
      return db.eventos.where('inicio').between(d.toISOString(), sumarDias(d, 1).toISOString(), true, false).toArray();
    },
    [dia], [] as Evento[],
  );
  const choques = horasValidas
    ? buscarTraslapes(
        { id: evento?.id, inicio: aISO(dia, horaIni), fin: aISO(dia, horaFin), lugar_id: lugarId, asignado_a: asignado || null },
        delDia,
      )
    : [];

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!horasValidas) return setError('La hora de fin debe ser posterior a la de inicio.');
    if (!lugarSel) return setError('Elige el lugar del evento.');
    if (lugarSel === 'otro' && !lugarTexto.trim()) return setError('Escribe dónde será el evento.');

    const datos: DatosEvento = {
      tipo,
      titulo: limpio(titulo),
      inicio: aISO(dia, horaIni),
      fin: aISO(dia, horaFin),
      lugar_id: lugarId,
      lugar_texto: lugarSel === 'otro' ? lugarTexto.trim() : null,
      asignado_a: asignado || null,
      intencion: limpio(intencion),
      contacto_nombre: limpio(contactoNombre),
      contacto_telefono: limpio(contactoTel),
      notas: limpio(notas),
    };

    if (evento) {
      // Solo se envía lo que realmente cambió.
      const cambios = Object.fromEntries(
        (Object.keys(datos) as (keyof DatosEvento)[]).filter((k) => datos[k] !== evento[k]).map((k) => [k, datos[k]]),
      ) as Partial<DatosEvento>;
      if (Object.keys(cambios).length) await editarEvento(evento.id, cambios);
    } else {
      await crearEvento(datos);
    }
    onCerrar();
  }

  async function cancelar() {
    if (!evento || !confirm('¿Cancelar este evento? Se avisará a los demás.')) return;
    await cancelarEvento(evento.id);
    onCerrar();
  }

  async function reactivar() {
    if (!evento) return;
    await reactivarEvento(evento.id);
    onCerrar();
  }

  const cancelado = evento?.estado === 'cancelado';

  return (
    <div className="fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="hoja" onSubmit={guardar}>
        <div className="hoja-cab">
          <h2>{evento ? 'Editar evento' : 'Nuevo evento'}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>

        {evento?.estado === 'en_conflicto' && (
          <div className="aviso error">Este evento está en conflicto con otro. Revisa la pestaña Conflictos.</div>
        )}
        {evento?.misa_fija_id && (
          <div className="aviso">Es una misa fija. Los cambios aquí solo afectan a esta fecha.</div>
        )}
        {cancelado && <div className="aviso">Este evento está cancelado.</div>}

        <label htmlFor="tipo">Tipo</label>
        <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEvento)}>
          {Object.entries(TIPOS_EVENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <label htmlFor="titulo">Título (opcional)</label>
        <input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Misa de XV años" />

        <label htmlFor="dia">Fecha</label>
        <input id="dia" type="date" value={dia} onChange={(e) => setDia(e.target.value)} required />
        <div className="dos">
          <div>
            <label htmlFor="ini">Inicio</label>
            <input id="ini" type="time" value={horaIni} onChange={(e) => cambiarInicio(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="fin">Fin</label>
            <input id="fin" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} required />
          </div>
        </div>

        <label htmlFor="lugar">Lugar</label>
        <select id="lugar" value={lugarSel} onChange={(e) => setLugarSel(e.target.value)}>
          <option value="">— Elegir —</option>
          {lugares.filter((l) => l.activo || l.id === evento?.lugar_id).map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          <option value="otro">Otro lugar (solo esta vez)…</option>
        </select>
        {lugarSel === 'otro' && (
          <input
            style={{ marginTop: 8 }} value={lugarTexto} onChange={(e) => setLugarTexto(e.target.value)}
            placeholder="Ej.: Casa de la Sra. Lupe, Calle Hidalgo 12"
          />
        )}

        <label htmlFor="asignado">Quién lo atiende</label>
        <select id="asignado" value={asignado} onChange={(e) => setAsignado(e.target.value)}>
          <option value="">Sin asignar</option>
          {sacerdotes.map((p) => <option key={p.id} value={p.id}>{p.nombre || p.email}</option>)}
        </select>

        <label htmlFor="intencion">Intención o motivo</label>
        <textarea id="intencion" value={intencion} onChange={(e) => setIntencion(e.target.value)} placeholder="Ej.: Por el eterno descanso de Don Pedro" />

        <div className="dos">
          <div>
            <label htmlFor="cn">Contacto</label>
            <input id="cn" value={contactoNombre} onChange={(e) => setContactoNombre(e.target.value)} placeholder="Nombre" autoComplete="off" />
          </div>
          <div>
            <label htmlFor="ct">Teléfono</label>
            <input id="ct" type="tel" inputMode="tel" value={contactoTel} onChange={(e) => setContactoTel(e.target.value)} placeholder="10 dígitos" autoComplete="off" />
          </div>
        </div>

        <label htmlFor="notas">Notas</label>
        <textarea id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} />

        {choques.length > 0 && (
          <div className="aviso error">
            <b>⚠ Se empalma con:</b>
            <ul>
              {choques.map((c) => (
                <li key={c.id}>{horaDe(c.inicio)}–{horaDe(c.fin)} {c.titulo || TIPOS_EVENTO[c.tipo]} · {nombreLugar(c, lugares)}</li>
              ))}
            </ul>
            Puedes guardarlo igual: ambos quedarán marcados en conflicto y se avisará a todos para resolverlo.
          </div>
        )}
        {error && <div className="aviso error">{error}</div>}

        <div className="acciones">
          <button className="btn" type="submit">Guardar</button>
          <button className="btn sec" type="button" onClick={onCerrar}>Cerrar</button>
        </div>
        {evento && !cancelado && (
          <div className="acciones"><button className="btn peligro" type="button" onClick={cancelar}>Cancelar este evento</button></div>
        )}
        {evento && cancelado && (
          <div className="acciones"><button className="btn sec" type="button" onClick={reactivar}>Reactivar evento</button></div>
        )}
      </form>
    </div>
  );
}
