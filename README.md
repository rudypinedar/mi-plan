# Mi plan

App personal de presupuesto y deudas, instalable en iPhone. Los datos viven en un Google Sheet privado; este repositorio solo tiene el código.

- **App:** `index.html`, `css/app.css`, `js/app.js` (interfaz), `js/motor.js` (cálculos), `js/datos.js` (copia en el teléfono + sincronización con el Sheet), `sw.js` (abre sin señal), `manifest.json` e `icono.png` (instalación).
- `apps-script/`: código del puente con Google Sheets (sin claves). Ver `docs/SHEET.md`.
- `herramientas/`: scripts de una sola vez (instalar, importar el respaldo).
- `pruebas/`: pruebas automáticas.
- `docs/PLAN.md`: fases de trabajo.
- `privado/`: solo en la computadora; nunca se sube.

## Conectar un teléfono

Abre la app y pega el **código de conexión** (empieza con `miplan1:`) guardado en Bitwarden. Se guarda solo en ese teléfono.

## Pruebas

```
npm test
```

Corren con Node 18 o superior y no necesitan instalar nada. Si existen `privado/respaldo.json` y `privado/mi-plan.html`, las pruebas también usan tus datos reales y comparan el motor nuevo contra el original.
