import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParroquia, useTiposEvento } from '../lib/hooks';
import { guardarColores, guardarTipoEvento } from '../lib/store';
import { esErrorDeRed, mensajeDeError, useEstadoSync } from '../lib/sync';
import { claveTipoNombre, puedeEditarCatalogos, TIPOS_EVENTO, type Perfil } from '../types';
import { VolverAjustes } from './VolverAjustes';

const norm = (s: string) => s.trim().toLowerCase();
const PALETA = ['#b3261e', '#d9822b', '#c9a24b', '#2e7d4f', '#1b8a8f', '#2f4a8a', '#6b3fa0', '#a0306b', '#5b1a2b', '#6b6166'];
const SIN_COLORES: Record<string, string> = {};

/** Botones de color de un tipo: la paleta, un selector libre y quitar. */
function SelectorColor({ nombre, color, onElegir }: { nombre: string; color: string | undefined; onElegir: (c: string | null) => void }) {
  return (
    <div className="fila" style={{ marginTop: 8, gap: 8, alignItems: 'center' }}>
      {PALETA.map((c) => (
        <button
          key={c} type="button" aria-label={`Color ${c}`} onClick={() => onElegir(c)}
          style={{
            width: 30, height: 30, minHeight: 30, borderRadius: '50%', background: c, cursor: 'pointer',
            border: color === c ? '3px solid var(--tinta)' : '2px solid #fff', boxShadow: '0 0 0 1px var(--linea)',
          }}
        />
      ))}
      <input
        type="color" aria-label={`Otro color para ${nombre}`} value={color ?? '#5b1a2b'}
        onChange={(e) => onElegir(e.target.value)} style={{ width: 44, height: 34, minHeight: 34, padding: 2 }}
      />
      {color && <button className="btn sec chico" onClick={() => onElegir(null)}>Sin color</button>}
    </div>
  );
}

/**
 * Tipos de evento de la parroquia: los de siempre (misa, bautizo…), los que se agregaron con «Otro»,
 * y el color de cada uno (se ve en el borde de sus tarjetas de la agenda; lo comparte toda la parroquia).
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
    return (
      <div key={clave} className={`item ${activo ? '' : 'inactivo'}`} style={{ display: 'block' }}>
        <div className="fila" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
          <span
            aria-hidden
            style={{ width: 8, alignSelf: 'stretch', minHeight: 28, borderRadius: 4, background: color ?? 'var(--vino)', opacity: color ? 1 : 0.35 }}
          />
          <b style={{ flex: 1 }}>{titulo}{!activo && ' (sin uso)'}</b>
          {!color && activo && <span className="ayuda">Sin color</span>}
          {opciones.accion}
        </div>
        {puede && activo && <SelectorColor nombre={titulo} color={color} onElegir={(c) => poner(clave, c)} />}
      </div>
    );
  };

  return (
    <>
      <VolverAjustes />
      <h2 style={{ marginBottom: 6 }}>Tipos de evento</h2>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Aquí están los tipos de evento y el color de cada uno, que se ve en el borde de sus tarjetas en la agenda.
        Los colores son de toda la parroquia. Los eventos en conflicto o cancelados conservan su propio aviso.
      </p>
      {!puede && <div className="aviso">Solo el párroco y la secretaria pueden agregar tipos y cambiar colores.</div>}

      {puede && (
        <form onSubmit={agregar} className="grupo">
          <label htmlFor="tn" style={{ marginTop: 0 }}>Nuevo tipo</label>
          <div className="fila" style={{ flexWrap: 'nowrap' }}>
            <input id="tn" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Retiro espiritual" maxLength={60} />
            <button className="btn" disabled={!nombre.trim()}>Agregar</button>
          </div>
          {error && <div className="aviso error">{error}</div>}
        </form>
      )}

      <div className="lista">
        {Object.entries(TIPOS_EVENTO).filter(([k]) => k !== 'otro').map(([k, v]) => fila(k, v))}
        {propios.map((t) => fila(claveTipoNombre(t.nombre), t.nombre, {
          activo: t.activo,
          accion: puede && (
            <button className="btn sec chico" onClick={() => void guardarTipoEvento({ activo: !t.activo }, t.id)}>
              {t.activo ? 'Quitar' : 'Reactivar'}
            </button>
          ),
        }))}
      </div>
      <p className="ayuda" style={{ marginTop: 12 }}>
        Los tipos de arriba vienen con la app. Los demás son los que se agregaron con «Otro» al crear un evento o desde aquí;
        quitar uno solo lo oculta de la lista, los eventos que ya lo usan no cambian.
      </p>

      {puede && (
        <>
          {mensaje && <div className={`aviso ${mensaje.tipo === 'ok' ? 'ok' : 'error'}`}>{mensaje.texto}</div>}
          {editado && !enLinea && <div className="aviso">Sin conexión: para guardar los colores necesitas internet.</div>}
          <div className="acciones">
            <button className="btn" onClick={() => void guardar()} disabled={!editado || guardando || !enLinea}>
              {guardando ? 'Guardando…' : 'Guardar colores'}
            </button>
            {editado && <button className="btn sec" onClick={() => { setBorrador(guardados); setEditado(false); }}>Descartar cambios</button>}
          </div>
        </>
      )}
    </>
  );
}
