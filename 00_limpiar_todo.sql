-- ⚠️ BORRA TODO el esquema "public" (tablas, vistas, funciones, datos).
-- No toca los usuarios de Authentication. Ejecútalo SOLO si quieres empezar de cero.
drop schema public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
