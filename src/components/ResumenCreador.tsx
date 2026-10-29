import { diaBreve } from '../lib/fechas';
import { diasDeVigencia, nombreParroquia, type ParroquiaAdmin } from '../types';
import { Icono } from './Iconos';

const POR_VENCER = 30;   // días: desde aquí se avisa que el acceso está por vencer

type Estado = 'suspendida' | 'vencida' | 'por-vencer' | 'al-dia' | 'sin-limite';

/** En qué punto está el acceso de una parroquia. */
function estadoDe(p: ParroquiaAdmin): { estado: Estado; dias: number | null } {
  const dias = diasDeVigencia(p);
  if (!p.activa) return { estado: 'suspendida', dias };
  if (dias === null) return { estado: 'sin-limite', dias };
  if (dias < 0) return { estado: 'vencida', dias };
  return { estado: dias <= POR_VENCER ? 'por-vencer' : 'al-dia', dias };
}

const ETIQUETA: Record<Estado, string> = {
  suspendida: 'Suspendida', vencida: 'Vencida', 'por-vencer': 'Por vencer', 'al-dia': 'Al día', 'sin-limite': 'Sin límite',
};

function textoTiempo(p: ParroquiaAdmin, estado: Estado, dias: number | null) {
  if (estado === 'sin-limite') return 'Sin fecha de vencimiento';
  if (dias === null) return '';
  const hasta = diaBreve(p.vigente_hasta!);
  if (dias < 0) return `Venció el ${hasta} (hace ${-dias} día${dias === -1 ? '' : 's'})`;
  if (dias === 0) return `Vence hoy (${hasta})`;
  return `Quedan ${dias} día${dias === 1 ? '' : 's'} · hasta el ${hasta}`;
}

function Dato({ valor, titulo, nota, tono }: { valor: number; titulo: string; nota?: string; tono?: 'alerta' | 'aviso' }) {
  return (
    <div className={`dato ${tono ?? ''}`}>
      <b>{valor}</b>
      <span>{titulo}</span>
      {nota && <small>{nota}</small>}
    </div>
  );
}

/**
 * Pantalla principal del Creador: cuántas cuentas hay, cuáles están por vencer y cuánto tiempo le queda a cada una,
 * con atajos para darles más tiempo.
 */
export function ResumenCreador({ parroquias, enLinea, onExtender, onVer }: {
  parroquias: ParroquiaAdmin[] | null;
  enLinea: boolean;
  onExtender: (p: ParroquiaAdmin, meses: number) => void;
  onVer: (p: ParroquiaAdmin) => void;
}) {
  if (!parroquias) return <p className="vacio">Cargando…</p>;
  if (parroquias.length === 0) return <p className="vacio">Todavía no hay parroquias. Crea la primera en la pestaña «Parroquias».</p>;

  const filas = parroquias.map((p) => ({ p, ...estadoDe(p) }));
  const cuenta = (e: Estado) => filas.filter((f) => f.estado === e).length;
  const suma = (k: 'usuarios' | 'pendientes' | 'eventos_proximos') => parroquias.reduce((s, p) => s + (p[k] ?? 0), 0);
  const sinAcceso = cuenta('suspendida') + cuenta('vencida');
  const porVencer = cuenta('por-vencer');
  // Primero lo más urgente: vencidas, por vencer, al día y, al final, las que no vencen.
  const orden = [...filas].sort((a, b) => (a.dias ?? Infinity) - (b.dias ?? Infinity) || nombreParroquia(a.p).localeCompare(nombreParroquia(b.p), 'es'));

  return (
    <>
      <div className="datos">
        <Dato valor={parroquias.length} titulo={parroquias.length === 1 ? 'Parroquia' : 'Parroquias'} nota={`${parroquias.length - sinAcceso} con acceso`} />
        <Dato valor={porVencer} titulo="Por vencer" nota={`en ${POR_VENCER} días o menos`} tono={porVencer ? 'aviso' : undefined} />
        <Dato valor={sinAcceso} titulo="Sin acceso" nota="vencidas o suspendidas" tono={sinAcceso ? 'alerta' : undefined} />
        <Dato valor={suma('usuarios')} titulo="Usuarios" nota={suma('pendientes') ? `${suma('pendientes')} sin aprobar` : 'todos aprobados'} />
        <Dato valor={suma('eventos_proximos')} titulo="Eventos por venir" nota="en todas las parroquias" />
      </div>

      <h3 className="dia-titulo">Tiempo de cada cuenta</h3>
      <div className="lista">
        {orden.map(({ p, estado, dias }) => {
          const tope = 365;
          const pct = dias === null ? 100 : Math.max(0, Math.min(100, (dias / tope) * 100));
          return (
            <div key={p.id} className={`item cuenta ${estado}`} style={{ display: 'block' }}>
              <div className="fila" style={{ flexWrap: 'nowrap', alignItems: 'center', gap: 8 }}>
                <b style={{ flex: 1, minWidth: 0 }}>{nombreParroquia(p)}</b>
                <span className={`etq-vig ${estado}`}>{ETIQUETA[estado]}</span>
              </div>
              <div className="ayuda">
                <Icono n="calendario" size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />
                {textoTiempo(p, estado, dias)}
              </div>
              <div className="medidor" aria-hidden><span style={{ width: `${pct}%` }} /></div>
              <div className="ayuda">
                {p.usuarios} usuario{p.usuarios === 1 ? '' : 's'}{p.pendientes > 0 ? ` (${p.pendientes} sin aprobar)` : ''} · {p.eventos_proximos ?? 0} evento{p.eventos_proximos === 1 ? '' : 's'} por venir
                {p.parrocos.length === 0 && ' · sin párroco registrado'}
              </div>
              <div className="fila" style={{ marginTop: 8 }}>
                <button className="btn chico" onClick={() => onExtender(p, 1)} disabled={!enLinea}>+1 mes</button>
                <button className="btn chico sec" onClick={() => onExtender(p, 12)} disabled={!enLinea}>+1 año</button>
                <button className="btn chico sec" onClick={() => onVer(p)}>Ver cuenta</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
