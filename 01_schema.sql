-- EFF-EX | Esquema de base de datos para Supabase
-- Ejecutar DESPUÉS de 00_limpiar_todo.sql (o en un proyecto limpio).

-- 1) Contadores y estado global
create table if not exists public.app_settings (
  id                    int primary key default 1 check (id = 1),
  po_seq                int not null default 504,
  sku_seq               int not null default 7,
  blocked_count         int not null default 0,
  outbound_dock_cursor  int not null default 0,
  last_scanned_po_code  text,
  selected_forklift_lpn text,
  updated_at            timestamptz not null default now()
);

-- 2) Órdenes de compra
create table if not exists public.purchase_orders (
  code                 text primary key,
  supplier             text not null,
  rfc                  text,
  invoice              text,
  po_date              date,
  contact              text,
  dock                 text,
  daily_rate           numeric(12,2) not null default 450,
  days_in_warehouse    int not null default 1,
  status               text not null default 'PENDIENTE' check (status in ('PENDIENTE','RECIBIDA')),
  next_step_dismissed  boolean not null default false,
  sort_order           int not null default 0,
  created_at           timestamptz not null default now()
);

-- 3) Productos de cada orden
create table if not exists public.po_products (
  id          bigint generated always as identity primary key,
  po_code     text not null references public.purchase_orders(code) on delete cascade,
  sort_order  int not null default 0,
  name        text not null,
  sku         text not null,
  qty         text not null default '1 Tarima',
  aisle       text not null default 'A',
  unique (po_code, sort_order)
);

-- 4) Etiquetas / tarimas (LPN)
create table if not exists public.lpns (
  id                     text primary key,
  po_code                text not null references public.purchase_orders(code) on delete cascade,
  product                text not null,
  qty                    text,
  rack                   text,
  status                 text not null default 'POR_ETIQUETAR'
                         check (status in ('POR_ETIQUETAR','ACOMODADO_EN_RACK','VERIFICADO_EN_RACK','DESPACHADA')),
  dispatch_rack_scanned  boolean not null default false,
  dispatch_prod_scanned  boolean not null default false,
  sort_order             int not null default 0,
  created_at             timestamptz not null default now()
);

-- 5) Racks
create table if not exists public.racks (
  code     text primary key,
  aisle    text not null,
  status   text not null default 'LIBRE' check (status in ('LIBRE','RESERVADO','OCUPADO')),
  lpn      text,
  product  text
);

-- 6) Operadores / tráilers
create table if not exists public.operators (
  id             text primary key,
  name           text not null,
  unit           text not null,
  assigned_dock  text,
  status         text not null default 'DISPONIBLE' check (status in ('DISPONIBLE','EN_RUTA')),
  assigned_ref   text
);

-- 7) Bitácora de eventos y bloqueos
create table if not exists public.event_logs (
  id          bigint generated always as identity primary key,
  time        text,
  ref         text,
  msg         text,
  ok          boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_po_products_po on public.po_products(po_code);
create index if not exists idx_lpns_po        on public.lpns(po_code);
create index if not exists idx_logs_id        on public.event_logs(id desc);

-- Permisos para la API
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- Seguridad por fila (RLS)
-- ⚠️ La app no tiene login todavía, así que estas políticas permiten leer y escribir a quien tenga la clave publishable.
-- Cuando agregues Supabase Auth, cambia "to anon, authenticated" por "to authenticated".
do $$
declare t text;
begin
  foreach t in array array['app_settings','purchase_orders','po_products','lpns','racks','operators','event_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "effex_all" on public.%I', t);
    execute format('create policy "effex_all" on public.%I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;
