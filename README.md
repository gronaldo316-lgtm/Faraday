# EFF-EX
**Menos errores en el andén.**

EFF-EX controla la recepción y salida de mercancía de un CEDIS en Veracruz con códigos de barras: cada paso se confirma escaneando y cualquier error se bloquea al momento.

> ⚠️ **DATOS DE EJEMPLO.** Las órdenes, proveedores, RFC y operadores que carga la app la primera vez son ficticios.

## El problema
Recibir, ubicar y despachar tarimas con papel y captura manual provoca productos en el rack equivocado, órdenes recibidas dos veces, salidas duplicadas y cobros de almacenaje mal calculados.

**Para quién:** el personal de andén, el montacarguista, el despachador y quien factura la estancia.

## Cómo funciona
1. **Check OC:** se escanea el código de barras de la Orden de Compra del chofer. Si no existe o ya se recibió, se bloquea.
2. **Etiquetas:** se genera una etiqueta Code-128 por producto (`P-501-01`) con su rack asignado, lista para imprimir.
3. **Asignación de rack:** el montacarguista escanea el rack; si no es el asignado, se bloquea.
4. **Despacho:** doble escaneo (rack y producto) libera el rack y manda la tarima a un andén de salida; se asigna un operador disponible.
5. **Unidades:** 3 operadores y tráileres; si los 3 están en ruta, no se puede despachar. Se registra su regreso a base.
6. **Estancia $:** días en almacén × tarifa diaria por orden.
7. **Bitácora:** PDF oficial de cada OC con código de barras y registro de validaciones y bloqueos.
8. **Nueva OC:** alta con folio automático, SKU automáticos y tarifa diaria.

## Arquitectura
Aplicación estática en el navegador que guarda su estado en **Supabase** (PostgreSQL + API REST), sin servidor propio. Detalle, diagrama y tablas en [`docs/arquitectura.md`](docs/arquitectura.md); identidad visual en [`docs/diseno.md`](docs/diseno.md).

## Cómo usarlo
1. En Supabase → SQL Editor, ejecuta `sql/00_limpiar_todo.sql` (solo si quieres empezar de cero; **borra todo**) y luego `sql/01_schema.sql`.
2. Revisa `frontend/static/js/config.js` (URL y clave **publishable** de tu proyecto; nunca la `secret`).
3. Abre `frontend/index.html` en el navegador, o publica la carpeta `frontend/` (por ejemplo arrastrándola a Netlify). Para escanear con la cámara hace falta HTTPS o `localhost`.

La primera vez se cargan 3 órdenes de ejemplo. El botón de reinicio (↺) borra los datos guardados y las vuelve a cargar.

---

## Bitácora de IA

### 2026-11-25 · Primera versión de la app
- **Qué se hizo:** `index.html` único con las 8 pantallas, escaneo por cámara, etiquetas Code-128, PDF de la OC y modo oscuro.
- **Herramientas de IA:** Gemini generó esta versión a partir de lo que el equipo pidió.

### 2026-11-26 · Conexión a Supabase
- **Qué se cambió:**

  | Archivo | Qué hace |
  |---|---|
  | `sql/01_schema.sql` | Crea las 7 tablas, permisos y políticas RLS. |
  | `sql/00_limpiar_todo.sql` | Borra el esquema `public` para empezar limpio. |
  | `frontend/static/js/supabase.js` | Cliente REST mínimo con `fetch`; usa solo la clave publishable. |
  | `frontend/static/js/app.js` | Carga el estado al abrir, guarda solo las tablas que cambiaron e indica "Sincronizado / Guardando / Sin conexión". |

- **Funcionalidad:** los datos sobreviven a recargar la página y se comparten entre dispositivos. Se probó la carga, el guardado, la recarga y el reinicio contra un Supabase simulado; falta probarlo en el proyecto real.
- **Decisión de seguridad:** al no haber login, las políticas permiten leer y escribir con la clave publishable. Pendiente: Supabase Auth.
- **Herramientas de IA:** Claude separó el código en archivos, escribió el SQL y la capa de sincronización; el equipo lo revisa y lo ejecuta.

### 2026-11-26 · Estructura del repositorio y documentación
- **Qué se agregó:** `README.md`, `docs/arquitectura.md`, `docs/diseno.md` y reorganización en `frontend/`, `sql/` y `docs/`.
- **Herramientas de IA:** Claude redactó la documentación tomando como modelo el formato de Fluport.
