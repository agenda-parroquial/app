import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { aISO, deClave, fechaDe, fechaHoraCorta, horaDe, sumarDias, sumarMinutos } from '../lib/fechas';
import { useLugares, usePerfiles, useTiposEvento } from '../lib/hooks';
import { cancelarEvento, crearEvento, editarEvento, guardarTipoEvento, reactivarEvento } from '../lib/store';
import { buscarTraslapes } from '../lib/traslapes';
import {
  esSacerdote, nombrePerfil, nombreTipo, TIPOS_EVENTO, type DatosEvento, type Evento, type TipoEvento,
} from '../types';
import { Icono } from './Iconos';
import { nombreLugar } from './TarjetaEvento';

interface Props {
  evento?: Evento;
  fecha: string; // día sugerido para un evento nuevo
  onCerrar: () => void;
  /** Abre el editor de intenciones. Solo se pasa si el usuario puede editarlas (secretaria, o quien celebra). */
  onIntenciones?: () => void;
}

const minutos = (h: string) => {
  const [a, b] = h.split(':').map(Number);
  return a * 60 + b;
};
const limpio = (s: string) => s.trim() || null;
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function EventoForm({ evento, fecha, onCerrar, onIntenciones }: Props) {
  const lugares = useLugares();
  const perfiles = usePerfiles();
  const tiposTodos = useTiposEvento();
  const sacerdotes = useMemo(() => perfiles.filter((p) => p.activo && esSacerdote(p)), [perfiles]);
  const tiposGuardados = useMemo(
    () => tiposTodos.filter((t) => t.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [tiposTodos],
  );

  // El selector de tipo vale: un tipo de la lista ('misa'…), 'otro' (escribirlo) o 'guardado:<id>'.
  const [tipoSel, setTipoSel] = useState<string>(evento?.tipo ?? 'misa');
  const [tipoTexto, setTipoTexto] = useState(evento?.tipo === 'otro' ? evento.tipo_texto ?? '' : '');
  const [guardarTipo, setGuardarTipo] = useState(false);
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

  // Al editar un evento cuyo tipo ya está guardado, el selector lo muestra como tal.
  const tipoTocado = useRef(false);
  useEffect(() => {
    if (!evento || tipoTocado.current || evento.tipo !== 'otro' || !evento.tipo_texto) return;
    const g = tiposGuardados.find((t) => norm(t.nombre) === norm(evento.tipo_texto));
    if (g) setTipoSel(`guardado:${g.id}`);
  }, [evento, tiposGuardados]);

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

    // Tipo: de la lista, uno guardado, o uno escrito ahora (que se puede guardar para la próxima).
    let tipo: TipoEvento;
    let tipo_texto: string | null = null;
    if (tipoSel.startsWith('guardado:')) {
      tipo = 'otro';
      tipo_texto = tiposTodos.find((t) => t.id === tipoSel.slice(9))?.nombre ?? null;
    } else if (tipoSel === 'otro') {
      tipo_texto = tipoTexto.trim();
      if (!tipo_texto) return setError('Escribe el nombre del tipo de evento.');
      tipo = 'otro';
      if (guardarTipo) {
        const existente = tiposTodos.find((t) => norm(t.nombre) === norm(tipo_texto));
        if (!existente) await guardarTipoEvento({ nombre: tipo_texto, activo: true });
        else if (!existente.activo) await guardarTipoEvento({ activo: true }, existente.id);
      }
    } else {
      tipo = tipoSel as TipoEvento;
    }

    const datos: DatosEvento = {
      tipo,
      tipo_texto,
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
        (Object.keys(datos) as (keyof DatosEvento)[])
          .filter((k) => datos[k] !== (evento[k] ?? null))
          .map((k) => [k, datos[k]]),
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
  const creador = evento?.creado_por ? nombrePerfil(perfiles.find((p) => p.id === evento.creado_por)) : null;
  const editor = evento?.modificado_por ? nombrePerfil(perfiles.find((p) => p.id === evento.modificado_por)) : null;

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

        <div className="seccion-form">Qué</div>
        <label htmlFor="tipo" style={{ marginTop: 14 }}>Tipo</label>
        <select
          id="tipo" value={tipoSel}
          onChange={(e) => { tipoTocado.current = true; setTipoSel(e.target.value); }}
        >
          {Object.entries(TIPOS_EVENTO).filter(([k]) => k !== 'otro').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          {tiposGuardados.length > 0 && (
            <optgroup label="Tipos guardados">
              {tiposGuardados.map((t) => <option key={t.id} value={`guardado:${t.id}`}>{t.nombre}</option>)}
            </optgroup>
          )}
          <option value="otro">Otro (escribirlo)…</option>
        </select>
        {tipoSel === 'otro' && (
          <>
            <input
              style={{ marginTop: 8 }} value={tipoTexto} onChange={(e) => setTipoTexto(e.target.value)}
              placeholder="Ej.: Retiro espiritual" maxLength={60}
            />
            <label className="check">
              <input type="checkbox" checked={guardarTipo} onChange={(e) => setGuardarTipo(e.target.checked)} />
              Guardar este tipo para usarlo la próxima vez
            </label>
            <p className="ayuda" style={{ margin: '2px 0 0' }}>Si no lo guardas, solo se usa para este evento.</p>
          </>
        )}

        <label htmlFor="titulo">Título (opcional)</label>
        <input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Misa de XV años" />

        <div className="seccion-form">Cuándo</div>
        <label htmlFor="dia" style={{ marginTop: 14 }}>Fecha</label>
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

        <div className="seccion-form">Dónde y quién</div>
        <label htmlFor="lugar" style={{ marginTop: 14 }}>Lugar</label>
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

        <label htmlFor="asignado">Celebrante</label>
        <select id="asignado" value={asignado} onChange={(e) => setAsignado(e.target.value)}>
          <option value="">Sin asignar</option>
          {sacerdotes.map((p) => <option key={p.id} value={p.id}>{nombrePerfil(p)}</option>)}
        </select>

        <div className="seccion-form">Detalles</div>
        <label htmlFor="intencion" style={{ marginTop: 14 }}>Motivo (resumen corto)</label>
        <textarea id="intencion" value={intencion} onChange={(e) => setIntencion(e.target.value)} placeholder="Ej.: Misa de XV años de Sofía" />
        {!evento ? (
          <p className="ayuda" style={{ marginBottom: 0 }}>Después de guardar podrás agregar las intenciones: difuntos, acción de gracias y salud.</p>
        ) : onIntenciones ? (
          <button type="button" className="btn sec ancho" style={{ marginTop: 8 }} onClick={onIntenciones}>
            <Icono n="cruz" size={17} />Agregar o editar intenciones (difuntos, acción de gracias, salud)
          </button>
        ) : (
          <p className="ayuda" style={{ marginBottom: 0 }}>
            Las intenciones las agrega la secretaria o quien celebra esta misa. Las puedes ver con el botón «Intenciones» de la tarjeta.
          </p>
        )}

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
            <b style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icono n="alerta" size={17} />Se empalma con:</b>
            <ul>
              {choques.map((c) => (
                <li key={c.id}>{horaDe(c.inicio)}–{horaDe(c.fin)} {c.titulo || nombreTipo(c)} · {nombreLugar(c, lugares)}</li>
              ))}
            </ul>
            Puedes guardarlo igual: ambos quedarán marcados en conflicto y se avisará a todos para resolverlo.
          </div>
        )}
        {error && <div className="aviso error">{error}</div>}

        <div className="acciones barra">
          <button className="btn" type="submit">Guardar</button>
          <button className="btn sec" type="button" onClick={onCerrar}>Cerrar</button>
        </div>
        {evento && !cancelado && (
          <div className="acciones"><button className="btn peligro" type="button" onClick={cancelar}>Cancelar este evento</button></div>
        )}
        {evento && cancelado && (
          <div className="acciones"><button className="btn sec" type="button" onClick={reactivar}>Reactivar evento</button></div>
        )}

        {evento && (
          <p className="ayuda" style={{ marginBottom: 0 }}>
            {evento.misa_fija_id ? 'Misa fija: se agenda sola cada semana.' : creador ? `Creado por ${creador} · ${fechaHoraCorta(evento.created_at)}` : ''}
            {editor && evento.version > 1 ? <><br />Última edición: {editor} · {fechaHoraCorta(evento.updated_at)}</> : null}
          </p>
        )}
      </form>
    </div>
  );
}
