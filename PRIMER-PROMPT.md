# Primer mensaje para Claude Code

Copia y pega esto en Claude Code, dentro de la carpeta del repositorio:

---

Hola. Este repo es mi app de finanzas personales, "Mi plan". Lee primero `CLAUDE.md` y `docs/PLAN.md`; ahí está todo el contexto y las reglas.

Referencias:
- `privado/mi-plan.html`: mi app actual (no se sube a GitHub).
- `privado/respaldo.json`: mis datos (tampoco se sube).
- https://github.com/JaimeCastroH/Finanzas: la app de mi amigo Jaime. Úsala de base para la estructura (PWA, service worker, puente con Apps Script), no para el contenido.

Empecemos con la **Fase 0 y el inicio de la Fase 1**:
1. Revisa que `.gitignore` excluya `privado/` y que no haya ningún dato personal en lo que vas a comitear.
2. Extrae el motor `ENG` de `privado/mi-plan.html` a `js/motor.js` (sin datos) y escribe pruebas en Node con mi respaldo: cerrar 24 meses seguidos, que cada mes cuadre en $0, que no haya saldos negativos ni NaN y que siempre se pueda pasar al siguiente mes.
3. Propón la estructura del Google Sheet y un primer `apps-script/Codigo.gs` con las acciones `leer`, `guardar` e `ingresar`, y la clave en Propiedades del script.

Antes de escribir código, dime en 5 líneas cómo lo vas a hacer y espera mi visto bueno.
