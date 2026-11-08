# CONTRACTS — Emerald City

**contract-v0.12** · **backend-v0.10** · diseño: ninguna entrega todavía (interfaz provisional) · **Fase 1 completa. Fase 2: Pasos 7+8 y 9+10 probados por el cliente en Producción. Siguiente bloque: Pasos 11+12. Este proyecto se va a UNIR con otro proyecto que ya existe: ver sección 18 (la completa el Brief antes de enviar el contrato)**

> Contrato compartido entre Programador, Diseñador e Integrador. Lo mantiene el Programador. El Diseñador aporta la tabla de nombres; el Integrador solo lee y audita.
> Fusiona el contract-v0.11 con la sección 18 (unión con otro proyecto existente). Por petición del cliente la Fase 2 se entrega en bloques: 7+8, 9+10, 11+12. No inventar nada que no esté aquí; lo no verificado está marcado como tal.

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
| Botón Cerrar sala con confirmación — **Paso 6** | `components/AdminControls.tsx` (CloseRoomButton) | provisional |
| Botón "Empezar ya" y campo de espera entre intentos del admin — **nuevo Pasos 9+10** | `components/AdminControls.tsx` (StartRoomButton, CooldownControl) | provisional |
| Sala de espera (cuenta regresiva, jugadores que llegaron) — **nuevo Pasos 9+10** | `components/WaitingRoom.tsx` | provisional |
| Opciones de la sala al crearla (espera entre intentos, minutos de sala de espera) — **nuevo Pasos 9+10** | `components/RoomForms.tsx` (CreateRoomForm, `<details>`) | provisional |
| Tabla lateral de pistas — **nuevo Pasos 7+8** | `components/HintsTable.tsx` | provisional |
| Chat de conversación — **nuevo** | `components/ChatPanel.tsx` | provisional |
| Aviso "ya intentaron ese Pokémon" (confirmar antes de repetir) — **nuevo** | `components/PokemonPicker.tsx` (repeatOf) | provisional |
| Panel de admin y entrada con código (con la partida en vivo, chat y Cerrar sala) | `app/sala/[roomCode]/admin/page.tsx` + AdminLoginForm | provisional |
| Estilos de botones y campos | `lib/ui.ts` | provisional |
| Tokens | `app/globals.css` (ec-bg, ec-surface, ec-primary EXAMPLE, ec-text, ec-muted) | provisional |
| Iconos de pista ❄️ 🌡️ 🔥 y sus etiquetas — **nuevo** | `lib/feed-types.ts` (HINT_META) | provisional |
| Acciones de sala | `app/actions/rooms.ts` | definitivo |
| Acción de entrada de jugador | `app/actions/players.ts` (joinRoomAction) | definitivo |
| Acción de enviar intento | `app/actions/attempts.ts` (submitAttemptAction) | definitivo |
| Acción de enviar mensaje de chat — **nuevo** | `app/actions/chat.ts` (sendChatMessageAction) | definitivo |
| Acción de cerrar sala | `app/actions/rooms.ts` (closeRoomAction) | definitivo |
| Acciones de empezar ya y cambiar la espera — **nuevo Pasos 9+10** | `app/actions/rooms.ts` (startRoomAction, updateCooldownAction) | definitivo |
| Servicio de salas | `services/rooms.service.ts` | definitivo |
| Servicio de jugadores | `services/players.service.ts` | definitivo |
| Servicio de intentos y pistas | `services/attempts.service.ts` | definitivo |
| Servicio de chat — **nuevo** | `services/chat.service.ts` | definitivo |
| Armado del feed (intentos + chat + pistas + jugadores) — **nuevo** | `services/feed.service.ts` | definitivo |
| Servicio de Pokémon | `services/pokemon.service.ts` | definitivo |
| Códigos | `lib/room-codes.ts` (puro), `lib/room-secrets.ts` (solo servidor) | definitivo |
| Sesión del jugador | `lib/player-session.ts` | definitivo |
| Resultado `{ data, error }` | `lib/result.ts` | definitivo |
| Límite de intentos (rate limit) | `lib/rate-limit.ts` | definitivo |
| Pokémon: esquema, normalización, buscador | `lib/validation/pokemon.ts`, `lib/normalize-name.ts`, `lib/pokemon-search.ts` | definitivo |
| Validación de salas / apodo / intentos y feed / chat | `lib/validation/rooms.ts`, `lib/validation/players.ts`, `lib/validation/attempts.ts`, `lib/validation/chat.ts` | definitivo |
| Mezcla y orden de pistas (navegador) — **nuevo** | `lib/feed-hints.ts` | definitivo |
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
| service_role | `rooms` | ✓ | ✓ | ✗ | ✗ | n/a. `rooms.finished_at` lo escribe solo `submit_attempt()`; el cierre (`status`, `closed_at`) solo `close_room()`; **`phase` solo `submit_attempt()`, `apply_due_timers()` y `start_room()`; `attempt_cooldown_seconds` solo `set_attempt_cooldown()`** |
| todos | `rate_limits` | ✗ | ✗ | ✗ | ✗ | ninguna. Solo vía `rate_limit_hit` |
| anon, authenticated | `players` | ✗ | ✗ | ✗ | ✗ | ninguna |
| service_role | `players` | ✓ | ✓ | ✗ (Fases 2 y 3) | ✗ (expulsar: Fases 2 y 3). `close_room()` los borra al cerrar la sala | n/a |
| anon, authenticated, **service_role** | `attempts` | ✗ | ✗ | ✗ | ✗ | ninguna. **Nadie** tiene privilegios directos: solo `submit_attempt()` y `list_attempts()` (SECURITY DEFINER, solo `service_role`). El Paso 6 borrará los intentos con una función de cierre |

| anon, authenticated, **service_role** | `chat_messages` | ✗ | ✗ | ✗ | ✗ | ninguna. Nadie tiene privilegios directos: solo `post_chat_message()`, `post_admin_chat_message()` y `list_chat()` (SECURITY DEFINER, solo `service_role`). `close_room()` lo borra al cerrar |

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
| 409 | **ALREADY_TRIED** | **nuevo (Pasos 7+8)**: alguien ya envió ese Pokémon; la pantalla pide confirmar. Se repite el envío con `confirmRepeat: true` |
| 409 | **ROOM_NOT_STARTED** | **nuevo (Pasos 9+10)**: la sala sigue en espera; no se aceptan intentos todavía |
| 429 | RATE_LIMITED (en acciones va en `details.retryAfter`, en segundos) | en uso (también: espera entre intentos; desde los Pasos 9+10 `retryAfter` es lo que de verdad falta, no siempre 1) |
| 500 | INTERNAL | en uso |
| 503 | EXTERNAL_SERVICE_UNAVAILABLE | en uso |

## 8. Endpoints y límites de intentos

Almacén de límites: Supabase, ventana fija, **falla cerrado**. Clave: hash de la primera IP de `x-forwarded-for`.

| Endpoint | Tipo | Límite | Clave |
|---|---|---|---|
| createRoomAction | Server Action | 10 por hora | hash de IP |
| loginAdminAction | Server Action | 10 por 10 minutos | hash de IP |
| joinRoomAction | Server Action | 60 por 10 minutos | hash de IP + sala |
| **sendChatMessageAction** | Server Action | 10 mensajes por minuto por jugador y 30 por minuto el admin, aplicados en la base. Sin límite por IP | jugador (id) / sala |
| **closeRoomAction** | Server Action | sin límite propio: exige la cookie secreta de admin y cerrar dos veces es inofensivo (la segunda responde `ROOM_CLOSED`) | cookie de admin |
| **submitAttemptAction** | Server Action | **una espera entre intentos por jugador, definida por el admin (1 a 120 s; por defecto 3 s al crear la sala; salas anteriores al Paso 9: 1 s)**, aplicada en la base (`submit_attempt`). Sin límite por IP | jugador (id) |
| **startRoomAction** | Server Action | sin límite propio: exige la cookie secreta de admin y repetirla no cambia nada (`started: false`) | cookie de admin |
| **updateCooldownAction** | Server Action | sin límite propio: exige la cookie secreta de admin; rango 1 a 120 validado en Zod y en la base | cookie de admin |
| **GET /api/rooms/[roomCode]/feed** | Route Handler | sin límite propio | exige cookie secreta de jugador o de admin; sin cookie responde 401 sin tocar la base |
| **GET /api/pokemon/names** | Route Handler | ninguno; respuesta cacheada por la CDN 24 h | público (solo nombres) |
| GET /api/health | Route Handler | ninguno | público |

- La cookie de admin no tiene límite propio: el código tiene 60 bits (32^12).
- **Riesgo conocido:** 60 entradas por IP y sala puede bloquear a los últimos si más de 60 personas entran desde una misma red en 10 minutos. Revisar en la prueba de carga.
- **Riesgo conocido (Paso 5):** `/api/pokemon/names` es público; si la CDN no cachea, cada llamada hace 2 consultas. Revisar en la prueba de carga.

Respuestas de los Route Handlers:
- `GET /api/rooms/[roomCode]/feed?after=<id>&chatAfter=<id>&players=1`: `{ data: { status: "waiting"|"playing"|"finished", cooldownSeconds, startDeadlineAt: string|null, serverNow: string|null, attempts: [{ id, nickname, pokemon, result: "fire"|"warm"|"cold", isWinner }], cursor, chat: [{ id, nickname, body, isAdmin }], chatCursor, hasMore, hints: [{ pokemon, result: "fire"|"warm" }]|null, players: string[]|null }, error: null }`. Sin `after`/`chatAfter` devuelve los últimos 50 de cada uno; con cursor, hasta 100 más nuevos (`hasMore` avisa si hay más). `players=1` pide el refresco completo (lista de jugadores y tabla de pistas): el navegador lo pide cada ~10 s. Estados 200, 400, 401, 404, 409 (sala cerrada), 500, 503. Nunca devuelve tipos, generación, ni hash de sesión.
- `GET /api/pokemon/names`: `{ data: { names: [{ id, nombre_es, search_key }] }, error: null }`. Cache-Control `public, max-age=3600, s-maxage=86400`.
- `GET /api/health`: 200 `{ data: { status: "ok" } }`; 500 si el entorno es inválido; 503 si la base no responde o la clave de servidor no es `service_role`. Sin detalles internos. Consulta Supabase, lo que también evita la pausa de Supabase Free.

Respuesta de `closeRoomAction`: `{ data: { closed: true }, error: null }`; errores `VALIDATION_ERROR`, `FORBIDDEN` (sin cookie de admin o cookie incorrecta), `NOT_FOUND`, `ROOM_CLOSED`, `EXTERNAL_SERVICE_UNAVAILABLE`. Borra la cookie de admin al cerrar.

Respuesta de `sendChatMessageAction`: `{ data: { id }, error: null }`; errores `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `ROOM_CLOSED`, `RATE_LIMITED` (`details.retryAfter` = 10), `EXTERNAL_SERVICE_UNAVAILABLE`.

Entrada de `submitAttemptAction`: `{ roomCode, pokemonId, confirmRepeat? }`. Sin `confirmRepeat`, si alguien ya envió ese Pokémon en la sala responde `ALREADY_TRIED` sin guardar nada (antes verifica que quien pregunta sea jugador de la sala).

Respuesta de `submitAttemptAction`: `{ data: { result: "fire"|"warm"|"cold", isWinner }, error: null }`. Errores nuevos (Pasos 9+10): `ROOM_NOT_STARTED` (sala en espera) y `RATE_LIMITED` con `details.retryAfter` = segundos que faltan.

Entrada de `createRoomAction`: `{ pokemonId, cooldownSeconds?, waitMinutes? }` (por defecto 3 s y 5 min; `waitMinutes` 0 = sin sala de espera, la sala nace en juego; máximo 60). Respuesta de `startRoomAction`: `{ data: { started: boolean }, error: null }` (`false` = ya había empezado); errores `VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `ROOM_CLOSED`, `EXTERNAL_SERVICE_UNAVAILABLE`. Respuesta de `updateCooldownAction` (entrada `{ roomCode, seconds }`): `{ data: { seconds }, error: null }`, mismos errores.

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
- **Espera entre intentos (Paso 9):** la define el admin (1 a 120 s) al crear la sala (por defecto 3 s) y puede cambiarla desde su panel; vale desde el siguiente intento de todos. La aplica `submit_attempt` por jugador. El botón del jugador cuenta hacia atrás después de cada envío (con la espera que trae el feed) y, si la base lo frena, con los segundos que faltan (`retryAfter`).
- **Sala de espera (Paso 10):** al crear la sala el admin elige cuántos minutos dura (0 a 60; por defecto 5; 0 = sin sala de espera). En `waiting` los jugadores entran, ven la lista, la cuenta regresiva y el chat; no ven buscador ni intentos. Pasa a `playing` cuando el admin pulsa "Empezar ya" (`start_room`) o cuando vence `start_deadline_at`: lo aplica **una sola vez** `apply_due_timers` (la lectura del feed la llama mientras la sala está en espera) o el primer intento después del plazo (`submit_attempt`). Si vence con 0 jugadores la sala pasa igual a `playing` y no se cierra (el cierre automático es de la Fase 3). El plazo se calcula con el reloj de Vercel al crear la sala (posible desfase de décimas de segundo con la base); la cuenta regresiva usa `serverNow` de la base.
- **Sin `pg_cron` en este bloque** (decisión del cliente): los plazos se aplican al leer. `pg_cron` queda para el cierre de salas vacías (Fase 3).
- Se permite repetir un intento, pero la pantalla avisa y pide confirmar si **alguien de la sala** ya lo envió (Pasos 7+8). El aviso es de cortesía: la base no lo exige.
- **Tabla lateral de pistas:** lista de los Pokémon de la sala que dieron 🔥 o 🌡️ (nunca ❄️), sin repetidos, fuego primero y luego orden alfabético. Se llena en vivo con los intentos nuevos y se completa cada ~10 s desde la base (máximo 500).
- **Chat de conversación (Pasos 7+8):** mensajes de 1 a 200 caracteres (se quitan saltos de línea y espacios repetidos), guardados en la base hasta cerrar la sala; `close_room()` los borra (incluidos los del admin). Los mensajes del admin se muestran como "Admin". Funciona también con la partida terminada. Límite: 10 por minuto por jugador y 30 el admin (constante en la base; en la Fase 3 el admin lo personaliza). El filtro de groserías es de la Fase 3. Sin mensajes privados ni edición. Freno: 1 intento por segundo por jugador; la espera definida por el admin llega en la Fase 2.
- **Cerrar sala (Paso 6):** solo el admin. Al cerrar se **borran los intentos y los jugadores (apodos)** de la sala (BRIEF: "nada al cerrar la sala"); la fila de la sala se queda (código, hash, estado cerrado, sin datos personales), así que el enlace responde "Sala no disponible". Los jugadores que siguen abiertos lo notan en su siguiente lectura del feed (hasta 5 s) y ven esa pantalla. Cerrar libera un cupo de las 10 salas.
- Los intentos se **guardan en la base hasta cerrar la sala** (decisión del cliente en el Paso 5): apodo, Pokémon e icono. El chat de conversación de la Fase 2 seguirá sin guardarse.
- Los jugadores no ven tipos ni generación, solo nombres. El admin ve el nombre del secreto en su panel.
- Formas regionales usan su propia generación y tipos. Sin Mega ni Gigamax.
- `pokemon.id` (1 a 1082) es la clave del juego. `dex_number` se repite en formas regionales y nunca es clave.
- Buscador: minúsculas, sin tildes, solo a-z0-9. Nidoran♀ y Nidoran♂ comparten clave. Se carga la lista completa una vez en el navegador (`/api/pokemon/names`) y se filtra ahí.
- Supabase devuelve máximo 1000 filas por petición y hay 1082 Pokémon: la lista se pide en páginas.
- Excluido por código: Basculin de Hisui (`basculin-white-striped`). El JSON no se toca.

**Pantalla (provisional)**
- Intentos: el más nuevo arriba. Cada uno lleva el icono con texto oculto para lectores de pantalla ("Fuego", "Tibio", "Hielo").
- Lectura del feed: cada 2 s (5 s con la sala terminada); en segundo plano no hace peticiones; tras 3 fallos seguidos muestra el botón Reintentar. En la sala de espera pide la lista de jugadores cada ~4 s (antes ~10 s).

**Operación**
- Logs: JSON con `request_id`, sin datos personales.
- Credenciales solo en variables de entorno; nunca se pegan en el chat.
- Chat de conversación: se guarda en la base hasta cerrar la sala (como los intentos, por sondeo) y `close_room()` lo borra. Cambio aprobado respecto del brief.

## 10. Base de datos

- `public.pokemon`: 1082 filas, RLS activo, sin políticas.
- `public.pokemon_names` (vista): id, nombre_es, search_key.
- `public.normalize_name(text)`: pura e inmutable.
- `public.rooms`: id, room_code, admin_code_hash, secret_pokemon_id (FK), status (open/closed), created_at, closed_at, finished_at (Paso 5, nullable), **attempt_cooldown_seconds (Paso 9; entero 1 a 120, por defecto 1), phase (Paso 10; `waiting`|`playing`, por defecto `playing`) y start_deadline_at (Paso 10; timestamptz UTC, nullable; obligatorio si la fase es `waiting`)**. Las salas anteriores quedan en `playing` con 1 s.
- `public.rate_limits` y `rate_limit_hit(text,int,int)`.
- `rooms_enforce_open_limit()` + trigger: máximo 10 salas abiertas (solo cuenta las de las últimas 24 horas). Error `53400`.
- `public.players` + `players_enforce_room_rules()` (sala abierta `P0001`, menos de 100 jugadores `53400`).
- **`public.attempts` (Paso 5)**: id (identity), room_id (FK cascade), player_id (FK cascade), pokemon_id (FK), result (`fire|warm|cold`), is_winner, created_at. Restricciones: un ganador debe ser `fire`; **índice único parcial: un ganador por sala**. Índices: (room_id, id), (player_id, created_at desc), pokemon_id. RLS activo, 0 políticas, **0 privilegios para todos los roles**.
- **`submit_attempt(room_id, session_hash, pokemon_id)`** (SECURITY DEFINER, `search_path` vacío, solo `service_role`): bloquea la sala, valida (sala abierta y no terminada, jugador de esa sala, Pokémon existente, 1 intento/s), calcula la pista, guarda, decide el ganador y marca la sala. Devuelve `o_outcome` (`ok`, `unknown_room`, `room_closed`, `round_finished`, `not_player`, `unknown_pokemon`, `cooldown`), `o_result`, `o_is_winner`. **Desde los Pasos 9+10** (reemplazada con `drop` + `create`, mismos permisos): lee la espera de la sala; en fase `waiting` responde `not_started` (después de `not_player`) o, si el plazo ya venció, la inicia ahí mismo; devuelve además `o_retry_after` (segundos que faltan, solo con `cooldown`).
- **`chat_messages` (Pasos 7+8)**: id, room_id (FK cascade), player_id (FK cascade; null = mensaje del admin), body (1 a 200, sin caracteres de control), created_at. RLS activo, 0 políticas, 0 privilegios. Índices (room_id, id) y (player_id, created_at desc). Nuevo índice `attempts (room_id, pokemon_id)`.
- **Funciones nuevas (SECURITY DEFINER, `search_path` vacío, solo `service_role`):** `was_tried(room, pokemon)`, `list_hints(room)`, `post_chat_message(room, session_hash, body)` y `post_admin_chat_message(room, body)` (toman la fila de la sala con `FOR SHARE` para no colarse mientras se cierra), `list_chat(room, after, limit)`.
- **`close_room(room_id)`** (Paso 6; desde los Pasos 7+8 también borra `chat_messages`; SECURITY DEFINER, `search_path` vacío, solo `service_role`): toma el mismo bloqueo por sala que el trigger de jugadores y la fila de la sala, borra `attempts` y `players` de la sala y marca `status = closed`, `closed_at`. Devuelve `true` si cerró, `false` si la sala no existe o ya estaba cerrada.
- **`list_attempts(room_id, after, limit)`** (SECURITY DEFINER, solo `service_role`): intentos con apodo y nombre del Pokémon, del más viejo al más nuevo; sin `after` devuelve los últimos N. Nunca devuelve tipos ni generación.
- **`apply_due_timers(room_id)`, `start_room(room_id)`, `set_attempt_cooldown(room_id, seconds)` (Pasos 9+10)** (SECURITY DEFINER, `search_path` vacío, solo `service_role`): `apply_due_timers` hace un solo UPDATE condicionado ("sigue en espera y ya venció") y devuelve fase, plazo y reloj de la base (ninguna fila si la sala no existe o está cerrada); `start_room` y `set_attempt_cooldown` devuelven si cambiaron una sala abierta; la segunda deja que la restricción de la tabla rechace valores fuera de rango (`23514`).

Migraciones (cada una con rollback documentado):
- `20261101223300_create_pokemon`
- `20261102222755_create_rooms`
- `20261102225304_limit_open_rooms`
- `20261105002410_create_players`
- `20261106004125_create_attempts` (Paso 5, aplicada)
- `20261107181838_hints_and_chat` (Pasos 7+8, **aplicada** por el Programador en la base de pruebas; solo expande)
- `20261108005307_wait_room_and_cooldown` (Pasos 9+10, **aplicada** por el Programador en la base de pruebas con confirmación del cliente; expande datos, reemplaza `submit_attempt` y **quita** `list_clues` y `find_previous_attempt`; rollback documentado en el archivo)
- `20261107190000_close_room_erases_chat` (Pasos 7+8, **aplicada por el cliente** en el SQL Editor; el Programador comprobó que la definición de `close_room` ya menciona `chat_messages`. No queda en el historial de migraciones de Supabase; nombre provisional)
- `20261106200000_close_room` (Paso 6, **aplicada por el cliente** en el SQL Editor de la base de pruebas; el Programador verificó que existe y que solo `service_role` puede ejecutarla. No queda registrada en el historial de migraciones de Supabase; el nombre del archivo es provisional)

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
| Paso 5 de punta a punta en Producción | **El cliente hizo dos pruebas y reportó que funcionaron.** No se confirmó cuáles casos cubrieron (doble tipo, forma regional, panel de admin, rechazo tras el ganador) |
| pgTAP Paso 6 (`close_room_rls.test.sql`, 17 pruebas) | escritas, **NO ejecutadas como pgTAP** |
| Simulación de 10 partidas en la base (6-nov-2026) | **Ejecutada** contra la base de pruebas en una transacción que se revirtió sola: 10 salas con secretos al azar (incluye formas regionales), 4 jugadores por sala, 3 pistas comparadas con un cálculo independiente, ganador, rechazo tras ganar, un solo ganador, feed, cierre que borra intentos y apodos, rechazo tras cerrar y segundo cierre en falso. **110 comprobaciones, 0 diferencias.** No cubre la capa web (Server Actions, rutas, pantalla) ni simultaneidad real de varios teléfonos |
| Vitest Paso 6 (6 pruebas: `closeRoom` y su validación) | pasan con el sustituto local; tipos de lib/ y services/ pasan. `closeRoomAction`, `AdminControls.tsx` y la pantalla: solo los comprueba el build de Vercel |
| Cerrar sala en la base | **Probado** en la simulación anterior |
| pgTAP Pasos 7+8 (`hints_chat_rls.test.sql`, 44 pruebas; `close_room_rls.test.sql` sube a 19) | escritas, **NO ejecutadas como pgTAP** |
| Comprobaciones SQL de los Pasos 7+8 (34) | **Ejecutadas** contra la base de pruebas en una transacción que se revirtió sola: permisos, `was_tried`, tabla de pistas, chat (límites, cierre, admin, cursores). 33 pasaron; 1 falló por un error de **mi expectativa** (la función devolvió el resultado correcto). El borrado del chat en `close_room` **no se probó** (migración pendiente) |
| Vitest Pasos 7+8 | 54 pruebas nuevas o actualizadas pasan con el sustituto local; tipos de lib/ y services/ pasan. Acciones, ruta, componentes y pantalla: solo el build de Vercel |
| **Simulación de 10 partidas con los Pasos 7+8 (7-nov-2026)** | **Ejecutada** contra la base de pruebas en una transacción que se revirtió sola (comprobado después: 0 jugadores, 0 intentos, 0 mensajes de más). Por partida: secreto al azar (incluye formas regionales), 6 jugadores, 5 intentos con pista comparada contra un cálculo independiente (uno repetido a propósito: `was_tried` correcto), ganador, tabla de pistas igual a un cálculo independiente y sin ❄️, chat de los 6 jugadores y del admin, límite de 10 mensajes por minuto (exactamente 9 más aceptados tras el primero), chat que sigue funcionando con la partida terminada, intento rechazado tras ganar, cierre que borra intentos, jugadores y chat (incluido el del admin), rechazo de intento, chat y chat de admin tras cerrar, y segundo cierre en falso. **290 comprobaciones, 0 fallos.** No cubre la capa web ni la simultaneidad real de varios teléfonos |
| pgTAP Pasos 9+10 (`wait_room_cooldown.test.sql`, 32 pruebas) | escritas, **NO ejecutadas como pgTAP** |
| **Comprobaciones SQL de los Pasos 9+10 (38)** | **Ejecutadas** contra la base de pruebas (8-nov-2026) en una transacción que se revirtió sola: valores por defecto, restricciones, `not_started`, `not_player` antes que `not_started`, `apply_due_timers` (sin vencer, vencido, repetido, sala inexistente o cerrada), inicio por primer intento vencido, `start_room`, espera de 3 s con `retry_after`, cambiar la espera y esperar 1,2 s, rangos, chat en espera, `close_room` en espera, permisos. **38 de 38 pasaron.** No cubren concurrencia real (100 lecturas a la vez del mismo plazo) |
| Vitest Pasos 9+10 | pruebas nuevas o actualizadas en `lib/validation/rooms.test.ts`, `lib/feed-parse.test.ts`, `services/rooms.service.test.ts`, `services/attempts.service.test.ts` y `services/feed.service.test.ts`: **NO ejecutadas** (el entorno del Programador no tiene `node_modules` ni red). Comando: `npm test` |
| `tsc`, lint, `next build` (Pasos 9+10) | **NO ejecutados**; los da el despliegue de Vercel |
| Trigger de 100 jugadores | Sin probar |

## 12. Excepciones de accesibilidad aceptadas

Ninguna.

## 13. Temporizadores y tope de 100 mensajes/s

**APROBADA por el cliente el 6-nov-2026 (D1 a D4 respondidas, ver 13.4).**

### 13.1 Datos verificados (6-nov-2026) y datos que faltan

| Dato | Valor | Origen |
|---|---|---|
| Realtime, plan Free | 200 conexiones, 100 mensajes/s, 100 entradas a canales/s, carga máxima 256 KB. Si se pasa del tope, **desconecta** a los clientes | documentación de Supabase |
| `pg_cron` | Disponible (v1.6.4), **no habilitado** en el proyecto de pruebas. Permite tareas cada 1 a 59 **segundos** | documentación de Supabase + consulta a la base |
| Invocaciones de Vercel Hobby al mes | **1.000.000** (confirmado por el cliente en Vercel → Usage; llevaba 574 el 6-nov-2026). Las búsquedas web daban 100.000 o 1.000.000. **No verificado:** las 4 horas de CPU activa y los 360 GB-hora de memoria que mencionan fuentes recientes; el Integrador los revisa en la prueba de carga | cliente + búsquedas web |
| Inicio de sesión anónimo de Supabase (necesario para canales privados de Realtime) | **No verificado**; puede tener un límite por IP que afecte a 100 personas en una misma red | sin consultar |

### 13.2 Principio de los temporizadores
El reloj vive en la base de datos, no en un proceso: cada plazo es una columna `timestamptz` (UTC). Nadie "ejecuta" un temporizador: alguien nota que venció y pide aplicarlo, y la base lo aplica **una sola vez**.

| Plazo | Dónde vive | Quién lo aplica |
|---|---|---|
| Salto de turno (20 s por defecto, modo A) | `rooms.turn_deadline_at` + `rooms.turn_seq` | (1) la lectura del feed de esa sala; (2) el barrido de `pg_cron` |
| Inicio de sala (5 min por defecto) | `rooms.start_deadline_at` | igual |
| Cierre por sala vacía (5 min) | `rooms.last_activity_at` | solo el barrido de `pg_cron` (con la sala vacía nadie lee el feed) |
| Pistas automáticas (Fase 3) | `rooms.next_hint_at` | igual que el salto de turno |

- **Aplicación única:** una función `apply_due_timers(room_id)` (SECURITY DEFINER, `search_path` vacío, solo `service_role`) hace `UPDATE ... WHERE turn_seq = <esperado> AND turn_deadline_at <= now()`. Si 100 lecturas la piden a la vez, solo una cambia el turno. Cierra salas con `close_room()`.
- **Sin procesos de servidor y sin reintentos de los clientes:** con sondeo, cada lectura del feed ya llega al servidor, así que el servidor aplica el plazo vencido en esa misma lectura. No hace falta que los clientes "avisen" ni retrasos aleatorios.
- **Respaldo:** `pg_cron` cada 10 s llama a `apply_due_timers` para todas las salas abiertas. Cubre salas donde nadie lee. **Mientras `pg_cron` no esté habilitado**, el cierre por sala vacía no funciona (el brief lo pide en la Fase 3; el salto de turno sí funciona sin `pg_cron`).
- **Antes de contar las 10 salas abiertas** al crear una nueva, se aplica el cierre por vacío: una sala muerta no bloquea cupo.
- **Presencia:** cada jugador y el admin actualizan su `last_seen_at` / `rooms.last_activity_at` en la lectura que ya piden la lista de jugadores (cada ~10 s), con una escritura limitada a una por ~30 s. Sala "vacía" = nadie visto en 5 minutos.
- **Precisión aceptada:** el salto de turno se aplica 0 a 3 s tarde (el intervalo de lectura). **Decisión D3.**
- La cuenta regresiva que ve el jugador usa la hora del servidor enviada en el feed (`serverNow` y `turnDeadlineAt`), no el reloj del teléfono.

### 13.3 Cómo ven todos la partida: dos caminos, con números

| | **Sondeo con cursor (hoy)** | **Realtime en lotes (alternativa)** |
|---|---|---|
| Qué se gasta | Invocaciones de Vercel y consultas a la base, constantes aunque nadie juegue | Conexiones (1 por persona), mensajes por segundo (cada entrega cuenta) |
| 30 jugadores | 15 peticiones/s, ~54.000 por hora | 31 conexiones; ~20 mensajes/s en pleno juego libre |
| 50 jugadores | 25 peticiones/s, ~90.000 por hora | 51 conexiones; ~33 mensajes/s |
| 100 jugadores | 50 peticiones/s, ~180.000 por hora (**con intervalo de 4 s**, ver abajo: 25/s, ~90.000/h) | 101 conexiones; ~67 mensajes/s (casi todo el tope de 100). **Dos salas llenas no caben** (202 > 200 conexiones) |
| Modo A (turnos) | igual de caro (el sondeo no depende de los eventos) | muy barato: ~1 evento cada 20 s, unos 5 mensajes/s con 100 jugadores |
| Seguridad | Sin cambios: nadie lee la base directamente | Canal privado necesita Supabase Auth (inicio anónimo, límite sin verificar). Canal público con nombre secreto: cualquiera dentro de la sala podría inyectar mensajes falsos |
| Complejidad | Ya construido | Alta; reemplaza `useRoomFeed` y agrega difusión desde el servidor |

**Propuesta: seguir con el sondeo en la Fase 2**, con una palanca nueva: el servidor devuelve `nextPollMs` en cada lectura y **escala el intervalo con la cantidad de jugadores** (`máx(2 s, jugadores × 40 ms)`: 2 s hasta 50 jugadores, 4 s con 100). Así el costo nunca pasa de ~25 peticiones/s por sala llena y el tope se controla desde el servidor sin volver a desplegar a los teléfonos.
- **Cuándo cambiar a Realtime:** si el límite de Vercel resulta ser 100.000 al mes, o si la prueba de carga (Fase 3) muestra que el sondeo no aguanta. El cambio se limita a `components/useRoomFeed.ts` y al envío desde el servidor.
- **Presupuesto mensual:** con 1.000.000 de invocaciones y ~90.000 por hora a 50 jugadores, alcanza para unas 11 horas de juego a esa escala al mes (unas 18 horas con 30 jugadores). Suficiente para partidas de comunidad, pero hay que vigilar Vercel → Usage; el Integrador lo reconfirma en la prueba de carga.
- **Tope global de jugadores** entre todas las salas: `CAPACITY_REACHED` (503). Valor inicial **60** (lo esperado por el cliente, D1) hasta la prueba de carga. Con 60 jugadores el intervalo de lectura es de 2,4 s. El tope de 100 por sala se mantiene; la prueba de carga decide el real.
- **El chat de conversación (Fase 2) también usa el sondeo (D2, aprobada):** se guarda en la base hasta cerrar la sala, igual que los intentos, y `close_room()` lo borra al cerrar. Viaja en el mismo feed con su propio cursor. Esto **cambia el brief** (decía "sin persistencia, Realtime Broadcast"): aprobado por el cliente. Sigue guardando solo apodo y mensaje, y nada al cerrar la sala.

### 13.4 Decisiones del cliente (6-nov-2026)
- **D1.** Primera partida real: de **31 a 60 jugadores**. El sondeo con intervalo escalable alcanza; tope global inicial 60.
- **D2.** Chat de conversación: **se guarda hasta cerrar la sala**, como los intentos (13.3).
- **D3.** Aclarado por el cliente: **se acepta hasta 5 s de retraso** en el salto de turno (el diseño apunta a 0 a 3 s). El tiempo de turno del modo A lo define el admin; por defecto 20 s (brief).
- **D4.** Límite de Vercel Hobby: 1.000.000 de invocaciones al mes (574 usadas).
- Acción para más adelante: habilitar `pg_cron` en Supabase (Database → Extensions, o Integrations → Cron).

## 14. Pendientes técnicos

- Correr `supabase test db` (20 pruebas del Paso 4 + 44 del Paso 5 + las anteriores); idealmente en GitHub Actions (Integrador).
- Fijar la versión de Node.
- Confirmar el dominio oficial de producción.
- Correr las pruebas pgTAP de `close_room`, pistas y chat con `supabase test db`.
- **Migración ajena (resuelta en los Pasos 9+10):** `20261107033549_create_clue_functions` (`find_previous_attempt`, `list_clues`) estaba sin uso y sin dependencias; la nueva migración las quita. **El cliente debe borrar a mano del repo** `supabase/migrations/20261106210000_create_clue_functions.sql` y `supabase/tests/clues_rls.test.sql` (el ZIP no borra archivos). El historial de migraciones de la base conserva la entrada vieja.
- UPDATE/DELETE a `players` (expulsar) en la Fase 2.
- Cierre automático de sala vacía (5 min) y de salas abandonadas (Fase 3): reutilizará `close_room()`.
- **Unión con otro proyecto existente (sección 18):** pendiente que el cliente entregue datos del otro proyecto y que el Brief complete la sección. Hasta entonces no se renombra ni se mueve nada.
- CSP probada con Realtime.
- Generar los tipos de Supabase (`supabase gen types typescript`).
- Cierre automático de salas abandonadas (Fase 3).
- Fase 2: `close_room()` deberá borrar también los mensajes del chat.
- Para el Integrador (Fase 3): proteger `main` con checks, crear el Upstash definitivo, medir cuántos jugadores totales aguanta el proyecto, reconfirmar el límite de invocaciones de Vercel Hobby.
- Para el cliente: logo y HEX; revisar nombres en español de las generaciones 3 a 8; decidir los nombres de los 3 Tauros de Paldea.
- Salas de prueba abiertas (5 al 5-nov-2026 por la consulta del Programador) ocupan cupo de las 10 hasta el Paso 6 o 24 horas.

## 15. Incidente resuelto (lección)

El 4-nov-2026, "Crear sala" en Producción respondía "El servicio no está disponible". Causa (registros de Vercel): `42501 permission denied for function rate_limit_hit`. `SUPABASE_SERVICE_ROLE_KEY` en Producción no tenía la clave `service_role`. El cliente la corrigió, hizo Redeploy y funcionó. Desde el Paso 4 `/api/health` detecta este caso (devuelve 503).

## 16. Versiones de entrega y changelog

| Entrega | Versión |
|---|---|
| Diseño | ninguna (interfaz provisional) |
| Backend | backend-v0.10 |
| Contrato | contract-v0.12 |

- **contract-v0.12** (sin cambio de código): Pasos 9+10 confirmados por el cliente en Producción. Se agrega la sección 18 (unión con otro proyecto existente): ficha de lo que este proyecto ocupa, riesgos de choque, modos de unión y preguntas abiertas. El Brief la completa y adapta el contrato antes de enviarlo.
- **backend-v0.10 / contract-v0.11**: Pasos 9+10 (juntos). Columnas `rooms.attempt_cooldown_seconds`, `phase`, `start_deadline_at`; funciones `apply_due_timers`, `start_room`, `set_attempt_cooldown`; `submit_attempt` reemplazada (`not_started`, `o_retry_after`); código `ROOM_NOT_STARTED`; opciones al crear la sala; `startRoomAction`, `updateCooldownAction`; `WaitingRoom`, `StartRoomButton`, `CooldownControl`; el feed trae `status: waiting`, `cooldownSeconds`, `startDeadlineAt`, `serverNow`. Se quitan `list_clues` y `find_previous_attempt`. Sin `nextPollMs` ni tope global de 60 jugadores (decisión del cliente: más adelante).
- **contract-v0.10**: verificación de los Pasos 7+8 y guía de arranque de los Pasos 9+10.
- **backend-v0.8 / contract-v0.9**: Pasos 7+8 (juntos, a pedido del cliente). Tabla lateral de pistas, aviso de Pokémon repetido (`ALREADY_TRIED`, `confirmRepeat`), chat de conversación guardado hasta cerrar la sala (`chat_messages`, `sendChatMessageAction`), feed con chat y pistas, `close_room` que borra el chat (migración pendiente). Mueve `getFeed` a `services/feed.service.ts`; el feed usa `players=1` como refresco completo.
- **contract-v0.8** (sin cambio de backend): sección 13 aprobada (D1 a D4). Tope global 60, chat guardado hasta cerrar, límite de Vercel confirmado en 1.000.000.
- **contract-v0.7**: sección 13 reescrita como propuesta con datos verificados.
- **backend-v0.6 / contract-v0.6**: Paso 6. Función `close_room`, `closeRoomAction`, botón Cerrar sala con confirmación en el panel de admin. Borra intentos y apodos al cerrar. Sin cambios de privilegios.
- **backend-v0.5 / contract-v0.5**: Paso 5. Tabla `attempts`, `rooms.finished_at`, `submit_attempt` y `list_attempts`, `submitAttemptAction`, feed por sondeo con cursor, buscador, pantalla de juego y vista del admin, código `ROUND_FINISHED`. Elimina `GET /api/rooms/[roomCode]/players` y `PlayerLobby`. Agrega `.env.example` y `.gitignore`.
- **v0.4**: Paso 4. Tabla `players`, entrada de jugador, lista por sondeo, `/api/health` con consulta a la base.
- **v0.3**: Paso 3. `rooms`, límite de 10 salas, `rate_limit_hit`, crear sala y entrada de admin.
- **v0.2**: Paso 2. `pokemon` (1082), `pokemon_names`, `normalize_name`, RLS.
- **v0.1**: Paso 1. Sitio base y `/api/health`.

## 17. Para retomar en otro chat (arranque de los Pasos 11+12)

**Estado del proyecto**
- Fase 1 (Pasos 1 a 6) cerrada y probada por el cliente en Producción. Pasos 7+8 probados por el cliente ("funciona bien").
- Pasos 9+10: migración `20261108005307_wait_room_and_cooldown` aplicada en la base de pruebas, verificada (38 de 38 comprobaciones SQL y 5 partidas simuladas con 66 comprobaciones, 0 fallos) y **probada por el cliente en Producción ("funcionó bien")**.
- Siguiente: **Pasos 11+12** (Modo A por turnos con salto a 20 s; reconexión y expulsar), según el brief. **Aparte:** el proyecto se unirá con otro existente (sección 18); no cambia el alcance de 11+12 hasta que el cliente decida el modo de unión.

**Decisiones del cliente en los Pasos 9+10 (no repetir)**
- Espera entre intentos por defecto 3 s (1 a 120). Sala de espera opcional, 5 min por defecto, 0 = sin sala de espera. Vence con 0 jugadores: pasa a `playing`. Sin `pg_cron` en este bloque. Tope global de 60 jugadores y `nextPollMs`: fuera de este bloque (hacerlo con el Paso 12 o antes de la prueba de carga). La sección 13 sigue vigente para ellos.
- Pendiente de la sección 13: `pg_cron` disponible (v1.6.4) pero NO habilitado; para el cierre de salas vacías (Fase 3).


**Reglas de trabajo**
- Un bloque a la vez, con "Cómo sé que funcionó" y "Qué haces tú ahora". No se empieza el siguiente sin confirmación del cliente.
- Un ZIP del repo completo y **un solo commit en inglés** por bloque (Conventional Commits). El ZIP no borra archivos: si se elimina alguno, avisar qué borrar a mano.
- Explicaciones en español; código, commits y comentarios en inglés. Lenguaje sencillo para el cliente (no técnico).
- El Programador no puede leer el repo desde el chat: pedir el ZIP completo (sin `node_modules`, `.next` ni `.env.local`). El ZIP del cliente puede no traer archivos que empiezan con punto: `.env.example` y `.gitignore` ya se agregaron en el Paso 5.
- Se prueba siempre en la dirección de Producción de Vercel. El cliente no puede instalar Node.js: tipos, lint y build los da el despliegue de Vercel (pedirle el estado Ready).
- Conexión al Supabase de **pruebas** (ref `hizsxxuipewlwbjbwzic`). No pedir conexión al definitivo.

**Trucos aprendidos (herramienta de Supabase y entorno)**
- `apply_migration` funciona sin confirmación para `create`/`alter`/`revoke`/`grant`. **Pide confirmación y el cliente de ese chat la cancela** si el SQL contiene `delete`, `update` sin más, `create extension`, etc.: en ese caso, entregar el SQL como archivo para que el cliente lo pegue en el SQL Editor, y no rodear la confirmación.
- Cada migración aplicada con `apply_migration` recibe su propia versión (leerla con `list_migrations` y nombrar el archivo del repo igual).
- Para probar sin dejar rastro: un bloque `do $do$ ... raise exception E'REPORT\n%', informe; end $do$;` con funciones temporales en `pg_temp` y sin `delete`/`update`/`create extension` en el texto (las funciones que se prueban sí pueden borrar por dentro). Las simulaciones de 10 partidas siguen este patrón.
- pgTAP real no se pudo ejecutar (no se puede crear la extensión desde esa herramienta): las pruebas `.test.sql` quedan escritas para `supabase test db`.
- Verificación local en el entorno del Programador: `tsc` con declaraciones de reemplazo y un sustituto mínimo de Vitest con `zod/v4` (ver sección 11); no hay Node de verdad ni red.
- Respuestas de funciones de la base: nombres de salida con prefijo `o_` para no chocar con columnas; resultado como `outcome` + datos; el servicio traduce a códigos de error.

**Archivos que el Programador necesita:** lo más simple, el ZIP completo del repo actual (sin `node_modules`, `.next` ni `.env.local`) y el BRIEF v1.8. Los archivos más relevantes para 9+10: `supabase/migrations/*`, `services/rooms.service.ts`, `services/attempts.service.ts`, `services/feed.service.ts`, `app/actions/rooms.ts`, `app/actions/attempts.ts`, `app/api/rooms/[roomCode]/feed/route.ts`, `components/useRoomFeed.ts`, `components/GameRoom.tsx`, `components/RoomForms.tsx`, `app/crear/page.tsx`, `app/sala/[roomCode]/page.tsx`, `app/sala/[roomCode]/admin/page.tsx`, `lib/validation/rooms.ts`, `lib/result.ts`.

**Conexiones necesarias en el chat:** Supabase (proyecto de pruebas) y, opcional pero útil, Vercel para leer los registros si algo falla.

**Pendientes abiertos que arrastra el nuevo chat**
- Confirmación del cliente de los Pasos 7+8 en Producción.
- Migración ajena `20261107033549_create_clue_functions` (`find_previous_attempt`, `list_clues`): sigue en la base; averiguar quién la aplicó (sección 14).
- pgTAP real pendiente (Integrador, Fase 3).
- Tope de 100 jugadores y concurrencia real: sin probar hasta la prueba de carga.


## 18. Unión con otro proyecto existente

**Estado: BORRADOR del Programador. Lo completa el Brief con el cliente antes de enviar este contrato.** El cliente informó que este proyecto (Emerald City) **se va a juntar con otro proyecto que ya existe**. Del otro proyecto **no se sabe nada todavía** (stack, repositorio, base de datos, inicio de sesión, hosting, diseño). Nada de lo que sigue sobre el otro proyecto está verificado: todo lo que lo toca son preguntas o hipótesis, y así está marcado.

### 18.1 Instrucción para el Brief

El Brief modifica **este contrato** (no el código) para que pueda enviarse al equipo del otro proyecto cuando esté listo. Concretamente:
1. Hacer al cliente las preguntas de 18.5 en un solo mensaje y registrar las respuestas aquí. No inventar datos del otro proyecto.
2. Decidir con el cliente el **modo de unión** (18.4) y escribirlo en esta sección.
3. Adaptar el contrato para quien lo reciba: marcar cada sección como **portable** (se usa tal cual), **a adaptar** (depende del otro proyecto) o **choca** (hay que resolver); quitar o marcar "no enviar" lo que es solo operativo de este proyecto (por ejemplo la referencia del proyecto de pruebas de Supabase, direcciones de Vercel e incidentes de la sección 15).
4. Subir la versión del contrato (`contract-vX.Y`) y anotar el cambio en la sección 16.
5. Avisar al Programador de cada cambio que afecte el código, con la regla de siempre: el Programador solo cambia código cuando el cliente confirma, y todo renombre se reporta, nunca se hace en silencio.
6. Marcar el contrato como **listo para enviar** solo cuando el cliente lo confirme.

### 18.2 Ficha de lo que este proyecto ocupa (verificada el 8-nov-2026)

| Qué | Lo que ocupa Emerald City |
|---|---|
| Tablas (esquema `public`) | `pokemon`, `pokemon_names` (vista), `rooms`, `rate_limits`, `players`, `attempts`, `chat_messages`. RLS activo en todas menos la vista, **sin políticas**: nadie accede como `anon`/`authenticated`; solo `service_role` y funciones SECURITY DEFINER |
| Funciones (`public`) | `normalize_name`, `rate_limit_hit`, `rooms_enforce_open_limit`, `players_enforce_room_rules`, `submit_attempt`, `list_attempts`, `was_tried`, `list_hints`, `post_chat_message`, `post_admin_chat_message`, `list_chat`, `close_room`, `apply_due_timers`, `start_room`, `set_attempt_cooldown` |
| Extensiones | `pgcrypto`, `uuid-ossp` (más las de Supabase). `pg_cron` disponible pero **no** habilitado |
| Migraciones | 9 archivos en `supabase/migrations/` (de `20261101223300_create_pokemon` a `20261108005307_wait_room_and_cooldown`); 7 archivos de pruebas en `supabase/tests/` |
| Rutas de página | `/`, `/crear`, `/sala/[roomCode]`, `/sala/[roomCode]/admin` |
| Rutas de API | `GET /api/health`, `GET /api/pokemon/names`, `GET /api/rooms/[roomCode]/feed` |
| Server Actions | `app/actions/rooms.ts`, `players.ts`, `attempts.ts`, `chat.ts` |
| Cookies | `ec_admin_<sala>` y `ec_player_<sala>` (httpOnly, 12 horas) |
| Variables de entorno | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Upstash: sin uso) |
| Dependencias | Next 15.5, React 19, TypeScript estricto, Zod 4, Tailwind 4 (tokens `ec-*` en `@theme`), `@supabase/supabase-js` ^2.45, Vitest 3, ESLint 8 |
| Inicio de sesión | **Ninguno.** No usa Supabase Auth ni `@supabase/ssr`. Jugador y admin se reconocen por cookie propia; el servidor accede con `service_role` |
| Idioma y zona horaria | Español; `America/Caracas`. Las fechas se guardan en UTC |
| Límites propios | 10 salas abiertas a la vez, 100 jugadores por sala (tope global 60 pendiente), 10 creaciones de sala por hora por IP |
| Recursos compartidos del plan Free | Supabase: 200 conexiones, 100 mensajes/s de Realtime (hoy **no** se usa Realtime), pausa a los 7 días sin actividad. Vercel Hobby: 1.000.000 de invocaciones al mes, solo uso personal no comercial |

### 18.3 Puntos de choque probables (HIPÓTESIS, por verificar contra el otro proyecto)

- **Nombres genéricos:** `rooms`, `players`, `attempts` y `rate_limits` pueden existir ya en el otro proyecto si comparte base de datos.
- **Modelo de seguridad distinto:** aquí todo se deniega y se accede por funciones con `service_role`. Si el otro proyecto usa Supabase Auth con políticas RLS para `authenticated`, hay que decidir cómo conviven (y que ninguna política nueva abra por accidente nuestras tablas).
- **Rutas y cookies:** `/crear`, `/sala/...`, `/api/health` y los prefijos `ec_` podrían repetirse.
- **Estilos:** los tokens `ec-*` y `lib/ui.ts` son provisionales (el Diseñador entra al final); el otro proyecto puede tener su propio sistema de diseño.
- **Versiones:** Next, React, Node, Zod o Tailwind distintos entre los dos.
- **Límites compartidos:** si los dos proyectos usan el mismo Supabase Free o el mismo Vercel Hobby, **suman** conexiones, invocaciones y la regla de "solo uso personal no comercial".
- **Zona horaria e idioma:** el otro proyecto puede usar otros.

### 18.4 Modos de unión posibles (a decidir con el cliente; no se ejecuta nada hasta entonces)

| Modo | Qué es | Costo | Cuándo conviene |
|---|---|---|---|
| **A. Dos aplicaciones enlazadas** | Cada proyecto sigue con su repositorio y su base; se unen por enlaces o subdominio y, si hace falta, un menú común | Bajo. No se renombra nada | Si los stacks son distintos, o si se quiere unir rápido y sin riesgo |
| **B. Mismo repositorio, esquemas separados** | Un solo repositorio (o monorepo); Emerald City pasa a un esquema propio de la base (por ejemplo `emerald`) y sus rutas a un prefijo (por ejemplo `/emerald`) | Medio. Migración de esquema, cambio de las llamadas y de las pruebas | Si el otro proyecto también es Next + Supabase |
| **C. Fusión total** | Una sola aplicación, una sola base, un solo inicio de sesión | Alto. Reescribe partes de los dos | Solo si el otro proyecto ya tiene usuarios y se quiere un perfil único |

**Recomendación provisional del Programador:** empezar por A y pasar a B solo si el otro proyecto es Next + Supabase y el cliente quiere una sola aplicación. Se confirma cuando se conozca el otro proyecto. Si hay duda, el modo más simple.

### 18.5 Preguntas abiertas para el cliente (las hace el Brief, en un solo mensaje)

1. ¿Cómo se llama el otro proyecto y qué hace, en una frase?
2. ¿Qué tecnología usa (Next.js, otra), dónde está su código (GitHub) y dónde está publicado (Vercel u otro)?
3. ¿Usa Supabase? Si sí: ¿el mismo proyecto de Supabase que este, o otro? ¿Tiene tablas llamadas `rooms`, `players`, `attempts` o `rate_limits`?
4. ¿Tiene inicio de sesión de usuarios? ¿Se quiere que el jugador de Emerald City use esa cuenta, o sigue entrando solo con apodo?
5. ¿Qué se quiere ver unido: solo un enlace entre los dos sitios, el mismo menú y diseño, o una sola aplicación?
6. ¿Quién mantiene el otro proyecto (otro chat de Programador, otra persona) y a quién se le envía el contrato?
7. ¿Hay una fecha o un hito para la unión? ¿Se hace antes o después de la prueba de carga de la Fase 3?
8. ¿El otro proyecto tiene fines comerciales (anuncios, pagos, donaciones)? Afecta el plan gratuito de Vercel y la regla de "sin monetización".

### 18.6 Qué NO se hace hasta que se decida

- No se renombran tablas, funciones, rutas ni cookies.
- No se mueve nada a otro esquema ni a otro repositorio.
- No se cambia el modelo de seguridad ni se agrega inicio de sesión.
- Los Pasos 11 y 12 y la Fase 3 siguen como en el brief; si el modo de unión cambia algo, el Brief lo anota aquí y el Programador lo aplica en un paso aparte.
