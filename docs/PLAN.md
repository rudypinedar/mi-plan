# Plan de trabajo

Cada fase deja algo usable. No se pasa a la siguiente sin que Rudy la pruebe en su teléfono.

## Fase 0 · Repositorio y hosting (1 sesión)

- Crear el repo en GitHub. Decidir:
  - **Público + GitHub Pages (gratis):** el código se ve, pero los datos no, porque viven en el Sheet. Es lo que hace Jaime.
  - **Privado:** GitHub Pages en un repo privado requiere GitHub Pro. La alternativa gratis es Cloudflare Pages.
- Activar GitHub Pages y confirmar que `index.html` abre en Safari del iPhone.
- Copiar `privado/mi-plan.html` y `privado/respaldo.json`. Nunca se suben.

## Fase 1 · Cascarón + motor + Sheet (2–4 sesiones)

1. Extraer el motor (`ENG`) de `privado/mi-plan.html` a `js/motor.js`, sin datos personales.
   - Las ~90 migraciones del artefacto **no se portan**: el estado actual ya las tiene aplicadas, y se importa desde el respaldo.
2. Crear el Google Sheet y `apps-script/Codigo.gs`:
   - `doPost` con acciones `leer`, `guardar` e `ingresar`.
   - La clave se valida contra Propiedades del script, con bloqueo temporal si se equivocan varias veces (como Jaime).
   - Respuestas en JSON.
3. Importar `respaldo.json` al Sheet: un script de una sola vez.
4. Pantallas mínimas:
   - **Mes:** pagos por hacer, sobres, ingresos y cierre.
   - **Deudas:** con la comparación "tu plan vs. solo cuotas".
   - **Fondos**, **proyección** y **ajustes**.
5. Pruebas automáticas del motor: las de `CLAUDE.md`, corriendo en Node.

## Fase 2 · iPhone como app (1–2 sesiones)

- `manifest.json` (nombre, ícono, `display: standalone`) y service worker (red primero y copia sin señal, como el `sw.js` de Jaime).
- **Bloqueo con Face ID** usando WebAuthn (llave de acceso del dispositivo). Si falla, código de 4–6 dígitos.
- **Modo discreto:** difumina los montos, como la app actual.
- Instalar desde Safari: Compartir → Agregar a pantalla de inicio.

## Fase 3 · Gastos automáticos desde los SMS del banco (2 sesiones)

**Límite de iOS:** ninguna app puede leer tus mensajes directamente. La forma permitida es una **automatización de Atajos**:

1. Atajos → Automatización → **Mensaje**.
   - Remitente: el número de alertas del banco.
   - Contiene: "Alerta de compra" o "has realizado una compra".
   - Marcar **"Ejecutar de inmediato"** (iOS 17 o superior).
2. Acción: **Obtener contenido de URL**, con POST a la app web de Apps Script (`accion: "ingresar"`, clave de ingreso y el texto del mensaje).
3. Apps Script interpreta el texto y lo deja en `por_clasificar` con monto, comercio, fecha y tarjeta (últimos 4). En la app, Rudy lo asigna con un toque a un sobre, a una tarjeta o a "lo paga otra persona".

Formatos reales que hay que interpretar (ejemplos):

```
Alerta de compra B.CUSCATLAN con su Tarjeta de Credito Titular 0001 por USD88.32 en TIENDA EJEMPLO el 2026-11-08 15:17. Mas inf. 00000000
Alertas PRF VISA 0002: has realizado una compra por USD 109.99 en el comercio: SUPER EJEMPLO 2026/11/08 16:32:03 Inf. https://bit.ly/...
```

Mapa de tarjetas por últimos 4: vive en el Sheet (pestaña `deudas`, columna `ultimos4`), no en el repositorio.

El débito Cuscatlán y Credisiman se agregan cuando haya ejemplos.

**Reglas:**
- Si llega la misma alerta dos veces, no la dupliques: misma tarjeta, monto y fecha/hora.
- Guarda el texto original solo en `bitacora`, sin el número del banco.
- Si el formato no se reconoce, se guarda igual en `por_clasificar` como "sin interpretar".

## Fase 4 · Correo (Gmail) (1–2 sesiones)

En el mismo proyecto de Apps Script, con un **disparador por tiempo** cada 15–30 minutos:

1. Busca en Gmail con una etiqueta o búsqueda (por ejemplo, `from:(alertas del banco) newer_than:2d`) y aplica el mismo intérprete de la Fase 3.
2. **Estados de cuenta:** guarda los PDF adjuntos en una carpeta de Drive ("Estados de cuenta/AAAA-MM/banco") y registra fecha de corte, fecha de pago y saldo si vienen en el cuerpo del correo.
   - Interpretar el PDF completo queda para después: Drive puede convertir PDF a texto, pero el formato cambia según el banco.
3. Marca cada correo procesado con la etiqueta `MiPlan/procesado`.
4. Revisa en `bitacora` qué entró por SMS y qué por correo, para no contar dos veces el mismo cargo.

## Fase 5 · Notificaciones (1–2 sesiones)

- **Web Push en iPhone:** funciona desde iOS 16.4 **solo si la app está instalada** en la pantalla de inicio y el usuario da permiso.
  - Necesita un servidor que firme las notificaciones (VAPID). Apps Script no lo hace bien.
  - Opciones: un **Cloudflare Worker** gratis, o un servicio como **ntfy**.
  - Verificar al implementar.
- **Qué avisar:**
  - Pago con fecha cercana (2 días antes).
  - Sobre al 75% y al 100%.
  - Cargo nuevo por clasificar.
  - "¿Ya te cayó el salario?" los días 19–23.
  - Corte de tarjeta: "compra grande después del corte".
- **Alternativa sin servidor:** que la app genere recordatorios en el Calendario (archivo .ics) para las fechas de pago.

## Fase 6 · Ideas de la app de Jaime para evaluar

- Ajustar con el banco (conciliar saldo real vs. app).
- Gastos "por clasificar" en el inicio.
- Reportes por categoría y comparación mes a mes.
- Sugerencias al anotar (autocompletar comercio → sobre).

## Fuera de alcance (por ahora)

- Conectarse directo a la banca en línea: no hay API pública de los bancos en El Salvador, y no se guardan contraseñas del banco.
- Leer SMS en Android o en Mac.
