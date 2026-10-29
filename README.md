# Agenda Parroquial

App web instalable (PWA) para llevar la agenda de la parroquia entre la secretaria, el párroco y el vicario.

- **Funciona sin internet** en el teléfono y en la PC: se puede abrir, consultar y agregar eventos. Al volver la señal se sincroniza sola.
- **Avisos al instante** a los demás usuarios de la parroquia cuando alguien agrega, cambia, cancela o elimina un evento (con el nombre de quien lo hizo; con la app abierta, o con las notificaciones push activadas).
- **Vista de calendario:** en la agenda, junto a Día y Semana, está **Mes**: el día de hoy va en rojo, un puntito marca cada día con eventos (rojo si hay un conflicto) y los días con eventos diocesanos se tiñen de azul. Al tocar un día se ve su agenda debajo.
- **Vicarios y ministros extraordinarios (sin cuenta):** el párroco los registra en **Ajustes → Vicarios** (sacerdotes que aún no usan la app) y **Ajustes → Ministros extraordinarios** (quienes ayudan con la comunión; nunca tienen cuenta). Aparecen en **Celebrante** (de eventos y misas fijas) en su propio grupo, junto a los sacerdotes con cuenta, y la app avisa si se les empalman dos eventos. Cuando un vicario se registra con su cuenta, «Ya tiene cuenta» une el registro con ella y sus eventos y misas fijas pasan a su cuenta.
- **Secretaría con PIN:** la cuenta con el rol Secretaría la comparten varias personas. El párroco las registra en **Ajustes → Usuarios e invitaciones → Personas de la Secretaría**, cada una con su PIN (4 a 6 números, sin repetir). Al **agendar** un evento la app pide el PIN y el evento queda a nombre de esa persona («Creado por …», y los avisos dicen quién fue). La Secretaría puede **editar, cancelar y eliminar cualquier evento** (las misas fijas se cancelan, no se eliminan), y cada vez la app pide el PIN: el evento sigue diciendo «Creado por …» y se le agrega **«Editado por …»** con la persona que hizo la última edición (los avisos también la nombran). El PIN no se guarda: se guarda una huella, y se comprueba también sin internet. Sirve para saber quién hizo cada cosa; no es una barrera de seguridad. Si todavía no hay personas registradas, la cuenta de Secretaría no puede agendar.
- **Intenciones solo donde corresponde:** llevan intenciones la **misa** y los tipos que la parroquia marque («Lleva intenciones» en **Ajustes → Tipos de evento**); bautizo, boda, confesiones, unción de enfermos y reunión no. Se agregan con el botón **Intenciones** de la tarjeta de la misa (quien puede capturarlas entra directo a editarlas: la secretaria en todas, el sacerdote en las suyas) o desde **Editar evento**.
- **Nombres de los tipos:** en **Ajustes → Tipos de evento**, el lápiz de cada tipo permite corregir su nombre (también los de siempre: «Confesiones», «Unción de enfermos»…); al renombrar un tipo propio, sus eventos y su color pasan al nombre nuevo.
- **Eliminar eventos:** dentro de un evento, **Eliminar este evento** lo borra para toda la parroquia y avisa a los demás (a diferencia de «Cancelar», que lo deja marcado). Lo pueden hacer el párroco, la secretaria y quien lo creó; una misa fija se cancela, no se elimina.
- **Detección de empalmes:** si dos eventos coinciden en horario y lugar (o con el mismo sacerdote), ambos se marcan en conflicto y se avisa a todos para resolverlo.
- **Misas fijas** que aparecen solas en la agenda: todas las semanas o **alternas** (una sí, una no; también cada 3 o 4 semanas). Para dos misas que se turnan a la misma hora, se crean dos con «Cada 2 semanas» y fechas de inicio con una semana de diferencia.
- **Intenciones de cada misa o evento:** el botón **🙏 Intenciones** de cada tarjeta muestra la lista (por los difuntos, acción de gracias y por la salud de) **en solo lectura**, con opción de copiarla para leerla. Se capturan, editan y quitan desde **Editar evento**, una por línea, y solo puede hacerlo la secretaria (en todas las misas) o el párroco/vicario en las misas que tienen asignadas. Funciona sin internet.
- **Avisos push:** llegan al teléfono aunque la app esté cerrada (ver «Avisos push» más abajo).
- **Avisos parroquiales:** el botón **Avisos** de la agenda (con el número de vigentes) abre los anuncios para la comunidad, los que se leen en misa. Cada aviso tiene título, texto y fechas de vigencia; los vigentes se pueden copiar de un solo toque para leerlos. Los crean y editan el párroco y la secretaria, y al crearlos se puede avisar a todos con una notificación.
- **Ajustes:** nombre propio, notificaciones del teléfono, lugares, misas fijas, tipos de evento y, para el párroco, usuarios e invitaciones.
- **Tipo de evento a tu medida:** al elegir **«Otro»** se escribe el tipo; si se marca «Guardar este tipo», queda en la lista para la próxima vez, y si no, solo se usa para ese evento.
- **Quién creó cada evento:** cada persona tiene su nombre y las tarjetas muestran «Creado por …». El celebrante de cada evento es quien lo atiende.
- **Tipos de evento con color:** en **Ajustes → Tipos de evento** el párroco o la secretaria ven los tipos (misa, bautizo… y los que agregaron), agregan nuevos y asignan un color a cada uno; se ve en el borde de las tarjetas de la agenda y lo comparte toda la parroquia.
- **Mapa de lugares:** en **Ajustes → Lugares** cada lugar puede tener su punto en el mapa (OpenStreetMap): se busca una dirección, se usa el GPS o se toca el mapa. Hay vista de lista y de mapa.
- **Varias parroquias, con acceso controlado:** un mismo sitio sirve a muchas parroquias y cada una solo ve lo suyo. Un **superadmin** crea cada parroquia y le da acceso a su párroco con un código de invitación (ver «Varias parroquias»). Nadie puede crear una cuenta sin invitación.
- **Roles:** párroco, secretaria y vicario; el párroco invita a su gente con un código y asigna los roles.

Tecnología: React + Vite (PWA) · Dexie/IndexedDB (copia local) · Supabase (base de datos, usuarios y tiempo real) · Netlify (hosting).

---

## 1. Crear el proyecto en Supabase (gratis)

1. Entra a <https://supabase.com> → **New project**. Anota la contraseña de la base de datos.
2. **SQL Editor → New query**: pega **todo** el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
   - Al crear cada parroquia se escribe su **lugar** (puede haber parroquias con el mismo nombre en lugares distintos); la zona horaria ya no se pide: la parroquia nueva usa la de la última creada (la primera, Ciudad de México).
   - Si ya tenías el proyecto de antes, **no** vuelvas a pegar `schema.sql`: ejecuta en orden los archivos nuevos de `supabase/migrations/` (`20261029_multi_parroquia.sql` activa las varias parroquias, `20261030_vigencia_colores_diocesanos.sql`, la vigencia automática, los colores por tipo y los eventos diocesanos, y `20261101_calendario_avisos_ministros.sql`, los ministros sin cuenta, el borrado de eventos, el obispo y los avisos diocesanos, `20261102_obispo_al_invitar.sql`, el obispo al crear la cuenta, `20261103_secretaria_pin_vicarios_tipos.sql`, la Secretaría con PIN, vicarios y ministros por separado, intenciones por tipo y nombres de tipos, y `20261104_secretaria_edita_y_firma.sql`, la Secretaría edita y elimina todo y se anota quién editó, `20261105_lugar_parroquia_intenciones_tipos.sql`, el lugar de la parroquia y qué tipos de siempre llevan intenciones, y `20261106_creador_aparte.sql`, la cuenta de Creador separada del todo de las parroquias). Publica la app **después** de ejecutar la migración.
3. **Authentication → Providers → Email**: desactiva **Confirm email**. (No hace falta confirmar el correo: el párroco ya aprueba cada cuenta a mano.)
4. **Project Settings → API**: copia la **Project URL** y la clave **anon / publishable**.

## 2. Probarla en tu computadora

```bash
npm install
cp .env.example .env     # en Windows: copy .env.example .env
# edita .env y pega la URL y la clave de Supabase
npm run dev
```

## 3. Publicarla en Netlify (gratis)

1. Sube esta carpeta a un repositorio de GitHub (el archivo `.env` **no** se sube).
   - **Importante:** Netlify solo despliega gratis un repositorio *privado* si es de una cuenta personal. Si el repositorio es de una **organización**, debe ser **público** (aquí no hay secretos: las claves van como variables de entorno) o hay que pagar el plan Pro.
2. En <https://netlify.com> → **Add new project → Import from Git** y elige el repositorio. Si es de una organización, primero instala la app de Netlify en esa organización desde GitHub. La configuración de compilación ya viene en `netlify.toml`.
3. En la misma pantalla, **Environment variables**: agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los mismos valores del `.env`.
4. Despliega. Cada cambio que se suba a la rama `main` se publica solo.
5. Opcional: en Supabase → **Authentication → URL Configuration**, pon la dirección del sitio en **Site URL**. Hoy la app no envía correos, así que solo importará si más adelante agregas recuperación de contraseña.

**Sitio actual:** <https://agenda-parroquial.netlify.app> · **Código:** <https://github.com/agenda-parroquial/app>

## 3b. Avisos push (una sola vez)

Para que los avisos lleguen con la app cerrada hace falta una función en Supabase:

1. **Edge Functions → Deploy a new function → Via Editor.** (Si la función ya existe, abre `enviar-push` → Code, pega el contenido nuevo y pulsa **Deploy updates**; después revisa que «Verify JWT with legacy secret» siga apagado.) Ponle el nombre **`enviar-push`**, pega el contenido de [`supabase/functions/enviar-push/index.ts`](supabase/functions/enviar-push/index.ts) y pulsa **Deploy function**.
2. En la pestaña **Settings** de esa función, apaga **«Verify JWT with legacy secret»** y guarda. (Quien la llama —la base de datos y el navegador— no envía JWT; la función se protege con un secreto compartido que la base de datos genera sola.)
3. Si instalaste con `schema.sql`, cambia en la tabla `config` el valor de `funciones_url` por la dirección de tu proyecto (`https://TU-PROYECTO.supabase.co/functions/v1`). Con la migración ya viene puesta.
4. Cada persona abre la app, va a **Ajustes → Notificaciones en este teléfono** y pulsa **Activar notificaciones** (en iPhone, antes hay que instalar la app en la pantalla de inicio: iOS 16.4 o superior). El botón **«Mandarme una notificación de prueba»** comprueba que todo funciona.

Las claves del servicio de avisos (VAPID) se generan solas la primera vez y se guardan en la tabla `push_config`, que ningún usuario puede leer. Para no saturar, si llegan varios avisos del mismo tipo en menos de 20 segundos solo se envía el primero al teléfono; el resto se ve dentro de la app.

## 4. Primer uso

1. **Quien administra la app se registra primero** desde la dirección de Netlify: en una instalación nueva, la primera cuenta queda como **superadmin**. En **Ajustes → Parroquias y accesos** crea la primera parroquia con el correo de su párroco y le manda el código. La cuenta de Creador queda siempre aparte: no pertenece a ninguna parroquia (la base de datos no lo permite) y no se usa para llevar una agenda parroquial.
2. El párroco se registra con el código (ver el punto 4) y en **Ajustes → Lugares** agrega la parroquia, las capillas y la oficina.
3. En **Ajustes → Misas fijas** agrega los horarios semanales.
4. Para sumar a la secretaria o al vicario, el párroco va a **Ajustes → Usuarios e invitaciones**, escribe su nombre, correo y rol y pulsa **Crear invitación**. La app genera un código y un mensaje listo para mandar por WhatsApp. La persona abre la app, toca **«No tengo cuenta · Registrarme»**, usa ese mismo correo, el código y elige su contraseña; entra directo, ya con su rol. Sin código no se puede crear una cuenta.

| | Párroco | Secretaria | Vicario |
|---|:-:|:-:|:-:|
| Ver la agenda y los conflictos | ✔ | ✔ | ✔ |
| Crear eventos | ✔ | ✔ (con PIN) | ✔ |
| Editar y cancelar eventos | ✔ | ✔ (con PIN) | ✔ |
| Eliminar eventos | todos | todos (con PIN) | los que creó |
| Ver las intenciones de cualquier evento | ✔ | ✔ | ✔ |
| Capturar o editar intenciones | solo en sus misas | en todas | solo en sus misas |
| Lugares, misas fijas y tipos de evento (agregar y editar nombres) | ✔ | ✔ | solo ver |
| Vicarios, ministros extraordinarios y personas de la Secretaría | ✔ | — | — |
| Usuarios e invitaciones | ✔ | — | — |
| Avisos parroquiales: ver | ✔ | ✔ | ✔ |
| Avisos parroquiales: crear y editar | ✔ | ✔ | — |
| Tipos de evento guardados: crear | ✔ | ✔ | ✔ |
| Tipos de evento guardados: quitar | ✔ | ✔ | — |
| Invitar usuarios | ✔ | — | — |
| Aprobar cuentas y asignar roles | ✔ | — | — |

## Varias parroquias (superadmin)

- **Superadmin:** la cuenta que administra la app. Desde **Ajustes → Parroquias y accesos** crea parroquias, manda la invitación a cada párroco, invita a otro párroco, renombra y **suspende o reactiva** parroquias (una parroquia suspendida no puede entrar ni ver sus datos). Solo gestiona accesos: **no ve la agenda, las intenciones ni los avisos de ninguna parroquia**.
- **Aislamiento:** cada fila de datos pertenece a una parroquia y la base de datos (Row Level Security) solo se la muestra a quienes son de ella; las notificaciones, los empalmes y las misas fijas también son por parroquia, cada una con su zona horaria.
- **Primer superadmin en una base que ya tenía datos:** la migración deja como superadmin al primer párroco activo. Para sumar otro: en el SQL Editor, `insert into superadmins (id) values ('<id del usuario>');`.
- **Vigencia automática:** cada parroquia puede tener una fecha de «acceso hasta». Al pasar esa fecha deja de entrar y de ver sus datos (como si estuviera suspendida), sin tareas programadas; sus datos se conservan y al renovar todo vuelve. En el panel: **+1 mes**, **+1 año**, una fecha exacta o **Sin límite**. Una semana antes de vencer, sus usuarios ven un aviso. Las parroquias existentes quedan sin límite hasta que fijes una fecha.
- **Interfaz del Creador:** la cuenta superadmin que no es de ninguna parroquia no lleva agenda de parroquia. Su pantalla principal es **Cuentas** (crear parroquias, invitar párrocos y obispo, vigencia, suspender), y además tiene **Agenda** (solo eventos diocesanos; el «Nuevo» publica uno) y **Ajustes**. Cualquier cuenta cambia su correo y su contraseña en **Ajustes → Mi cuenta → Correo y contraseña** (con «Confirm email» desactivado en Supabase el correo cambia al instante; el perfil lo copia solo).
- **Obispo:** al crear una parroquia o invitar a un párroco, el creador marca **«Esta persona es el obispo»**; al registrarse con su código, esa persona tiene su cuenta y agenda como cualquier párroco y además permiso de publicar eventos diocesanos (a alguien que ya tiene cuenta se le da en **Cuentas → Diocesanos → Quién más puede publicar**). El obispo no administra parroquias.
- **Evento diocesano desde la agenda:** quien puede publicarlos (creador y obispo) ve arriba del formulario «Nuevo» un selector **Parroquia / Diocesano**; no hace falta ir a Ajustes.
- **Avisos y borrado de eventos diocesanos:** al crear uno, o al cambiar su día, hora, lugar o título, se manda una notificación a todos los usuarios de las parroquias con acceso (casilla marcada por omisión); eliminarlo siempre avisa. Quien puede publicarlos también puede **editarlo o eliminarlo desde su tarjeta en la agenda**; al eliminarlo desaparece en todas las parroquias.
- **Eventos diocesanos:** en **Ajustes → Administración → Eventos diocesanos** el superadmin (o un obispo) sube eventos (con aviso a todos) que aparecen en la agenda de todas las parroquias con un formato propio (borde punteado azul y la etiqueta «Diocesano»). Son solo informativos: no generan empalmes y cada usuario puede ocultarlos (individualmente o todos) desde su teléfono.
- **Lugares desde el panel:** en **Administración → 🗺 Lugares** el superadmin crea un punto en el mapa, elige la parroquia a la que pertenece y le aparece como lugar a esa parroquia (en su lista, su mapa y al agendar). Ella puede editarlo como los suyos. El superadmin solo ve los lugares, no su agenda.
- **Costos:** el plan gratis de Supabase y el de Netlify bastan para empezar. Cuando sean varias parroquias conviene pasar a Supabase Pro (respaldos automáticos y sin pausas por inactividad). El dominio propio es opcional.

## Respaldos automáticos (GitHub Actions)

El flujo `.github/workflows/respaldo.yml` guarda **cada día una copia cifrada de toda la base de datos** (los datos de todas las parroquias y las cuentas de usuario), y la conserva 30 días. Como cada respaldo abre una conexión a la base, también evita que el plan gratis de Supabase la pause por inactividad.

**Configuración (una sola vez)**
1. En Supabase: **Connect** (arriba) → **Session pooler** → copia la cadena de conexión (termina en `:5432/postgres`) y sustituye `[YOUR-PASSWORD]` por la contraseña de la base de datos. Hay que usar *Session pooler*: GitHub solo tiene IPv4 y la conexión directa de Supabase es IPv6.
2. En GitHub: repositorio → **Settings → Secrets and variables → Actions → New repository secret** y crea dos:
   - `SUPABASE_DB_URL`: la cadena del paso anterior.
   - `BACKUP_PASSPHRASE`: una contraseña larga que inventes tú. **Guárdala en tu gestor de contraseñas**: sin ella no se puede abrir ningún respaldo.
3. Pestaña **Actions → Respaldo de la base de datos → Run workflow** para probarlo. Si algo falla, GitHub te manda un correo.

Los respaldos se descargan desde esa misma pantalla (cada ejecución → *Artifacts*). Este repositorio es público, por eso el archivo **solo se sube cifrado** (AES-256): sin la contraseña no sirve a nadie. GitHub pausa los flujos programados si el repositorio pasa 60 días sin ninguna actividad; con un cambio al código de vez en cuando basta.

**Restaurar** (en un proyecto de Supabase nuevo y vacío, con `pg_net` habilitado)
```bash
gpg -d respaldo-AAAA-MM-DD.dump.gpg > respaldo.dump
pg_restore --no-owner --no-privileges -d "<cadena de conexión del proyecto nuevo>" respaldo.dump
```
Saldrán avisos de «already exists» (los esquemas y objetos que Supabase ya trae): son normales. Después, en el SQL Editor del proyecto nuevo:
```sql
alter publication supabase_realtime add table parroquias, perfiles, lugares, misas_fijas, tipos_evento,
  avisos_parroquiales, eventos, conflictos, intenciones, notificaciones, eventos_diocesanos;
update config set valor = 'https://<referencia-del-proyecto-nuevo>.supabase.co/functions/v1' where clave = 'funciones_url';
```
Y por último: volver a desplegar la función `enviar-push` (Verify JWT apagado) y cambiar la URL y la clave del proyecto en las variables de Netlify.

## 5. Instalar en el teléfono

- **iPhone:** abrir la dirección en **Safari** → Compartir → **Añadir a pantalla de inicio**. Abrirla desde ese ícono.
- **Android:** en Chrome → menú ⋮ → **Instalar aplicación**.
- **PC:** en Chrome o Edge, ícono de instalar en la barra de direcciones (opcional; también funciona como página normal).

**Importante:** abrir la app **una vez con internet** después de instalarla, para que descargue todo y funcione sin señal.

---

## Cómo se resuelven los empalmes

- Al escribir un evento, el formulario avisa al momento si se empalma con otro (incluso sin internet).
- Si se guarda igual, o si el empalme nace porque dos personas agendaron sin verse (por ejemplo, el párroco sin señal), al sincronizar **el servidor marca ambos eventos «EN CONFLICTO» y avisa a todos**.
- En la pestaña **Conflictos** se resuelve: cambiar horario o lugar, cancelar uno, o confirmar que pueden coexistir. Al cambiar o cancelar, el conflicto se cierra solo.
- Si dos personas editan **el mismo evento** a la vez, aparece «Cambio que chocó» mostrando las dos versiones para elegir cuál conservar. Solo viajan los campos que cada quien cambió, así que no se pisan cambios distintos.

La regla de empalme: se cruzan en el tiempo **y** comparten lugar (de la lista) **o** el mismo celebrante (sacerdote con cuenta o ministro). Un evento en «Otro lugar (solo esta vez)» solo choca por sacerdote.

## Límites actuales y siguientes pasos

- **Avisos push en iPhone:** solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o superior) y aceptando el permiso. En Android funcionan también desde Chrome.
- **Mapa:** las calles se descargan de OpenStreetMap, así que sin internet el mapa se ve en blanco (los puntos y la lista siguen ahí).
- **PDF/impresión semanal** para el tablón: pendiente.
- **Supabase gratis** pausa un proyecto tras una semana sin actividad y **no incluye respaldos automáticos**: por eso el repositorio trae un respaldo diario con GitHub Actions (ver «Respaldos automáticos»).
- **Cerrar sesión borra los datos locales** de ese dispositivo; si hay cambios sin enviar, la app lo avisa antes.

## Estructura

```
supabase/schema.sql        tablas, roles, seguridad, detección de empalmes, misas fijas y parroquias (instalación nueva)
supabase/migrations/       cambios para bases ya creadas (ejecutar en orden en el SQL Editor)
supabase/functions/        función que envía los avisos push (se despliega desde el panel de Supabase)
src/sw.ts                  service worker: modo sin conexión y recepción de avisos
src/lib/db.ts              copia local (Dexie)
src/lib/store.ts           escrituras "local primero" + cola de cambios pendientes
src/lib/sync.ts            enviar pendientes, traer cambios, tiempo real
src/lib/traslapes.ts       regla de empalme (espejo de la del servidor)
src/components/            pantallas
```
