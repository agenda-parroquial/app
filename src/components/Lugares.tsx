import { useMemo, useState } from 'react';
import { useLugares } from '../lib/hooks';
import { guardarLugar } from '../lib/store';
import { puedeEditarCatalogos, TIPOS_LUGAR, type Lugar, type Perfil } from '../types';
import { FormLugar } from './FormLugar';
import { Icono } from './Iconos';
import type { PuntoMapa } from './Mapa';
import { MapaCarga } from './MapaCarga';
import { VolverAjustes } from './VolverAjustes';

export function Lugares({ perfil }: { perfil: Perfil }) {
  const lugares = useLugares();
  const [editando, setEditando] = useState<Lugar | 'nuevo' | null>(null);
  const [verMapa, setVerMapa] = useState(false);
  const puede = puedeEditarCatalogos(perfil.rol);
  const orden = [...lugares].sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'));

  const puntos = useMemo<PuntoMapa[]>(
    () => lugares.filter((l) => l.activo && l.lat != null && l.lng != null)
      .map((l) => ({ id: l.id, nombre: l.nombre, lat: l.lat!, lng: l.lng!, detalle: TIPOS_LUGAR[l.tipo] })),
    [lugares],
  );
  const sinUbicar = lugares.filter((l) => l.activo && (l.lat == null || l.lng == null)).length;

  return (
    <>
      <VolverAjustes />
      <div className="fila entre" style={{ marginBottom: 12 }}>
        <h2>Lugares</h2>
        {puede && <button className="btn chico" onClick={() => setEditando('nuevo')}><Icono n="mas" size={17} strokeWidth={2.4} />Agregar</button>}
      </div>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Parroquia, capillas y demás lugares habituales. Para algo de una sola vez (una unción en una casa) elige
        «Otro lugar» al crear el evento.
      </p>
      <div className="segmentos" style={{ marginBottom: 12 }} role="group" aria-label="Vista">
        <button className={verMapa ? '' : 'on'} onClick={() => setVerMapa(false)}>Lista</button>
        <button className={verMapa ? 'on' : ''} onClick={() => setVerMapa(true)}><Icono n="mapa" size={16} />Mapa</button>
      </div>

      {verMapa && (
        <div style={{ marginBottom: 12 }}>
          {puntos.length === 0
            ? <div className="vacio">Ningún lugar tiene ubicación todavía.{puede ? ' Edita un lugar y toca el mapa para ponerla.' : ''}</div>
            : <MapaCarga puntos={puntos} alto={360} onPunto={(id) => { const l = lugares.find((x) => x.id === id); if (l && puede) setEditando(l); }} />}
          {sinUbicar > 0 && puntos.length > 0 && <p className="ayuda">{sinUbicar} lugar(es) sin ubicación no aparecen en el mapa.</p>}
        </div>
      )}

      {orden.length === 0 && (
        <div className="vacio grande">
          <span className="vacio-ico"><Icono n="ubicacion" size={26} /></span>
          <b>Aún no hay lugares</b>
          <span>Agrega el templo y las capillas para poder agendar en ellos.</span>
        </div>
      )}
      <div className="lista">
        {orden.map((l) => (
          <div key={l.id} className={`item ${puede ? 'clic' : ''} ${l.activo ? '' : 'inactivo'}`} onClick={() => puede && setEditando(l)}>
            <span className="ico"><Icono n={l.tipo === 'templo' || l.tipo === 'capilla' ? 'iglesia' : 'ubicacion'} /></span>
            <div>
              <b>{l.nombre}</b>{!l.activo && ' (sin uso)'}
              <div className="ayuda">{TIPOS_LUGAR[l.tipo]}{l.direccion ? ` · ${l.direccion}` : ''}{l.lat != null ? ' · en el mapa' : ''}</div>
            </div>
          </div>
        ))}
      </div>
      {editando && (
        <FormLugar
          lugar={editando === 'nuevo' ? undefined : editando}
          otros={puntos}
          onGuardar={(d) => guardarLugar(d, editando === 'nuevo' ? undefined : editando.id)}
          onCerrar={() => setEditando(null)}
        />
      )}
    </>
  );
}
