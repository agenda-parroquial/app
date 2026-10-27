import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface Coord {
  lat: number;
  lng: number;
}

export interface PuntoMapa extends Coord {
  id: string;
  nombre: string;
  detalle?: string;
  atenuado?: boolean;
}

interface Props {
  puntos?: PuntoMapa[];
  /** Punto que se está eligiendo (se mueve al tocar el mapa). */
  elegido?: Coord | null;
  onElegir?: (c: Coord) => void;
  onPunto?: (id: string) => void;
  /** Cuando cambia, el mapa se centra ahí (p. ej. tras buscar una dirección). */
  centro?: Coord | null;
  alto?: number;
}

const SIN_PUNTOS: PuntoMapa[] = [];

const icono = (emoji: string, clase: string) =>
  L.divIcon({ className: `pin ${clase}`, html: `<span>${emoji}</span>`, iconSize: [36, 36], iconAnchor: [18, 34] });

/** Mapa de OpenStreetMap con los lugares (⛪) y, si se pide, un punto para elegir (📍). Necesita internet para las calles. */
export default function Mapa({ puntos = SIN_PUNTOS, elegido, onElegir, onPunto, centro, alto = 300 }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  const marca = useRef<L.Marker | null>(null);
  const alElegir = useRef(onElegir);
  const alPunto = useRef(onPunto);
  alElegir.current = onElegir;
  alPunto.current = onPunto;
  const encuadre = useRef('');
  const centradoEnElegido = useRef(false);

  useEffect(() => {
    if (!contenedor.current) return;
    const m = L.map(contenedor.current).setView([23.6, -102.5], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    capa.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => alElegir.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapa.current = m;
    const medidas = new ResizeObserver(() => m.invalidateSize());
    medidas.observe(contenedor.current);
    return () => {
      medidas.disconnect();
      m.remove();
      mapa.current = null;
      capa.current = null;
      marca.current = null;
      encuadre.current = '';
      centradoEnElegido.current = false;
    };
  }, []);

  // Los lugares. Se vuelve a encuadrar cuando cambia el conjunto (p. ej. otra parroquia).
  useEffect(() => {
    const m = mapa.current;
    const c = capa.current;
    if (!m || !c) return;
    c.clearLayers();
    for (const p of puntos) {
      const pin = L.marker([p.lat, p.lng], { icon: icono('⛪', p.atenuado ? 'tenue' : '') });
      const texto = document.createElement('div'); // textContent: el nombre nunca se interpreta como HTML
      texto.textContent = p.detalle ? `${p.nombre} · ${p.detalle}` : p.nombre;
      pin.bindTooltip(texto);
      pin.on('click', (ev: L.LeafletMouseEvent) => {
        if (!alPunto.current) return;
        L.DomEvent.stopPropagation(ev);
        alPunto.current(p.id);
      });
      c.addLayer(pin);
    }
    const clave = puntos.map((p) => p.id).join(',');
    if (clave !== encuadre.current) {
      encuadre.current = clave;
      if (puntos.length && !centradoEnElegido.current) {
        m.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lng] as [number, number])), { padding: [52, 52], maxZoom: 16 });
      }
    }
  }, [puntos]);

  // El punto que se está eligiendo.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    marca.current?.remove();
    marca.current = null;
    if (!elegido) return;
    marca.current = L.marker([elegido.lat, elegido.lng], { icon: icono('📍', 'elegido'), zIndexOffset: 1000 }).addTo(m);
    if (!centradoEnElegido.current) {
      centradoEnElegido.current = true;
      m.setView([elegido.lat, elegido.lng], 16);
    }
  }, [elegido?.lat, elegido?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (centro && mapa.current) mapa.current.setView([centro.lat, centro.lng], 17);
  }, [centro?.lat, centro?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={contenedor} className="mapa" style={{ height: alto }} role="application" aria-label="Mapa" />;
}
