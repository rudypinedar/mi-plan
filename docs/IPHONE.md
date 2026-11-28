# Mi plan en iPhone

La app es la misma para iPhone y Android: una página web que se instala como app. No hay que bajar nada del App Store.

## 1. Instalar la app

1. Abre **Safari** y entra a https://rudypinedar.github.io/mi-plan/. Tiene que ser Safari: desde otro navegador no se instala bien.
2. Toca **Compartir** (el cuadro con la flecha hacia arriba) → **Agregar a pantalla de inicio** → **Agregar**.
3. Abre la app **desde el ícono** y pega el **código de conexión** de Bitwarden (nota "Mi plan · claves", empieza con `miplan1:`).

## 2. Bloqueo con Face ID

**Más → Seguridad → Activar bloqueo**:

1. Crea un código de 6 números. Es el respaldo si Face ID falla.
2. Acepta guardar la **llave de acceso** con Face ID.

Al abrir la app, iOS pregunta "¿Usar llave de acceso?" antes de Face ID. Eso lo pone Safari y no se puede quitar desde la app: no deja usar Face ID sin un toque. Funciona igual tocar **Desbloquear con Face ID**.

## 3. Compras automáticas desde los SMS del banco (Atajos)

iPhone no deja que una app lea los SMS, pero la app **Atajos** sí puede reaccionar a un mensaje que llega y mandarlo al script. El script lo interpreta y lo deja en **Por clasificar**.

Se usa la **clave de ingreso** (`CLAVE_INGRESO` en Bitwarden): solo puede agregar cargos por clasificar, no puede leer tu plan.

### Automatización

Atajos → pestaña **Automatización** → **+** → **Mensaje**:

1. **Cuando:** el mensaje **contiene** `compra`. Deja "Remitente" vacío, porque los bancos usan varios números.
2. Marca **Ejecutar inmediatamente**. Si dejas "Ejecutar tras confirmar", te pide permiso con cada compra.
3. Toca **Siguiente** → **Nuevo atajo en blanco** → agrega la acción **Obtener contenido de URL**:
   - **URL:** la del Apps Script, la que termina en `/exec`.
   - Toca la flecha de la acción para ver más opciones:
     - **Método:** POST.
     - **Cuerpo de la solicitud:** Formulario, con 4 campos de texto:

       | Clave | Valor |
       |---|---|
       | `accion` | `ingresar` |
       | `origen` | `sms` |
       | `clave` | tu `CLAVE_INGRESO` |
       | `texto` | la variable **Entrada del atajo**: tócala y elige **Contenido** del mensaje |

Al enviarlo como formulario, ningún símbolo del mensaje (`&`, `=`, `+`, `%`) lo puede romper.

### Probar

Pide que te manden **desde otro teléfono** un SMS con "compra" y el formato del banco, o espera una compra real. En unos segundos debe aparecer en **Mes → Por clasificar**.

- Si el texto no se reconoce, igual entra como "sin interpretar".
- Si llega dos veces la misma alerta, no se duplica.
- Si la compra también llegó por correo, tampoco se duplica.

**Si cambias la clave de ingreso:** edita la automatización y cambia el campo `clave`.

## 4. Recordatorios

Los pagos y cortes llegan por **Google Tasks**, en la lista "Mi plan · pagos", a las 9 a. m. (los pagos, el día antes; los cortes, ese día). En iPhone hay que tener instalada la app **Google Tasks** con las notificaciones activadas.
