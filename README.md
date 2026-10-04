# T-800 — App Android de compras, inventario, ventas y gastos

Una sola base de código que funciona como **app Android (APK)** y también
como página web. Datos en Supabase (proyecto **Moroni**), costo $0/mes.

## Qué hace

- **Compras** a proveedores: entran a bodega, recalculan el costo promedio,
  se pagan al contado, al crédito o con abonos.
- **Inventario** en Bodega + Camión, Terminal y Floresta: cargar, devolver y
  traspasar entre ubicaciones.
- **Ventas** desde cada ubicación, con precio pactado por cliente, pago al
  contado, al crédito o con abonos.
- **Gastos** operativos (combustible, alquiler, sueldos…).
- **Inicio**: ganancia o pérdida de hoy / semana / mes / mes anterior / año
  o fechas a elegir, lo que le deben, lo que debe y el flujo de caja.
- **PDF** de cualquier periodo: Estado de resultados (ganancia o pérdida),
  Compras, Ventas, Gastos y Cuentas por cobrar/pagar. En el celular se abre
  el menú de compartir para guardarlo o enviarlo por WhatsApp o correo.
- **Anular** compras, ventas o gastos mal registrados (solo admin). El
  inventario se corrige solo.

| Rol | Puede |
|---|---|
| admin | Todo, incluso anular |
| bodega | Compras, pagos a proveedores, mover inventario, ventas desde cualquier ubicación, gastos |
| vendedor | Ventas y cobros solo desde su ubicación, gastos, ver inventario y reportes |

---

## Paso 1 — Actualizar la base de datos (una sola vez)

Ya corriste la versión 1 del esquema, así que se usa la migración, que
conserva tus 4 cuentas y tus 9 productos:

1. Supabase → proyecto **Moroni** → **SQL Editor** → **New query**.
2. Pega todo `sql/migracion_v1_a_v2.sql` → **Run**.
3. Nueva query: pega el archivo privado **`usuarios.sql`** (entregado aparte,
   no va en este repositorio porque tiene contraseñas) → **Run**.
   Al final muestra 4 filas: jorge, moroni, terminal, floresta.
4. Recomendado: **Authentication → Sign In / Providers → Email** y apaga
   **"Allow new users to sign up"**, así nadie puede crear cuentas desde fuera.

> Instalación desde cero en otro proyecto: usa `sql/schema.sql` en lugar de
> la migración y crea usuarios con
> `select crear_usuario('camion','Clave-Segura','Vendedor Camión','vendedor','Camión');`

## Paso 2 — Subir a GitHub (el APK se compila solo)

En tu carpeta `C:\Users\admin\Documents\proyecto`:

1. Borra todo **excepto la carpeta oculta `.git`**, y copia ahí el contenido
   de este zip (la carpeta `proyecto`).
2. Ejecuta:

```
git add -A
git commit -m "T-800 v2: app Android, gastos y reportes PDF"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/t-800.git
git push -u origin main
```

(El `git remote add` solo la primera vez; si dice que ya existe, sáltalo.)

3. En GitHub, pestaña **Actions**: verás "Android APK" trabajando (5-8 min).
   Al terminar en verde, el APK queda en la pestaña **Releases**.

Deja el repositorio **privado**: incluye la llave con la que se firma el APK.

## Paso 3 — Instalar en los celulares

1. En el celular, entra a GitHub con tu cuenta → tu repositorio →
   **Releases** → descarga **T-800.apk** (o descárgalo en la PC y envíalo
   por WhatsApp/cable a cada teléfono).
2. Ábrelo. Android pedirá permitir "instalar apps de origen desconocido":
   acéptalo e instala.
3. Ingresa con el usuario corto (ej. `terminal`) y su contraseña.
4. Cada quien puede cambiar su contraseña en **Más → Cambiar mi contraseña**.

Para actualizar: cada `git push` genera un APK nuevo en Releases; se instala
encima del anterior sin perder nada (los datos viven en Supabase).

## Versión web (opcional)

El mismo código funciona en Vercel: importa el repositorio en vercel.com y
listo (las claves públicas ya están en `.env.production`).

---

## Mantenimiento

- **Pausa de Supabase**: el plan gratis pausa el proyecto tras 7 días sin
  uso. Con uso diario no pasa; si ocurre, entra a supabase.com y dale
  **Restore**.
- **Productos, clientes, proveedores**: pestaña **Más → Catálogos**.
- **Nuevo usuario** (SQL Editor):
  `select crear_usuario('usuario','Contraseña','Nombre','vendedor','Camión');`
- **Olvido de contraseña** (SQL Editor):
  `update auth.users set encrypted_password = extensions.crypt('NuevaClave', extensions.gen_salt('bf')) where email = 'terminal@t800.local';`

## Estructura

```
sql/schema.sql                 Esquema completo (instalación nueva)
sql/migracion_v1_a_v2.sql      Actualización desde la v1
src/                           App (React)
src/lib/pdf.js                 Reportes PDF
android/                       Proyecto Android (Capacitor)
.github/workflows/android.yml  Compila el APK en cada push
```
