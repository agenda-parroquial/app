import { useCallback, useEffect, useMemo, useState } from 'react';
import { guardarLugarParroquia, listarLugaresParroquia, listarParroquias } from '../lib/store';
import { esErrorDeRed, mensajeDeError, useEstadoSync } from '../lib/sync';
import { TIPOS_LUGAR, type LugarAdmin, type ParroquiaAdmin } from '../types';
import { FormLugar } from './FormLugar';
import { Icono } from './Iconos';
import type { PuntoMapa } from './Mapa';
import { MapaCarga } from './MapaCarga';

/**
 * El superadmin crea o edita lugares (con su punto en el mapa) y elige a qué parroquia pertenecen:
 * a esa parroquia le aparecen en su lista de lugares y en su mapa. Solo ve los lugares, no su agenda.
 */
export function LugaresParroquias() {
  const { enLinea } = useEstadoSync();
  const [parroquias, setParroquias] = useState<ParroquiaAdmin[] | null>(null);
  const [parroquiaId, setParroquiaId] = useState('');
  const [lugares, setLugares] = useState<LugarAdmin[] | null>(null);
  const [error, setError] = useState('');
  const [listo, setListo] = useState('');
  const [editando, setEditando] = useState<LugarAdmin | 'nuevo' | null>(null);
  const [destino, setDestino] = useState(''); // parroquia del lugar que se está creando

  const cargarLugares = useCallback(async (id: string) => {
    if (!id) return;
    try {
      setLugares(await listarLugaresParroquia(id));
      setError('');
    } catch (e) {
      setError(esErrorDeRed(e) ? 'Necesitas internet para ver los lugares.' : mensajeDeError(e));
    }
  }, []);

  useEffect(() => {
    void listarParroquias().then(
      (lista) => {
        setParroquias(lista);
        setParroquiaId((actual) => actual || lista[0]?.id || '');
      },
      (e) => setError(esErrorDeRed(e) ? 'Necesitas internet para ver las parroquias.' : mensajeDeError(e)),
    );
  }, []);
  useEffect(() => { setLugares(null); void cargarLugares(parroquiaId); }, [parroquiaId, cargarLugares]);

  const nombreParroquia = (id: string) => parroquias?.find((p) => p.id === id)?.nombre ?? 'la parroquia';
  const puntos = useMemo<PuntoMapa[]>(
    () => (lugares ?? []).filter((l) => l.activo && l.lat != null && l.lng != null)
      .map((l) => ({ id: l.id, nombre: l.nombre, lat: l.lat!, lng: l.lng!, detalle: TIPOS_LUGAR[l.tipo] })),
    [lugares],
  );
  const orden = [...(lugares ?? [])].sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'));

  async function guardar(d: Parameters<typeof guardarLugarParroquia>[1]) {
    const parroquia = editando === 'nuevo' ? destino : parroquiaId;
    await guardarLugarParroquia(parroquia, d, editando === 'nuevo' || !editando ? undefined : editando.id);
    setListo(
      editando === 'nuevo'
        ? `Listo: «${d.nombre}» ya aparece como lugar de ${nombreParroquia(parroquia)}.`
        : `Listo: «${d.nombre}» se actualizó en ${nombreParroquia(parroquia)}.`,
    );
    setParroquiaId(parroquia);
    await cargarLugares(parroquia);
  }

  function abrirNuevo() {
    setListo('');
    setDestino(parroquiaId);
    setEditando('nuevo');
  }

  return (
    <>
      <div className="fila entre" style={{ marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>Lugares de las parroquias</h3>
        <button className="btn chico" onClick={abrirNuevo} disabled={!enLinea || !parroquias?.length}><Icono n="mas" size={17} strokeWidth={2.4} />Nuevo lugar</button>
      </div>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Crea un punto en el mapa y elige la parroquia a la que pertenece: le aparecerá como lugar en su lista, en su mapa
        y al agendar. Ella puede editarlo después como los suyos. Aquí solo ves los lugares, no su agenda.
      </p>
      {!enLinea && <div className="aviso">Sin conexión: este panel requiere internet.</div>}
      {error && <div className="aviso error">{error}</div>}
      {listo && <div className="aviso ok">{listo}</div>}
      {parroquias?.length === 0 && <div className="vacio">Primero crea una parroquia en «Parroquias y accesos».</div>}

      {!!parroquias?.length && (
        <>
          <label htmlFor="lp" style={{ marginTop: 0 }}>Parroquia</label>
          <select id="lp" value={parroquiaId} onChange={(e) => { setParroquiaId(e.target.value); setListo(''); }}>
            {parroquias.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>

          <div style={{ marginTop: 12 }}>
            {lugares && puntos.length > 0
              ? <MapaCarga puntos={puntos} alto={320} onPunto={(id) => { const l = lugares.find((x) => x.id === id); if (l) { setListo(''); setEditando(l); } }} />
              : lugares && <div className="vacio">{lugares.length ? 'Ninguno de sus lugares tiene ubicación en el mapa.' : 'Esta parroquia todavía no tiene lugares.'}</div>}
          </div>

          <div className="lista" style={{ marginTop: 12 }}>
            {orden.map((l) => (
              <div key={l.id} className={`item clic ${l.activo ? '' : 'inactivo'}`} onClick={() => { setListo(''); setEditando(l); }}>
                <span className="ico"><Icono n="ubicacion" /></span>
                <div>
                  <b>{l.nombre}</b>{!l.activo && ' (sin uso)'}
                  <div className="ayuda">{TIPOS_LUGAR[l.tipo]}{l.direccion ? ` · ${l.direccion}` : ''}{l.lat != null ? ' · en el mapa' : ' · sin ubicación'}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {editando && (
        <FormLugar
          lugar={editando === 'nuevo' ? undefined : editando}
          titulo={editando === 'nuevo' ? 'Nuevo lugar' : `Editar lugar de ${nombreParroquia(parroquiaId)}`}
          otros={puntos}
          encabezado={editando === 'nuevo' && parroquias && (
            <>
              <label htmlFor="lpd">Pertenece a la parroquia</label>
              <select id="lpd" value={destino} onChange={(e) => setDestino(e.target.value)} required>
                {parroquias.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </>
          )}
          onGuardar={guardar}
          onCerrar={() => setEditando(null)}
        />
      )}
    </>
  );
}
