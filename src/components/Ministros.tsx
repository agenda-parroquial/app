import { useState, type FormEvent } from 'react';
import { useMinistros, usePerfiles } from '../lib/hooks';
import { guardarMinistro, vincularVicario } from '../lib/store';
import { esErrorDeRed, mensajeDeError, useEstadoSync } from '../lib/sync';
import { nombrePerfil, puedeRegistrarPersonas, TIPOS_MINISTRO, type Ministro, type Perfil, type TipoMinistro } from '../types';
import { Icono } from './Iconos';
import { VolverAjustes } from './VolverAjustes';

const TEXTOS: Record<TipoMinistro, { titulo: string; singular: string; vacio: string; vacioTexto: string; intro: string; ej: string }> = {
  ministro: {
    titulo: 'Ministros extraordinarios',
    singular: 'ministro extraordinario',
    vacio: 'Aún no hay ministros extraordinarios',
    vacioTexto: 'Agrega a quienes ayudan con la comunión para poder asignarles eventos.',
    intro: 'Quienes ayudan con la comunión (ministros extraordinarios, no ordenados). No tienen cuenta ni usan la app: aquí los registras '
      + 'y los eliges como celebrante al agendar un evento o una misa fija. La app avisa si les empalmas dos eventos a la misma hora.',
    ej: 'Ej.: Ana López',
  },
  vicario: {
    titulo: 'Vicarios',
    singular: 'vicario',
    vacio: 'Aún no hay vicarios sin cuenta',
    vacioTexto: 'Si un vicario todavía no usa la app, regístralo aquí para poder asignarle misas y eventos.',
    intro: 'Los vicarios son sacerdotes. Los que ya tienen cuenta aparecen solos como celebrantes. Aquí registras a los que todavía no la tienen; '
      + 'cuando se registren en la app, toca «Ya tiene cuenta» y todo lo que tenía asignado pasa a su cuenta.',
    ej: 'Ej.: Pbro. Luis Ramos',
  },
};

function Formulario({ tipo, persona, onCerrar }: { tipo: TipoMinistro; persona?: Ministro; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(persona?.nombre ?? '');
  const [activo, setActivo] = useState(persona?.activo ?? true);
  const t = TEXTOS[tipo];

  async function guardar(e: FormEvent) {
    e.preventDefault();
    await guardarMinistro({ nombre: nombre.trim(), tipo, activo }, persona?.id);
    onCerrar();
  }

  return (
    <div className="fondo">
      <form className="hoja" onSubmit={guardar}>
        <div className="hoja-cab">
          <h2>{persona ? 'Editar' : 'Agregar'} {t.singular}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <label htmlFor="pn" style={{ marginTop: 6 }}>Nombre</label>
        <input id="pn" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus placeholder={t.ej} autoComplete="off" />
        {persona && (
          <label className="check">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Disponible para elegirlo en los eventos
          </label>
        )}
        <p className="ayuda">
          No necesita cuenta ni correo: solo aparece en la lista de celebrantes. Si ya no está, desmarca «Disponible»; los eventos que ya
          lo tienen conservan su nombre.
        </p>
        <div className="acciones barra">
          <button className="btn" type="submit">Guardar</button>
          <button className="btn sec" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

/** Une a un vicario registrado sin cuenta con su cuenta de la app. */
function Vincular({ vicario, cuentas, onCerrar }: { vicario: Ministro; cuentas: Perfil[]; onCerrar: () => void }) {
  const { enLinea } = useEstadoSync();
  const [cuenta, setCuenta] = useState(cuentas[0]?.id ?? '');
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  async function vincular(e: FormEvent) {
    e.preventDefault();
    setError('');
    setTrabajando(true);
    try {
      await vincularVicario(vicario.id, cuenta);
      onCerrar();
    } catch (err) {
      setError(esErrorDeRed(err) ? 'Necesitas internet para hacer esto.' : mensajeDeError(err));
      setTrabajando(false);
    }
  }

  return (
    <div className="fondo">
      <form className="hoja" onSubmit={vincular}>
        <div className="hoja-cab">
          <h2>{vicario.nombre} ya tiene cuenta</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <p className="ayuda" style={{ marginTop: 0 }}>
          Elige su cuenta. Sus eventos y misas fijas pasan a ella, y este registro deja de usarse para no verlo dos veces como celebrante.
        </p>
        <label htmlFor="vc">Cuenta del vicario</label>
        <select id="vc" value={cuenta} onChange={(e) => setCuenta(e.target.value)} required>
          {cuentas.map((p) => <option key={p.id} value={p.id}>{nombrePerfil(p)} · {p.email}</option>)}
        </select>
        {error && <div className="aviso error">{error}</div>}
        <div className="acciones barra">
          <button className="btn" disabled={trabajando || !enLinea || !cuenta}>{trabajando ? 'Uniendo…' : 'Unir con su cuenta'}</button>
          <button className="btn sec" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
        {!enLinea && <p className="ayuda">Necesitas internet para unirlo con su cuenta.</p>}
      </form>
    </div>
  );
}

/**
 * El párroco registra a las personas sin cuenta que pueden ser celebrantes: los vicarios (sacerdotes) que aún no usan la app
 * y los ministros extraordinarios (que nunca tienen cuenta). Son listas separadas.
 */
function ListaPersonas({ perfil, tipo }: { perfil: Perfil; tipo: TipoMinistro }) {
  const todos = useMinistros();
  const perfiles = usePerfiles();
  const [editando, setEditando] = useState<Ministro | 'nuevo' | null>(null);
  const [vinculando, setVinculando] = useState<Ministro | null>(null);
  const puede = puedeRegistrarPersonas(perfil.rol);
  const t = TEXTOS[tipo];

  const lista = todos.filter((m) => m.tipo === tipo && !m.perfil_id);
  const vinculados = todos.filter((m) => m.tipo === tipo && m.perfil_id);
  const orden = [...lista].sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'));

  // Los sacerdotes con cuenta: ya son celebrantes sin registrarlos aquí; sirven para unir a un vicario con la suya.
  const yaUnidas = new Set(todos.map((m) => m.perfil_id).filter(Boolean));
  const cuentasVicario = perfiles.filter((p) => p.activo && p.rol === 'vicario');
  const cuentasLibres = cuentasVicario.filter((p) => !yaUnidas.has(p.id));

  if (!puede) {
    return (
      <>
        <VolverAjustes />
        <h2>{t.titulo}</h2>
        <div className="aviso">Solo el párroco registra a {tipo === 'vicario' ? 'los vicarios' : 'los ministros extraordinarios'}.</div>
      </>
    );
  }

  return (
    <>
      <VolverAjustes />
      <div className="fila entre" style={{ marginBottom: 12 }}>
        <h2>{t.titulo}</h2>
        <button className="btn chico" onClick={() => setEditando('nuevo')}><Icono n="mas" size={17} strokeWidth={2.4} />Agregar</button>
      </div>
      <p className="ayuda" style={{ marginTop: 0 }}>{t.intro}</p>

      {orden.length === 0 && (
        <div className="vacio grande">
          <span className="vacio-ico"><Icono n="persona" size={26} /></span>
          <b>{t.vacio}</b>
          <span>{t.vacioTexto}</span>
        </div>
      )}
      <div className="lista">
        {orden.map((m) => (
          <div key={m.id} className={`item clic ${m.activo ? '' : 'inactivo'}`} onClick={() => setEditando(m)}>
            <span className={`ico ${tipo === 'vicario' ? 'oro' : ''}`}><Icono n="persona" /></span>
            <div>
              <b>{m.nombre}</b>{!m.activo && ' (no disponible)'}
              <div className="ayuda">{TIPOS_MINISTRO[m.tipo]} · sin cuenta</div>
              {tipo === 'vicario' && m.activo && cuentasLibres.length > 0 && (
                <button className="btn sec chico" style={{ marginTop: 8 }} onClick={(e) => { e.stopPropagation(); setVinculando(m); }}>
                  Ya tiene cuenta
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {tipo === 'vicario' && (
        <>
          <div className="seccion-etq">Vicarios con cuenta</div>
          {cuentasVicario.length === 0 && vinculados.length === 0 && (
            <p className="ayuda">Todavía no hay vicarios con cuenta. Invítalos en Ajustes → Usuarios e invitaciones con el rol Vicario.</p>
          )}
          <div className="lista">
            {cuentasVicario.map((p) => (
              <div key={p.id} className="item">
                <span className="ico oro"><Icono n="persona" /></span>
                <div><b>{nombrePerfil(p)}</b><div className="ayuda">{p.email} · ya aparece como celebrante</div></div>
              </div>
            ))}
          </div>
        </>
      )}

      {editando && <Formulario tipo={tipo} persona={editando === 'nuevo' ? undefined : editando} onCerrar={() => setEditando(null)} />}
      {vinculando && <Vincular vicario={vinculando} cuentas={cuentasLibres} onCerrar={() => setVinculando(null)} />}
    </>
  );
}

export const Ministros = ({ perfil }: { perfil: Perfil }) => <ListaPersonas perfil={perfil} tipo="ministro" />;
export const Vicarios = ({ perfil }: { perfil: Perfil }) => <ListaPersonas perfil={perfil} tipo="vicario" />;
