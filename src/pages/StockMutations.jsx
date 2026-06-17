import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const mutationTypes = ['RESTOCK', 'RUSAK', 'RETUR', 'KOREKSI']
const pageSize = 25
const formatDate = (value) => value
  ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '-'

export default function StockMutations() {
  const [variants, setVariants] = useState([])
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [type, setType] = useState('RESTOCK')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [history, setHistory] = useState([])
  const [historySearch, setHistorySearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadVariants = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('product_variants')
      .select('id, nama_varian, satuan, stok, products(id, sku, nama_produk, brand)')
      .order('nama_varian')
      .limit(1000)
    if (queryError) {
      console.error('Gagal memuat produk mutasi:', queryError)
      setError(queryError.message)
    } else {
      setVariants(data || [])
    }
  }, [])

  const loadHistory = useCallback(async () => {
    setLoading(true)
    const from = (page - 1) * pageSize
    let query = supabase
      .from('stock_mutations')
      .select('id, variant_id, tipe, qty, catatan, ref_id, created_at, product_variants(id, nama_varian, products(id, sku, nama_produk, brand))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1)

    const keyword = historySearch.trim().replace(/[,%().]/g, ' ')
    if (keyword) query = query.or(`tipe.ilike.%${keyword}%,catatan.ilike.%${keyword}%`)
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00+07:00`)
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59+07:00`)

    const { data, error: queryError, count } = await query
    if (queryError) {
      console.error('Gagal memuat riwayat mutasi:', queryError)
      setError(queryError.message)
    } else {
      setHistory(data || [])
      setTotal(count || 0)
    }
    setLoading(false)
  }, [dateFrom, dateTo, historySearch, page])

  useEffect(() => {
    loadVariants()
  }, [loadVariants])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const filteredVariants = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase()
    return variants.filter((variant) => {
      const product = variant.products || {}
      return [product.sku, product.nama_produk, product.brand, variant.nama_varian]
        .filter(Boolean).join(' ').toLowerCase().includes(keyword)
    }).slice(0, 30)
  }, [productSearch, variants])

  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const selectVariant = (variant) => {
    setSelectedVariantId(variant.id)
    setProductSearch('')
  }

  const getSignedQty = () => {
    const numericQty = Number(qty)
    if (type === 'KOREKSI') return numericQty
    if (type === 'RUSAK') return -Math.abs(numericQty)
    return Math.abs(numericQty)
  }

  const saveMutation = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!selectedVariant) return setError('Pilih produk terlebih dahulu.')
    if (!Number(qty)) return setError('Qty tidak boleh nol.')
    if (type !== 'KOREKSI' && Number(qty) < 0) return setError(`Qty ${type} harus berupa angka positif.`)

    const signedQty = getSignedQty()
    const oldStock = Number(selectedVariant.stok) || 0
    const newStock = oldStock + signedQty
    if (newStock < 0) return setError(`Stok tidak mencukupi. Stok saat ini: ${oldStock}.`)

    setSaving(true)
    const { data: updated, error: stockError } = await supabase
      .from('product_variants')
      .update({ stok: newStock })
      .eq('id', selectedVariant.id)
      .eq('stok', oldStock)
      .select('id')

    if (stockError || !updated?.length) {
      const updateError = stockError || new Error('Stok berubah. Silakan ulangi mutasi.')
      console.error('Gagal memperbarui stok:', updateError)
      setError(updateError.message)
      setSaving(false)
      return
    }

    const { error: mutationError } = await supabase.from('stock_mutations').insert({
      variant_id: selectedVariant.id,
      tipe: type,
      qty: signedQty,
      catatan: note.trim(),
      ref_id: null,
    })

    if (mutationError) {
      console.error('Gagal mencatat mutasi stok:', mutationError)
      const { error: rollbackError } = await supabase.from('product_variants').update({ stok: oldStock }).eq('id', selectedVariant.id).eq('stok', newStock)
      if (rollbackError) console.error('Gagal rollback stok:', rollbackError)
      setError(mutationError.message)
      setSaving(false)
      return
    }

    setVariants((current) => current.map((variant) => variant.id === selectedVariant.id ? { ...variant, stok: newStock } : variant))
    setQty('')
    setNote('')
    setSuccess(`Mutasi ${type} berhasil. Stok baru: ${newStock}.`)
    setSaving(false)
    setPage(1)
    await loadHistory()
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Inventori</span><h2>Restock / Mutasi Stok</h2><p>Sesuaikan stok dan pantau seluruh riwayat perubahannya.</p></div>
      </section>

      {success && <div className="notice success"><CheckCircle2 size={19} /><span>{success}</span></div>}
      {error && <div className="notice error"><AlertCircle size={19} /><span>{error}</span></div>}

      <section className="mutation-layout">
        <form className="content-card mutation-form" onSubmit={saveMutation}>
          <div className="section-title"><span>01</span><h3>Input Mutasi Stok</h3></div>
          <div className="mutation-form-body">
            <div className="product-picker">
              <label className="search-field"><Search size={18} /><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Cari SKU, produk, atau brand..." /></label>
              {productSearch && <div className="product-options">
                {!filteredVariants.length && <span className="picker-message">Produk tidak ditemukan.</span>}
                {filteredVariants.map((variant) => <button type="button" key={variant.id} onClick={() => selectVariant(variant)}>
                  <div><strong>{variant.products?.nama_produk}</strong><span>{variant.products?.sku}</span></div>
                  <div><span>Stok: {variant.stok} {variant.satuan}</span></div>
                </button>)}
              </div>}
              {selectedVariant && <div className="selected-product"><div><strong>{selectedVariant.products?.nama_produk}</strong><span>Produk dipilih</span></div><button type="button" onClick={() => setSelectedVariantId('')}>Ganti</button></div>}
            </div>

            {selectedVariant && <div className="current-stock"><span>Stok Saat Ini</span><strong>{selectedVariant.stok} {selectedVariant.satuan}</strong></div>}

            <Field label="Tipe Mutasi"><select value={type} onChange={(event) => setType(event.target.value)}>{mutationTypes.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label={type === 'KOREKSI' ? 'Qty (+/-)' : 'Qty'}><input type="number" value={qty} onChange={(event) => setQty(event.target.value)} placeholder={type === 'KOREKSI' ? 'Contoh: -2 atau 5' : 'Masukkan qty positif'} required /></Field>
            <Field label="Catatan"><textarea rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Catatan mutasi stok..." /></Field>
            <button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />}{saving ? 'Menyimpan...' : 'Simpan Mutasi'}</button>
          </div>
        </form>

        <aside className="content-card mutation-guide">
          <SlidersHorizontal size={25} />
          <h3>Arah Mutasi</h3>
          <div><span>RESTOCK</span><strong>Stok bertambah</strong></div>
          <div><span>RETUR</span><strong>Stok bertambah</strong></div>
          <div><span>RUSAK</span><strong>Stok berkurang</strong></div>
          <div><span>KOREKSI</span><strong>Qty bisa plus / minus</strong></div>
        </aside>
      </section>

      <section className="content-card">
        <div className="table-toolbar">
          <label className="search-field"><Search size={18} /><input value={historySearch} onChange={(event) => { setHistorySearch(event.target.value); setPage(1) }} placeholder="Cari tipe atau catatan mutasi..." /></label>
          <label className="date-field"><span>Dari</span><input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1) }} /></label>
          <label className="date-field"><span>Sampai</span><input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1) }} /></label>
          {(dateFrom || dateTo) && <button className="button ghost history-reset-filter" onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }}>Reset Tanggal</button>}
          <button className="button ghost" onClick={() => { loadVariants(); loadHistory() }}><RefreshCw size={16} /> Refresh</button>
          <span className="result-count">Total: {total} mutasi</span>
        </div>
        <div className="table-wrap"><table className="history-table mutation-history">
          <thead><tr><th>Tanggal</th><th>Produk</th><th>Tipe</th><th>Qty</th><th>Catatan</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan="5"><div className="empty-state"><LoaderCircle className="spin" /><strong>Memuat riwayat...</strong></div></td></tr>}
            {!loading && !history.length && <tr><td colSpan="5"><div className="empty-state"><strong>Belum ada riwayat mutasi</strong></div></td></tr>}
            {!loading && history.map((mutation) => <tr key={mutation.id}>
              <td>{formatDate(mutation.created_at)}</td>
              <td><div className="product-name"><strong>{mutation.product_variants?.products?.nama_produk || '-'}</strong><span>{mutation.product_variants?.products?.sku || '-'}</span></div></td>
              <td><span className={`mutation-type ${mutation.tipe?.toLowerCase()}`}>{mutation.tipe}</span></td>
              <td><span className={`difference ${mutation.qty > 0 ? 'plus' : mutation.qty < 0 ? 'minus' : ''}`}>{mutation.qty > 0 ? `+${mutation.qty}` : mutation.qty}</span></td>
              <td>{mutation.catatan || '-'}</td>
            </tr>)}
          </tbody>
        </table></div>
        <div className="pagination"><span>Total data: <strong>{total}</strong></span><div><button className="button ghost" onClick={() => setPage((current) => current - 1)} disabled={page <= 1}>Previous</button><span>Halaman {page} dari {totalPages}</span><button className="button ghost" onClick={() => setPage((current) => current + 1)} disabled={page >= totalPages}>Next</button></div></div>
      </section>
    </div>
  )
}

function Field({ label, children }) {
  return <label className="form-field"><span>{label}</span>{children}</label>
}
