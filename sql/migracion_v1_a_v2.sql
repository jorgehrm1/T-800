-- =====================================================================
-- T-800 · Migración v1 -> v2 (aplicada al proyecto Moroni el 2026-10-04)
-- Conserva las 4 cuentas de usuario (auth.users) y sus perfiles.
-- La v1 no tenía compras/ventas registradas, así que se reconstruye.
-- =====================================================================
create temp table _perfiles on commit drop as
  select id, nombre, rol, activo from public.profiles;

drop table if exists public.pagos_venta, public.venta_detalle, public.ventas, public.cargas_ubicacion,
  public.pagos_compra, public.compra_detalle, public.compras, public.inventario_ubicacion,
  public.inventario_bodega, public.clientes, public.proveedores, public.productos,
  public.profiles, public.ubicaciones cascade;
drop function if exists public.fn_compra_detalle_insert(), public.fn_carga_ubicacion_insert(),
  public.fn_venta_detalle_insert(), public.fn_pagos_compra_insert(), public.fn_pagos_venta_insert(),
  public.fn_rol_actual() cascade;

-- =====================================================================
-- T-800 · Esquema de base de datos (versión 2)
-- Ejecutar completo en Supabase -> SQL Editor -> New query -> Run
--
-- Diseño:
--  * Toda escritura de movimientos (compras, ventas, pagos, cargas,
--    gastos, anulaciones) pasa por funciones RPC atómicas: o se guarda
--    todo o no se guarda nada, y el inventario nunca queda a medias.
--  * Las tablas de movimientos NO aceptan INSERT/UPDATE directo desde la
--    app; solo lectura. Las RPC validan rol y reglas de negocio.
--  * Solo usuarios con perfil activo pueden leer datos (aunque alguien
--    lograra registrarse en Auth, sin perfil no ve nada).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- CATÁLOGOS
-- ---------------------------------------------------------------------
create table ubicaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  usuario text not null unique,
  nombre text not null,
  rol text not null check (rol in ('admin','bodega','vendedor')),
  ubicacion_id uuid references ubicaciones(id),  -- vendedor: su punto de venta
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  unidad_medida text not null default 'unidad',
  costo_promedio numeric(12,4) not null default 0,
  stock_minimo numeric(12,2) not null default 0,
  activo boolean not null default true
);

create table proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  contacto text,
  telefono text,
  activo boolean not null default true
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  contacto text,
  telefono text,
  activo boolean not null default true
);

-- ---------------------------------------------------------------------
-- INVENTARIO
-- ---------------------------------------------------------------------
create table inventario_bodega (
  producto_id uuid primary key references productos(id) on delete cascade,
  cantidad numeric(12,2) not null default 0 check (cantidad >= 0)
);

create table inventario_ubicacion (
  ubicacion_id uuid references ubicaciones(id) on delete cascade,
  producto_id uuid references productos(id) on delete cascade,
  cantidad numeric(12,2) not null default 0 check (cantidad >= 0),
  primary key (ubicacion_id, producto_id)
);

-- ---------------------------------------------------------------------
-- MOVIMIENTOS
-- ---------------------------------------------------------------------
create table compras (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references proveedores(id),
  usuario_id uuid references profiles(id),
  fecha date not null default current_date,
  num_factura text,
  total numeric(12,2) not null default 0,
  estado_pago text not null default 'pendiente' check (estado_pago in ('pendiente','parcial','pagado')),
  anulada boolean not null default false,
  creado_en timestamptz not null default now()
);

create table compra_detalle (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references compras(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad numeric(12,2) not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  subtotal numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored
);

create table pagos_compra (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references compras(id) on delete cascade,
  usuario_id uuid references profiles(id),
  fecha date not null default current_date,
  monto numeric(12,2) not null check (monto > 0),
  metodo_pago text not null default 'efectivo',
  creado_en timestamptz not null default now()
);

create table cargas_ubicacion (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('carga','devolucion','traspaso')),
  ubicacion_id uuid not null references ubicaciones(id),          -- destino (carga) u origen (devolución/traspaso)
  ubicacion_destino_id uuid references ubicaciones(id),           -- solo traspaso
  producto_id uuid not null references productos(id),
  cantidad numeric(12,2) not null check (cantidad > 0),
  usuario_id uuid references profiles(id),
  fecha date not null default current_date,
  creado_en timestamptz not null default now()
);

create table ventas (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references ubicaciones(id),
  vendedor_id uuid references profiles(id),
  cliente_id uuid not null references clientes(id),
  fecha date not null default current_date,
  total numeric(12,2) not null default 0,
  estado_pago text not null default 'pendiente' check (estado_pago in ('pendiente','parcial','pagado')),
  anulada boolean not null default false,
  creado_en timestamptz not null default now()
);

create table venta_detalle (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad numeric(12,2) not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  costo_unitario numeric(12,4) not null default 0,  -- costo promedio al momento de vender
  subtotal numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored
);

create table pagos_venta (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas(id) on delete cascade,
  usuario_id uuid references profiles(id),
  fecha date not null default current_date,
  monto numeric(12,2) not null check (monto > 0),
  metodo_pago text not null default 'efectivo',
  creado_en timestamptz not null default now()
);

-- Gastos operativos (combustible, alquiler, sueldos, etc.)
create table gastos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  categoria text not null,
  descripcion text,
  monto numeric(12,2) not null check (monto > 0),
  ubicacion_id uuid references ubicaciones(id),
  usuario_id uuid references profiles(id),
  anulado boolean not null default false,
  creado_en timestamptz not null default now()
);

create index on compras (fecha);
create index on ventas (fecha);
create index on gastos (fecha);
create index on pagos_compra (fecha);
create index on pagos_venta (fecha);

-- ---------------------------------------------------------------------
-- VISTAS CON SALDO (respetan RLS del usuario que consulta)
-- ---------------------------------------------------------------------
create view v_compras with (security_invoker = true) as
select c.*,
       p.nombre as proveedor,
       coalesce((select sum(monto) from pagos_compra pc where pc.compra_id = c.id), 0) as pagado,
       c.total - coalesce((select sum(monto) from pagos_compra pc where pc.compra_id = c.id), 0) as saldo
from compras c
join proveedores p on p.id = c.proveedor_id;

create view v_ventas with (security_invoker = true) as
select v.*,
       cl.nombre as cliente,
       u.nombre as ubicacion,
       pr.nombre as vendedor,
       coalesce((select sum(monto) from pagos_venta pv where pv.venta_id = v.id), 0) as cobrado,
       v.total - coalesce((select sum(monto) from pagos_venta pv where pv.venta_id = v.id), 0) as saldo
from ventas v
join clientes cl on cl.id = v.cliente_id
join ubicaciones u on u.id = v.ubicacion_id
left join profiles pr on pr.id = v.vendedor_id;

-- =====================================================================
-- FUNCIONES DE APOYO
-- =====================================================================
create or replace function fn_rol_actual() returns text
language sql stable security definer set search_path = public as $$
  select rol from profiles where id = auth.uid() and activo;
$$;

create or replace function fn_exigir_rol(p_roles text[]) returns profiles
language plpgsql stable security definer set search_path = public as $$
declare v profiles;
begin
  select * into v from profiles where id = auth.uid() and activo;
  if v.id is null then raise exception 'Usuario sin perfil activo'; end if;
  if not (v.rol = any(p_roles)) then raise exception 'Tu rol (%) no puede realizar esta acción', v.rol; end if;
  return v;
end;
$$;

create or replace function fn_estado_pago(p_total numeric, p_pagado numeric) returns text
language sql immutable as $$
  select case when p_pagado >= p_total and p_total > 0 then 'pagado'
              when p_pagado > 0 then 'parcial'
              else 'pendiente' end;
$$;

-- =====================================================================
-- RPC: COMPRAS
-- p_lineas = [{"producto_id": "...", "cantidad": 10, "precio_unitario": 5.5}, ...]
-- =====================================================================
create or replace function registrar_compra(
  p_proveedor_id uuid, p_fecha date, p_lineas jsonb,
  p_num_factura text default null, p_pago_inicial numeric default 0, p_metodo text default 'efectivo'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user profiles := fn_exigir_rol(array['admin','bodega']);
  v_id uuid; l jsonb; v_prod uuid; v_cant numeric; v_precio numeric;
  v_stock numeric; v_costo numeric; v_total numeric;
begin
  if jsonb_array_length(coalesce(p_lineas,'[]')) = 0 then raise exception 'La compra no tiene productos'; end if;

  insert into compras (proveedor_id, usuario_id, fecha, num_factura)
  values (p_proveedor_id, v_user.id, coalesce(p_fecha, current_date), nullif(p_num_factura,''))
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lineas) loop
    v_prod := (l->>'producto_id')::uuid;
    v_cant := (l->>'cantidad')::numeric;
    v_precio := (l->>'precio_unitario')::numeric;

    insert into compra_detalle (compra_id, producto_id, cantidad, precio_unitario)
    values (v_id, v_prod, v_cant, v_precio);

    insert into inventario_bodega (producto_id, cantidad) values (v_prod, 0) on conflict do nothing;

    -- costo promedio ponderado sobre TODO el stock (bodega + ubicaciones)
    select coalesce((select cantidad from inventario_bodega where producto_id = v_prod),0)
         + coalesce((select sum(cantidad) from inventario_ubicacion where producto_id = v_prod),0)
      into v_stock;
    select costo_promedio into v_costo from productos where id = v_prod for update;

    update productos
       set costo_promedio = case when v_stock + v_cant > 0
                                 then (v_stock * v_costo + v_cant * v_precio) / (v_stock + v_cant)
                                 else v_precio end
     where id = v_prod;

    update inventario_bodega set cantidad = cantidad + v_cant where producto_id = v_prod;
  end loop;

  select sum(subtotal) into v_total from compra_detalle where compra_id = v_id;
  update compras set total = v_total where id = v_id;

  if coalesce(p_pago_inicial,0) > 0 then
    perform registrar_pago_compra(v_id, least(p_pago_inicial, v_total), p_fecha, p_metodo);
  end if;
  return v_id;
end;
$$;

create or replace function registrar_pago_compra(
  p_compra_id uuid, p_monto numeric, p_fecha date default null, p_metodo text default 'efectivo'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user profiles := fn_exigir_rol(array['admin','bodega']);
  v_total numeric; v_pagado numeric; v_anulada boolean;
begin
  select total, anulada into v_total, v_anulada from compras where id = p_compra_id for update;
  if v_total is null then raise exception 'Compra no encontrada'; end if;
  if v_anulada then raise exception 'La compra está anulada'; end if;
  select coalesce(sum(monto),0) into v_pagado from pagos_compra where compra_id = p_compra_id;
  if p_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;
  if p_monto > v_total - v_pagado + 0.001 then
    raise exception 'El abono (Q%) supera el saldo pendiente (Q%)', p_monto, v_total - v_pagado;
  end if;

  insert into pagos_compra (compra_id, usuario_id, fecha, monto, metodo_pago)
  values (p_compra_id, v_user.id, coalesce(p_fecha, current_date), p_monto, coalesce(p_metodo,'efectivo'));

  update compras set estado_pago = fn_estado_pago(v_total, v_pagado + p_monto) where id = p_compra_id;
end;
$$;

-- =====================================================================
-- RPC: VENTAS
-- =====================================================================
create or replace function registrar_venta(
  p_ubicacion_id uuid, p_cliente_id uuid, p_fecha date, p_lineas jsonb,
  p_pago_inicial numeric default 0, p_metodo text default 'efectivo'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user profiles := fn_exigir_rol(array['admin','bodega','vendedor']);
  v_id uuid; l jsonb; v_prod uuid; v_cant numeric; v_precio numeric;
  v_stock numeric; v_total numeric; v_nombre text;
begin
  if v_user.rol = 'vendedor' and v_user.ubicacion_id is not null and v_user.ubicacion_id <> p_ubicacion_id then
    raise exception 'Solo puedes vender desde tu ubicación asignada';
  end if;
  if jsonb_array_length(coalesce(p_lineas,'[]')) = 0 then raise exception 'La venta no tiene productos'; end if;

  insert into ventas (ubicacion_id, vendedor_id, cliente_id, fecha)
  values (p_ubicacion_id, v_user.id, p_cliente_id, coalesce(p_fecha, current_date))
  returning id into v_id;

  for l in select * from jsonb_array_elements(p_lineas) loop
    v_prod := (l->>'producto_id')::uuid;
    v_cant := (l->>'cantidad')::numeric;
    v_precio := (l->>'precio_unitario')::numeric;

    select cantidad into v_stock from inventario_ubicacion
     where ubicacion_id = p_ubicacion_id and producto_id = v_prod for update;
    if coalesce(v_stock,0) < v_cant then
      select nombre into v_nombre from productos where id = v_prod;
      raise exception 'Stock insuficiente de % en esta ubicación (hay %)', v_nombre, coalesce(v_stock,0);
    end if;

    insert into venta_detalle (venta_id, producto_id, cantidad, precio_unitario, costo_unitario)
    values (v_id, v_prod, v_cant, v_precio, (select costo_promedio from productos where id = v_prod));

    update inventario_ubicacion set cantidad = cantidad - v_cant
     where ubicacion_id = p_ubicacion_id and producto_id = v_prod;
  end loop;

  select sum(subtotal) into v_total from venta_detalle where venta_id = v_id;
  update ventas set total = v_total where id = v_id;

  if coalesce(p_pago_inicial,0) > 0 then
    perform registrar_cobro_venta(v_id, least(p_pago_inicial, v_total), p_fecha, p_metodo);
  end if;
  return v_id;
end;
$$;

create or replace function registrar_cobro_venta(
  p_venta_id uuid, p_monto numeric, p_fecha date default null, p_metodo text default 'efectivo'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user profiles := fn_exigir_rol(array['admin','bodega','vendedor']);
  v_total numeric; v_cobrado numeric; v_anulada boolean;
begin
  select total, anulada into v_total, v_anulada from ventas where id = p_venta_id for update;
  if v_total is null then raise exception 'Venta no encontrada'; end if;
  if v_anulada then raise exception 'La venta está anulada'; end if;
  select coalesce(sum(monto),0) into v_cobrado from pagos_venta where venta_id = p_venta_id;
  if p_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;
  if p_monto > v_total - v_cobrado + 0.001 then
    raise exception 'El cobro (Q%) supera el saldo pendiente (Q%)', p_monto, v_total - v_cobrado;
  end if;

  insert into pagos_venta (venta_id, usuario_id, fecha, monto, metodo_pago)
  values (p_venta_id, v_user.id, coalesce(p_fecha, current_date), p_monto, coalesce(p_metodo,'efectivo'));

  update ventas set estado_pago = fn_estado_pago(v_total, v_cobrado + p_monto) where id = p_venta_id;
end;
$$;

-- =====================================================================
-- RPC: MOVIMIENTOS DE INVENTARIO (carga, devolución, traspaso)
-- =====================================================================
create or replace function mover_inventario(
  p_tipo text, p_ubicacion_id uuid, p_producto_id uuid, p_cantidad numeric,
  p_ubicacion_destino_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user profiles := fn_exigir_rol(array['admin','bodega']);
  v_stock numeric;
begin
  if p_cantidad <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  insert into inventario_bodega (producto_id, cantidad) values (p_producto_id, 0) on conflict do nothing;
  insert into inventario_ubicacion (ubicacion_id, producto_id, cantidad) values (p_ubicacion_id, p_producto_id, 0) on conflict do nothing;

  if p_tipo = 'carga' then
    select cantidad into v_stock from inventario_bodega where producto_id = p_producto_id for update;
    if v_stock < p_cantidad then raise exception 'Stock insuficiente en bodega (hay %)', v_stock; end if;
    update inventario_bodega set cantidad = cantidad - p_cantidad where producto_id = p_producto_id;
    update inventario_ubicacion set cantidad = cantidad + p_cantidad where ubicacion_id = p_ubicacion_id and producto_id = p_producto_id;

  elsif p_tipo in ('devolucion','traspaso') then
    select cantidad into v_stock from inventario_ubicacion where ubicacion_id = p_ubicacion_id and producto_id = p_producto_id for update;
    if v_stock < p_cantidad then raise exception 'Stock insuficiente en la ubicación de origen (hay %)', v_stock; end if;
    update inventario_ubicacion set cantidad = cantidad - p_cantidad where ubicacion_id = p_ubicacion_id and producto_id = p_producto_id;

    if p_tipo = 'devolucion' then
      update inventario_bodega set cantidad = cantidad + p_cantidad where producto_id = p_producto_id;
    else
      if p_ubicacion_destino_id is null or p_ubicacion_destino_id = p_ubicacion_id then
        raise exception 'Selecciona una ubicación destino distinta';
      end if;
      insert into inventario_ubicacion (ubicacion_id, producto_id, cantidad) values (p_ubicacion_destino_id, p_producto_id, 0) on conflict do nothing;
      update inventario_ubicacion set cantidad = cantidad + p_cantidad where ubicacion_id = p_ubicacion_destino_id and producto_id = p_producto_id;
    end if;
  else
    raise exception 'Tipo de movimiento inválido';
  end if;

  insert into cargas_ubicacion (tipo, ubicacion_id, ubicacion_destino_id, producto_id, cantidad, usuario_id)
  values (p_tipo, p_ubicacion_id, case when p_tipo = 'traspaso' then p_ubicacion_destino_id end, p_producto_id, p_cantidad, v_user.id);
end;
$$;

-- =====================================================================
-- RPC: GASTOS
-- =====================================================================
create or replace function registrar_gasto(
  p_fecha date, p_categoria text, p_monto numeric,
  p_descripcion text default null, p_ubicacion_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user profiles := fn_exigir_rol(array['admin','bodega','vendedor']);
  v_id uuid;
begin
  if coalesce(trim(p_categoria),'') = '' then raise exception 'Indica la categoría del gasto'; end if;
  insert into gastos (fecha, categoria, descripcion, monto, ubicacion_id, usuario_id)
  values (coalesce(p_fecha, current_date), trim(p_categoria), nullif(trim(coalesce(p_descripcion,'')),''), p_monto,
          case when v_user.rol = 'vendedor' then coalesce(v_user.ubicacion_id, p_ubicacion_id) else p_ubicacion_id end,
          v_user.id)
  returning id into v_id;
  return v_id;
end;
$$;

-- =====================================================================
-- RPC: ANULACIONES (solo admin) — para corregir errores de registro
-- =====================================================================
create or replace function anular_venta(p_venta_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_venta ventas; d record;
begin
  perform fn_exigir_rol(array['admin']);
  select * into v_venta from ventas where id = p_venta_id for update;
  if v_venta.id is null then raise exception 'Venta no encontrada'; end if;
  if v_venta.anulada then raise exception 'La venta ya estaba anulada'; end if;
  -- el producto regresa a la ubicación de donde salió
  for d in select producto_id, cantidad from venta_detalle where venta_id = p_venta_id loop
    insert into inventario_ubicacion (ubicacion_id, producto_id, cantidad) values (v_venta.ubicacion_id, d.producto_id, 0) on conflict do nothing;
    update inventario_ubicacion set cantidad = cantidad + d.cantidad
     where ubicacion_id = v_venta.ubicacion_id and producto_id = d.producto_id;
  end loop;
  update ventas set anulada = true where id = p_venta_id;
end;
$$;

create or replace function anular_compra(p_compra_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_compra compras; d record; v_stock numeric; v_nombre text;
begin
  perform fn_exigir_rol(array['admin']);
  select * into v_compra from compras where id = p_compra_id for update;
  if v_compra.id is null then raise exception 'Compra no encontrada'; end if;
  if v_compra.anulada then raise exception 'La compra ya estaba anulada'; end if;
  for d in select producto_id, cantidad from compra_detalle where compra_id = p_compra_id loop
    select cantidad into v_stock from inventario_bodega where producto_id = d.producto_id for update;
    if coalesce(v_stock,0) < d.cantidad then
      select nombre into v_nombre from productos where id = d.producto_id;
      raise exception 'No se puede anular: ya no hay suficiente % en bodega (hay %, la compra fue de %)', v_nombre, coalesce(v_stock,0), d.cantidad;
    end if;
    update inventario_bodega set cantidad = cantidad - d.cantidad where producto_id = d.producto_id;
  end loop;
  update compras set anulada = true where id = p_compra_id;
end;
$$;

create or replace function anular_gasto(p_gasto_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform fn_exigir_rol(array['admin']);
  update gastos set anulado = true where id = p_gasto_id;
end;
$$;

-- =====================================================================
-- RPC: REPORTE / ESTADO DE RESULTADOS de un periodo
-- =====================================================================
create or replace function reporte_periodo(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb;
  v_ventas numeric; v_costo numeric; v_gastos numeric; v_compras numeric;
  v_pagos_prov numeric; v_cobros numeric; v_por_cobrar numeric; v_por_pagar numeric;
begin
  perform fn_exigir_rol(array['admin','bodega','vendedor']);

  select coalesce(sum(d.subtotal),0), coalesce(sum(d.cantidad * d.costo_unitario),0)
    into v_ventas, v_costo
    from venta_detalle d join ventas v on v.id = d.venta_id
   where not v.anulada and v.fecha between p_desde and p_hasta;

  select coalesce(sum(monto),0) into v_gastos from gastos
   where not anulado and fecha between p_desde and p_hasta;

  select coalesce(sum(total),0) into v_compras from compras
   where not anulada and fecha between p_desde and p_hasta;

  select coalesce(sum(pc.monto),0) into v_pagos_prov from pagos_compra pc join compras c on c.id = pc.compra_id
   where not c.anulada and pc.fecha between p_desde and p_hasta;

  select coalesce(sum(pv.monto),0) into v_cobros from pagos_venta pv join ventas v on v.id = pv.venta_id
   where not v.anulada and pv.fecha between p_desde and p_hasta;

  -- saldos abiertos al día de hoy (no dependen del periodo)
  select coalesce(sum(saldo),0) into v_por_cobrar from v_ventas where not anulada and saldo > 0;
  select coalesce(sum(saldo),0) into v_por_pagar from v_compras where not anulada and saldo > 0;

  r := jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'ventas', round(v_ventas,2),
    'costo_ventas', round(v_costo,2),
    'utilidad_bruta', round(v_ventas - v_costo,2),
    'gastos', round(v_gastos,2),
    'utilidad_neta', round(v_ventas - v_costo - v_gastos,2),
    'compras', round(v_compras,2),
    'pagos_proveedores', round(v_pagos_prov,2),
    'cobros_clientes', round(v_cobros,2),
    'flujo_caja', round(v_cobros - v_pagos_prov - v_gastos,2),
    'por_cobrar', round(v_por_cobrar,2),
    'por_pagar', round(v_por_pagar,2),
    'por_producto', coalesce((
      select jsonb_agg(x order by x->>'producto') from (
        select jsonb_build_object(
          'producto', p.nombre,
          'cantidad', sum(d.cantidad),
          'ventas', round(sum(d.subtotal),2),
          'costo', round(sum(d.cantidad * d.costo_unitario),2),
          'utilidad', round(sum(d.subtotal) - sum(d.cantidad * d.costo_unitario),2)) x
        from venta_detalle d join ventas v on v.id = d.venta_id join productos p on p.id = d.producto_id
        where not v.anulada and v.fecha between p_desde and p_hasta
        group by p.nombre) s), '[]'::jsonb),
    'por_ubicacion', coalesce((
      select jsonb_agg(x order by x->>'ubicacion') from (
        select jsonb_build_object(
          'ubicacion', u.nombre,
          'ventas', round(coalesce(sum(d.subtotal),0),2),
          'utilidad', round(coalesce(sum(d.subtotal) - sum(d.cantidad * d.costo_unitario),0),2)) x
        from ubicaciones u
        left join ventas v on v.ubicacion_id = u.id and not v.anulada and v.fecha between p_desde and p_hasta
        left join venta_detalle d on d.venta_id = v.id
        group by u.nombre) s), '[]'::jsonb),
    'gastos_por_categoria', coalesce((
      select jsonb_agg(x order by (x->>'monto')::numeric desc) from (
        select jsonb_build_object('categoria', categoria, 'monto', round(sum(monto),2)) x
        from gastos where not anulado and fecha between p_desde and p_hasta
        group by categoria) s), '[]'::jsonb)
  );
  return r;
end;
$$;

-- =====================================================================
-- CREAR USUARIOS (solo desde el SQL Editor de Supabase; la app no puede)
-- select crear_usuario('camion', 'ContraseñaSegura', 'Vendedor Camión', 'vendedor', 'Camión');
-- El usuario entra a la app escribiendo solo "camion" + su contraseña.
-- =====================================================================
create or replace function crear_usuario(
  p_usuario text, p_password text, p_nombre text, p_rol text, p_ubicacion text default null
) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_usuario)) || '@t800.local';
  v_ubic uuid;
begin
  if p_ubicacion is not null then
    select id into v_ubic from ubicaciones where nombre = p_ubicacion;
    if v_ubic is null then raise exception 'Ubicación % no existe', p_ubicacion; end if;
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
          crypt(p_password, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('nombre', p_nombre), now(), now(),
          '', '', '', '');

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());

  insert into profiles (id, usuario, nombre, rol, ubicacion_id)
  values (v_id, lower(trim(p_usuario)), p_nombre, p_rol, v_ubic);
  return v_id;
end;
$$;

-- =====================================================================
-- PERMISOS DE EJECUCIÓN
-- =====================================================================
revoke execute on all functions in schema public from public, anon;
grant execute on function fn_rol_actual(), registrar_compra(uuid,date,jsonb,text,numeric,text),
  registrar_pago_compra(uuid,numeric,date,text), registrar_venta(uuid,uuid,date,jsonb,numeric,text),
  registrar_cobro_venta(uuid,numeric,date,text), mover_inventario(text,uuid,uuid,numeric,uuid),
  registrar_gasto(date,text,numeric,text,uuid), anular_venta(uuid), anular_compra(uuid), anular_gasto(uuid),
  reporte_periodo(date,date)
  to authenticated;
revoke execute on function crear_usuario(text,text,text,text,text) from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

-- =====================================================================
-- SEGURIDAD (RLS)
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['ubicaciones','profiles','productos','proveedores','clientes',
    'inventario_bodega','inventario_ubicacion','compras','compra_detalle','pagos_compra',
    'cargas_ubicacion','ventas','venta_detalle','pagos_venta','gastos']
  loop
    execute format('alter table %I enable row level security', t);
    -- lectura: solo usuarios con perfil activo
    execute format('create policy leer on %I for select to authenticated using (fn_rol_actual() is not null)', t);
  end loop;
end $$;

-- catálogos editables desde la app
create policy editar_productos on productos for all to authenticated
  using (fn_rol_actual() in ('admin','bodega')) with check (fn_rol_actual() in ('admin','bodega'));
create policy editar_proveedores on proveedores for all to authenticated
  using (fn_rol_actual() in ('admin','bodega')) with check (fn_rol_actual() in ('admin','bodega'));
create policy editar_clientes on clientes for all to authenticated
  using (fn_rol_actual() is not null) with check (fn_rol_actual() is not null);
-- inventario y movimientos: sin políticas de escritura -> solo vía RPC

-- =====================================================================
-- DATOS INICIALES
-- =====================================================================
insert into ubicaciones (nombre) values ('Camión'), ('Terminal'), ('Floresta');

insert into productos (nombre) values
  ('ANY'), ('ZULY'), ('MAYO'), ('BOLAS'), ('BOLSAS'), ('HABA'), ('CHORI'), ('TG'), ('TP');

insert into inventario_bodega (producto_id, cantidad) select id, 0 from productos;
insert into inventario_ubicacion (ubicacion_id, producto_id, cantidad)
  select u.id, p.id, 0 from ubicaciones u cross join productos p;


-- ---- restaurar perfiles con nombre de usuario y ubicación ----
insert into public.profiles (id, usuario, nombre, rol, ubicacion_id, activo)
select p.id, lower(p.nombre), p.nombre, p.rol,
       (select u.id from public.ubicaciones u where lower(u.nombre) = lower(p.nombre)),
       p.activo
from _perfiles p;
