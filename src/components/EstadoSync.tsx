import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useEstadoSync } from '../lib/sync';

export function EstadoSync() {
  const s = useEstadoSync();
  const porEnviar = useLiveQuery(() => db.outbox.count(), [], 0);

  let texto: string;
  let clase = '';
  if (!s.enLinea) {
    texto = `Sin conexión${porEnviar ? ` · ${porEnviar} por enviar` : ''}`;
    clase = 'off';
  } else if (s.sincronizando) {
    texto = 'Sincronizando…';
    clase = 'sinc';
  } else if (porEnviar) {
    texto = `${porEnviar} por enviar`;
    clase = 'sinc';
  } else {
    texto = 'Al día';
  }

  return <span className={`estado ${clase}`} role="status">{texto}</span>;
}
