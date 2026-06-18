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
import { formatDateTimeWIB, formatRupiah } from '../lib/format'
import { productNameOnly } from '../lib/productDisplay'
import { supabase } from '../lib/supabase'
import { printLabel } from '../modules/labelPrinter'
import { buildTrackingMessage, copyToClipboard } from '../modules/waGenerator'

const pageSize = 25
const statuses = ['', 'diproses', 'dikirim']
const couriers = ['JNE REG', 'JNE YES', 'J&T', 'SiCepat', 'Anteraja', 'POS', 'Wahana', 'GoSend', 'GrabExpress', 'COD', 'Ambil di Toko']

const getItemsSubtotal = (order) =>
  (order.order_items || []).reduce((total, item) => total + Number(item.subtotal || 0), 0)

const getTrackingNumber = (order = {}) =>
  String(order.nomor_resi ?? order.resi ?? order.tracking_number ?? '').trim()

const getCourier = (order = {}) =>
  String(order.ekspedisi ?? order.courier ?? '').trim()

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

const buildTrackingUpdatePayload = (trackingNumber, courier) => ({
  status: 'dikirim',
  nomor_resi: trackingNumber,
  ekspedisi: courier || null,
})

const isMissingTrackingColumnError = (error) =>
  error?.code === 'PGRST204' && /'(nomor_resi|ekspedisi)' column/i.test(error.message || '')

const buildShippingLabelOrder = (order = {}) => {
  const trackingNumber = getTrackingNumber(order)
  const footerParts = [
    order.nomor_order ? `Order ${order.nomor_order}` : '',
    trackingNumber ? `Resi ${trackingNumber}` : '',
  ].filter(Boolean)

  return {
    receiver_name: order.nama_customer,
    receiver_phone: order.no_wa,
    receiver_address: order.alamat,
    courier: getCourier(order),
    tracking_number: trackingNumber,
    footer_note: footerParts.join(' | ') || 'CERUTUMURAH.COM',
    items: (order.order_items || []).map((item) => ({
      name: productNameOnly(item.nama_produk_snapshot),
      qty: item.qty,
    })),
  }
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
      const filteredOrders = shouldFilterStatus
        ? (data || []).filter((order) => getDisplayStatus(order) === status)
        : data || []
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

    const { data: savedOrder, error: updateError } = await supabase
      .from('orders')
      .update(buildTrackingUpdatePayload(cleanTrackingNumber, cleanCourier))
      .eq('id', trackingOrder.id)
      .select()
      .single()

    setSavingTracking(false)
    if (updateError) {
      console.error('Gagal menyimpan resi:', updateError)
      setError(isMissingTrackingColumnError(updateError)
        ? 'Kolom nomor_resi dan ekspedisi belum ada di database Supabase. Jalankan migrasi database dulu, lalu coba simpan resi lagi.'
        : updateError.message || 'Gagal menyimpan nomor resi.')
      return
    }

    const updatedOrder = { ...trackingOrder, ...(savedOrder || {}), status: 'dikirim' }
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

  const printShippingLabel = async (order) => {
    try {
      await printLabel(buildShippingLabelOrder(order))
      setError('')
    } catch (printError) {
      console.error('Gagal print label pengiriman:', printError)
      setError(printError.message || 'Gagal membuka print label pengiriman.')
    }
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
                    <td>{formatDateTimeWIB(order.created_at)}</td>
                    <td><div className="product-name"><strong>{order.nama_customer || '-'}</strong><span>{order.no_wa || '-'}</span></div></td>
                    <td><span className={`order-status ${displayStatus}`}>{formatStatus(displayStatus)}</span></td>
                    <td>{order.order_items?.length || 0}</td>
                    <td className="money">{formatRupiah(getItemsSubtotal(order))}</td>
                    <td><div className="row-actions">
                      <button className="icon-button small" onClick={() => setSelectedOrder(order)} aria-label="Lihat detail"><Eye size={16} /></button>
                      <button className="icon-button small" onClick={() => printShippingLabel(order)} aria-label="Print label pengiriman" title="Print Label Pengiriman"><Printer size={16} /></button>
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

      {selectedOrder && <OrderDetail order={selectedOrder} onClose={() => setSelectedOrder(null)} onPrintLabel={printShippingLabel} onTracking={openTrackingModal} />}
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

function OrderDetail({ order, onClose, onPrintLabel, onTracking }) {
  const displayStatus = getDisplayStatus(order)
  return (
    <Modal title={order.nomor_order} subtitle={`${formatDateTimeWIB(order.created_at)} · ${order.status || 'baru'}`} onClose={onClose}>
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
              <tr key={item.id}><td>{productNameOnly(item.nama_produk_snapshot)}</td><td>{item.qty}</td><td>{formatRupiah(item.harga)}</td><td className="money">{formatRupiah(item.subtotal)}</td></tr>
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
        <button className="button primary" onClick={() => onPrintLabel(order)}><Printer size={16} /> Print Label Pengiriman</button>
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
