# CONTRACTS — Emerald City

**contract-v0.5** · **backend-v0.5** · diseño: ninguna entrega todavía (interfaz provisional) · **Pasos 1 a 4 cerrados y confirmados por el cliente; Paso 5 entregado, pendiente de confirmación**

> Contrato compartido entre Programador, Diseñador e Integrador. Lo mantiene el Programador. El Diseñador aporta la tabla de nombres; el Integrador solo lee y audita.
> Fusiona el contract-v0.4 con los cambios del Paso 5. No inventar nada que no esté aquí; lo no verificado está marcado como tal.

## 1. Respuestas del proyecto

| Tema | Valor |
|---|---|
| Modo | Proyecto nuevo (create) |
| Roles | Administrador (código de sala), Jugador (solo apodo) |
| Login | Ninguno. El admin entra con un código generado al crear la sala (solo se guarda su hash). El jugador entra con apodo |
| Idioma | Español, nombres de Pokémon en español |
| Zona horaria | America/Caracas (UTC-4). En base de datos todo `timestamptz` en UTC |
| Modo oscuro | Sí, tema base (verde oscuro y negro). ASSUMPTION: sin modo claro |
| Citas/reservas | No |
| Pagos | No (sin Stripe, sin monetización ni publicidad) |
| Móvil | Obligatorio |
| Salas | Hasta 10 abiertas a la vez (decisión del cliente) |
| Jugadores | Hasta 100 por sala. El tope total entre salas lo fija la prueba de carga. Plan B: 30 a 50 |
| Costo | Cero |

## 2. Stack y versiones

| Pieza | Versión | Origen |
|---|---|---|
| Next.js | 15.5.28 (App Router) | build de Vercel |
| React | ^19 | package.json |
| TypeScript | strict + noUncheckedIndexedAccess | tsconfig.json |
| Zod | ^4 | package.json |
| Tailwind CSS | ^4 (tokens en `@theme`) | package.json |
| ESLint | 8 | package.json |
| @supabase/supabase-js | ^2.45 | package.json |
| Vitest | ^3.2 (`npm test`) | package.json |
| Supabase | proyecto de PRUEBAS "Projecto Dinamica Frio-Caliente", ref `hizsxxuipewlwbjbwzic`, us-west-2, Postgres 17 | Supabase |
| Hosting | Vercel Hobby, equipo emerald-city1, proyecto emerald-city | Vercel |
| Aún no instalados | @supabase/ssr (no hay login), TanStack Query (llega en la Fase 2) | |

- Producción: `emerald-city-emerald-city1.vercel.app`. Los registros de Vercel mostraron además `emerald-city-lyart.vercel.app`. **Por confirmar cuál es el oficial.**
- Node: `package.json` dice `>=20`, Vercel ejecuta `nodejs26.x` (según los registros). **Pendiente fijar la versión.**
- Las pantallas leen la partida con un sondeo propio y mínimo (`components/useRoomFeed.ts`); TanStack Query llega en la Fase 2.

## 3. Variables de entorno (solo nombres)

| Variable | Tipo | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | pública | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | pública | |
| `SUPABASE_SERVICE_ROLE_KEY` | **secreta, solo servidor** | Nunca con prefijo `NEXT_PUBLIC_`. Debe ser la clave `service_role`, no la `anon` (ver sección 15) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | secretas | No se usan en la Fase 1 |

- Sin variables nuevas en el Paso 5. `.env.example` y `.gitignore` se agregan al repo en el Paso 5 (no estaban en el ZIP revisado).
- Producción y Preview apuntan hoy al Supabase de PRUEBAS (temporal, confirmado por el cliente). Una Preview nunca apunta a la base definitiva.
- Cambiar variables en Vercel exige un Redeploy.

## 4. Mapa "nombre en diseño → archivo en código"

Interfaz **provisional**: el Diseñador entra al final y reconcilia con esta tabla. Todo renombre se reporta, nunca se hace en silencio.

| Nombre en diseño | Archivo en código | Estado |
|---|---|---|
| Página principal (con espacio de logo) | `app/page.tsx` | provisional |
| Layout raíz | `app/layout.tsx` | provisional |
| Pantalla Crear sala | `app/crear/page.tsx` + `components/RoomForms.tsx` (CreateRoomForm) | provisional |
| Botón Unirme a una sala | `components/RoomForms.tsx` (JoinRoomForm) | provisional |
| Pantalla de sala (jugadores): entrar / jugar / no disponible / sin conexión | `app/sala/[roomCode]/page.tsx` | provisional |
| Entrada con apodo | `components/PlayerForms.tsx` (JoinNicknameForm) | provisional |
| Sala de juego (intentos, buscador, ganador, lista de jugadores) — **nuevo Paso 5, reemplaza a PlayerLobby** | `components/GameRoom.tsx` (GameRoom, AttemptItem) | provisional |
| Buscador de Pokémon y botón Enviar — **nuevo** | `components/PokemonPicker.tsx` | provisional |
| Panel de admin y entrada con código (ahora con la partida en vivo, solo lectura) | `app/sala/[roomCode]/admin/page.tsx` + AdminLoginForm | provisional |
| Estilos de botones y campos | `lib/ui.ts` | provisional |
| Tokens | `app/globals.css` (ec-bg, ec-surface, ec-primary EXAMPLE, ec-text, ec-muted) | provisional |
| Iconos de pista ❄️ 🌡️ 🔥 y sus etiquetas — **nuevo** | `lib/feed-types.ts` (HINT_META) | provisional |
| Acciones de sala | `app/actions/rooms.ts` | definitivo |
| Acción de entrada de jugador | `app/actions/players.ts` (joinRoomAction) | definitivo |
| Acción de enviar intento — **nuevo** | `app/actions/attempts.ts` (submitAttemptAction) | definitivo |
| Servicio de salas | `services/rooms.service.ts` | definitivo |
| Servicio de jugadores | `services/players.service.ts` | definitivo |
| Servicio de intentos y feed — **nuevo** | `services/attempts.service.ts` | definitivo |
| Servicio de Pokémon | `services/pokemon.service.ts` | definitivo |
| Códigos | `lib/room-codes.ts` (puro), `lib/room-secrets.ts` (solo servidor) | definitivo |
| Sesión del jugador | `lib/player-session.ts` | definitivo |
| Resultado `{ data, error }` | `lib/result.ts` | definitivo |
| Límite de intentos (rate limit) | `lib/rate-limit.ts` | definitivo |
| Pokémon: esquema, normalización, buscador | `lib/validation/pokemon.ts`, `lib/normalize-name.ts`, `lib/pokemon-search.ts` | definitivo |
| Validación de salas / apodo / intentos y feed | `lib/validation/rooms.ts`, `lib/validation/players.ts`, `lib/validation/attempts.ts` | definitivo |
| Tipos y lectura del feed (sin Zod, para el navegador) — **nuevo** | `lib/feed-types.ts`, `lib/feed-parse.ts` | definitivo |
| Lectura periódica del feed (único punto; se cambia aquí si algún día se usa Realtime) — **nuevo** | `components/useRoomFeed.ts` | definitivo |
| Cliente Supabase (servidor) | `lib/supabase/server.ts` | definitivo |
| Variables de entorno | `lib/env.ts` | definitivo |
| Health | `app/api/health/route.ts` | definitivo |
| Feed de la sala (reemplaza a la lista de jugadores) — **nuevo** | `app/api/rooms/[roomCode]/feed/route.ts` | definitivo |
| Lista pública de nombres — **nuevo** | `app/api/pokemon/names/route.ts` | definitivo |

Eliminado en el Paso 5: `app/api/rooms/[roomCode]/players/route.ts` (lo reemplaza el feed) y el componente `PlayerLobby`.

## 5. Tokens

Definidos en `app/globals.css` (`@theme`): `ec-bg`, `ec-surface`, `ec-primary` (valor **EXAMPLE**, HEX real pendiente del cliente), `ec-text`, `ec-muted`. Los valores viven solo en ese archivo.

## 6. Matriz de permisos

Nadie inicia sesión en Supabase. Jugador y admin llegan como `anon`; el servidor decide quién es quién y accede con `service_role`. No hay políticas RLS en ninguna tabla: la denegación es RLS activo más privilegios revocados.

| role | table | SELECT | INSERT | UPDATE | DELETE | policy name |
|---|---|---|---|---|---|---|
| anon, authenticated | `pokemon` | ✗ | ✗ | ✗ | ✗ | ninguna |
| service_role | `pokemon` | ✓ | ✗ | ✗ | ✗ | n/a (privilegio SELECT) |
| anon, authenticated, service_role | `pokemon_names` (vista) | ✓ | ✗ | ✗ | ✗ | n/a (vista) |
| anon, authenticated | `rooms` | ✗ | ✗ | ✗ | ✗ | ninguna |
| service_role | `rooms` | ✓ | ✓ | ✗ (Paso 6) | ✗ | n/a. `rooms.finished_at` lo escribe solo `submit_attempt()` |
| todos | `rate_limits` | ✗ | ✗ | ✗ | ✗ | ninguna. Solo vía `rate_limit_hit` |
| anon, authenticated | `players` | ✗ | ✗ | ✗ | ✗ | ninguna |
| service_role | `players` | ✓ | ✓ | ✗ (Fases 2 y 3) | ✗ (Fases 2 y 3) | n/a |
| anon, authenticated, **service_role** | `attempts` | ✗ | ✗ | ✗ | ✗ | ninguna. **Nadie** tiene privilegios directos: solo `submit_attempt()` y `list_attempts()` (SECURITY DEFINER, solo `service_role`). El Paso 6 borrará los intentos con una función de cierre |

Justificaciones:
- `pokemon` guarda tipo y generación (las pistas). Si el navegador pudiera leerla, un jugador vería la respuesta.
- `pokemon_names` es pública a propósito (solo `id`, `nombre_es`, `search_key`) y corre con derechos del dueño (`security_invoker = false`). El aviso "Security Definer View" del panel de Supabase es intencional.
- Los avisos "RLS sin políticas" del panel (ahora 4 tablas) son intencionales.
- `attempts` guarda quién probó qué. Se accede por funciones para que la pista se calcule y el ganador se decida dentro de una sola transacción.

## 7. Formato de error y códigos

Todo devuelve `{ data, error }`, con `error = { code, message, details? }`. `details` nunca lleva mensajes internos de Postgres; esos se registran solo en el servidor. La tabla de estados HTTP aplica solo a Route Handlers; las Server Actions devuelven el mismo `code`, sin estado HTTP.

| HTTP | Código | Estado |
|---|---|---|
| 400 | VALIDATION_ERROR | en uso (también: Pokémon inexistente) |
| 401 | UNAUTHENTICATED | en uso (feed; enviar intento sin entrar con apodo) |
| 403 | FORBIDDEN | en uso |
| 404 | NOT_FOUND | en uso |
| 409 | CONFLICT | en uso (caso raro de unicidad de sesión) |
| 409 | ROOM_LIMIT_REACHED | en uso |
| 409 | ROOM_CLOSED | en uso |
| 409 | ROOM_FULL | en uso |
| 409 | NICKNAME_TAKEN | en uso |
| 409 | **ROUND_FINISHED** | **nuevo (Paso 5)**: alguien ya adivinó; no se aceptan más intentos |
| 429 | RATE_LIMITED (en acciones va en `details.retryAfter`, en segundos) | en uso (también: 1 intento por segundo) |
| 500 | INTERNAL | en uso |
| 503 | EXTERNAL_SERVICE_UNAVAILABLE | en uso |

## 8. Endpoints y límites de intentos

Almacén de límites: Supabase, ventana fija, **falla cerrado**. Clave: hash de la primera IP de `x-forwarded-for`.

| Endpoint | Tipo | Límite | Clave |
|---|---|---|---|
| createRoomAction | Server Action | 10 por hora | hash de IP |
| loginAdminAction | Server Action | 10 por 10 minutos | hash de IP |
| joinRoomAction | Server Action | 60 por 10 minutos | hash de IP + sala |
| **submitAttemptAction** | Server Action | **1 intento por segundo por jugador**, aplicado en la base (`submit_attempt`). Sin límite por IP | jugador (id) |
| **GET /api/rooms/[roomCode]/feed** | Route Handler | sin límite propio | exige cookie secreta de jugador o de admin; sin cookie responde 401 sin tocar la base |
| **GET /api/pokemon/names** | Route Handler | ninguno; respuesta cacheada por la CDN 24 h | público (solo nombres) |
| GET /api/health | Route Handler | ninguno | público |

- La cookie de admin no tiene límite propio: el código tiene 60 bits (32^12).
- **Riesgo conocido:** 60 entradas por IP y sala puede bloquear a los últimos si más de 60 personas entran desde una misma red en 10 minutos. Revisar en la prueba de carga.
- **Riesgo conocido (Paso 5):** `/api/pokemon/names` es público; si la CDN no cachea, cada llamada hace 2 consultas. Revisar en la prueba de carga.

Respuestas de los Route Handlers:
- `GET /api/rooms/[roomCode]/feed?after=<id>&players=1`: `{ data: { status: "playing"|"finished", attempts: [{ id, nickname, pokemon, result: "fire"|"warm"|"cold", isWinner }], cursor, hasMore, players: string[]|null }, error: null }`. Sin `after` devuelve los últimos 50; con `after`, hasta 100 más nuevos (`hasMore` avisa si hay más). `players` solo con `players=1` (el navegador lo pide cada ~10 s). Estados 200, 400, 401, 404, 409 (sala cerrada), 500, 503. Nunca devuelve tipos, generación, ni hash de sesión.
- `GET /api/pokemon/names`: `{ data: { names: [{ id, nombre_es, search_key }] }, error: null }`. Cache-Control `public, max-age=3600, s-maxage=86400`.
- `GET /api/health`: 200 `{ data: { status: "ok" } }`; 500 si el entorno es inválido; 503 si la base no responde o la clave de servidor no es `service_role`. Sin detalles internos. Consulta Supabase, lo que también evita la pausa de Supabase Free.

Respuesta de `submitAttemptAction`: `{ data: { result: "fire"|"warm"|"cold", isWinner }, error: null }`.

## 9. Reglas técnicas vigentes

**Códigos y cookies**
- Sala: 6 caracteres (público). Admin: 12 (secreto, se muestra una vez, formato `ABCD-EFGH-JKMN`). Alfabeto de 32 sin I, O, 0, 1.
- Hash del admin: `sha256("<sala>:<código>")`, comparado en tiempo constante.
- Cookie de admin: `ec_admin_<sala>`, httpOnly, secure en producción, sameSite lax, 12 horas.
- Cookie de jugador: `ec_player_<sala>`, httpOnly, secure en producción, sameSite lax, 12 horas. Valor: token aleatorio de 43 caracteres. La base guarda solo `sha256("player:<sala>:<token>")`.
- Un dispositivo que vuelve a entrar conserva su apodo original (no crea otro jugador).

**Apodo**
- 2 a 20 caracteres. Permitidos: A-Z, a-z, 0-9, tildes españolas (áéíóúüñ y mayúsculas), espacio, punto, guion y guion bajo. Se recortan los bordes y se juntan espacios repetidos. Mínimo 2 letras o números. **Sin emojis**.
- "Ana", "ANÁ" y "ana" son el mismo apodo en una sala. La base manda (`players.nickname_key`).

**Juego**
- Pistas (calculadas **solo en la base**, en `submit_attempt`): 🔥 `fire` coincide tipo y generación; 🌡️ `warm` solo uno de los dos; ❄️ `cold` ninguno. "Coincide en tipo" = comparten al menos un tipo.
- **Gana** quien envía exactamente el Pokémon secreto (mismo `pokemon.id`); un 🔥 que no es el secreto no gana. Un ganador por sala, garantizado por la base (bloqueo de la sala + índice único parcial).
- Con ganador, la sala queda **terminada** (`rooms.finished_at`): sigue abierta, no acepta más intentos (`ROUND_FINISHED`) hasta que el admin la cierre (Paso 6). Reiniciar con otro secreto es de la Fase 3 (decisión del cliente: "a menos que el administrador la reinicie y ponga otro Pokémon").
- Se permite repetir un intento (el aviso antes de repetir es de la Fase 2). Freno: 1 intento por segundo por jugador; la espera definida por el admin llega en la Fase 2.
- Los intentos se **guardan en la base hasta cerrar la sala** (decisión del cliente en el Paso 5): apodo, Pokémon e icono. El chat de conversación de la Fase 2 seguirá sin guardarse.
- Los jugadores no ven tipos ni generación, solo nombres. El admin ve el nombre del secreto en su panel.
- Formas regionales usan su propia generación y tipos. Sin Mega ni Gigamax.
- `pokemon.id` (1 a 1082) es la clave del juego. `dex_number` se repite en formas regionales y nunca es clave.
- Buscador: minúsculas, sin tildes, solo a-z0-9. Nidoran♀ y Nidoran♂ comparten clave. Se carga la lista completa una vez en el navegador (`/api/pokemon/names`) y se filtra ahí.
- Supabase devuelve máximo 1000 filas por petición y hay 1082 Pokémon: la lista se pide en páginas.
- Excluido por código: Basculin de Hisui (`basculin-white-striped`). El JSON no se toca.

**Pantalla (provisional)**
- Intentos: el más nuevo arriba. Cada uno lleva el icono con texto oculto para lectores de pantalla ("Fuego", "Tibio", "Hielo").
- Lectura del feed: cada 2 s (5 s con la sala terminada); en segundo plano no hace peticiones; tras 3 fallos seguidos muestra el botón Reintentar.

**Operación**
- Logs: JSON con `request_id`, sin datos personales.
- Credenciales solo en variables de entorno; nunca se pegan en el chat.
- Chat de conversación (Fase 2): sin persistencia (Realtime Broadcast), se borra al cerrar la sala.

## 10. Base de datos

- `public.pokemon`: 1082 filas, RLS activo, sin políticas.
- `public.pokemon_names` (vista): id, nombre_es, search_key.
- `public.normalize_name(text)`: pura e inmutable.
- `public.rooms`: id, room_code, admin_code_hash, secret_pokemon_id (FK), status (open/closed), created_at, closed_at, **finished_at (Paso 5, nullable)**.
- `public.rate_limits` y `rate_limit_hit(text,int,int)`.
- `rooms_enforce_open_limit()` + trigger: máximo 10 salas abiertas (solo cuenta las de las últimas 24 horas). Error `53400`.
- `public.players` + `players_enforce_room_rules()` (sala abierta `P0001`, menos de 100 jugadores `53400`).
- **`public.attempts` (Paso 5)**: id (identity), room_id (FK cascade), player_id (FK cascade), pokemon_id (FK), result (`fire|warm|cold`), is_winner, created_at. Restricciones: un ganador debe ser `fire`; **índice único parcial: un ganador por sala**. Índices: (room_id, id), (player_id, created_at desc), pokemon_id. RLS activo, 0 políticas, **0 privilegios para todos los roles**.
- **`submit_attempt(room_id, session_hash, pokemon_id)`** (SECURITY DEFINER, `search_path` vacío, solo `service_role`): bloquea la sala, valida (sala abierta y no terminada, jugador de esa sala, Pokémon existente, 1 intento/s), calcula la pista, guarda, decide el ganador y marca la sala. Devuelve `o_outcome` (`ok`, `unknown_room`, `room_closed`, `round_finished`, `not_player`, `unknown_pokemon`, `cooldown`), `o_result`, `o_is_winner`.
- **`list_attempts(room_id, after, limit)`** (SECURITY DEFINER, solo `service_role`): intentos con apodo y nombre del Pokémon, del más viejo al más nuevo; sin `after` devuelve los últimos N. Nunca devuelve tipos ni generación.

Migraciones (cada una con rollback documentado):
- `20261101223300_create_pokemon`
- `20261102222755_create_rooms`
- `20261102225304_limit_open_rooms`
- `20261105002410_create_players`
- `20261106004125_create_attempts` (Paso 5, **ya aplicada** en la base de pruebas; solo expande, no cambia nada existente)

## 11. Verificación

| Comprobación | Estado |
|---|---|
| pgTAP Pasos 2 y 3 | 63 y 64 pruebas, 0 fallos (reportado antes) |
| pgTAP Paso 4 (`players_rls.test.sql`, 20 pruebas) | escritas, **NO ejecutadas** |
| pgTAP Paso 5 (`attempts_rls.test.sql`, 44 pruebas) | escritas, **NO ejecutadas como pgTAP**: el entorno del Programador no permitió crear la extensión ni correr `supabase test db`. Comando: `supabase test db` |
| Comprobaciones SQL equivalentes del Paso 5 (30) | **Ejecutadas contra la base de pruebas** en una transacción que se revirtió sola: permisos, pistas fire/warm/cold, ganador único, `ROUND_FINISHED`, freno de 1 s, sala cerrada, jugador ajeno, feed y cursor, restricciones. **30 de 30 pasaron.** No cubren: DELETE en cascada de sala (verificado solo por la definición de la FK) ni el tope de 100 jugadores |
| Vitest | 37 pruebas nuevas del Paso 5 pasan con un sustituto local y `zod/v4`; todas las demás pruebas existentes pasan salvo un `toThrow` que el sustituto no implementa (`lib/validation/pokemon.test.ts`). **No es Vitest real ni el Zod 4 exacto del proyecto** |
| `tsc` estricto | pasa en lib/ y services/ con declaraciones de reemplazo. **app/ y components/ NO se pudieron comprobar** (faltan Next y React en el entorno): lo hace el build de Vercel |
| `next build`, lint | **No ejecutados** por el Programador. El cliente debe confirmar el despliegue **Ready** en Vercel |
| Paso 5 de punta a punta en Producción | **Sin probar** (pendiente: guion de prueba del Paso 5) |
| Trigger de 100 jugadores | Sin probar |

## 12. Excepciones de accesibilidad aceptadas

Ninguna.

## 13. Temporizadores y tope de 100 mensajes/s

**BORRADOR. Falta que el cliente lo confirme y debe cerrarse antes de pedir la confirmación de la Fase 2.** (Sin cambios de fondo en el Paso 5.)

**13.1 Principio.** El reloj vive en la base de datos, no en un proceso. Cada plazo es una columna `timestamptz` en UTC. Nadie "ejecuta" un temporizador: alguien nota que venció y pide aplicarlo, y la base lo aplica una sola vez.

**13.2 Plazos**

| Plazo | Dónde vive | Quién lo dispara |
|---|---|---|
| Salto de turno (20 s, modo A) | `rooms.turn_deadline_at` + `turn_seq` | Clientes, la siguiente acción en la sala y el respaldo de la base |
| Inicio de sala (5 min) | `rooms.start_deadline_at` | Igual que el anterior |
| Cierre por sala vacía (5 min) | `players.last_seen_at` | Solo el respaldo de la base (con la sala vacía no hay clientes) |

- Una función `SECURITY DEFINER` con `search_path` vacío hace `UPDATE ... WHERE turn_seq = <esperado> AND turn_deadline_at <= now()`. Si 100 clientes la llaman a la vez, solo uno gana.
- Clientes: al llegar su cuenta regresiva a 0, llaman con un retraso aleatorio de 0 a 1,5 s (el admin, sin retraso). La cuenta regresiva usa el `now()` del servidor.
- Respaldo: `pg_cron` en Supabase, barrido cada 10 a 15 s. **Verificado en el Paso 5 solo que `pg_cron` está disponible para instalar en el proyecto de pruebas; no está habilitado ni se probó su frecuencia mínima.** Alternativa: barrido perezoso más una tarea de GitHub Actions cada 5 minutos solo para salas vacías.
- Antes de contar las 10 salas abiertas al crear una nueva, se ejecuta el barrido: una sala muerta nunca bloquea cupo.
- Latidos: cada jugador avisa cada 30 a 60 s por HTTP (escritura en la base, no mensajes de Realtime).
- Precisión aceptada: el salto de turno puede aplicarse 1 a 3 s tarde. **Decisión del cliente por confirmar.**

**13.3 Tope de 100 mensajes por segundo**
- Supuesto a confirmar en la prueba de carga: cada entrega a un suscriptor cuenta como un mensaje (un evento a 100 jugadores cuesta 100).
- El tope de 200 conexiones simultáneas también limita: dos salas llenas ya no caben.
- Todo sale del servidor; los clientes solo reciben. Un canal privado por sala (los canales privados exigen sesión de Supabase Auth, que hoy no existe: es parte del costo de Realtime).
- Lotes: cada sala difunde como máximo un lote cada T segundos (intentos, pistas y chat juntos). Presupuesto global: 70 entregas por segundo. Con S suscriptores activos, T = máx(1 s, S ÷ 70).
- Tope global de jugadores: `CAPACITY_REACHED` (503). Valor inicial 150, supuesto hasta la prueba de carga.
- Sin Presence: la lista de jugadores viaja dentro del lote o por GET con caché.
- **Decisión del Paso 5 (aprobada por el cliente): los intentos se leen por sondeo con cursor** (`/api/rooms/[roomCode]/feed`), no por Realtime. No gasta cupo de Realtime ni conexiones. Costo: peticiones a Vercel y a la base. Con 100 jugadores sondeando cada 2 s son ~50 peticiones por segundo, cada una con 2 consultas (3 cuando pide la lista de jugadores, cada ~10 s). **No verificado:** el límite mensual de invocaciones de Vercel Hobby; el Integrador debe reconfirmarlo antes de la prueba de carga. Si la prueba muestra que no alcanza, se cambia solo `components/useRoomFeed.ts`.
- Plan C si el sondeo no alcanza: Realtime en lotes (arriba).

## 14. Pendientes técnicos

- Correr `supabase test db` (20 pruebas del Paso 4 + 44 del Paso 5 + las anteriores); idealmente en GitHub Actions (Integrador).
- Fijar la versión de Node.
- Confirmar el dominio oficial de producción.
- **Paso 6:** dar UPDATE a `rooms` y una función de cierre que también borre los `attempts` de la sala; UPDATE/DELETE a `players` (expulsar) en la Fase 2.
- CSP probada con Realtime.
- Generar los tipos de Supabase (`supabase gen types typescript`).
- Cierre automático de salas abandonadas (Fase 3).
- Cierre de la sección 13 antes de pedir la confirmación de la Fase 2.
- Para el Integrador (Fase 3): proteger `main` con checks, crear el Upstash definitivo, medir cuántos jugadores totales aguanta el proyecto, reconfirmar el límite de invocaciones de Vercel Hobby.
- Para el cliente: logo y HEX; revisar nombres en español de las generaciones 3 a 8; decidir los nombres de los 3 Tauros de Paldea.
- Salas de prueba abiertas (5 al 5-nov-2026 por la consulta del Programador) ocupan cupo de las 10 hasta el Paso 6 o 24 horas.

## 15. Incidente resuelto (lección)

El 4-nov-2026, "Crear sala" en Producción respondía "El servicio no está disponible". Causa (registros de Vercel): `42501 permission denied for function rate_limit_hit`. `SUPABASE_SERVICE_ROLE_KEY` en Producción no tenía la clave `service_role`. El cliente la corrigió, hizo Redeploy y funcionó. Desde el Paso 4 `/api/health` detecta este caso (devuelve 503).

## 16. Versiones de entrega y changelog

| Entrega | Versión |
|---|---|
| Diseño | ninguna (interfaz provisional) |
| Backend | backend-v0.5 |
| Contrato | contract-v0.5 |

- **backend-v0.5 / contract-v0.5**: Paso 5. Tabla `attempts`, `rooms.finished_at`, `submit_attempt` y `list_attempts`, `submitAttemptAction`, feed por sondeo con cursor, buscador, pantalla de juego y vista del admin, código `ROUND_FINISHED`. Elimina `GET /api/rooms/[roomCode]/players` y `PlayerLobby`. Agrega `.env.example` y `.gitignore`.
- **v0.4**: Paso 4. Tabla `players`, entrada de jugador, lista por sondeo, `/api/health` con consulta a la base.
- **v0.3**: Paso 3. `rooms`, límite de 10 salas, `rate_limit_hit`, crear sala y entrada de admin.
- **v0.2**: Paso 2. `pokemon` (1082), `pokemon_names`, `normalize_name`, RLS.
- **v0.1**: Paso 1. Sitio base y `/api/health`.

## 17. Para retomar en otro chat

**Estado del proyecto**
- Pasos 1 a 4 cerrados y confirmados. **Paso 5 entregado, pendiente de que el cliente lo pruebe y confirme.**
- Siguiente: **Paso 6**, cerrar sala (el enlace deja de permitir jugar; se borran los intentos).
- La sección 13 sigue en borrador.

**Reglas de trabajo**
- Un paso a la vez, con "Cómo sé que funcionó" y "Qué haces tú ahora". No se empieza el siguiente sin confirmación del cliente.
- Un ZIP y un solo commit en inglés por paso (Conventional Commits).
- Explicaciones en español; código, commits y comentarios en inglés.
- El Programador no puede leer el repo desde el chat: lo mejor es un ZIP completo del repo (sin `node_modules`, `.next` ni `.env.local`).
- Se prueba siempre en la dirección de Producción de Vercel.
- El Programador tiene conexión al Supabase de pruebas (ref `hizsxxuipewlwbjbwzic`). No pedir conexión al definitivo. Su herramienta de SQL pide confirmación para `delete`/`update`/`create extension` y el cliente de este chat la cancela: por eso las pruebas se hicieron sin esas sentencias.
- El cliente no puede instalar Node.js: tipos, lint y build los da el despliegue de Vercel.
