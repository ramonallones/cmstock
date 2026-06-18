import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Edit3,
  Eye,
  LoaderCircle,
  Plus,
  Printer,
  Search,
  Trash2,
  Truck,
  X,
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

const buildVariantLabel = (variant = {}) => {
  const productName = variant.products?.nama_produk || variant.nama_produk_snapshot || 'Produk'
  const variantName = variant.nama_varian && variant.nama_varian !== '-' ? ` - ${variant.nama_varian}` : ''
  return `${productName}${variantName}`
}

const groupVariantQty = (items = []) => items.reduce((groups, item) => {
  if (!item.variant_id) return groups
  const current = groups.get(item.variant_id) || 0
  groups.set(item.variant_id, current + Number(item.qty || 0))
  return groups
}, new Map())

const buildRestoreQty = (order = {}, mutations = []) => {
  if (mutations.length) {
    return mutations.reduce((groups, mutation) => {
      if (!mutation.variant_id) return groups
      const restoreQty = Number(mutation.qty || 0) < 0 ? Math.abs(Number(mutation.qty || 0)) : 0
      if (!restoreQty) return groups
      groups.set(mutation.variant_id, (groups.get(mutation.variant_id) || 0) + restoreQty)
      return groups
    }, new Map())
  }

  return groupVariantQty(order.order_items || [])
}

const normalizeEditedItems = (items = []) => items.map((item) => ({
  variant_id: Number(item.variant_id),
  nama_produk_snapshot: item.nama_produk_snapshot,
  qty: Number(item.qty || 0),
  harga: Number(item.harga || 0),
  subtotal: Number(item.qty || 0) * Number(item.harga || 0),
}))

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
  const [editingOrder, setEditingOrder] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingOrder, setDeletingOrder] = useState(null)
  const [deletingOrderId, setDeletingOrderId] = useState(null)
  const [variants, setVariants] = useState([])
  const [loadingVariants, setLoadingVariants] = useState(true)

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

  const loadVariants = useCallback(async () => {
    setLoadingVariants(true)
    const { data, error: variantError } = await supabase
      .from('product_variants')
      .select('id, product_id, nama_varian, satuan, harga_jual, stok, dijual, products(id, sku, nama_produk, brand, aktif)')
      .order('nama_varian')

    if (variantError) {
      console.error('Gagal memuat produk untuk edit order:', variantError)
      setError(variantError.message || 'Gagal memuat produk untuk edit order.')
      setVariants([])
    } else {
      setVariants(data || [])
    }
    setLoadingVariants(false)
  }, [])

  useEffect(() => {
    loadVariants()
  }, [loadVariants])

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

  const syncVariantStocks = async (restoreQty, orderQty) => {
    const variantIds = [...new Set([...restoreQty.keys(), ...orderQty.keys()])]
    if (!variantIds.length) return []

    const { data: stockRows, error: stockReadError } = await supabase
      .from('product_variants')
      .select('id, stok, nama_varian, products(nama_produk)')
      .in('id', variantIds)

    if (stockReadError) throw stockReadError

    const stockMap = new Map((stockRows || []).map((row) => [row.id, row]))
    const snapshots = []

    for (const variantId of variantIds) {
      const row = stockMap.get(variantId)
      if (!row) throw new Error(`Produk variant ID ${variantId} tidak ditemukan.`)

      const oldStock = Number(row.stok || 0)
      const restoredStock = oldStock + Number(restoreQty.get(variantId) || 0)
      const requiredQty = Number(orderQty.get(variantId) || 0)
      const nextStock = restoredStock - requiredQty
      const productName = row.products?.nama_produk || row.nama_varian || 'Produk'

      if (nextStock < 0) {
        throw new Error(`Stok ${productName} tidak mencukupi. Tersedia setelah koreksi order lama: ${restoredStock}, dibutuhkan: ${requiredQty}.`)
      }

      const { data: updatedRows, error: stockUpdateError } = await supabase
        .from('product_variants')
        .update({ stok: nextStock })
        .eq('id', variantId)
        .eq('stok', oldStock)
        .select('id')

      if (stockUpdateError) throw stockUpdateError
      if (!updatedRows?.length) throw new Error(`Stok ${productName} berubah saat diproses. Muat ulang lalu coba lagi.`)

      snapshots.push({ variantId, oldStock, nextStock })
    }

    return snapshots
  }

  const rollbackVariantStocks = async (snapshots = []) => {
    for (const snapshot of snapshots) {
      const { error: rollbackError } = await supabase
        .from('product_variants')
        .update({ stok: snapshot.oldStock })
        .eq('id', snapshot.variantId)
        .eq('stok', snapshot.nextStock)
      if (rollbackError) console.error('Gagal rollback stok edit order:', rollbackError)
    }
  }

  const saveOrderEdit = async (form) => {
    setError('')
    setSuccess('')

    const cleanName = form.nama_customer.trim()
    const cleanItems = normalizeEditedItems(form.items)
    if (!cleanName) return setError('Nama customer wajib diisi.')
    if (!cleanItems.length) return setError('Order harus memiliki minimal 1 item.')
    if (cleanItems.some((item) => !item.variant_id || item.qty <= 0 || item.harga < 0)) {
      return setError('Pastikan semua item memiliki produk, qty lebih dari 0, dan harga valid.')
    }

    setSavingEdit(true)
    let stockSnapshots = []
    let latestOrder = null
    let latestMutations = []
    let orderUpdated = false
    let mutationsDeleted = false
    let itemsDeleted = false

    try {
      const { data: orderSnapshot, error: orderReadError } = await supabase
        .from('orders')
        .select('*, order_items(id, order_id, variant_id, nama_produk_snapshot, qty, harga, subtotal)')
        .eq('id', editingOrder.id)
        .single()
      if (orderReadError) throw orderReadError
      latestOrder = orderSnapshot

      const { data: mutations, error: mutationReadError } = await supabase
        .from('stock_mutations')
        .select('id, variant_id, tipe, qty, catatan, ref_id')
        .eq('ref_id', editingOrder.id)
      if (mutationReadError) throw mutationReadError
      latestMutations = mutations || []

      const restoreQty = buildRestoreQty(latestOrder, latestMutations)
      const orderQty = groupVariantQty(cleanItems)
      stockSnapshots = await syncVariantStocks(restoreQty, orderQty)

      const total = cleanItems.reduce((sum, item) => sum + item.subtotal, 0) + (Number(form.ongkir) || 0)
      const { data: updatedOrder, error: orderUpdateError } = await supabase
        .from('orders')
        .update({
          nama_customer: cleanName,
          no_wa: form.no_wa.trim(),
          alamat: form.alamat.trim(),
          ongkir: Number(form.ongkir) || 0,
          total,
          status: form.status,
        })
        .eq('id', editingOrder.id)
        .select()
        .single()
      if (orderUpdateError) throw orderUpdateError
      orderUpdated = true

      const { error: deleteMutationError } = await supabase.from('stock_mutations').delete().eq('ref_id', editingOrder.id)
      if (deleteMutationError) throw deleteMutationError
      mutationsDeleted = true

      const { error: deleteItemsError } = await supabase.from('order_items').delete().eq('order_id', editingOrder.id)
      if (deleteItemsError) throw deleteItemsError
      itemsDeleted = true

      const itemPayload = cleanItems.map((item) => ({
        order_id: editingOrder.id,
        variant_id: item.variant_id,
        nama_produk_snapshot: item.nama_produk_snapshot,
        qty: item.qty,
        harga: item.harga,
        subtotal: item.subtotal,
      }))
      const { data: insertedItems, error: insertItemsError } = await supabase
        .from('order_items')
        .insert(itemPayload)
        .select('id, order_id, variant_id, nama_produk_snapshot, qty, harga, subtotal')
      if (insertItemsError) throw insertItemsError

      const mutationPayload = cleanItems.map((item) => ({
        variant_id: item.variant_id,
        tipe: 'ORDER',
        qty: -item.qty,
        catatan: updatedOrder.nomor_order,
        ref_id: editingOrder.id,
      }))
      const { error: insertMutationError } = await supabase.from('stock_mutations').insert(mutationPayload)
      if (insertMutationError) throw insertMutationError

      const nextOrder = { ...updatedOrder, order_items: insertedItems || [] }
      setOrders((current) => current.map((order) => order.id === editingOrder.id ? nextOrder : order))
      setSelectedOrder((current) => current?.id === editingOrder.id ? nextOrder : current)
      setEditingOrder(null)
      setSuccess(`Order ${updatedOrder.nomor_order} berhasil diperbarui dan stok tersinkron.`)
      await loadVariants()
    } catch (editError) {
      console.error('Gagal mengedit order:', editError)
      await rollbackVariantStocks(stockSnapshots)
      if (itemsDeleted && latestOrder?.order_items?.length) {
        const { error: restoreItemsError } = await supabase.from('order_items').insert(latestOrder.order_items.map((item) => ({
          order_id: latestOrder.id,
          variant_id: item.variant_id,
          nama_produk_snapshot: item.nama_produk_snapshot,
          qty: item.qty,
          harga: item.harga,
          subtotal: item.subtotal,
        })))
        if (restoreItemsError) console.error('Gagal rollback item lama:', restoreItemsError)
      }
      if (mutationsDeleted && latestMutations.length) {
        const { error: restoreMutationError } = await supabase.from('stock_mutations').insert(latestMutations.map((mutation) => ({
          variant_id: mutation.variant_id,
          tipe: mutation.tipe,
          qty: mutation.qty,
          catatan: mutation.catatan,
          ref_id: mutation.ref_id,
        })))
        if (restoreMutationError) console.error('Gagal rollback mutasi lama:', restoreMutationError)
      }
      if (orderUpdated && latestOrder) {
        const { error: restoreOrderError } = await supabase
          .from('orders')
          .update({
            nama_customer: latestOrder.nama_customer,
            no_wa: latestOrder.no_wa,
            alamat: latestOrder.alamat,
            ongkir: latestOrder.ongkir,
            total: latestOrder.total,
            status: latestOrder.status,
          })
          .eq('id', latestOrder.id)
        if (restoreOrderError) console.error('Gagal rollback data order lama:', restoreOrderError)
      }
      setError(editError.message || 'Gagal mengedit order.')
    } finally {
      setSavingEdit(false)
    }
  }

  const deleteOrder = async (order) => {
    setDeletingOrderId(order.id)
    setError('')
    setSuccess('')
    let stockSnapshots = []
    let latestOrder = null
    let latestMutations = []
    let mutationsDeleted = false
    let itemsDeleted = false

    try {
      const { data: orderSnapshot, error: orderReadError } = await supabase
        .from('orders')
        .select('*, order_items(id, order_id, variant_id, nama_produk_snapshot, qty, harga, subtotal)')
        .eq('id', order.id)
        .single()
      if (orderReadError) throw orderReadError
      latestOrder = orderSnapshot

      const { data: mutations, error: mutationReadError } = await supabase
        .from('stock_mutations')
        .select('id, variant_id, tipe, qty, catatan, ref_id')
        .eq('ref_id', order.id)
      if (mutationReadError) throw mutationReadError
      latestMutations = mutations || []

      const restoreQty = buildRestoreQty(latestOrder, latestMutations)
      stockSnapshots = await syncVariantStocks(restoreQty, new Map())

      const { error: deleteMutationError } = await supabase.from('stock_mutations').delete().eq('ref_id', order.id)
      if (deleteMutationError) throw deleteMutationError
      mutationsDeleted = true

      const { error: deleteItemsError } = await supabase.from('order_items').delete().eq('order_id', order.id)
      if (deleteItemsError) throw deleteItemsError
      itemsDeleted = true

      const { error: deleteOrderError } = await supabase.from('orders').delete().eq('id', order.id)
      if (deleteOrderError) throw deleteOrderError

      setOrders((current) => current.filter((item) => item.id !== order.id))
      setTotalOrders((current) => Math.max(0, current - 1))
      setSelectedOrder((current) => current?.id === order.id ? null : current)
      setDeletingOrder(null)
      setSuccess(`Order ${order.nomor_order} berhasil dihapus dan stok dikembalikan.`)
      await loadVariants()
    } catch (deleteError) {
      console.error('Gagal menghapus order:', deleteError)
      await rollbackVariantStocks(stockSnapshots)
      if (itemsDeleted && latestOrder?.order_items?.length) {
        const { error: restoreItemsError } = await supabase.from('order_items').insert(latestOrder.order_items.map((item) => ({
          order_id: latestOrder.id,
          variant_id: item.variant_id,
          nama_produk_snapshot: item.nama_produk_snapshot,
          qty: item.qty,
          harga: item.harga,
          subtotal: item.subtotal,
        })))
        if (restoreItemsError) console.error('Gagal rollback item order saat hapus:', restoreItemsError)
      }
      if (mutationsDeleted && latestMutations.length) {
        const { error: restoreMutationError } = await supabase.from('stock_mutations').insert(latestMutations.map((mutation) => ({
          variant_id: mutation.variant_id,
          tipe: mutation.tipe,
          qty: mutation.qty,
          catatan: mutation.catatan,
          ref_id: mutation.ref_id,
        })))
        if (restoreMutationError) console.error('Gagal rollback mutasi order saat hapus:', restoreMutationError)
      }
      setError(deleteError.message || 'Gagal menghapus order.')
    } finally {
      setDeletingOrderId(null)
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
                      <button className="icon-button small" onClick={() => setEditingOrder(order)} aria-label="Edit order" title="Edit Order"><Edit3 size={16} /></button>
                      <button className="icon-button small" onClick={() => printShippingLabel(order)} aria-label="Print label pengiriman" title="Print Label Pengiriman"><Printer size={16} /></button>
                      <button className="icon-button small" onClick={() => openTrackingModal(order)} aria-label="Input nomor resi" title="Input nomor resi"><Truck size={16} /></button>
                      <button className="icon-button small danger" onClick={() => setDeletingOrder(order)} aria-label="Hapus order" title="Hapus Order" disabled={deletingOrderId === order.id}>
                        {deletingOrderId === order.id ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
                      </button>
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
      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          variants={variants}
          loadingVariants={loadingVariants}
          saving={savingEdit}
          onClose={() => setEditingOrder(null)}
          onSave={saveOrderEdit}
        />
      )}
      {deletingOrder && (
        <DeleteOrderModal
          order={deletingOrder}
          deleting={deletingOrderId === deletingOrder.id}
          onClose={() => setDeletingOrder(null)}
          onDelete={() => deleteOrder(deletingOrder)}
        />
      )}
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

function EditOrderModal({ order, variants, loadingVariants, saving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    nama_customer: order.nama_customer || '',
    no_wa: order.no_wa || '',
    alamat: order.alamat || '',
    ongkir: order.ongkir ?? 0,
    status: order.status || 'baru',
    items: (order.order_items || []).map((item) => ({
      row_id: item.id || crypto.randomUUID(),
      variant_id: item.variant_id || '',
      nama_produk_snapshot: item.nama_produk_snapshot || '',
      qty: Number(item.qty || 1),
      harga: Number(item.harga || 0),
    })),
  }))
  const [productSearch, setProductSearch] = useState('')

  const filteredVariants = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase()
    return variants.filter((variant) => {
      const product = variant.products || {}
      if (!product.aktif || !variant.dijual) return false
      const label = `${product.sku || ''} ${product.brand || ''} ${product.nama_produk || ''} ${variant.nama_varian || ''}`.toLowerCase()
      return !keyword || label.includes(keyword)
    })
  }, [productSearch, variants])

  const itemsSubtotal = form.items.reduce((total, item) => total + (Number(item.qty || 0) * Number(item.harga || 0)), 0)
  const total = itemsSubtotal + (Number(form.ongkir) || 0)

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const updateItem = (rowId, field, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => item.row_id === rowId ? { ...item, [field]: value } : item),
    }))
  }

  const changeItemVariant = (rowId, variantId) => {
    const variant = variants.find((item) => String(item.id) === String(variantId))
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => item.row_id === rowId ? {
        ...item,
        variant_id: variantId,
        nama_produk_snapshot: variant ? buildVariantLabel(variant) : '',
        harga: variant ? Number(variant.harga_jual || 0) : item.harga,
      } : item),
    }))
  }

  const addItem = () => {
    setForm((current) => ({
      ...current,
      items: [...current.items, {
        row_id: crypto.randomUUID(),
        variant_id: '',
        nama_produk_snapshot: '',
        qty: 1,
        harga: 0,
      }],
    }))
  }

  const removeItem = (rowId) => {
    setForm((current) => ({
      ...current,
      items: current.items.filter((item) => item.row_id !== rowId),
    }))
  }

  const submit = (event) => {
    event.preventDefault()
    onSave(form)
  }

  return (
    <Modal title={`Edit Order ${order.nomor_order}`} subtitle="Perubahan order akan disimpan ke database dan stok disinkronkan." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body edit-order-modal">
          <section className="edit-order-section">
            <h3>Data Customer</h3>
            <div className="form-grid">
              <label className="form-field">
                <span>Nama Customer</span>
                <input value={form.nama_customer} onChange={(event) => updateField('nama_customer', event.target.value)} required />
              </label>
              <label className="form-field">
                <span>No WA</span>
                <input value={form.no_wa} onChange={(event) => updateField('no_wa', event.target.value)} />
              </label>
              <label className="form-field wide">
                <span>Alamat</span>
                <textarea rows="3" value={form.alamat} onChange={(event) => updateField('alamat', event.target.value)} />
              </label>
              <label className="form-field">
                <span>Ongkir</span>
                <input type="number" min="0" value={form.ongkir} onChange={(event) => updateField('ongkir', event.target.value)} />
              </label>
              <label className="form-field">
                <span>Status</span>
                <select value={form.status} onChange={(event) => updateField('status', event.target.value)}>
                  {['baru', 'diproses', 'dikirim', 'selesai', 'dibatalkan'].map((item) => (
                    <option key={item} value={item}>{formatStatus(item)[0].toUpperCase() + formatStatus(item).slice(1)}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="edit-order-section">
            <div className="edit-order-section-title">
              <div>
                <h3>Pesanan</h3>
                <span>{form.items.length} item tersimpan di order ini</span>
              </div>
              <button className="button ghost" type="button" onClick={addItem}><Plus size={16} /> Tambah Item</button>
            </div>

            <label className="search-field edit-product-search">
              <Search size={17} />
              <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Filter produk untuk dropdown..." />
            </label>

            <div className="edit-order-items">
              {form.items.map((item, index) => {
                const selectedVariant = variants.find((variant) => String(variant.id) === String(item.variant_id))
                const variantOptions = selectedVariant && !filteredVariants.some((variant) => variant.id === selectedVariant.id)
                  ? [selectedVariant, ...filteredVariants]
                  : filteredVariants

                return (
                  <div className="edit-order-item" key={item.row_id}>
                    <div className="edit-order-item-number">{index + 1}</div>
                    <label className="form-field">
                      <span>Produk</span>
                      <select value={item.variant_id} onChange={(event) => changeItemVariant(item.row_id, event.target.value)} required>
                        <option value="">{loadingVariants ? 'Memuat produk...' : 'Pilih produk'}</option>
                        {variantOptions.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {buildVariantLabel(variant)} - Stok {variant.stok ?? 0}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="form-field compact">
                      <span>Qty</span>
                      <input type="number" min="1" value={item.qty} onChange={(event) => updateItem(item.row_id, 'qty', event.target.value)} required />
                    </label>
                    <label className="form-field compact">
                      <span>Harga</span>
                      <input type="number" min="0" value={item.harga} onChange={(event) => updateItem(item.row_id, 'harga', event.target.value)} required />
                    </label>
                    <div className="edit-order-item-subtotal">
                      <span>Subtotal</span>
                      <strong>{formatRupiah(Number(item.qty || 0) * Number(item.harga || 0))}</strong>
                    </div>
                    <button className="icon-button small danger" type="button" onClick={() => removeItem(item.row_id)} aria-label="Hapus item">
                      <X size={16} />
                    </button>
                  </div>
                )
              })}
              {!form.items.length && (
                <div className="order-empty edit-order-empty">Belum ada item. Tambahkan minimal satu produk sebelum menyimpan.</div>
              )}
            </div>
          </section>

          <section className="edit-order-summary">
            <div><span>Subtotal Produk</span><strong>{formatRupiah(itemsSubtotal)}</strong></div>
            <div><span>Ongkir</span><strong>{formatRupiah(form.ongkir)}</strong></div>
            <div className="grand"><span>Total Baru</span><strong>{formatRupiah(total)}</strong></div>
          </section>
        </div>
        <div className="modal-footer">
          <button className="button ghost" type="button" onClick={onClose} disabled={saving}>Batal</button>
          <button className="button primary" type="submit" disabled={saving || loadingVariants}>
            {saving ? <LoaderCircle className="spin" size={16} /> : <Edit3 size={16} />} Simpan Perubahan
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteOrderModal({ order, deleting, onClose, onDelete }) {
  return (
    <Modal title={`Hapus Order ${order.nomor_order}`} subtitle="Aksi ini menghapus order dari database dan mengembalikan stok dari mutasi order." onClose={onClose}>
      <div className="modal-body delete-order-modal">
        <div className="notice error">
          <AlertCircle size={19} />
          <span>Order atas nama <strong>{order.nama_customer || '-'}</strong> akan dihapus permanen. Data item dan mutasi order ini juga akan dihapus.</span>
        </div>
        <div className="detail-totals">
          <div><span>Item</span><strong>{order.order_items?.length || 0}</strong></div>
          <div><span>Total</span><strong>{formatRupiah(order.total)}</strong></div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="button ghost" type="button" onClick={onClose} disabled={deleting}>Batal</button>
        <button className="button primary danger-button" type="button" onClick={onDelete} disabled={deleting}>
          {deleting ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />} Hapus Order
        </button>
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
