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

const svg = (trazos: string) =>
  `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${trazos}</svg>`;
const IGLESIA = svg('<path d="M10 9h4M12 7v5"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="m18 9 3.52 2.147a1 1 0 0 1 .48.854V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6.999a1 1 0 0 1 .48-.854L6 9"/><path d="M6 21V7a1 1 0 0 1 .376-.782l5-3.999a1 1 0 0 1 1.249.001l5 4A1 1 0 0 1 18 7v14"/>');
const PUNTO = svg('<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>');

const icono = (html: string, clase: string) =>
  L.divIcon({ className: `pin ${clase}`, html: `<span>${html}</span>`, iconSize: [36, 36], iconAnchor: [18, 34] });

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
      const pin = L.marker([p.lat, p.lng], { icon: icono(IGLESIA, p.atenuado ? 'tenue' : '') });
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
    marca.current = L.marker([elegido.lat, elegido.lng], { icon: icono(PUNTO, 'elegido'), zIndexOffset: 1000 }).addTo(m);
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
