# Estructura del Google Sheet

El Sheet es privado y es la fuente de verdad. La app lo lee y lo escribe a través de `apps-script/Codigo.gs`.

## Cómo se guarda

- Cada pestaña tiene **columnas para leer a simple vista**, más una columna `datos` con el objeto completo en JSON.
- Al leer, manda `datos`. La única excepción es `saldo` en `deudas` y `fondos`: **si corriges un saldo a mano en el Sheet, ese saldo gana**.
- Si un JSON no cabe en una celda (50,000 caracteres), sigue en las columnas de la derecha. Esas columnas no llevan título.
- Todo se escribe como texto, para que Sheets no convierta `2026-11` en una fecha.
- `config` guarda `_version`. Cada vez que se guarda, la versión sube en 1. Si la app intenta guardar sobre una versión vieja (por ejemplo, desde otro teléfono), el script responde `conflicto` y no pisa nada.

## Pestañas

| Pestaña | Una fila por… | Columnas |
|---|---|---|
| `config` | dato suelto del plan | `clave`, `valor` (JSON). Ejemplos: `startKey`, `current`, `income`, `incomeExtra`, `order`, `waterfallFrom`, `carry`, `carryIncome`, `puente`, `log`, `nombres` (nombre real de la cuenta de impuestos y de quien paga los honorarios), `_version`, `_actualizado` |
| `deudas` | deuda | `id`, `nombre`, `tipo` (loan, card, installment, person), `saldo`, `tasa`, `cuota`, `paga_con`, `dia_pago`, `ultimos4`, `cerrada`, `datos` |
| `fondos` | fondo | `id`, `nombre`, `saldo`, `meta`, `datos` |
| `recurrentes` | gasto fijo o sobre | `id`, `nombre`, `categoria`, `paga_con`, `sobre`, `datos` (incluye el calendario de montos) |
| `puntuales` | gasto, ingreso o movimiento aparte de un mes | `id`, `mes`, `nombre`, `tipo` (gasto, income, extra), `monto`, `datos` |
| `fechas` | cumpleaños o fecha especial | `id`, `mes`, `dia`, `nombre`, `monto`, `datos` |
| `meses` | mes del plan (del 20 al 19) | `mes`, `cerrado`, `deuda_inicio`, `deuda_cierre`, `datos` (todos los ítems, lo pagado y los gastos de los sobres) |
| `movimientos` | ítem de un mes | `mes`, `nombre`, `categoria`, `tipo`, `paga_con`, `monto`, `pagado`, `monto_pagado`, `deuda`, `fondo`. **Solo para consultar**: se reescribe cada vez que se guarda |
| `por_clasificar` | alerta del banco (SMS o correo) | `id`, `recibido`, `origen`, `fecha`, `monto`, `comercio`, `tarjeta` (últimos 4), `estado` (pendiente, asignado, descartado), `asignado_a`, `nota`, `huella` (evita duplicados) |
| `estados_cuenta` | estado de cuenta que llegó por correo | `recibido`, `banco`, `tarjeta` (últimos 4), `fecha_corte`, `fecha_pago`, `pago_minimo`, `pago_contado`, `huella` |
| `bitacora` | evento | `fecha`, `origen`, `accion`, `detalle`. El texto de los SMS se guarda sin números largos ni enlaces |

Agregué dos pestañas que no estaban en `CLAUDE.md`, `puntuales` y `fechas`, para que cada lista del plan tenga la suya.

## Acciones de `Codigo.gs`

Todas se mandan por `POST` con un JSON en el cuerpo y `Content-Type: text/plain`, para evitar el aviso de CORS del navegador.

| Acción | Clave | Envía | Responde |
|---|---|---|---|
| `leer` | `CLAVE_APP` | — | `plan`, `version`, `actualizado`, `porClasificar` (solo los pendientes) |
| `guardar` | `CLAVE_APP` | `version`, `plan`, opcional `clasificados: [{id, estado, asignado_a}]` | `version` nueva, o `conflicto: true` |
| `ingresar` | `CLAVE_INGRESO` o `CLAVE_APP` | `texto`, opcional `origen` (sms, correo) | `id`, `interpretado`, o `duplicado: true` |
| `revisarCorreo` | `CLAVE_APP` | — | cuántas compras, estados de cuenta, duplicados e ignorados encontró |
| `activarCorreo` | `CLAVE_APP` | — | crea (una vez) el disparador que revisa Gmail cada 15 minutos |
| `cambiarClaveIngreso` | `CLAVE_APP` | `nueva` (24 o más caracteres) | cambia la clave de Atajos y MacroDroid; la anterior deja de servir |
| `recordatorios` | `CLAVE_APP` | — | actualiza la lista de Google Tasks "Mi plan · pagos" (`tareas`, `nuevas`, `borradas`); también se hace sola una vez al día y después de guardar |
| `correosSinReconocer` | `CLAVE_APP` | opcional `dias` (1–30) | solo lectura: correos de banco que no se reconocieron como compra ni estado de cuenta |
| `ingresar` (variante para SMS) | `CLAVE_INGRESO` | `?accion=ingresar&clave=…&origen=sms` en la dirección y el SMS tal cual en el cuerpo (`text/plain`) | igual que `ingresar` |

## Correo (Gmail)

- **Remitentes que se revisan:** `baccredomatic.com`, `baccredomatic.sv` y `bancocuscatlan.com`, de los últimos 3 días. Se cambia con la propiedad `BUSQUEDA_CORREO`.
- **Qué se lee:**
  - Las compras con tarjeta ("Alerta PRF" y "Sistema de Alertas" de BAC) van a `por_clasificar`.
  - Los estados de cuenta (Cuscatlán) van a `estados_cuenta`.
  - Las transferencias, depósitos, códigos y promociones se ignoran.
  - Las compras rechazadas se anotan solo en la bitácora.
- **Duplicados:** si una misma compra llega por dos correos distintos (misma tarjeta, monto y día), entra una sola vez.
- **Primera revisión:** solo toma nota de los correos que ya existían, porque esas compras ya se anotaron a mano.
- **Qué no hace:** el permiso es de solo lectura, así que no puede borrar, marcar ni etiquetar correos. Para no repetir, recuerda los últimos 300 correos que ya revisó.

## Seguridad

- **Claves:** viven en **Propiedades del script**, nunca en el código.
  - `CLAVE_INGRESO` solo puede agregar a `por_clasificar`; no puede leer nada.
  - Una clave correcta **siempre** entra: no hay bloqueo por intentos, para que nadie pueda dejar fuera a Rudy ni a Atajos. Las incorrectas solo se anotan en `bitacora` (una fila cada 10 minutos como máximo) y reciben el mismo mensaje genérico: "Clave incorrecta".
- **`CLAVE_INGRESO` en la dirección (variante para SMS):** se queda así a propósito, aunque la clave quede en los registros de MacroDroid y de Google. En MacroDroid, solo los "Parámetros de consulta" se codifican solos; el "Cuerpo del contenido" se manda tal cual, sin codificar ([guía oficial de la acción](https://macrodroidforum.com/wiki/index.php/Action:_HTTP_Request)). Si la clave fuera en un formulario en el cuerpo (`accion=…&clave=…&texto=…`), un SMS con `&`, `=`, `+` o `%` rompería los campos. Mandar JSON tampoco es seguro, porque la documentación no dice si escapa las comillas ni los saltos de línea del SMS. Además, Apps Script no deja leer los encabezados de la petición, así que la clave no puede ir ahí. El riesgo es bajo: esa clave solo puede agregar cargos "por clasificar" y se cambia con `cambiarClaveIngreso`.
- **Instalación:** `instalar` solo funciona con un `TOKEN_INSTALACION` puesto a mano en Propiedades del script, y mientras no haya claves. El token se borra al usarlo.
- **Permisos mínimos:**
  - Gmail en **solo lectura** (`gmail.readonly`, con la API de Gmail). El script no puede enviar, borrar ni modificar correos.
  - Drive solo para **los archivos que el propio script crea** (`drive.file`).
  - Sheets solo para **este** Sheet (`spreadsheets.currentonly`).
  - Google Tasks (`tasks`), para la lista "Mi plan · pagos". Tasks no tiene un permiso más limitado; el script solo usa la lista que él mismo crea. Ya **no** pide permiso del calendario.
- **Correos:** solo se aceptan si la dirección real (la de dentro de `<…>`, no el nombre visible) es de un banco de la lista fija `BANCOS` (o un subdominio) y el **primer** `Authentication-Results` que escribe Gmail (`mx.google.com;`) dice `dmarc=pass` con `header.from` igual a ese dominio. Los demás se anotan en `bitacora` y se descartan.
  - Los correos de banco con monto que no se reconocen se anotan en `bitacora` como "sin reconocer" (sin publicidad), para poder agregar formatos nuevos. La acción `correosSinReconocer` los lista en solo lectura.
- **Datos del cliente:**
  - `guardar` revisa la forma del plan y no acepta claves que empiecen con `_` ni `constructor`/`prototype`. Escribe primero y después borra lo que sobra, así una falla a medias nunca deja una pestaña vacía.
  - Ninguna celda puede quedar como fórmula: lo que empieza con `= + - @` se guarda con un apóstrofo.
- **Textos de SMS o correo:** lo que no se interpreta no se guarda; solo una huella SHA-256. En `bitacora` se tapan enlaces, correos, teléfonos y números de 4 o más dígitos.
- **App:**
  - Todo lo que viene del Sheet se escapa antes de mostrarse, y los íconos y bancos solo aceptan letras, números y `_`.
  - La política de seguridad no permite scripts en línea ni de otros sitios.
  - La librería de Excel (SheetJS 0.20.3) vive dentro del repo.
- **Bloqueo con huella (`js/candado.js`):** se activa en **Más → Seguridad**.
  - Una llave aleatoria (AES-GCM 256) cifra en el teléfono la conexión, la copia del plan, la bandeja y los estados de cuenta.
  - Esa llave se guarda envuelta dos veces: con el secreto PRF de la huella o el rostro (WebAuthn) y con un código de 4 a 6 dígitos (PBKDF2, 310,000 vueltas).
  - Tras 3 códigos malos, cada intento espera más.
  - Se bloquea sola tras 5 minutos en segundo plano.
  - Si el navegador no da PRF, se usa solo el código.

## Instalación (una vez)

Ya está hecha. Así se hizo, por si hay que repetirla:

1. `npx @google/clasp login` con la cuenta personal.
2. `npx @google/clasp create-script --type sheets --title "Mi plan · datos" --rootDir apps-script` crea el Sheet con su script.
   - Ojo: este comando reemplaza `apps-script/appsscript.json`. Hay que restaurarlo con `git checkout`.
   - Guarda los identificadores en `.clasp.json`, que no se sube.
3. `npx @google/clasp push --force` y luego `npx @google/clasp create-deployment`. La URL `/exec` va en `privado/conexion.json`.
4. Una sola vez en el navegador: abre el editor del script, ejecuta `configurar` y acepta los permisos (solo pide esta hoja).
5. En Propiedades del script, crea `TOKEN_INSTALACION` con un valor aleatorio. Luego ejecuta `MIPLAN_TOKEN=<ese valor> node herramientas/instalar.js`:
   - Genera las dos claves en `privado/claves.json`, que no se sube.
   - Las instala con la acción `instalar`, que solo funciona mientras no haya claves.
   - Importa `privado/respaldo.json`.

Para publicar cambios del script: `npx @google/clasp push --force` y luego `npx @google/clasp update-deployment <id>`, para que la URL no cambie.
