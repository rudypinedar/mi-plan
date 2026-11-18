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
| `bitacora` | evento | `fecha`, `origen`, `accion`, `detalle`. El texto de los SMS se guarda sin números largos ni enlaces |

Agregué dos pestañas que no estaban en `CLAUDE.md`, `puntuales` y `fechas`, para que cada lista del plan tenga la suya.

## Acciones de `Codigo.gs`

Todas se mandan por `POST` con un JSON en el cuerpo y `Content-Type: text/plain`, para evitar el aviso de CORS del navegador.

| Acción | Clave | Envía | Responde |
|---|---|---|---|
| `leer` | `CLAVE_APP` | — | `plan`, `version`, `actualizado`, `porClasificar` (solo los pendientes) |
| `guardar` | `CLAVE_APP` | `version`, `plan`, opcional `clasificados: [{id, estado, asignado_a}]` | `version` nueva, o `conflicto: true` |
| `ingresar` | `CLAVE_INGRESO` o `CLAVE_APP` | `texto`, opcional `origen` (sms, correo) | `id`, `interpretado`, o `duplicado: true` |

## Seguridad

- Las claves viven en **Propiedades del script**, nunca en el código. La función `crearClaves()` las genera y las muestra una sola vez.
- `CLAVE_INGRESO` solo puede agregar a `por_clasificar`; no puede leer nada.
- Después de 5 claves equivocadas, el acceso se bloquea 15 minutos para todos. La función `desbloquear()` lo quita.
- Si no hay `CLAVE_APP` configurada, no entra nadie.

## Instalación (una vez)

1. Crea un Google Sheet nuevo llamado "Mi plan · datos".
2. Ve a Extensiones → Apps Script y pega el contenido de `apps-script/Codigo.gs`.
3. Ejecuta `configurar` (crea las pestañas) y luego `crearClaves`. Copia las dos claves del registro de ejecución.
4. Ve a Implementar → Nueva implementación → Aplicación web:
   - Ejecutar como: **yo**.
   - Quién tiene acceso: **cualquier usuario**. La clave es la que protege.
5. Copia la URL que termina en `/exec`.
6. Importa el respaldo desde la computadora:
   `MIPLAN_URL=… MIPLAN_CLAVE=… node herramientas/importar.js`
