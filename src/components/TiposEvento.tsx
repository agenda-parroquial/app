import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useIntencionesTipos, useNombresTipos, useParroquia, useTiposEvento } from '../lib/hooks';
import { guardarColores, guardarIntencionesTipos, guardarNombresTipos, guardarTipoEvento, renombrarTipo } from '../lib/store';
import { esErrorDeRed, mensajeDeError, useEstadoSync } from '../lib/sync';
import {
  baseLlevaIntenciones, claveTipoNombre, nombreTipoBase, puedeEditarCatalogos, TIPOS_EVENTO, type Perfil, type TipoEvento, type TipoEventoGuardado,
} from '../types';
import { Icono } from './Iconos';
import { PaletaColor } from './PaletaColor';
import { VolverAjustes } from './VolverAjustes';

const norm = (s: string) => s.trim().toLowerCase();
const SIN_COLORES: Record<string, string> = {};

type Renombrando =
  | { base: TipoEvento }                  // un tipo de siempre (misa, bautizo…): se le puede poner otro nombre
  | { propio: TipoEventoGuardado };       // un tipo que agregó la parroquia

/** Corregir el nombre de un tipo y decidir si lleva intenciones. */
function RenombrarTipo({ que, nombresTipos, intencionesTipos, parroquiaId, onCerrar }: {
  que: Renombrando; nombresTipos: Record<string, string>; intencionesTipos: Record<string, boolean>; parroquiaId: string; onCerrar: () => void;
}) {
  const { enLinea } = useEstadoSync();
  const base = 'base' in que ? que.base : null;
  const propio = 'propio' in que ? que.propio : null;
  const [nombre, setNombre] = useState(base ? nombreTipoBase(base, nombresTipos) : propio!.nombre);
  const llevaActual = base ? baseLlevaIntenciones(base, intencionesTipos) : propio!.lleva_intenciones;
  const [lleva, setLleva] = useState(llevaActual);
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const n = nombre.trim();
    if (!n) return setError('Escribe el nombre.');
    setError('');
    setTrabajando(true);
    try {
      if (base) {
        const nuevos = { ...nombresTipos };
        if (n === TIPOS_EVENTO[base]) delete nuevos[base]; else nuevos[base] = n;
        const llevaCambio = lleva !== llevaActual;
        if (n !== nombreTipoBase(base, nombresTipos)) await guardarNombresTipos(parroquiaId, nuevos);
        if (llevaCambio) {
          const valores = { ...intencionesTipos };
          if (lleva === (base === 'misa')) delete valores[base]; else valores[base] = lleva;   // igual que de origen: no se guarda
          await guardarIntencionesTipos(parroquiaId, valores);
        }
      } else if (propio) {
        if (n !== propio.nombre) await renombrarTipo(propio.id, n);   // requiere internet; cambia también los eventos y el color
        if (lleva !== propio.lleva_intenciones) await guardarTipoEvento({ lleva_intenciones: lleva }, propio.id);
      }
      onCerrar();
    } catch (err) {
      setError(esErrorDeRed(err) ? 'Necesitas internet para guardar este cambio.' : mensajeDeError(err));
      setTrabajando(false);
    }
  }

  // Solo cambiar «lleva intenciones» en un tipo agregado por la parroquia se guarda sin internet; lo demás va al servidor.
  const soloLleva = !base && nombre.trim() === propio?.nombre;

  return (
    <div className="fondo">
      <form className="hoja" onSubmit={guardar}>
        <div className="hoja-cab">
          <h2>Editar tipo de evento</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <label htmlFor="tn2" style={{ marginTop: 6 }}>Nombre</label>
        <input id="tn2" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus maxLength={60} autoComplete="off" />
        {base && nombresTipos[base] && (
          <button type="button" className="enlace" style={{ padding: 0, marginTop: 6 }} onClick={() => setNombre(TIPOS_EVENTO[base])}>
            Volver al nombre de origen («{TIPOS_EVENTO[base]}»)
          </button>
        )}

        <label className="check">
          <input type="checkbox" checked={lleva} onChange={(e) => setLleva(e.target.checked)} />
          Lleva intenciones (como la misa)
        </label>
        <p className="ayuda">
          {base
            ? 'El cambio se ve en toda la parroquia: agenda, formularios y avisos. Si lleva intenciones, sus eventos muestran el botón para capturarlas.'
            : 'Al cambiar el nombre, los eventos que ya tienen este tipo y su color pasan al nombre nuevo.'}
        </p>
        {error && <div className="aviso error">{error}</div>}
        {!enLinea && !soloLleva && <div className="aviso">Para guardar este cambio necesitas internet.</div>}
        <div className="acciones barra">
          <button className="btn" type="submit" disabled={trabajando || (!enLinea && !soloLleva)}>{trabajando ? 'Guardando…' : 'Guardar'}</button>
          <button className="btn sec" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

/**
 * Tipos de evento de la parroquia: los de siempre (misa, bautizo…), los que se agregaron con «Otro»,
 * el color de cada uno (se ve en el borde de sus tarjetas de la agenda; lo comparte toda la parroquia) y si lleva intenciones.
 * Cada tipo muestra un solo botón de color; al tocarlo se abre la paleta. El lápiz permite corregir su nombre.
 */
export function TiposEvento({ perfil }: { perfil: Perfil }) {
  const tipos = useTiposEvento();
  const parroquia = useParroquia(perfil.parroquia_id);
  const nombresTipos = useNombresTipos(perfil.parroquia_id);
  const { enLinea } = useEstadoSync();
  const intencionesTipos = useIntencionesTipos(perfil.parroquia_id);
  const guardados = parroquia?.colores ?? SIN_COLORES;
  const [nombre, setNombre] = useState('');
  const [llevaNuevo, setLlevaNuevo] = useState(false);
  const [error, setError] = useState('');
  const [borrador, setBorrador] = useState<Record<string, string>>(guardados);
  const [editado, setEditado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eligiendo, setEligiendo] = useState<{ clave: string; titulo: string } | null>(null);
  const [renombrando, setRenombrando] = useState<Renombrando | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const puede = puedeEditarCatalogos(perfil.rol);

  // Si otra persona cambia los colores y aquí no hay cambios sin guardar, se muestran los nuevos.
  useEffect(() => { if (!editado) setBorrador(guardados); }, [guardados, editado]);

  const propios = useMemo(
    () => [...tipos].sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es')),
    [tipos],
  );

  async function agregar(e: FormEvent) {
    e.preventDefault();
    setError('');
    const n = nombre.trim();
    if (!n) return;
    const existente = tipos.find((t) => norm(t.nombre) === norm(n));
    if (existente) {
      if (existente.activo) return setError('Ese tipo ya existe.');
      await guardarTipoEvento({ activo: true }, existente.id); // estaba desactivado: se reactiva
    } else {
      await guardarTipoEvento({ nombre: n, activo: true, lleva_intenciones: llevaNuevo });
    }
    setNombre('');
    setLlevaNuevo(false);
  }

  function poner(clave: string, color: string | null) {
    setEditado(true);
    setMensaje(null);
    setBorrador((b) => {
      const n = { ...b };
      if (color) n[clave] = color; else delete n[clave];
      return n;
    });
  }

  async function guardar() {
    if (!parroquia) return;
    setGuardando(true);
    setMensaje(null);
    try {
      await guardarColores(parroquia.id, borrador);
      setEditado(false);
      setMensaje({ tipo: 'ok', texto: 'Colores guardados.' });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: esErrorDeRed(e) ? 'Necesitas internet para guardar los colores.' : mensajeDeError(e) });
    } finally {
      setGuardando(false);
    }
  }

  const fila = (
    clave: string, titulo: string,
    opciones: { activo?: boolean; accion?: React.ReactNode; lleva: boolean; renombrar: Renombrando } ,
  ) => {
    const color = borrador[clave];
    const activo = opciones.activo ?? true;
    const editable = puede && activo;
    const abrir = () => editable && setEligiendo({ clave, titulo });
    return (
      <div
        key={clave} className={`item ${editable ? 'clic' : ''} ${activo ? '' : 'inactivo'}`}
        onClick={abrir} role={editable ? 'button' : undefined} tabIndex={editable ? 0 : undefined}
        onKeyDown={(e) => { if (editable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(); } }}
        aria-label={editable ? `Cambiar el color de ${titulo}` : undefined}
      >
        <span className={`muestra-btn ${color ? '' : 'ninguno'}`} style={color ? { background: color } : undefined} aria-hidden />
        <div>
          <b>{titulo}</b>{!activo && ' (sin uso)'}
          <div className="ayuda">{color ? 'Con color' : 'Sin color'} · {opciones.lleva ? 'Lleva intenciones' : 'Sin intenciones'}</div>
        </div>
        {puede && (
          <button
            className="btn sec chico" aria-label={`Editar el nombre de ${titulo}`}
            onClick={(e) => { e.stopPropagation(); setRenombrando(opciones.renombrar); }}
          ><Icono n="lapiz" size={15} /></button>
        )}
        {opciones.accion}
      </div>
    );
  };

  return (
    <>
      <VolverAjustes />
      <h2 style={{ marginBottom: 6 }}>Tipos de evento</h2>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Cada tipo puede tener un color, que se ve en el borde de sus tarjetas en la agenda. Toca un tipo para elegirlo y el lápiz para
        corregir su nombre. De origen solo la misa lleva intenciones, pero en el lápiz de cada tipo puedes marcar u ocultar eso. Los colores y los nombres son de toda la parroquia.
      </p>
      {!puede && <div className="aviso">Solo el párroco y la secretaria pueden agregar tipos, cambiar colores y corregir nombres.</div>}

      {puede && (
        <form onSubmit={agregar} className="grupo">
          <label htmlFor="tn" style={{ marginTop: 0 }}>Agregar un tipo nuevo</label>
          <div className="fila" style={{ flexWrap: 'nowrap' }}>
            <input id="tn" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Retiro espiritual" maxLength={60} />
            <button className="btn" disabled={!nombre.trim()}><Icono n="mas" size={18} strokeWidth={2.4} />Agregar</button>
          </div>
          <label className="check">
            <input type="checkbox" checked={llevaNuevo} onChange={(e) => setLlevaNuevo(e.target.checked)} />
            Lleva intenciones (como la misa)
          </label>
          {error && <div className="aviso error">{error}</div>}
        </form>
      )}

      <div className="seccion-etq">Incluidos</div>
      <div className="lista">
        {(Object.keys(TIPOS_EVENTO) as TipoEvento[]).filter((k) => k !== 'otro').map((k) =>
          fila(k, nombreTipoBase(k, nombresTipos), { lleva: baseLlevaIntenciones(k, intencionesTipos), renombrar: { base: k } }))}
      </div>

      {propios.length > 0 && (
        <>
          <div className="seccion-etq">Agregados por la parroquia</div>
          <div className="lista">
            {propios.map((t) => fila(claveTipoNombre(t.nombre), t.nombre, {
              activo: t.activo, lleva: t.lleva_intenciones, renombrar: { propio: t },
              accion: puede && (
                <button
                  className="btn sec chico"
                  onClick={(e) => { e.stopPropagation(); void guardarTipoEvento({ activo: !t.activo }, t.id); }}
                >
                  {t.activo ? 'Quitar' : 'Reactivar'}
                </button>
              ),
            }))}
          </div>
          <p className="ayuda" style={{ marginTop: 10 }}>
            Quitar un tipo solo lo oculta de la lista; los eventos que ya lo usan no cambian.
          </p>
        </>
      )}

      {mensaje && <div className={`aviso ${mensaje.tipo === 'ok' ? 'ok' : 'error'}`}>{mensaje.texto}</div>}

      {puede && editado && (
        <div className="barra-guardar">
          <span>{enLinea ? 'Hay colores sin guardar' : 'Sin conexión: para guardar necesitas internet'}</span>
          <button className="btn sec chico" onClick={() => { setBorrador(guardados); setEditado(false); }}>Descartar</button>
          <button className="btn chico" onClick={() => void guardar()} disabled={guardando || !enLinea}>
            {guardando ? 'Guardando…' : 'Guardar colores'}
          </button>
        </div>
      )}

      {eligiendo && (
        <PaletaColor
          titulo={eligiendo.titulo} color={borrador[eligiendo.clave]}
          onElegir={(c) => poner(eligiendo.clave, c)} onCerrar={() => setEligiendo(null)}
        />
      )}
      {renombrando && parroquia && (
        <RenombrarTipo que={renombrando} nombresTipos={nombresTipos} intencionesTipos={intencionesTipos} parroquiaId={parroquia.id} onCerrar={() => setRenombrando(null)} />
      )}
    </>
  );
}
