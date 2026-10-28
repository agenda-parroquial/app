import { claveDia, diaLargo, sumarDias } from '../lib/fechas';
import { DIAS } from '../types';

export interface MarcaDia {
  /** Cuántos eventos de la parroquia tiene el día (sin contar los cancelados). */
  eventos: number;
  /** Algún evento del día está en conflicto. */
  conflicto: boolean;
  /** El día tiene algún evento diocesano. */
  diocesano: boolean;
}

interface Props {
  /** Cualquier día del mes que se muestra. */
  mes: Date;
  seleccionado: string;
  hoy: string;
  marcas: Map<string, MarcaDia>;
  onElegir: (clave: string) => void;
}

/**
 * Calendario del mes: el día de hoy va en rojo, un puntito marca los días con eventos o celebraciones
 * y los días con eventos diocesanos se tiñen de azul. Al tocar un día, la agenda muestra lo de ese día.
 */
export function CalendarioMes({ mes, seleccionado, hoy, marcas, onElegir }: Props) {
  const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const diasDelMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const semanas = Math.ceil((primero.getDay() + diasDelMes) / 7);
  const inicio = sumarDias(primero, -primero.getDay());
  const celdas = Array.from({ length: semanas * 7 }, (_, i) => sumarDias(inicio, i));

  return (
    <div className="mes">
      <div className="mes-cab" aria-hidden="true">
        {DIAS.map((d, i) => <span key={d + i}>{d[0]}</span>)}
      </div>
      <div className="mes-grid" role="group" aria-label="Días del mes">
        {celdas.map((d) => {
          const k = claveDia(d);
          const m = marcas.get(k);
          const fuera = d.getMonth() !== mes.getMonth();
          const detalle = [
            k === hoy ? 'hoy' : '',
            m?.eventos ? `${m.eventos} evento${m.eventos === 1 ? '' : 's'}` : '',
            m?.conflicto ? 'con conflicto' : '',
            m?.diocesano ? 'evento diocesano' : '',
          ].filter(Boolean).join(', ');
          return (
            <button
              key={k} type="button" onClick={() => onElegir(k)} aria-pressed={k === seleccionado}
              aria-label={detalle ? `${diaLargo(d)}, ${detalle}` : diaLargo(d)}
              className={['dm', fuera ? 'fuera' : '', k === hoy ? 'hoy' : '', k === seleccionado ? 'sel' : '', m?.diocesano ? 'dio' : ''].filter(Boolean).join(' ')}
            >
              <b>{d.getDate()}</b>
              <span className="puntos" aria-hidden="true">
                {m?.eventos ? <i className={m.conflicto ? 'mal' : ''} /> : null}
                {m?.diocesano ? <i className="dio" /> : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mes-leyenda" aria-hidden="true">
        <span><i className="hoy" />Hoy</span>
        <span><i className="ev" />Eventos</span>
        <span><i className="dio" />Diocesano</span>
      </div>
    </div>
  );
}
