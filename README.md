# Mi plan

App personal de presupuesto y deudas, instalable en el teléfono. Los datos viven en un Google Sheet privado; este repositorio solo tiene el código.

- **App:**
  - `index.html` y `css/app.css`: la interfaz.
  - `js/app.js`: pantallas y acciones.
  - `js/motor.js`: cálculos del plan (mes, cascada de abonos, cierre, proyección).
  - `js/datos.js`: copia en el teléfono y sincronización con el Sheet.
  - `js/candado.js`: bloqueo y cifrado en el teléfono.
  - `js/tema.js`: modo claro u oscuro.
  - `sw.js`: hace que abra sin señal.
  - `manifest.json` e `icono-v2*.png`: instalación.
  - `fonts/`: cifras.
  - `js/vendor/`: la librería para exportar a Excel.
- `apps-script/`: el puente con Google Sheets, Gmail, Drive y Google Tasks (sin claves). Ver `docs/SHEET.md`.
- `herramientas/ajuste.js`: aplica ajustes al plan con vista previa y control de versión.
- `pruebas/`: pruebas automáticas (`npm test`).
- `docs/`: cómo está hecho el Sheet (`SHEET.md`) y el teléfono Android (`ANDROID.md`).
- `privado/`: solo en la computadora; nunca se sube.

## Conectar un teléfono

Abre la app y pega el **código de conexión** (empieza con `miplan1:`) guardado en Bitwarden. Se guarda solo en ese teléfono.

## Pruebas

```
npm test
```

Corren con Node 18 o superior y no necesitan instalar nada. Si existen `privado/respaldo.json` y `privado/mi-plan.html`, las pruebas también usan tus datos reales y comparan el motor contra el original.

## Pendiente

- **Cuando llegue el iPhone (aprox. dic 2026):**
  - Face ID (PRF en iOS 18). Al tenerlo, quitar el respaldo del código de 4 a 6 dígitos (o pedir una frase larga si no hay Face ID).
  - Atajos para los SMS.
  - Revisar el diseño en Safari.
  - Decidir si los montos siguen en los recordatorios.
- **Débito de Cuscatlán:** el banco no manda avisos de compra. Cuando lleguen, agregar su formato en `interpretar()`.
