import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { q, fechaBonita } from './format.jsx'

const ORO = [176, 138, 52]
const OSCURO = [16, 27, 29]
const VERDE = [46, 125, 80]
const ROJO = [178, 64, 50]

let logoCache = null
async function logo() {
  if (logoCache) return logoCache
  try {
    const blob = await (await fetch('/logo.png')).blob()
    logoCache = await new Promise((res) => {
      const r = new FileReader()
      r.onload = () => res(r.result)
      r.readAsDataURL(blob)
    })
  } catch { logoCache = null }
  return logoCache
}

async function nuevoDoc(titulo, desde, hasta) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const img = await logo()
  if (img) doc.addImage(img, 'PNG', 14, 10, 18, 18)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...OSCURO)
  doc.text('T-800', 36, 17)
  doc.setFontSize(12); doc.setTextColor(...ORO)
  doc.text(titulo, 36, 24)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90)
  const periodo = desde === hasta ? `Fecha: ${fechaBonita(desde)}` : `Periodo: ${fechaBonita(desde)} al ${fechaBonita(hasta)}`
  doc.text(periodo, 202, 15, { align: 'right' })
  doc.text(`Generado: ${new Date().toLocaleString('es-GT')}`, 202, 20, { align: 'right' })
  doc.setDrawColor(...ORO); doc.setLineWidth(0.6); doc.line(14, 31, 202, 31)
  return doc
}

function pie(doc) {
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(8); doc.setTextColor(140)
    doc.text(`T-800 · Página ${i} de ${n}`, 108, 272, { align: 'center' })
  }
}

const tablaBase = {
  theme: 'grid',
  styles: { fontSize: 9, cellPadding: 2 },
  headStyles: { fillColor: OSCURO, textColor: 255, fontStyle: 'bold' },
  footStyles: { fillColor: [235, 230, 215], textColor: 20, fontStyle: 'bold' },
  margin: { left: 14, right: 14 },
  // montos alineados a la derecha también en encabezados y totales
  didParseCell: (d) => {
    if (d.section === 'foot' && /^-?Q[\d,]/.test(String(d.cell.raw))) d.cell.styles.halign = 'right'
    if (d.section === 'head' && d.table.columns[d.column.index]?.index !== 0 && /Monto|Total|Pagado|Saldo|Cobrado|Ventas|Costo|Ganancia|Cantidad|Precio|Subtotal/.test(String(d.cell.raw))) d.cell.styles.halign = 'right'
  },
}

function subtitulo(doc, texto, y) {
  if (y > 235) { doc.addPage(); y = 20 } // evita títulos sueltos al pie de página
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...OSCURO)
  doc.text(texto, 14, y)
  return y + 3
}
const sigY = (doc, extra = 8) => doc.lastAutoTable.finalY + extra

export async function guardarPDF(doc, nombreArchivo) {
  pie(doc)
  if (Capacitor.isNativePlatform()) {
    const data = doc.output('datauristring').split(',')[1]
    const { uri } = await Filesystem.writeFile({ path: nombreArchivo, data, directory: Directory.Cache })
    await Share.share({ title: nombreArchivo, files: [uri], dialogTitle: 'Guardar o enviar PDF' })
  } else {
    doc.save(nombreArchivo)
  }
}

const nombre = (base, desde, hasta) => `T800_${base}_${desde}${desde === hasta ? '' : '_a_' + hasta}.pdf`

// ---------------------------------------------------------------------
// ESTADO DE RESULTADOS (ganancia o pérdida del periodo)
// ---------------------------------------------------------------------
export async function pdfEstadoResultados(rep) {
  const { desde, hasta } = rep
  const doc = await nuevoDoc('Estado de resultados', desde, hasta)
  const neta = Number(rep.utilidad_neta)
  const esGanancia = neta >= 0

  let y = subtitulo(doc, 'Resultado del periodo', 40)
  autoTable(doc, {
    ...tablaBase, startY: y,
    head: [['Concepto', 'Monto']],
    body: [
      ['Ventas', q(rep.ventas)],
      ['(-) Costo de lo vendido', q(rep.costo_ventas)],
      [{ content: '= Utilidad bruta', styles: { fontStyle: 'bold' } }, { content: q(rep.utilidad_bruta), styles: { fontStyle: 'bold' } }],
      ['(-) Gastos operativos', q(rep.gastos)],
    ],
    foot: [[esGanancia ? 'GANANCIA NETA' : 'PÉRDIDA NETA', q(neta)]],
    footStyles: { ...tablaBase.footStyles, fillColor: esGanancia ? VERDE : ROJO, textColor: 255 },
    columnStyles: { 1: { halign: 'right', cellWidth: 50 } },
  })

  y = subtitulo(doc, 'Movimiento de dinero (efectivo real)', sigY(doc))
  autoTable(doc, {
    ...tablaBase, startY: y,
    head: [['Concepto', 'Monto']],
    body: [
      ['Cobrado a clientes', q(rep.cobros_clientes)],
      ['(-) Pagado a proveedores', q(rep.pagos_proveedores)],
      ['(-) Gastos pagados', q(rep.gastos)],
    ],
    foot: [['Flujo neto de caja', q(rep.flujo_caja)]],
    columnStyles: { 1: { halign: 'right', cellWidth: 50 } },
  })

  y = subtitulo(doc, 'Compras y saldos', sigY(doc))
  autoTable(doc, {
    ...tablaBase, startY: y,
    head: [['Concepto', 'Monto']],
    body: [
      ['Compras de mercadería en el periodo', q(rep.compras)],
      ['Le deben (cuentas por cobrar, a hoy)', q(rep.por_cobrar)],
      ['Debe a proveedores (cuentas por pagar, a hoy)', q(rep.por_pagar)],
    ],
    columnStyles: { 1: { halign: 'right', cellWidth: 50 } },
  })

  if (rep.por_producto?.length) {
    y = subtitulo(doc, 'Ventas y ganancia por producto', sigY(doc))
    autoTable(doc, {
      ...tablaBase, startY: y,
      head: [['Producto', 'Cantidad', 'Ventas', 'Costo', 'Ganancia']],
      body: rep.por_producto.map(p => [p.producto, Number(p.cantidad).toLocaleString('es-GT'), q(p.ventas), q(p.costo), q(p.utilidad)]),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    })
  }

  y = subtitulo(doc, 'Por ubicación', sigY(doc))
  autoTable(doc, {
    ...tablaBase, startY: y,
    head: [['Ubicación', 'Ventas', 'Ganancia bruta']],
    body: (rep.por_ubicacion || []).map(u => [u.ubicacion, q(u.ventas), q(u.utilidad)]),
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  })

  if (rep.gastos_por_categoria?.length) {
    y = subtitulo(doc, 'Gastos por categoría', sigY(doc))
    autoTable(doc, {
      ...tablaBase, startY: y,
      head: [['Categoría', 'Monto']],
      body: rep.gastos_por_categoria.map(g => [g.categoria, q(g.monto)]),
      columnStyles: { 1: { halign: 'right', cellWidth: 50 } },
    })
  }

  await guardarPDF(doc, nombre('EstadoResultados', desde, hasta))
}

// ---------------------------------------------------------------------
// LISTADOS
// ---------------------------------------------------------------------
async function pdfListado({ titulo, base, desde, hasta, head, body, foot, derecha = [] }) {
  const doc = await nuevoDoc(titulo, desde, hasta)
  const columnStyles = Object.fromEntries(derecha.map(i => [i, { halign: 'right' }]))
  autoTable(doc, {
    ...tablaBase, startY: 38, head: [head],
    body: body.length ? body : [[{ content: 'Sin registros en este periodo', colSpan: head.length, styles: { halign: 'center', textColor: 120 } }]],
    foot: foot ? [foot] : undefined, columnStyles,
  })
  await guardarPDF(doc, nombre(base, desde, hasta))
}

const suma = (arr, k) => arr.reduce((a, r) => a + Number(r[k] || 0), 0)

export function pdfCompras(compras, desde, hasta) {
  const lista = compras.filter(c => !c.anulada)
  return pdfListado({
    titulo: 'Reporte de compras', base: 'Compras', desde, hasta,
    head: ['Fecha', 'Proveedor', 'Factura', 'Total', 'Pagado', 'Saldo', 'Estado'],
    body: lista.map(c => [fechaBonita(c.fecha), c.proveedor, c.num_factura || '', q(c.total), q(c.pagado), q(c.saldo), c.estado_pago]),
    foot: ['', 'TOTAL', '', q(suma(lista, 'total')), q(suma(lista, 'pagado')), q(suma(lista, 'saldo')), ''],
    derecha: [3, 4, 5],
  })
}

export function pdfVentas(ventas, desde, hasta, ubicacion) {
  const lista = ventas.filter(v => !v.anulada)
  return pdfListado({
    titulo: ubicacion ? `Reporte de ventas · ${ubicacion}` : 'Reporte de ventas', base: ubicacion ? `Ventas_${ubicacion}` : 'Ventas', desde, hasta,
    head: ['Fecha', 'Cliente', 'Ubicación', 'Total', 'Cobrado', 'Saldo', 'Estado'],
    body: lista.map(v => [fechaBonita(v.fecha), v.cliente, v.ubicacion, q(v.total), q(v.cobrado), q(v.saldo), v.estado_pago]),
    foot: ['', 'TOTAL', '', q(suma(lista, 'total')), q(suma(lista, 'cobrado')), q(suma(lista, 'saldo')), ''],
    derecha: [3, 4, 5],
  })
}

export function pdfGastos(gastos, desde, hasta, ubicacion) {
  const lista = gastos.filter(g => !g.anulado)
  return pdfListado({
    titulo: ubicacion ? `Reporte de gastos · ${ubicacion}` : 'Reporte de gastos', base: ubicacion ? `Gastos_${ubicacion}` : 'Gastos', desde, hasta,
    head: ['Fecha', 'Categoría', 'Descripción', 'Ubicación', 'Monto'],
    body: lista.map(g => [fechaBonita(g.fecha), g.categoria, g.descripcion || '', g.ubicaciones?.nombre || 'General', q(g.monto)]),
    foot: ['', 'TOTAL', '', '', q(suma(lista, 'monto'))],
    derecha: [4],
  })
}

// porPagar = null -> solo cuentas por cobrar (vista de un vendedor)
export async function pdfCuentas(porCobrar, porPagar, fecha, ubicacion) {
  const soloCobrar = porPagar == null
  const titulo = soloCobrar ? `Cuentas por cobrar${ubicacion ? ' · ' + ubicacion : ''}` : 'Cuentas por cobrar y por pagar'
  const doc = await nuevoDoc(titulo, fecha, fecha)
  let y = subtitulo(doc, 'Le deben (cuentas por cobrar)', 40)
  autoTable(doc, {
    ...tablaBase, startY: y,
    head: [['Fecha', 'Cliente', 'Ubicación', 'Total', 'Saldo']],
    body: porCobrar.length ? porCobrar.map(v => [fechaBonita(v.fecha), v.cliente, v.ubicacion, q(v.total), q(v.saldo)])
      : [[{ content: 'Nadie debe nada', colSpan: 5, styles: { halign: 'center', textColor: 120 } }]],
    foot: [['', 'TOTAL', '', '', q(suma(porCobrar, 'saldo'))]],
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
  })
  if (!soloCobrar) {
    y = subtitulo(doc, 'Debe (cuentas por pagar a proveedores)', sigY(doc, 10))
    autoTable(doc, {
      ...tablaBase, startY: y,
      head: [['Fecha', 'Proveedor', 'Factura', 'Total', 'Saldo']],
      body: porPagar.length ? porPagar.map(c => [fechaBonita(c.fecha), c.proveedor, c.num_factura || '', q(c.total), q(c.saldo)])
        : [[{ content: 'No se debe nada a proveedores', colSpan: 5, styles: { halign: 'center', textColor: 120 } }]],
      foot: [['', 'TOTAL', '', '', q(suma(porPagar, 'saldo'))]],
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
    })
  }
  await guardarPDF(doc, `T800_${soloCobrar ? 'PorCobrar' : 'Cuentas'}${ubicacion ? '_' + ubicacion : ''}_${fecha}.pdf`)
}

// =====================================================================
// PDF PARA COMPARTIR CON CLIENTES Y PROVEEDORES
// (sin costos ni datos internos del negocio)
// =====================================================================
const referencia = (id) => String(id || '').slice(0, 8).toUpperCase()
const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const ordenPagos = (a, b) => (a.fecha + (a.creado_en || '')).localeCompare(b.fecha + (b.creado_en || ''))
const archivo = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')

// Datos de la parte (cliente o proveedor) en dos columnas
function bloqueDatos(doc, filas, y) {
  doc.setFontSize(10)
  filas.forEach(([etq, val], i) => {
    const x = i % 2 === 0 ? 14 : 110
    const yy = y + Math.floor(i / 2) * 6
    doc.setFont('helvetica', 'normal'); doc.setTextColor(110); doc.text(`${etq}:`, x, yy)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...OSCURO); doc.text(String(val ?? ''), x + doc.getTextWidth(`${etq}: `) + 1, yy)
  })
  return y + Math.ceil(filas.length / 2) * 6 + 2
}

// Recuadro grande con el saldo: verde si está pagado, rojo si hay pendiente
function recuadroSaldo(doc, y, saldo, textoPendiente) {
  const pagado = Number(saldo) <= 0.004
  doc.setFillColor(...(pagado ? VERDE : ROJO))
  doc.roundedRect(14, y, 188, 16, 2, 2, 'F')
  doc.setTextColor(255); doc.setFont('helvetica', 'bold')
  doc.setFontSize(12); doc.text(pagado ? 'PAGADO EN SU TOTALIDAD' : textoPendiente, 20, y + 10)
  doc.setFontSize(15); doc.text(q(pagado ? 0 : saldo), 196, y + 10.5, { align: 'right' })
  return y + 24
}

// Comprobante de UNA venta o compra con su historial de pagos.
// tipo: 'venta' | 'compra'; op: fila de v_ventas / v_compras
export async function pdfComprobante(tipo, op, detalle, pagos) {
  const esVenta = tipo === 'venta'
  const parte = esVenta ? op.cliente : op.proveedor
  const doc = await nuevoDoc(esVenta ? 'Estado de cuenta de venta' : 'Estado de cuenta de compra', hoyLocal(), hoyLocal())

  const datos = [[esVenta ? 'Cliente' : 'Proveedor', parte], ['Referencia', referencia(op.id)], ['Fecha de la ' + tipo, fechaBonita(op.fecha)]]
  if (esVenta && op.ubicacion) datos.push(['Despachado desde', op.ubicacion])
  if (!esVenta && op.num_factura) datos.push(['No. factura', op.num_factura])
  let y = bloqueDatos(doc, datos, 40)

  y = recuadroSaldo(doc, y + 2, op.saldo, esVenta ? 'SALDO PENDIENTE DE PAGO' : 'SALDO PENDIENTE A PAGAR')

  y = subtitulo(doc, 'Detalle', y)
  autoTable(doc, {
    ...tablaBase, startY: y,
    head: [['Producto', 'Cantidad', 'Precio', 'Subtotal']],
    body: detalle.map(d => [d.productos?.nombre || '', Number(d.cantidad).toLocaleString('es-GT'), q(d.precio_unitario), q(d.subtotal)]),
    foot: [['TOTAL', '', '', q(op.total)]],
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  })

  y = subtitulo(doc, 'Historial de pagos', sigY(doc))
  const lista = [...pagos].sort(ordenPagos)
  let restante = Number(op.total)
  autoTable(doc, {
    ...tablaBase, startY: y,
    head: [['#', 'Fecha', 'Forma de pago', 'Monto pagado', 'Saldo después']],
    body: lista.length
      ? lista.map((p, i) => { restante -= Number(p.monto); return [i + 1, fechaBonita(p.fecha), p.metodo_pago || 'efectivo', q(p.monto), q(Math.max(restante, 0))] })
      : [[{ content: 'Aún no se ha registrado ningún pago', colSpan: 5, styles: { halign: 'center', textColor: 120 } }]],
    foot: [['', '', 'TOTAL PAGADO', q(suma(lista, 'monto')), q(op.saldo)]],
    columnStyles: { 0: { cellWidth: 10 }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  })

  y = sigY(doc, 10)
  autoTable(doc, {
    ...tablaBase, startY: y, theme: 'plain', tableWidth: 90, margin: { left: 112 },
    body: [['Total', q(op.total)], ['Pagado', q(suma(lista, 'monto'))], [{ content: 'Saldo pendiente', styles: { fontStyle: 'bold' } }, { content: q(op.saldo), styles: { fontStyle: 'bold' } }]],
    columnStyles: { 1: { halign: 'right' } }, styles: { fontSize: 10, cellPadding: 1.5 },
  })

  await guardarPDF(doc, `T800_${esVenta ? 'Venta' : 'Compra'}_${archivo(parte)}_${referencia(op.id)}.pdf`)
}

// Estado de cuenta de un cliente o proveedor: todo lo que tiene pendiente
// ops: filas de v_ventas / v_compras con saldo; pagos: de todas esas operaciones
export async function pdfEstadoCuenta(tipo, nombreParte, ops, pagos) {
  const esVenta = tipo === 'venta'
  const doc = await nuevoDoc('Estado de cuenta', hoyLocal(), hoyLocal())
  const totalSaldo = suma(ops, 'saldo')
  let y = bloqueDatos(doc, [[esVenta ? 'Cliente' : 'Proveedor', nombreParte], ['Operaciones pendientes', ops.length]], 40)
  y = recuadroSaldo(doc, y + 2, totalSaldo, esVenta ? 'TOTAL PENDIENTE DE PAGO' : 'TOTAL PENDIENTE A PAGAR')

  y = subtitulo(doc, esVenta ? 'Ventas con saldo pendiente' : 'Compras con saldo pendiente', y)
  autoTable(doc, {
    ...tablaBase, startY: y,
    head: [['Fecha', 'Referencia', esVenta ? 'Despachado desde' : 'Factura', 'Total', 'Pagado', 'Saldo']],
    body: ops.length
      ? ops.map(o => [fechaBonita(o.fecha), referencia(o.id), (esVenta ? o.ubicacion : o.num_factura) || '', q(o.total), q(esVenta ? o.cobrado : o.pagado), q(o.saldo)])
      : [[{ content: 'No hay saldos pendientes', colSpan: 6, styles: { halign: 'center', textColor: 120 } }]],
    foot: [['', 'TOTAL', '', q(suma(ops, 'total')), q(suma(ops, esVenta ? 'cobrado' : 'pagado')), q(totalSaldo)]],
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
  })

  if (ops.length) {
    const ref = Object.fromEntries(ops.map(o => [o.id, referencia(o.id)]))
    const lista = [...pagos].sort(ordenPagos)
    y = subtitulo(doc, 'Historial de pagos', sigY(doc))
    autoTable(doc, {
      ...tablaBase, startY: y,
      head: [['Fecha', 'Referencia', 'Forma de pago', 'Monto pagado']],
      body: lista.length
        ? lista.map(p => [fechaBonita(p.fecha), ref[esVenta ? p.venta_id : p.compra_id] || '', p.metodo_pago || 'efectivo', q(p.monto)])
        : [[{ content: 'Aún no se ha registrado ningún pago', colSpan: 4, styles: { halign: 'center', textColor: 120 } }]],
      foot: [['', '', 'TOTAL PAGADO', q(suma(lista, 'monto'))]],
      columnStyles: { 3: { halign: 'right' } },
    })
  }

  await guardarPDF(doc, `T800_EstadoCuenta_${archivo(nombreParte)}_${hoyLocal()}.pdf`)
}
