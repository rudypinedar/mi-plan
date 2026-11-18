# Mi plan

App personal de presupuesto y deudas, instalable en iPhone. Los datos viven en un Google Sheet privado; este repositorio solo tiene el código.

- `CLAUDE.md`: contexto y reglas para Claude Code.
- `docs/PLAN.md`: fases de trabajo.
- `apps-script/`: código del puente con Google Sheets (sin claves).
- `privado/`: solo en tu computadora; nunca se sube.

## Pruebas

```
npm test
```

Corren con Node 18 o superior y no necesitan instalar nada. Si existen `privado/respaldo.json` y `privado/mi-plan.html`, las pruebas también usan tus datos reales y comparan el motor nuevo contra el original.
