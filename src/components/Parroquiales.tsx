import { useMemo, useState, type FormEvent } from 'react';
import { diaBreve, diaLargo, deClave, hoyClave } from '../lib/fechas';
import { useAvisosParroquiales, useIdsPendientes, usePerfiles } from '../lib/hooks';
import { guardarAviso, quitarAviso } from '../lib/store';
import { nombrePerfil, puedeEditarCatalogos, type AvisoParroquial, type Perfil } from '../types';
import { Icono } from './Iconos';
import { VolverAgenda } from './VolverAjustes';

/** Texto de vigencia: «Del 3 nov al 10 nov», «Desde el 3 nov», «Hasta el 10 nov». */
function vigencia(a: AvisoParroquial, hoy: string) {
  if (a.desde > hoy && a.hasta) return `Del ${diaBreve(a.desde)} al ${diaBreve(a.hasta)}`;
  if (a.desde > hoy) return `Desde el ${diaBreve(a.desde)}`;
  if (a.hasta) return `Hasta el ${diaBreve(a.hasta)}`;
  return 'Sin fecha de fin';
}

function FormAviso({ aviso, autorId, onCerrar }: { aviso?: AvisoParroquial; autorId: string; onCerrar: () => void }) {
  const [titulo, setTitulo] = useState(aviso?.titulo ?? '');
  const [texto, setTexto] = useState(aviso?.texto ?? '');
  const [desde, setDesde] = useState(aviso?.desde ?? hoyClave());
  const [hasta, setHasta] = useState(aviso?.hasta ?? '');
  const [notificar, setNotificar] = useState(true);
  const [error, setError] = useState('');

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (hasta && hasta < desde) return setError('La fecha final no puede ser anterior a la inicial.');
    await guardarAviso(
      {
        titulo: titulo.trim(), texto: texto.trim(), desde, hasta: hasta || null, activo: true,
        ...(aviso ? {} : { notificar, creado_por: autorId }),
      },
      aviso?.id,
    );
    onCerrar();
  }

  async function quitar() {
    if (aviso && confirm('¿Quitar este aviso? Dejará de mostrarse.')) {
      await quitarAviso(aviso.id);
      onCerrar();
    }
  }

  return (
    <div className="fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="hoja" onSubmit={guardar}>
        <div className="hoja-cab">
          <h2>{aviso ? 'Editar aviso' : 'Nuevo aviso parroquial'}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <label htmlFor="at">Título</label>
        <input id="at" value={titulo} onChange={(e) => setTitulo(e.target.value)} required placeholder="Ej.: Retiro de jóvenes" />
        <label htmlFor="ax">Texto del aviso</label>
        <textarea
          id="ax" style={{ minHeight: 140 }} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej.: Sábado 8 de noviembre a las 9:00 am en el salón parroquial. Informes con la secretaría."
        />
        <div className="dos">
          <div>
            <label htmlFor="ad">Se muestra desde</label>
            <input id="ad" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="ah">Hasta (opcional)</label>
            <input id="ah" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </div>
        {!aviso && (
          <label className="check">
            <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} />
            Avisar a todos con una notificación
          </label>
        )}
        {error && <div className="aviso error">{error}</div>}
        <div className="acciones barra">
          <button className="btn" type="submit">Guardar</button>
          <button className="btn sec" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
        {aviso && <div className="acciones"><button className="btn peligro" type="button" onClick={() => void quitar()}>Quitar este aviso</button></div>}
      </form>
    </div>
  );
}

/** Los anuncios que se leen en misa. Todos los ven; la secretaria y el párroco los crean y editan. */
export function Parroquiales({ perfil }: { perfil: Perfil }) {
  const avisos = useAvisosParroquiales();
  const perfiles = usePerfiles();
  const pendientes = useIdsPendientes();
  const [editando, setEditando] = useState<AvisoParroquial | 'nuevo' | null>(null);
  const [verPasados, setVerPasados] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const puede = puedeEditarCatalogos(perfil.rol);
  const hoy = hoyClave();

  const { vigentes, proximos, pasados } = useMemo(() => {
    const act = avisos.filter((a) => a.activo);
    return {
      vigentes: act.filter((a) => a.desde <= hoy && (!a.hasta || a.hasta >= hoy)).sort((a, b) => b.desde.localeCompare(a.desde) || b.created_at.localeCompare(a.created_at)),
      proximos: act.filter((a) => a.desde > hoy).sort((a, b) => a.desde.localeCompare(b.desde)),
      pasados: act.filter((a) => a.hasta && a.hasta < hoy).sort((a, b) => (b.hasta ?? '').localeCompare(a.hasta ?? '')),
    };
  }, [avisos, hoy]);

  async function copiar() {
    const cuerpo = `AVISOS PARROQUIALES · ${diaLargo(deClave(hoy))}\n\n` +
      vigentes.map((a, i) => `${i + 1}. ${a.titulo}${a.texto ? `\n${a.texto}` : ''}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(cuerpo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      alert(cuerpo);
    }
  }

  const tarjeta = (a: AvisoParroquial, atenuado = false) => {
    const autor = a.creado_por ? nombrePerfil(perfiles.find((p) => p.id === a.creado_por)) : null;
    return (
      <div key={a.id} className="tarjeta nota" style={{ opacity: atenuado ? 0.65 : 1 }}>
        <div className="titulo" style={{ fontSize: '1.12rem', fontFamily: 'var(--serif)' }}>{a.titulo}</div>
        {a.texto && <div style={{ whiteSpace: 'pre-wrap', margin: '6px 0 4px', fontSize: '1rem' }}>{a.texto}</div>}
        <div className="meta"><Icono n="calendario" size={15} />{vigencia(a, hoy)}{autor ? ` · Publicó: ${autor}` : ''}</div>
        {pendientes.has(a.id) && <div className="etiquetas"><span className="etq pendiente">Sin enviar</span></div>}
        {puede && (
          <div className="fila" style={{ marginTop: 10 }}>
            <button className="btn sec chico" onClick={() => setEditando(a)}><Icono n="lapiz" size={15} />Editar</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <VolverAgenda />
      <div className="fila entre" style={{ marginBottom: 6 }}>
        <h2>Avisos parroquiales</h2>
        {puede && <button className="btn chico" onClick={() => setEditando('nuevo')}><Icono n="mas" size={17} strokeWidth={2.4} />Nuevo</button>}
      </div>
      <p className="ayuda" style={{ marginTop: 0 }}>Los anuncios para la comunidad, los que se leen en misa.</p>

      {vigentes.length > 0 && (
        <button className="btn sec chico" style={{ marginBottom: 12 }} onClick={() => void copiar()}>
          <Icono n={copiado ? 'check' : 'copiar'} size={16} />{copiado ? 'Copiado' : 'Copiar los vigentes para leerlos'}
        </button>
      )}

      {vigentes.length === 0 && (
        <div className="vacio grande">
          <span className="vacio-ico"><Icono n="megafono" size={26} /></span>
          <b>No hay avisos vigentes</b>
          <span>{puede ? 'Crea uno con «Nuevo» para que todos lo vean.' : 'Cuando haya anuncios para la comunidad aparecerán aquí.'}</span>
        </div>
      )}
      {vigentes.map((a) => tarjeta(a))}

      {proximos.length > 0 && (
        <>
          <h3 className="dia-titulo">Próximos</h3>
          {proximos.map((a) => tarjeta(a))}
        </>
      )}

      {pasados.length > 0 && (
        <>
          <button className="enlace" onClick={() => setVerPasados(!verPasados)}>
            {verPasados ? 'Ocultar anteriores' : `Ver anteriores (${pasados.length})`}
          </button>
          {verPasados && pasados.map((a) => tarjeta(a, true))}
        </>
      )}

      {editando && (
        <FormAviso aviso={editando === 'nuevo' ? undefined : editando} autorId={perfil.id} onCerrar={() => setEditando(null)} />
      )}
    </>
  );
}
