import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { esErrorDeRed, mensajeDeError } from '../lib/sync';
import { TIPOS_LUGAR, type Lugar, type TipoLugar } from '../types';
import type { Coord, PuntoMapa } from './Mapa';
import { Icono } from './Iconos';
import { MapaCarga } from './MapaCarga';

export type DatosLugar = Pick<Lugar, 'nombre' | 'tipo' | 'direccion' | 'lat' | 'lng' | 'activo'>;

interface Props {
  lugar?: Pick<Lugar, 'id' | 'nombre' | 'tipo' | 'direccion' | 'lat' | 'lng' | 'activo'>;
  titulo?: string;
  /** Algo para mostrar arriba del formulario (p. ej. a qué parroquia pertenece). */
  encabezado?: ReactNode;
  /** Otros lugares ya ubicados, para orientarse en el mapa. */
  otros?: PuntoMapa[];
  onGuardar: (d: DatosLugar) => Promise<void>;
  onCerrar: () => void;
}

/** Alta y edición de un lugar, con el punto en el mapa (buscar una dirección, usar el GPS o tocar el mapa). */
export function FormLugar({ lugar, titulo, encabezado, otros, onGuardar, onCerrar }: Props) {
  const [nombre, setNombre] = useState(lugar?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoLugar>(lugar?.tipo ?? 'capilla');
  const [direccion, setDireccion] = useState(lugar?.direccion ?? '');
  const [activo, setActivo] = useState(lugar?.activo ?? true);
  const [punto, setPunto] = useState<Coord | null>(lugar?.lat != null && lugar.lng != null ? { lat: lugar.lat, lng: lugar.lng } : null);
  const [centro, setCentro] = useState<Coord | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const puntosOtros = useMemo(() => (otros ?? []).filter((p) => p.id !== lugar?.id), [otros, lugar?.id]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      await onGuardar({
        nombre: nombre.trim(), tipo, direccion: direccion.trim() || null, activo,
        lat: punto ? punto.lat : null, lng: punto ? punto.lng : null,
      });
      onCerrar();
    } catch (err) {
      setError(esErrorDeRed(err) ? 'Necesitas internet para guardar.' : mensajeDeError(err));
      setGuardando(false);
    }
  }

  async function buscar() {
    const q = busqueda.trim();
    if (!q) return;
    setError('');
    setBuscando(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=es&q=${encodeURIComponent(q)}`);
      if (!r.ok) throw new Error('No se pudo buscar.');
      const res = (await r.json()) as { lat: string; lon: string }[];
      if (!res.length) return setError('No encontré ese lugar. Prueba con la calle, la colonia y la ciudad, o toca el mapa.');
      const c = { lat: Number(res[0].lat), lng: Number(res[0].lon) };
      setPunto(c);
      setCentro(c);
    } catch {
      setError('No pude buscar (¿hay internet?). También puedes tocar el mapa.');
    } finally {
      setBuscando(false);
    }
  }

  function usarMiUbicacion() {
    setError('');
    if (!navigator.geolocation) return setError('Este dispositivo no permite obtener la ubicación.');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPunto(c);
        setCentro(c);
      },
      () => setError('No pude obtener tu ubicación. Revisa el permiso del navegador o toca el mapa.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="fondo">
      <form className="hoja" onSubmit={guardar}>
        <div className="hoja-cab">
          <h2>{titulo ?? (lugar ? 'Editar lugar' : 'Nuevo lugar')}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        {encabezado}
        <label htmlFor="ln">Nombre</label>
        <input id="ln" value={nombre} onChange={(e) => setNombre(e.target.value)} required placeholder="Ej.: Capilla de San José" />
        <label htmlFor="lt">Tipo</label>
        <select id="lt" value={tipo} onChange={(e) => setTipo(e.target.value as TipoLugar)}>
          {Object.entries(TIPOS_LUGAR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label htmlFor="ld">Dirección o referencia (opcional)</label>
        <input id="ld" value={direccion} onChange={(e) => setDireccion(e.target.value)} />

        <label htmlFor="lb">Ubicación en el mapa (opcional)</label>
        <div className="fila" style={{ flexWrap: 'nowrap' }}>
          <input
            id="lb" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar una dirección"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscar(); } }}
          />
          <button type="button" className="btn sec" onClick={() => void buscar()} disabled={buscando || !busqueda.trim()}>
            {buscando ? '…' : 'Buscar'}
          </button>
        </div>
        <div className="fila" style={{ margin: '8px 0' }}>
          <button type="button" className="btn sec chico" onClick={usarMiUbicacion}><Icono n="gps" size={16} />Usar mi ubicación</button>
          {punto && <button type="button" className="btn sec chico" onClick={() => setPunto(null)}>Quitar el punto</button>}
        </div>
        <MapaCarga elegido={punto} onElegir={setPunto} centro={centro} puntos={puntosOtros} alto={240} />
        <p className="ayuda" style={{ marginTop: 6 }}>
          {punto ? `Punto elegido: ${punto.lat.toFixed(5)}, ${punto.lng.toFixed(5)}. ` : 'Toca el mapa para poner el punto. '}
          Para ver las calles se necesita internet.
        </p>

        {lugar && (
          <label className="check">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Se usa actualmente (si lo quitas, ya no aparece al agendar)
          </label>
        )}
        {error && <div className="aviso error">{error}</div>}
        <div className="acciones barra">
          <button className="btn" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button className="btn sec" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
