import { estadoDe, POR_VENCER } from '../lib/vigencia';
import type { ParroquiaAdmin } from '../types';

function Dato({ valor, titulo, nota, tono }: { valor: number; titulo: string; nota?: string; tono?: 'alerta' | 'aviso' }) {
  return (
    <div className={`dato ${tono ?? ''}`}>
      <b>{valor}</b>
      <span>{titulo}</span>
      {nota && <small>{nota}</small>}
    </div>
  );
}

/** Pantalla principal del Creador: de un vistazo, cuántas cuentas hay y en qué estado están. El detalle de cada una está en «Parroquias». */
export function ResumenCreador({ parroquias, onVerParroquias }: { parroquias: ParroquiaAdmin[] | null; onVerParroquias: () => void }) {
  if (!parroquias) return <p className="vacio">Cargando…</p>;
  if (parroquias.length === 0) return <p className="vacio">Todavía no hay parroquias. Crea la primera en la pestaña «Parroquias».</p>;

  const estados = parroquias.map((p) => estadoDe(p).estado);
  const cuenta = (e: string) => estados.filter((x) => x === e).length;
  const suma = (k: 'usuarios' | 'pendientes' | 'eventos_proximos') => parroquias.reduce((s, p) => s + (p[k] ?? 0), 0);
  const sinAcceso = cuenta('suspendida') + cuenta('vencida');
  const porVencer = cuenta('por-vencer');
  const sinParroco = parroquias.filter((p) => p.parrocos.length === 0).length;
  const invitaciones = parroquias.reduce((s, p) => s + p.invitaciones.length, 0);

  return (
    <>
      <div className="datos">
        <Dato valor={parroquias.length} titulo={parroquias.length === 1 ? 'Parroquia' : 'Parroquias'} nota={`${parroquias.length - sinAcceso} con acceso`} />
        <Dato valor={porVencer} titulo="Por vencer" nota={`en ${POR_VENCER} días o menos`} tono={porVencer ? 'aviso' : undefined} />
        <Dato valor={sinAcceso} titulo="Sin acceso" nota="vencidas o suspendidas" tono={sinAcceso ? 'alerta' : undefined} />
        <Dato valor={suma('usuarios')} titulo="Usuarios" nota={suma('pendientes') ? `${suma('pendientes')} sin aprobar` : 'todos aprobados'} />
        <Dato valor={suma('eventos_proximos')} titulo="Eventos por venir" nota="en todas las parroquias" />
        <Dato valor={sinParroco} titulo="Sin párroco" nota={sinParroco === 0 ? 'todas tienen párroco' : invitaciones ? `${invitaciones} invitación(es) pendiente(s)` : 'ninguna invitación pendiente'} tono={sinParroco ? 'aviso' : undefined} />
      </div>
      <button className="btn sec ancho" style={{ marginTop: 14 }} onClick={onVerParroquias}>Ver las parroquias y su tiempo de acceso</button>
    </>
  );
}
