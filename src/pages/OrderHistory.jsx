import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Eye,
  LoaderCircle,
  Printer,
  Search,
  Truck,
} from 'lucide-react'
import Modal from '../components/Modal'
import { formatRupiah } from '../lib/format'
import { supabase } from '../lib/supabase'
import { BANK_ACCOUNTS } from '../modules/bankInfo'
import { buildTrackingMessage, copyToClipboard } from '../modules/waGenerator'

const pageSize = 25
const statuses = ['', 'diproses', 'dikirim']
const trackingStorageKey = 'cm_order_tracking_overrides'
const couriers = ['JNE REG', 'JNE YES', 'J&T', 'SiCepat', 'Anteraja', 'POS', 'Wahana', 'GoSend', 'GrabExpress', 'COD', 'Ambil di Toko']

const formatDate = (value) => value
  ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '-'

const escapeHtml = (value) => String(value ?? '-')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const getItemsSubtotal = (order) =>
  (order.order_items || []).reduce((total, item) => total + Number(item.subtotal || 0), 0)

const readTrackingOverrides = () => {
  try {
    return JSON.parse(localStorage.getItem(trackingStorageKey) || '{}')
  } catch {
    return {}
  }
}

const writeTrackingOverride = (orderId, value) => {
  const current = readTrackingOverrides()
  localStorage.setItem(trackingStorageKey, JSON.stringify({ ...current, [orderId]: value }))
}

const getTrackingNumber = (order = {}) =>
  String(order.nomor_resi ?? order.resi ?? order.tracking_number ?? order.local_tracking_number ?? '').trim()

const getCourier = (order = {}) =>
  String(order.ekspedisi ?? order.courier ?? order.local_courier ?? '').trim()

const isMarketplaceOrder = (order = {}) => {
  const customer = String(order.nama_customer || '').toLowerCase()
  const address = String(order.alamat || '').toLowerCase()
  return address.includes('order marketplace:') || customer.startsWith('tokopedia') || customer.startsWith('toco')
}

const getDisplayStatus = (order = {}) => {
  if (isMarketplaceOrder(order)) return 'dikirim'
  if (['selesai', 'dibatalkan'].includes(order.status)) return order.status
  return getTrackingNumber(order) ? 'dikirim' : 'diproses'
}

const formatStatus = (status) => status === 'dikirim' ? 'terkirim' : status

const buildHistoryTrackingMessage = (order = {}, trackingNumber, courier) => buildTrackingMessage({
  receiver_name: order.nama_customer,
  courier,
  tracking_number: trackingNumber,
})

const trackingUpdatePayloads = (trackingNumber, courier) => {
  const withCourier = courier ? { ekspedisi: courier } : {}
  return [
    { status: 'dikirim', nomor_resi: trackingNumber, ...withCourier },
    { status: 'dikirim', nomor_resi: trackingNumber },
    { status: 'dikirim', resi: trackingNumber },
    { status: 'dikirim', tracking_number: trackingNumber },
    { status: 'dikirim' },
  ]
}

export default function OrderHistory() {
  const [orders, setOrders] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [totalOrders, setTotalOrders] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [trackingOrder, setTrackingOrder] = useState(null)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [trackingCourier, setTrackingCourier] = useState('')
  const [savingTracking, setSavingTracking] = useState(false)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError('')

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const shouldFilterStatus = Boolean(status)
    let query = supabase
      .from('orders')
      .select('*, order_items(id, order_id, variant_id, nama_produk_snapshot, qty, harga, subtotal)', { count: 'exact' })
      .order('created_at', { ascending: false })

    const keyword = search.trim().replace(/[,%().]/g, ' ')
    if (keyword) query = query.or(`nomor_order.ilike.%${keyword}%,nama_customer.ilike.%${keyword}%`)
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00+07:00`)
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59+07:00`)
    if (!shouldFilterStatus) query = query.range(from, to)

    const { data, error: queryError, count } = await query
    if (queryError) {
      console.error('Gagal memuat riwayat order:', queryError)
      setOrders([])
      setError(queryError.message)
    } else {
      const trackingOverrides = readTrackingOverrides()
      const normalizedOrders = (data || []).map((order) => ({ ...order, ...(trackingOverrides[order.id] || {}) }))
      const filteredOrders = shouldFilterStatus
        ? normalizedOrders.filter((order) => getDisplayStatus(order) === status)
        : normalizedOrders
      setOrders(shouldFilterStatus ? filteredOrders.slice(from, to + 1) : filteredOrders)
      setTotalOrders(shouldFilterStatus ? filteredOrders.length : count || 0)
    }
    setLoading(false)
  }, [dateFrom, dateTo, page, search, status])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const totalPages = Math.max(1, Math.ceil(totalOrders / pageSize))

  const openTrackingModal = (order) => {
    setTrackingOrder(order)
    setTrackingNumber(getTrackingNumber(order))
    setTrackingCourier(getCourier(order))
    setError('')
  }

  const saveTracking = async (event) => {
    event.preventDefault()
    const cleanTrackingNumber = trackingNumber.trim()
    const cleanCourier = trackingCourier.trim()
    if (!cleanTrackingNumber) {
      setError('Isi nomor resi terlebih dahulu.')
      return
    }

    setSavingTracking(true)
    setError('')

    let savedOrder = null
    let lastError = null
    for (const payload of trackingUpdatePayloads(cleanTrackingNumber, cleanCourier)) {
      const { data, error: updateError } = await supabase
        .from('orders')
        .update(payload)
        .eq('id', trackingOrder.id)
        .select()
        .single()

      if (!updateError) {
        savedOrder = data
        lastError = null
        break
      }
      lastError = updateError
    }

    setSavingTracking(false)
    if (lastError) {
      console.error('Gagal menyimpan resi:', lastError)
      setError(lastError.message || 'Gagal menyimpan nomor resi.')
      return
    }

    const override = { local_tracking_number: cleanTrackingNumber, local_courier: cleanCourier }
    writeTrackingOverride(trackingOrder.id, override)
    const updatedOrder = { ...trackingOrder, ...(savedOrder || {}), ...override, status: 'dikirim' }
    setOrders((current) => current.map((order) => order.id === trackingOrder.id ? updatedOrder : order))
    setTrackingOrder(updatedOrder)
    setSelectedOrder((current) => current?.id === trackingOrder.id ? updatedOrder : current)
    setSuccess(`Nomor resi ${trackingOrder.nomor_order} berhasil disimpan. Status menjadi terkirim.`)
  }

  const copyTrackingShare = async () => {
    const text = buildHistoryTrackingMessage(trackingOrder, trackingNumber.trim(), trackingCourier.trim())
    if (!text) {
      setError('Isi nomor resi terlebih dahulu.')
      return
    }
    try {
      await copyToClipboard(text)
      setSuccess(`Chat resi ${trackingOrder.nomor_order} berhasil disalin.`)
      setError('')
    } catch (copyError) {
      console.error('Gagal menyalin chat resi:', copyError)
      setError('Gagal menyalin chat resi.')
    }
  }

  const openInvoice = (order) => {
    const printWindow = window.open('', '_blank', 'width=900,height=1100')
    if (!printWindow) {
      setError('Popup invoice diblokir browser.')
      return
    }

    const itemsSubtotal = getItemsSubtotal(order)
    const paymentRows = Object.values(BANK_ACCOUNTS).map((account) => `
      <div class="bank-row">
        <strong>${escapeHtml(account.bank)}</strong>
        <span>${escapeHtml(account.number)}</span>
        <small>a.n. ${escapeHtml(account.name)}</small>
      </div>`).join('')
    const itemRows = (order.order_items || []).map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.nama_produk_snapshot)}</td>
        <td class="center">${escapeHtml(item.qty)}</td>
        <td class="right">${formatRupiah(item.harga)}</td>
        <td class="right">${formatRupiah(item.subtotal)}</td>
      </tr>`).join('') || `
      <tr>
        <td colspan="5" class="empty">Tidak ada item.</td>
      </tr>`
    const customerInfo = [
      order.nama_customer ? `<strong>${escapeHtml(order.nama_customer)}</strong>` : '<strong>-</strong>',
      order.no_wa ? `<span>WA: ${escapeHtml(order.no_wa)}</span>` : '',
      order.alamat ? `<span>${escapeHtml(order.alamat)}</span>` : '',
    ].filter(Boolean).join('')

    printWindow.document.write(`<!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice ${escapeHtml(order.nomor_order)}</title>
      <style>
        @page{size:A4;margin:14mm}
        *{box-sizing:border-box}
        body{margin:0;background:#f5f6f2;color:#1f2933;font-family:Inter,Arial,Helvetica,sans-serif}
        .invoice{width:210mm;min-height:297mm;margin:0 auto;padding:22mm 18mm;background:#fff}
        .top{display:flex;justify-content:space-between;gap:28px;border-bottom:3px solid #18181b;padding-bottom:22px}
        .brand h1{margin:0;color:#1f2933;font-size:28px;letter-spacing:.5px}
        .brand p{margin:7px 0 0;color:#6b7280;font-size:12px;line-height:1.6}
        .invoice-title{text-align:right}
        .invoice-title h2{margin:0 0 8px;font-size:34px;letter-spacing:2px}
        .invoice-title span{display:block;color:#6b7280;font-size:12px;line-height:1.6}
        .grid{display:grid;grid-template-columns:1.1fr .9fr;gap:22px;margin-top:26px}
        .box{border:1px solid #e1e4dd;border-radius:12px;padding:16px;background:#f8f9f6}
        .box h3{margin:0 0 12px;color:#18181b;font-size:11px;text-transform:uppercase;letter-spacing:1.4px}
        .box strong,.box span{display:block}
        .box strong{font-size:16px;margin-bottom:7px}
        .box span{color:#4b5563;font-size:12px;line-height:1.7;white-space:pre-wrap}
        .meta{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .meta div{padding:10px;border-radius:9px;background:#f4f4f5}
        .meta small{display:block;color:#6b7280;font-size:9px;text-transform:uppercase;letter-spacing:.8px}
        .meta b{display:block;margin-top:4px;font-size:12px}
        table{width:100%;border-collapse:collapse;margin-top:28px}
        th{padding:12px 10px;background:#374151;color:#fff;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.9px}
        td{padding:13px 10px;border-bottom:1px solid #e1e4dd;color:#374151;font-size:12px;vertical-align:top}
        .center{text-align:center}.right{text-align:right}.empty{text-align:center;color:#6b7280}
        .totals{width:310px;margin:24px 0 0 auto}
        .totals div{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid #e1e4dd;font-size:12px}
        .totals .grand{margin-top:4px;padding:14px 0;border-top:2px solid #18181b;border-bottom:0;font-size:18px;font-weight:700}
        .payment{margin-top:26px;border:1px solid #e1e4dd;border-radius:14px;overflow:hidden}
        .payment h3{margin:0;padding:13px 16px;background:#374151;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:1.1px}
        .payment-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0;background:#f8f9f6}
        .bank-row{padding:15px 16px;border-right:1px solid #e1e4dd}
        .bank-row:last-child{border-right:0}
        .bank-row strong,.bank-row span,.bank-row small{display:block}
        .bank-row strong{font-size:12px;color:#18181b;letter-spacing:.8px}
        .bank-row span{margin-top:7px;font-size:16px;font-weight:700;color:#1f2933}
        .bank-row small{margin-top:6px;color:#4b5563;font-size:11px}
        .message{margin-top:22px;padding:16px;border-radius:12px;background:#f4f4f5;color:#4b5563;font-size:11px;line-height:1.7}
        .regards{margin-top:28px;width:260px;margin-left:auto;color:#1f2933;font-size:12px;line-height:1.7}
        .regards strong{display:block;margin-top:26px;font-size:14px}
        .footer{margin-top:28px;padding-top:16px;border-top:1px solid #e1e4dd;display:flex;justify-content:space-between;color:#6b7280;font-size:10px}
        .no-print{position:fixed;right:20px;bottom:20px;display:flex;gap:8px}
        .no-print button{border:0;border-radius:10px;padding:12px 16px;background:#18181b;color:#fff;font-weight:700;cursor:pointer}
        .no-print .ghost{background:#fff;color:#18181b;border:1px solid #d4d4d8}
        @media print{
          body{background:#fff}
          .invoice{width:auto;min-height:auto;margin:0;padding:0}
          .no-print{display:none}
        }
      </style>
    </head>
    <body>
      <main class="invoice">
        <section class="top">
          <div class="brand">
            <h1>CERUTUMURAH</h1>
            <p>Premium cigar stock & order management<br>Invoice resmi pesanan pelanggan</p>
          </div>
          <div class="invoice-title">
            <h2>INVOICE</h2>
            <span>No. Invoice: <b>${escapeHtml(order.nomor_order)}</b></span>
            <span>Tanggal: ${formatDate(order.created_at)}</span>
          </div>
        </section>

        <section class="grid">
          <div class="box">
            <h3>Ditagihkan Kepada</h3>
            ${customerInfo}
          </div>
          <div class="box">
            <h3>Detail Invoice</h3>
            <div class="meta">
              <div><small>Status</small><b>${escapeHtml(formatStatus(getDisplayStatus(order)))}</b></div>
              <div><small>Jumlah Item</small><b>${order.order_items?.length || 0}</b></div>
              <div><small>Subtotal</small><b>${formatRupiah(itemsSubtotal)}</b></div>
              <div><small>Ongkir</small><b>${formatRupiah(order.ongkir)}</b></div>
            </div>
          </div>
        </section>

        <table>
          <thead><tr><th style="width:46px">No</th><th>Produk</th><th class="center" style="width:80px">Qty</th><th class="right" style="width:135px">Harga</th><th class="right" style="width:145px">Subtotal</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>

        <section class="totals">
          <div><span>Subtotal Produk</span><strong>${formatRupiah(itemsSubtotal)}</strong></div>
          <div><span>Ongkir</span><strong>${formatRupiah(order.ongkir)}</strong></div>
          <div class="grand"><span>Total</span><strong>${formatRupiah(order.total)}</strong></div>
        </section>

        <section class="payment">
          <h3>Informasi Pembayaran</h3>
          <div class="payment-grid">${paymentRows}</div>
        </section>

        <section class="message">
          Mohon lakukan pembayaran sesuai total invoice dan kirimkan bukti transfer setelah pembayaran berhasil. Pesanan akan kami proses setelah pembayaran terkonfirmasi.
        </section>

        <section class="regards">
          Regards,
          <strong>Subhan Adib Alfaiz</strong>
          <span>CERUTUMURAH</span>
        </section>

        <footer class="footer">
          <span>Terima kasih sudah berbelanja di CERUTUMURAH.</span>
          <span>${escapeHtml(order.nomor_order)}</span>
        </footer>
      </main>
      <div class="no-print">
        <button class="ghost" onclick="window.close()">Tutup</button>
        <button onclick="window.print()">Cetak / Save PDF</button>
      </div>
    </body>
    </html>`)
    printWindow.document.close()
    printWindow.focus()
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Penjualan</span>
          <h2>Riwayat Order</h2>
          <p>Cari, periksa, dan bagikan order yang telah dibuat.</p>
        </div>
      </section>

      {success && <div className="notice success"><CheckCircle2 size={19} /><span>{success}</span></div>}
      {error && <div className="notice error"><AlertCircle size={19} /><span>{error}</span></div>}

      <section className="content-card">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={18} />
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1) }}
              placeholder="Cari nomor order atau customer..."
            />
          </label>
          <label className="select-field">
            <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
              {statuses.map((item) => <option key={item || 'all'} value={item}>{item ? formatStatus(item)[0].toUpperCase() + formatStatus(item).slice(1) : 'Semua status'}</option>)}
            </select>
            <ChevronDown size={17} />
          </label>
          <label className="date-field">
            <span>Dari</span>
            <input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1) }} />
          </label>
          <label className="date-field">
            <span>Sampai</span>
            <input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1) }} />
          </label>
          {(dateFrom || dateTo) && (
            <button className="button ghost history-reset-filter" type="button" onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }}>
              Reset Tanggal
            </button>
          )}
          <span className="result-count">Total: {totalOrders} order</span>
        </div>

        <div className="table-wrap">
          <table className="history-table">
            <thead><tr><th>Nomor Order</th><th>Tanggal</th><th>Customer</th><th>Status</th><th>Item</th><th>Penjualan Produk</th><th>Aksi</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan="7"><div className="empty-state"><LoaderCircle className="spin" size={23} /><strong>Memuat riwayat order...</strong></div></td></tr>}
              {!loading && !orders.length && <tr><td colSpan="7"><div className="empty-state"><strong>Belum ada riwayat order</strong></div></td></tr>}
              {!loading && orders.map((order) => {
                const displayStatus = getDisplayStatus(order)
                return (
                  <tr key={order.id}>
                    <td><span className="sku">{order.nomor_order}</span></td>
                    <td>{formatDate(order.created_at)}</td>
                    <td><div className="product-name"><strong>{order.nama_customer || '-'}</strong><span>{order.no_wa || '-'}</span></div></td>
                    <td><span className={`order-status ${displayStatus}`}>{formatStatus(displayStatus)}</span></td>
                    <td>{order.order_items?.length || 0}</td>
                    <td className="money">{formatRupiah(getItemsSubtotal(order))}</td>
                    <td><div className="row-actions">
                      <button className="icon-button small" onClick={() => setSelectedOrder(order)} aria-label="Lihat detail"><Eye size={16} /></button>
                      <button className="icon-button small" onClick={() => openInvoice(order)} aria-label="Invoice / Save PDF" title="Invoice / Save PDF"><Printer size={16} /></button>
                      <button className="icon-button small" onClick={() => openTrackingModal(order)} aria-label="Input nomor resi" title="Input nomor resi"><Truck size={16} /></button>
                    </div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <span>Total data: <strong>{totalOrders}</strong></span>
          <div>
            <button className="button ghost" onClick={() => setPage((current) => current - 1)} disabled={loading || page <= 1}>Previous</button>
            <span>Halaman {page} dari {totalPages}</span>
            <button className="button ghost" onClick={() => setPage((current) => current + 1)} disabled={loading || page >= totalPages}>Next</button>
          </div>
        </div>
      </section>

      {selectedOrder && <OrderDetail order={selectedOrder} onClose={() => setSelectedOrder(null)} onInvoice={openInvoice} onTracking={openTrackingModal} />}
      {trackingOrder && (
        <TrackingModal
          order={trackingOrder}
          trackingNumber={trackingNumber}
          courier={trackingCourier}
          saving={savingTracking}
          onTrackingChange={setTrackingNumber}
          onCourierChange={setTrackingCourier}
          onSave={saveTracking}
          onCopy={copyTrackingShare}
          onClose={() => setTrackingOrder(null)}
        />
      )}
    </div>
  )
}

function OrderDetail({ order, onClose, onInvoice, onTracking }) {
  const displayStatus = getDisplayStatus(order)
  return (
    <Modal title={order.nomor_order} subtitle={`${formatDate(order.created_at)} · ${order.status || 'baru'}`} onClose={onClose}>
      <div className="modal-body order-detail">
        <div className="detail-customer">
          <div><span>Customer</span><strong>{order.nama_customer || '-'}</strong></div>
          <div><span>No WA</span><strong>{order.no_wa || '-'}</strong></div>
          <div><span>Status</span><strong>{formatStatus(displayStatus)}</strong></div>
          <div><span>Ekspedisi</span><strong>{getCourier(order) || '-'}</strong></div>
          <div><span>No Resi</span><strong>{getTrackingNumber(order) || '-'}</strong></div>
          <div className="wide"><span>Alamat</span><strong>{order.alamat || '-'}</strong></div>
        </div>
        <div className="table-wrap">
          <table className="order-items-table">
            <thead><tr><th>Produk</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead>
            <tbody>{(order.order_items || []).map((item) => (
              <tr key={item.id}><td>{item.nama_produk_snapshot}</td><td>{item.qty}</td><td>{formatRupiah(item.harga)}</td><td className="money">{formatRupiah(item.subtotal)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="detail-totals">
          <div><span>Subtotal</span><strong>{formatRupiah(getItemsSubtotal(order))}</strong></div>
          <div><span>Ongkir</span><strong>{formatRupiah(order.ongkir)}</strong></div>
          <div className="grand"><span>Total</span><strong>{formatRupiah(order.total)}</strong></div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="button ghost" onClick={() => onTracking(order)}><Truck size={16} /> Input Resi</button>
        <button className="button primary" onClick={() => onInvoice(order)}><Printer size={16} /> Invoice / PDF</button>
      </div>
    </Modal>
  )
}

function TrackingModal({
  order,
  trackingNumber,
  courier,
  saving,
  onTrackingChange,
  onCourierChange,
  onSave,
  onCopy,
  onClose,
}) {
  const preview = buildHistoryTrackingMessage(order, trackingNumber.trim(), courier.trim())
  const courierOptions = courier && !couriers.includes(courier) ? [courier, ...couriers] : couriers

  return (
    <Modal title={`Input Resi ${order.nomor_order}`} subtitle={`${order.nama_customer || '-'} - ${order.no_wa || '-'}`} onClose={onClose}>
      <form onSubmit={onSave}>
        <div className="modal-body tracking-modal">
          <div className="form-grid">
            <label className="form-field">
              <span>Nomor Resi</span>
              <input
                value={trackingNumber}
                onChange={(event) => onTrackingChange(event.target.value)}
                placeholder="Contoh: JP1234567890"
                autoFocus
              />
            </label>
            <label className="form-field">
              <span>Ekspedisi (opsional)</span>
              <select
                value={courier}
                onChange={(event) => onCourierChange(event.target.value)}
              >
                <option value="">Pilih ekspedisi</option>
                {courierOptions.map((item) => (
                  <option key={item} value={item}>{courier && item === courier && !couriers.includes(item) ? `${item} (tersimpan)` : item}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="tracking-preview-box">
            <div>
              <span>Preview Chat WhatsApp</span>
              <strong>{trackingNumber.trim() ? 'Siap dikirim ke customer' : 'Isi nomor resi untuk membuat preview'}</strong>
            </div>
            <textarea
              className="wa-chat-preview"
              value={preview || 'Isi nomor resi untuk menampilkan preview chat resi.'}
              readOnly
              rows="10"
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="button ghost" type="button" onClick={onCopy} disabled={!trackingNumber.trim()}>
            <Clipboard size={16} /> Copy Chat Resi
          </button>
          <button className="button primary" type="submit" disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={16} /> : <Truck size={16} />} Simpan Resi
          </button>
        </div>
      </form>
    </Modal>
  )
}
