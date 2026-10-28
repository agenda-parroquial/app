import { useState } from 'react';
import { Icono } from './Iconos';

/** Colores propuestos: cubren la gama litúrgica y se distinguen bien entre sí en una lista. */
export const COLORES_BASE = [
  '#b3261e', '#d9822b', '#c9a24b', '#7a9a2e', '#2e7d4f',
  '#1b8a8f', '#2f6fb3', '#2f4a8a', '#6b3fa0', '#a0306b',
  '#5b1a2b', '#7a5230', '#6b6166', '#111111', '#e08fa0',
];

interface Props {
  titulo: string;
  color: string | undefined;
  onElegir: (color: string | null) => void;
  onCerrar: () => void;
}

/** Hoja emergente para elegir el color de un tipo: un toque en una muestra y listo, o un color a gusto. */
export function PaletaColor({ titulo, color, onElegir, onCerrar }: Props) {
  const [propio, setPropio] = useState(color ?? '#5b1a2b');
  const elegir = (c: string | null) => {
    onElegir(c);
    onCerrar();
  };

  return (
    <div className="fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="hoja" role="dialog" aria-label={`Color de ${titulo}`}>
        <div className="hoja-cab">
          <div>
            <h2>Color</h2>
            <div className="ayuda">{titulo}</div>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>

        <div className="paleta">
          {COLORES_BASE.map((c) => (
            <button
              key={c} type="button" className={`muestra ${color?.toLowerCase() === c ? 'on' : ''}`}
              style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={color?.toLowerCase() === c} onClick={() => elegir(c)}
            >
              {color?.toLowerCase() === c && <Icono n="check" size={22} strokeWidth={3} />}
            </button>
          ))}
        </div>

        <label htmlFor="color-propio">Otro color</label>
        <div className="fila" style={{ flexWrap: 'nowrap' }}>
          <input id="color-propio" type="color" value={propio} onChange={(e) => setPropio(e.target.value)} style={{ width: 70, flex: 'none' }} />
          <button type="button" className="btn" style={{ flex: 1 }} onClick={() => elegir(propio)}>Usar este color</button>
        </div>

        {color && (
          <div className="acciones">
            <button type="button" className="btn sec" onClick={() => elegir(null)}>Quitar el color</button>
          </div>
        )}
      </div>
    </div>
  );
}
