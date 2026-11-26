[README.md](https://github.com/user-attachments/files/35439196/README.md)
# EFF-EX | Control Logístico (conectado a Supabase)

## Archivos
- `index.html` – pantalla principal
- `app.js` – lógica de la app + guardado automático en Supabase
- `supabase.js` – cliente mínimo de la API REST de Supabase
- `config.js` – URL y clave publishable de tu proyecto
- `styles.css` – estilos y modo oscuro
- `sql/00_limpiar_todo.sql` – BORRA todo el esquema public (para empezar de cero)
- `sql/01_schema.sql` – crea las tablas, permisos y políticas RLS

## Pasos
1. Supabase → SQL Editor → pega y ejecuta `sql/00_limpiar_todo.sql` (borra lo que habías intentado).
2. Mismo lugar → pega y ejecuta `sql/01_schema.sql`.
3. Abre `index.html` (o súbela a Netlify). La primera vez carga las 3 OC de ejemplo en Supabase.
4. Revisa Table Editor: deben aparecer `purchase_orders`, `po_products`, `lpns`, `racks`, `operators`, `event_logs`, `app_settings`.

Indicador en el encabezado: Sincronizado / Guardando / Sin conexión (tócalo para reintentar).

## Importante
- La app no tiene login: las políticas RLS permiten leer y escribir a quien tenga la clave publishable.
- Dos dispositivos a la vez: cada uno guarda su estado completo, así que el último en guardar pisa al otro. Recarga para ver lo del otro.
- "Reiniciar Demo" ahora borra los datos guardados en Supabase (pide confirmación).
