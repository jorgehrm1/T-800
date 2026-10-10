-- =====================================================================
-- T-800 · Migración v2 -> v3: cada vendedor solo ve lo de su ubicación
--
--  * admin y bodega: ven todo el negocio (como antes).
--  * vendedor: solo ventas, cobros, saldos por cobrar, gastos e inventario
--    de SU ubicación. No ve compras, proveedores, bodega, costos ni
--    ganancias, ni los totales del negocio.
--  * Los costos (costo promedio y costo de cada venta) pasan a tablas
--    aparte que solo admin y bodega pueden leer.
--
-- La restricción vive en la base de datos (RLS), no solo en la pantalla.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Funciones de alcance
-- ---------------------------------------------------------------------
create or replace function fn_ve_todo() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol in ('admin','bodega') from profiles where id = auth.uid() and activo), false);
$$;

create or replace function fn_mi_ubicacion() returns uuid
language sql stable security definer set search_path = public as $$
  select ubicacion_id from profiles where id = auth.uid() and activo and rol = 'vendedor';
$$;

grant execute on function fn_ve_todo(), fn_mi_ubicacion() to authenticated;

-- ---------------------------------------------------------------------
-- 2) Costos en tablas aparte (solo admin / bodega)
-- ---------------------------------------------------------------------
create table costos_producto (
  producto_id uuid primary key references productos(id) on delete cascade,
  costo_promedio numeric(12,4) not null default 0
);
insert into costos_producto (producto_id, costo_promedio)
  select id, costo_promedio from productos;
alter table productos drop column costo_promedio;

create table venta_detalle_costo (
  venta_detalle_id uuid primary key references venta_detalle(id) on delete cascade,
  costo_unitario numeric(12,4) not null default 0
);
insert into venta_detalle_costo (venta_detalle_id, costo_unitario)
  select id, costo_unitario from venta_detalle;
alter table venta_detalle drop column costo_unitario;

alter table costos_producto enable row level security;
alter table venta_detalle_costo enable row level security;

-- ---------------------------------------------------------------------
-- 3) Reglas de lectura por alcance
-- ---------------------------------------------------------------------
drop policy if exists leer on profiles;
drop policy if exists leer on proveedores;
drop policy if exists leer on inventario_bodega;
drop policy if exists leer on inventario_ubicacion;
drop policy if exists leer on compras;
drop policy if exists leer on compra_detalle;
drop policy if exists leer on pagos_compra;
drop policy if exists leer on cargas_ubicacion;
drop policy if exists leer on ventas;
drop policy if exists leer on venta_detalle;
drop policy if exists leer on pagos_venta;
drop policy if exists leer on gastos;
-- 'editar_proveedores' (for all) también daba lectura: se separa
drop policy if exists editar_proveedores on proveedores;

-- Perfiles: cada quien el suyo; admin/bodega todos
create policy leer on profiles for select to authenticated
  using (id = auth.uid() or fn_ve_todo());

-- Solo admin / bodega
create policy leer on proveedores        for select to authenticated using (fn_ve_todo());
create policy leer on inventario_bodega  for select to authenticated using (fn_ve_todo());
create policy leer on compras            for select to authenticated using (fn_ve_todo());
create policy leer on compra_detalle     for select to authenticated using (fn_ve_todo());
create policy leer on pagos_compra       for select to authenticated using (fn_ve_todo());
create policy leer on costos_producto    for select to authenticated using (fn_ve_todo());
create policy leer on venta_detalle_costo for select to authenticated using (fn_ve_todo());

create policy editar_proveedores_ins on proveedores for insert to authenticated with check (fn_ve_todo());
create policy editar_proveedores_upd on proveedores for update to authenticated using (fn_ve_todo()) with check (fn_ve_todo());
create policy editar_proveedores_del on proveedores for delete to authenticated using (fn_ve_todo());

-- Por ubicación
create policy leer on inventario_ubicacion for select to authenticated
  using (fn_ve_todo() or ubicacion_id = fn_mi_ubicacion());

create policy leer on cargas_ubicacion for select to authenticated
  using (fn_ve_todo() or ubicacion_id = fn_mi_ubicacion() or ubicacion_destino_id = fn_mi_ubicacion());

create policy leer on ventas for select to authenticated
  using (fn_ve_todo() or ubicacion_id = fn_mi_ubicacion());

create policy leer on venta_detalle for select to authenticated
  using (fn_ve_todo() or exists (select 1 from ventas v where v.id = venta_id and v.ubicacion_id = fn_mi_ubicacion()));

create policy leer on pagos_venta for select to authenticated
  using (fn_ve_todo() or exists (select 1 from ventas v where v.id = venta_id and v.ubicacion_id = fn_mi_ubicacion()));

create policy leer on gastos for select to authenticated
  using (fn_ve_todo() or ubicacion_id = fn_mi_ubicacion() or usuario_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4) Funciones que usan costos o necesitan el alcance
-- ---------------------------------------------------------------------
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
    insert into costos_producto (producto_id, costo_promedio) values (v_prod, 0) on conflict do nothing;

    -- costo promedio ponderado sobre TODO el stock (bodega + ubicaciones)
    select coalesce((select cantidad from inventario_bodega where producto_id = v_prod),0)
         + coalesce((select sum(cantidad) from inventario_ubicacion where producto_id = v_prod),0)
      into v_stock;
    select costo_promedio into v_costo from costos_producto where producto_id = v_prod for update;

    update costos_producto
       set costo_promedio = case when v_stock + v_cant > 0
                                 then (v_stock * v_costo + v_cant * v_precio) / (v_stock + v_cant)
                                 else v_precio end
     where producto_id = v_prod;

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

create or replace function registrar_venta(
  p_ubicacion_id uuid, p_cliente_id uuid, p_fecha date, p_lineas jsonb,
  p_pago_inicial numeric default 0, p_metodo text default 'efectivo'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user profiles := fn_exigir_rol(array['admin','bodega','vendedor']);
  v_id uuid; v_det uuid; l jsonb; v_prod uuid; v_cant numeric; v_precio numeric;
  v_stock numeric; v_total numeric; v_nombre text;
begin
  if v_user.rol = 'vendedor' and v_user.ubicacion_id is distinct from p_ubicacion_id then
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

    insert into venta_detalle (venta_id, producto_id, cantidad, precio_unitario)
    values (v_id, v_prod, v_cant, v_precio)
    returning id into v_det;

    insert into venta_detalle_costo (venta_detalle_id, costo_unitario)
    values (v_det, coalesce((select costo_promedio from costos_producto where producto_id = v_prod), 0));

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
  v_total numeric; v_cobrado numeric; v_anulada boolean; v_ub uuid;
begin
  select total, anulada, ubicacion_id into v_total, v_anulada, v_ub from ventas where id = p_venta_id for update;
  if v_total is null then raise exception 'Venta no encontrada'; end if;
  if v_user.rol = 'vendedor' and v_user.ubicacion_id is distinct from v_ub then
    raise exception 'Venta no encontrada';
  end if;
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

-- Reporte: admin/bodega ven el negocio completo; un vendedor solo su
-- ubicación, sin costos, compras, proveedores ni ganancias.
create or replace function reporte_periodo(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_user profiles := fn_exigir_rol(array['admin','bodega','vendedor']);
  v_todo boolean; v_ub uuid; v_ub_nombre text;
  v_ventas numeric; v_costo numeric; v_gastos numeric; v_compras numeric;
  v_pagos_prov numeric; v_cobros numeric; v_por_cobrar numeric; v_por_pagar numeric;
begin
  v_todo := v_user.rol in ('admin','bodega');
  v_ub := case when v_todo then null else v_user.ubicacion_id end;
  select nombre into v_ub_nombre from ubicaciones where id = v_ub;

  select coalesce(sum(d.subtotal),0), coalesce(sum(d.cantidad * coalesce(c.costo_unitario,0)),0)
    into v_ventas, v_costo
    from venta_detalle d
    join ventas v on v.id = d.venta_id
    left join venta_detalle_costo c on c.venta_detalle_id = d.id
   where not v.anulada and v.fecha between p_desde and p_hasta
     and (v_todo or v.ubicacion_id = v_ub);

  select coalesce(sum(g.monto),0) into v_gastos from gastos g
   where not g.anulado and g.fecha between p_desde and p_hasta
     and (v_todo or g.ubicacion_id = v_ub or g.usuario_id = v_user.id);

  select coalesce(sum(pv.monto),0) into v_cobros
    from pagos_venta pv join ventas v on v.id = pv.venta_id
   where not v.anulada and pv.fecha between p_desde and p_hasta
     and (v_todo or v.ubicacion_id = v_ub);

  select coalesce(sum(vv.saldo),0) into v_por_cobrar from v_ventas vv
   where not vv.anulada and vv.saldo > 0
     and (v_todo or vv.ubicacion_id = v_ub);

  if not v_todo then
    return jsonb_build_object(
      'alcance', 'ubicacion',
      'ubicacion', v_ub_nombre,
      'desde', p_desde, 'hasta', p_hasta,
      'ventas', round(v_ventas,2),
      'gastos', round(v_gastos,2),
      'cobros_clientes', round(v_cobros,2),
      'efectivo', round(v_cobros - v_gastos,2),
      'por_cobrar', round(v_por_cobrar,2),
      'por_producto', coalesce((
        select jsonb_agg(x order by x->>'producto') from (
          select jsonb_build_object('producto', p.nombre, 'cantidad', sum(d.cantidad), 'ventas', round(sum(d.subtotal),2)) x
          from venta_detalle d join ventas v on v.id = d.venta_id join productos p on p.id = d.producto_id
          where not v.anulada and v.fecha between p_desde and p_hasta and v.ubicacion_id = v_ub
          group by p.nombre) s), '[]'::jsonb),
      'gastos_por_categoria', coalesce((
        select jsonb_agg(x order by (x->>'monto')::numeric desc) from (
          select jsonb_build_object('categoria', g.categoria, 'monto', round(sum(g.monto),2)) x
          from gastos g
          where not g.anulado and g.fecha between p_desde and p_hasta
            and (g.ubicacion_id = v_ub or g.usuario_id = v_user.id)
          group by g.categoria) s), '[]'::jsonb)
    );
  end if;

  select coalesce(sum(total),0) into v_compras from compras
   where not anulada and fecha between p_desde and p_hasta;

  select coalesce(sum(pc.monto),0) into v_pagos_prov from pagos_compra pc join compras c on c.id = pc.compra_id
   where not c.anulada and pc.fecha between p_desde and p_hasta;

  select coalesce(sum(saldo),0) into v_por_pagar from v_compras where not anulada and saldo > 0;

  return jsonb_build_object(
    'alcance', 'total',
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
          'costo', round(sum(d.cantidad * coalesce(c.costo_unitario,0)),2),
          'utilidad', round(sum(d.subtotal) - sum(d.cantidad * coalesce(c.costo_unitario,0)),2)) x
        from venta_detalle d
        join ventas v on v.id = d.venta_id
        join productos p on p.id = d.producto_id
        left join venta_detalle_costo c on c.venta_detalle_id = d.id
        where not v.anulada and v.fecha between p_desde and p_hasta
        group by p.nombre) s), '[]'::jsonb),
    'por_ubicacion', coalesce((
      select jsonb_agg(x order by x->>'ubicacion') from (
        select jsonb_build_object(
          'ubicacion', u.nombre,
          'ventas', round(coalesce(sum(d.subtotal),0),2),
          'utilidad', round(coalesce(sum(d.subtotal) - sum(d.cantidad * coalesce(c.costo_unitario,0)),0),2)) x
        from ubicaciones u
        left join ventas v on v.ubicacion_id = u.id and not v.anulada and v.fecha between p_desde and p_hasta
        left join venta_detalle d on d.venta_id = v.id
        left join venta_detalle_costo c on c.venta_detalle_id = d.id
        group by u.nombre) s), '[]'::jsonb),
    'gastos_por_categoria', coalesce((
      select jsonb_agg(x order by (x->>'monto')::numeric desc) from (
        select jsonb_build_object('categoria', categoria, 'monto', round(sum(monto),2)) x
        from gastos where not anulado and fecha between p_desde and p_hasta
        group by categoria) s), '[]'::jsonb)
  );
end;
$$;
