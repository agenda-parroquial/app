import { useEffect, useMemo, useState } from 'react';
import { useParroquia, useTiposEvento } from '../lib/hooks';
import { guardarColores } from '../lib/store';
import { esErrorDeRed, mensajeDeError, useEstadoSync } from '../lib/sync';
import { claveTipoNombre, puedeEditarCatalogos, TIPOS_EVENTO, type Perfil } from '../types';
import { VolverAjustes } from './VolverAjustes';

const PALETA = ['#b3261e', '#d9822b', '#c9a24b', '#2e7d4f', '#1b8a8f', '#2f4a8a', '#6b3fa0', '#a0306b', '#5b1a2b', '#6b6166'];
const SIN_COLORES: Record<string, string> = {};

/** Un color por cada tipo de evento: se ve en el borde de sus tarjetas de la agenda. Lo comparte toda la parroquia. */
export function ColoresTipos({ perfil }: { perfil: Perfil }) {
  const parroquia = useParroquia(perfil.parroquia_id);
  const tiposGuardados = useTiposEvento();
  const { enLinea } = useEstadoSync();
  const puede = puedeEditarCatalogos(perfil.rol);
  const guardados = parroquia?.colores ?? SIN_COLORES;
  const [borrador, setBorrador] = useState<Record<string, string>>(guardados);
  const [editado, setEditado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Si otra persona cambia los colores y aquí no hay cambios sin guardar, se muestran los nuevos.
  useEffect(() => { if (!editado) setBorrador(guardados); }, [guardados, editado]);

  const filas = useMemo(() => {
    const base = Object.entries(TIPOS_EVENTO).map(([k, nombre]) => ({ clave: k, nombre: k === 'otro' ? 'Otro (sin nombre)' : nombre }));
    const propios = tiposGuardados
      .filter((t) => t.activo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map((t) => ({ clave: claveTipoNombre(t.nombre), nombre: t.nombre }));
    return [...base.filter((f) => f.clave !== 'otro'), ...propios, ...base.filter((f) => f.clave === 'otro')];
  }, [tiposGuardados]);

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

  return (
    <>
      <VolverAjustes />
      <h2 style={{ marginBottom: 6 }}>Colores por tipo de evento</h2>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Cada tipo de evento tiene su color en el borde de la tarjeta, para reconocerlo de un vistazo en la agenda.
        Los colores son de toda la parroquia. Los eventos en conflicto o cancelados conservan su propio aviso.
      </p>
      {!puede && <div className="aviso">Solo el párroco y la secretaria pueden cambiar los colores.</div>}

      <div className="lista">
        {filas.map((f) => {
          const color = borrador[f.clave];
          return (
            <div key={f.clave} className="item" style={{ display: 'block' }}>
              <div className="fila" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
                <span
                  aria-hidden
                  style={{ width: 8, alignSelf: 'stretch', minHeight: 28, borderRadius: 4, background: color ?? 'var(--vino)', opacity: color ? 1 : 0.35 }}
                />
                <b style={{ flex: 1 }}>{f.nombre}</b>
                {!color && <span className="ayuda">Sin color</span>}
                {puede && color && (
                  <button className="btn sec chico" onClick={() => poner(f.clave, null)}>Quitar</button>
                )}
              </div>
              {puede && (
                <div className="fila" style={{ marginTop: 8, gap: 8, alignItems: 'center' }}>
                  {PALETA.map((c) => (
                    <button
                      key={c} type="button" aria-label={`Color ${c}`} onClick={() => poner(f.clave, c)}
                      style={{
                        width: 30, height: 30, minHeight: 30, borderRadius: '50%', background: c, cursor: 'pointer',
                        border: color === c ? '3px solid var(--tinta)' : '2px solid #fff', boxShadow: '0 0 0 1px var(--linea)',
                      }}
                    />
                  ))}
                  <input
                    type="color" aria-label={`Otro color para ${f.nombre}`} value={color ?? '#5b1a2b'}
                    onChange={(e) => poner(f.clave, e.target.value)}
                    style={{ width: 44, height: 34, minHeight: 34, padding: 2 }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {puede && (
        <>
          {mensaje && <div className={`aviso ${mensaje.tipo === 'ok' ? 'ok' : 'error'}`}>{mensaje.texto}</div>}
          {!enLinea && <div className="aviso">Sin conexión: para guardar los colores necesitas internet.</div>}
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
