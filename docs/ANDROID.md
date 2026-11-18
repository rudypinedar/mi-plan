# Mi plan en Android

La app es la misma para iPhone y Android: una página web que se instala como app. No hay que bajar nada de Play Store.

## 1. Instalar la app

1. Abre **Chrome** y entra a https://rudypinedar.github.io/mi-plan/
2. Pega el **código de conexión** de Bitwarden (nota "Mi plan · claves", empieza con `miplan1:`) y toca **Conectar**.
3. Instálala de una de estas dos formas:
   - En la app: **Más → Instalar en tu teléfono → Instalar app**.
   - En Chrome: **menú ⋮ → Instalar app** (o "Agregar a la pantalla principal").

Ya instalada:

- Se abre como app, sin la barra del navegador.
- Funciona sin señal: guarda una copia en el teléfono y sincroniza cuando vuelve la conexión.
- **Mantén presionado el ícono** para ver dos accesos directos: **Anotar gasto** y **Por clasificar**.

## 2. Compras automáticas desde los SMS del banco

Android sí permite que una app lea los SMS (iPhone no). Se usa una app de automatización, por ejemplo **MacroDroid** (gratis en Play Store), para reenviar cada alerta de compra al script. El script la interpreta y la deja en **Por clasificar**.

La **clave de ingreso** solo puede agregar cargos por clasificar: no puede leer tu plan. Por eso es la que se pone en el teléfono para esto. Está en Bitwarden como `CLAVE_INGRESO`.

### Macro en MacroDroid

Los nombres de los botones pueden variar un poco según la versión.

1. **Agregar macro → Disparador → Mensaje SMS recibido.**
   - Remitente: cualquiera, o el número de alertas de tu banco.
   - Contenido: que **contenga** `compra`.
2. **Acción → Solicitud HTTP** (HTTP Request):
   - Método: **POST**.
   - URL: la dirección del Apps Script (en Bitwarden, "URL del Apps Script"; termina en `/exec`).
   - Cuerpo: **formulario** (`application/x-www-form-urlencoded`) con estos campos:

     | Campo | Valor |
     |---|---|
     | `accion` | `ingresar` |
     | `clave` | tu `CLAVE_INGRESO` |
     | `texto` | la variable con **el texto del SMS** (en MacroDroid se elige con el botón de variables) |
     | `origen` | `sms` |

   - Activa **seguir redirecciones** si la opción aparece: Google responde con una redirección.
3. Guarda la macro y dale permiso a MacroDroid para **leer SMS** y para **funcionar en segundo plano** (sin ahorro de batería).

### Probar

Mándate un SMS de prueba que **contenga** "compra" y el formato del banco, o espera una compra real. En unos segundos debe aparecer en **Mes → Por clasificar**.

- Si el texto no se reconoce, igual entra como "sin interpretar".
- Si llega dos veces la misma alerta, no se duplica.
- Si la compra también llegó por correo, tampoco se duplica.

Formatos que ya se reconocen:

- **Cuscatlán:** "Alerta de compra … Tarjeta de Credito Titular 1234 por USD88.32 en COMERCIO el 2026-11-08 15:17".
- **BAC:** "Alertas PRF VISA 1234: has realizado una compra por USD 109.99 en el comercio: COMERCIO 2026/11/08 16:32:03".

## 3. Pendiente

- **Bloqueo con huella o rostro:** el mismo trabajo del Face ID de iPhone (Fase 2) sirve para la huella de Android.
- **Notificaciones** (Fase 5): en Android funcionan incluso sin instalar la app. Por ahora los recordatorios de pago llegan por el calendario "Mi plan · pagos".
