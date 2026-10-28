import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParroquia, useTiposEvento } from '../lib/hooks';
import { guardarColores, guardarTipoEvento } from '../lib/store';
import { esErrorDeRed, mensajeDeError, useEstadoSync } from '../lib/sync';
import { claveTipoNombre, puedeEditarCatalogos, TIPOS_EVENTO, type Perfil } from '../types';
import { Icono } from './Iconos';
import { PaletaColor } from './PaletaColor';
import { VolverAjustes } from './VolverAjustes';

const norm = (s: string) => s.trim().toLowerCase();
const SIN_COLORES: Record<string, string> = {};

/**
 * Tipos de evento de la parroquia: los de siempre (misa, bautizo…), los que se agregaron con «Otro»,
 * y el color de cada uno (se ve en el borde de sus tarjetas de la agenda; lo comparte toda la parroquia).
 * Cada tipo muestra un solo botón de color; al tocarlo se abre la paleta.
 */
export function TiposEvento({ perfil }: { perfil: Perfil }) {
  const tipos = useTiposEvento();
  const parroquia = useParroquia(perfil.parroquia_id);
  const { enLinea } = useEstadoSync();
  const guardados = parroquia?.colores ?? SIN_COLORES;
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [borrador, setBorrador] = useState<Record<string, string>>(guardados);
  const [editado, setEditado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eligiendo, setEligiendo] = useState<{ clave: string; titulo: string } | null>(null);
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
      await guardarTipoEvento({ nombre: n, activo: true });
    }
    setNombre('');
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

  const fila = (clave: string, titulo: string, opciones: { activo?: boolean; accion?: React.ReactNode } = {}) => {
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
          <div className="ayuda">{color ? 'Con color' : 'Sin color'}</div>
        </div>
        {opciones.accion}
      </div>
    );
  };

  return (
    <>
      <VolverAjustes />
      <h2 style={{ marginBottom: 6 }}>Tipos de evento</h2>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Cada tipo puede tener un color, que se ve en el borde de sus tarjetas en la agenda. Toca un tipo para elegirlo.
        Los colores son de toda la parroquia; los eventos en conflicto o cancelados conservan su propio aviso.
      </p>
      {!puede && <div className="aviso">Solo el párroco y la secretaria pueden agregar tipos y cambiar colores.</div>}

      {puede && (
        <form onSubmit={agregar} className="grupo">
          <label htmlFor="tn" style={{ marginTop: 0 }}>Agregar un tipo nuevo</label>
          <div className="fila" style={{ flexWrap: 'nowrap' }}>
            <input id="tn" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Retiro espiritual" maxLength={60} />
            <button className="btn" disabled={!nombre.trim()}><Icono n="mas" size={18} strokeWidth={2.4} />Agregar</button>
          </div>
          {error && <div className="aviso error">{error}</div>}
        </form>
      )}

      <div className="seccion-etq">Incluidos</div>
      <div className="lista">
        {Object.entries(TIPOS_EVENTO).filter(([k]) => k !== 'otro').map(([k, v]) => fila(k, v))}
      </div>

      {propios.length > 0 && (
        <>
          <div className="seccion-etq">Agregados por la parroquia</div>
          <div className="lista">
            {propios.map((t) => fila(claveTipoNombre(t.nombre), t.nombre, {
              activo: t.activo,
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
    </>
  );
}
