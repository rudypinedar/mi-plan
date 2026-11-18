# Mi plan — app de finanzas personales de Rudy

App personal de presupuesto y deudas. **Desde el 18 nov 2026 es la app principal de Rudy** (antes usaba el artefacto "Mi plan" de claude.ai; su código queda como referencia en `privado/mi-plan.html`, que no se sube). Toma ideas de la app de Jaime: https://github.com/JaimeCastroH/Finanzas

## Reglas de oro

1. **Ningún dato personal en el repositorio.** Saldos, montos, nombres de familia, números de tarjeta, NRC o claves viven solo en el Google Sheet privado o en `privado/` (en `.gitignore`). El repo es solo el cascarón.
2. **Ninguna clave ni token en el código.** Las claves van en las Propiedades del script de Apps Script o en el teléfono. Si algo parece un secreto, no lo comitees.
3. **Tarjetas solo por sus últimos 4 dígitos.** Nunca guardes ni muestres números completos.
4. **Primero el iPhone.** Rudy se cambia a iPhone: la app es una PWA instalable desde Safari ("Agregar a pantalla de inicio"), con diseño móvil primero.
5. **Todo en español de El Salvador**, cálido y claro. Montos en USD con 2 decimales (`$1,234.56`). Sin jerga técnica en la interfaz.
6. **No romper el cuadre.** Cada mes tiene que cuadrar en $0 (ingresos = gastos + abonos + fondos). Cualquier cambio al motor se prueba con la batería de pruebas antes de comitear.

## Arquitectura

- **Frontend:** HTML, CSS y JS sin frameworks pesados (como la app actual y la de Jaime), servido desde GitHub Pages. Service worker para funcionar sin señal y manifest para instalarse.
- **Backend:** Google Apps Script (`apps-script/Codigo.gs`), publicado como aplicación web. Lee y escribe el Google Sheet privado de Rudy. El script se puede subir al repo **sin la clave**; la clave vive en Propiedades del script.
- **Acceso:**
  - **Lectura y escritura desde la app:** clave de acceso guardada en el teléfono, más bloqueo con Face ID (WebAuthn) en la app.
  - **Ingreso automático** (Atajos de iOS, Gmail): una clave distinta, que solo puede agregar movimientos "por clasificar".
  - (Fase posterior y opcional: inicio de sesión con Google.)
- **Datos:** Google Sheet con pestañas `config`, `deudas`, `fondos`, `recurrentes`, `meses`, `movimientos`, `por_clasificar`, `bitacora`. La app guarda una copia local y sincroniza con cola de envíos si no hay señal.

## Modelo del plan (portar de `privado/mi-plan.html`, objeto `ENG`)

- **Mes del plan = del 20 al 19.** El salario cae el día 20. El mes "2026-11" va del 20 nov al 19 dic.
- **Ingresos:**
  - Salario (día 20).
  - Honorarios (fin de mes). Caen en la **cuenta de impuestos**: ahí se quedan el IVA (F-07), la retención del contador (F-14) y el fondo de renta. Lo demás se mueve a la cuenta personal. Detalles en `CLAUDE.local.md`.
- **Gastos:**
  - **Fijos:** recurrentes con calendario de montos por mes.
  - **Sobres (envelopes):** gasolina, súper, gustos, ropa. Se anotan los gastos del día a día contra el sobre.
  - **Puntuales:** oneoffs con mes.
- **Deudas:**
  - `loan`: préstamos con cuota fija y tasa; la cuota se divide en capital e interés más seguros.
  - `card`: tarjetas con corte, fecha de pago, mínimo y tasa.
  - `installment`: cuotas 0% dentro de una tarjeta.
  - `person`: deudas con familia, sin interés.
- **Fondos:** con meta opcional y calendario de aportes. Algunos se guardan en la cuenta de impuestos.
- **Cascada de abonos (`order`):** lo que sobra cada mes se abona a la siguiente deuda o fondo del orden. Prioridad: deudas con más interés primero. Las deudas con familia pueden tener un tope (`cap`): solo reciben su cuota mientras haya deudas con interés.
- **Movimientos aparte (`type: "extra"`):** dinero que no sale del salario, como la venta del carro, cargos grandes a tarjeta o abonos especiales.
- **Cierre de mes:** resumen, pasar pendientes al mes siguiente y mandar el sobrante. No debe dejar el plan trabado (ver `docs/PLAN.md`, pruebas).
- **Proyección:** simula mes a mes hasta quedar sin deudas. Muestra fecha libre, intereses, hitos y la comparación "tu plan vs. pagar solo cuotas".

## Reglas personales

Están en `CLAUDE.local.md` (no se sube). Léelas antes de tocar la lógica o los textos. Además:

- Las compras grandes con tarjeta se hacen después del corte, para pagarlas lo más tarde posible y sin intereses.

## Pruebas obligatorias

Antes de cada commit que toque el motor:
- Cargar el respaldo real (`privado/respaldo.json`) y cerrar 24 meses seguidos marcando todo pagado: cada mes cuadra en $0, no aparecen saldos negativos ni `NaN`, y siempre se puede pasar al siguiente mes.
- Cerrar un mes sin marcar nada: el siguiente mes se arma y el sobrante no se manda si faltan ingresos por marcar.
- Reabrir un mes anterior y volver al último.
- Pagos parciales: la diferencia se refleja en lo libre.

## Estilo de trabajo

- Commits pequeños y en español: `motor: …`, `ui: …`, `apps-script: …`.
- Antes de un cambio grande, explica el plan en 3–5 líneas y espera el visto bueno de Rudy.
- Si algo del modelo no está claro, revisa `privado/mi-plan.html` antes de inventar.
