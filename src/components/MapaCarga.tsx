import { lazy, Suspense, type ComponentProps } from 'react';

// El mapa (Leaflet) pesa bastante: solo se descarga cuando alguien lo abre.
const Mapa = lazy(() => import('./Mapa'));

export function MapaCarga(props: ComponentProps<typeof Mapa>) {
  return (
    <Suspense fallback={<div className="ayuda" style={{ padding: 16, textAlign: 'center' }}>Cargando mapa…</div>}>
      <Mapa {...props} />
    </Suspense>
  );
}
