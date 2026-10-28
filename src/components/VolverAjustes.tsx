import { Icono } from './Iconos';

/** Enlace para regresar a Ajustes desde sus subpáginas (lugares, misas fijas, usuarios, tipos). */
export function VolverAjustes() {
  return (
    <a href="#/ajustes" className="volver">
      <Icono n="izquierda" size={20} />Ajustes
    </a>
  );
}

/** Enlace para regresar a la agenda (desde los avisos parroquiales). */
export function VolverAgenda() {
  return (
    <a href="#/agenda" className="volver">
      <Icono n="izquierda" size={20} />Agenda
    </a>
  );
}
