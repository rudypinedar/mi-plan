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

### Macro en MacroDroid (así quedó configurada en el S24 Ultra)

Macro **"Mi plan - SMS de compras"**:

1. **Disparador:** "SMS recibido", de cualquier número, **contiene** `compra`.
2. **Acción:** Interacciones web → **Solicitud HTTP**:
   - **Configuración:**
     - Método **POST**.
     - URL: la del Apps Script, que termina en `/exec`.
     - **Seguir redireccionamientos** activado, porque Google responde con una redirección.
   - **Parámetros de consulta** (van en la dirección):

     | Nombre | Valor |
     |---|---|
     | `accion` | `ingresar` |
     | `origen` | `sms` |
     | `clave` | tu `CLAVE_INGRESO` |

   - **Cuerpo del contenido:** tipo `text/plain`, con el texto mágico **"Mensaje del SMS entrante"** (`{sms_message}`).

     El SMS va **tal cual**: ningún símbolo del mensaje (`&`, `=`, `+`, `%`) lo puede romper.
3. **Permisos:**
   - **Recibir SMS:** sí.
   - **Batería:** sin restricciones (Ajustes → Aplicaciones → MacroDroid → Batería).

**Si cambias la clave de ingreso:** edita la macro → toca la acción → Configurar → Parámetros de consulta → `clave`. El script la cambia con la acción `cambiarClaveIngreso`, que solo funciona con la clave de la app.

### Probar

Pide que te manden **desde otro teléfono** un SMS que contenga "compra" y el formato del banco, o espera una compra real.

Un mensaje a tu propio número **no sirve**: Samsung lo manda como chat (RCS), no como SMS, y MacroDroid no lo ve. En unos segundos debe aparecer en **Mes → Por clasificar**.

- Si el texto no se reconoce, igual entra como "sin interpretar".
- Si llega dos veces la misma alerta, no se duplica.
- Si la compra también llegó por correo, tampoco se duplica.

Formatos que ya se reconocen:

- **Cuscatlán:** "Alerta de compra … Tarjeta de Credito Titular 1234 por USD88.32 en COMERCIO el 2026-11-08 15:17".
- **BAC:** "Alertas PRF VISA 1234: has realizado una compra por USD 109.99 en el comercio: COMERCIO 2026/11/08 16:32:03".

## 3. Bloqueo con huella

**Más → Seguridad → Activar bloqueo**:

1. Crea un código de 4 a 6 números. Es el respaldo si la huella falla.
2. El teléfono te pide la huella o el rostro.

Desde ahí la app pide la huella al abrirse, y tus datos en el teléfono quedan cifrados. Si olvidas el código: "Olvidé mi código" borra la copia del teléfono y vuelves a conectar con el código de Bitwarden. Tus datos siguen en el Sheet.

## 4. Pendiente

- **Notificaciones** (Fase 5): en Android funcionan incluso sin instalar la app. Por ahora los recordatorios de pagos y cortes llegan por **Google Tasks**, en la lista "Mi plan · pagos": avisan a las 9 a. m. (los pagos, el día antes; los cortes, ese día).
