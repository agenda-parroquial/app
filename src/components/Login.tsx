import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { Icono } from './Iconos';

export function Login() {
  const { iniciarSesion, registrar } = useAuth();
  const [modo, setModo] = useState<'entrar' | 'registro'>('entrar');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAviso('');
    setTrabajando(true);
    const r = modo === 'entrar' ? await iniciarSesion(email, password) : await registrar(email, password, nombre, codigo);
    setTrabajando(false);
    if (r.error) setError(r.error);
    if (r.aviso) {
      setAviso(r.aviso);
      setModo('entrar');
    }
  }

  function cambiarModo(m: 'entrar' | 'registro') {
    setModo(m);
    setError('');
  }

  return (
    <div className="centro">
      <form className="caja" onSubmit={enviar}>
        <img className="logo" src="/icon.svg" alt="" />
        <h1>Agenda Parroquial</h1>
        <p className="sub">La agenda de tu parroquia, siempre contigo</p>

        <div className="segmentos lleno" role="tablist" aria-label="Acceso" style={{ marginTop: 12 }}>
          <button type="button" className={modo === 'entrar' ? 'on' : ''} onClick={() => cambiarModo('entrar')}>Iniciar sesión</button>
          <button type="button" className={modo === 'registro' ? 'on' : ''} onClick={() => cambiarModo('registro')}>Crear cuenta</button>
        </div>

        {modo === 'registro' && (
          <>
            <label htmlFor="nombre">Tu nombre</label>
            <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoComplete="name" />
          </>
        )}
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoCapitalize="none" />
        <label htmlFor="password">Contraseña</label>
        <div className="campo-icono">
          <input
            id="password" type={verClave ? 'text' : 'password'} value={password} minLength={6} required
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
          />
          <button type="button" onClick={() => setVerClave(!verClave)} aria-label={verClave ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}>
            <Icono n={verClave ? 'ojoNo' : 'ojo'} size={20} />
          </button>
        </div>

        {modo === 'registro' && (
          <>
            <label htmlFor="codigo">Código de invitación</label>
            <input
              id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ej.: 3F9A-12BC"
              autoCapitalize="characters" autoComplete="off" maxLength={12} required
            />
          </>
        )}

        {error && <div className="aviso error">{error}</div>}
        {aviso && <div className="aviso ok">{aviso}</div>}
        {modo === 'registro' && (
          <p className="ayuda">
            El código te lo da tu párroco (o quien administra la app). Usa el mismo correo con el que te invitaron.
          </p>
        )}

        <button className="btn ancho" style={{ marginTop: 20 }} disabled={trabajando}>
          {trabajando ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>
    </div>
  );
}
