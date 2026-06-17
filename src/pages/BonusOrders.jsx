import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Gift,
  LoaderCircle,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  Trash2,
} from 'lucide-react'
import { productNameOnly } from '../lib/productDisplay'
import { supabase } from '../lib/supabase'

export default function BonusOrders() {
  const [recipient, setRecipient] = useState('')
  const [note, setNote] = useState('')
  const [variants, setVariants] = useState([])
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [qty, setQty] = useState(1)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const loadProducts = async () => {
      setLoadingProducts(true)
      const { data, error: queryError } = await supabase
        .from('product_variants')
        .select('id, product_id, nama_varian, satuan, harga_jual, stok, dijual, products(id, sku, nama_produk, brand, aktif)')
        .eq('dijual', true)
        .gt('stok', 0)
        .order('nama_varian')
        .limit(500)

      if (queryError) {
        console.error('Gagal memuat produk bonus:', queryError)
        setError(queryError.message)
        setVariants([])
      } else {
        setVariants(data || [])
      }
      setLoadingProducts(false)
    }

    loadProducts()
  }, [])

  const filteredVariants = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return variants
      .filter((variant) => {
        const product = variant.products || {}
        if (!product.aktif || !variant.dijual || Number(variant.stok) <= 0) return false
        return [product.sku, product.brand, product.nama_produk, variant.nama_varian]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword)
      })
      .slice(0, 30)
  }, [search, variants])

  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId)
  const totalQty = items.reduce((total, item) => total + item.qty, 0)

  const selectVariant = (variant) => {
    setSelectedVariantId(variant.id)
    setQty(1)
    setSearch('')
  }

  const addItem = () => {
    setError('')
    const numericQty = Number(qty)

    if (!selectedVariant) return setError('Pilih produk terlebih dahulu.')
    if (!selectedVariant.products?.aktif || !selectedVariant.dijual || Number(selectedVariant.stok) <= 0) return setError('Produk ini tidak aktif atau stoknya kosong.')
    if (numericQty <= 0) return setError('Qty harus lebih dari 0.')
    if (numericQty > Number(selectedVariant.stok)) return setError(`Stok tidak mencukupi. Tersedia: ${selectedVariant.stok}.`)

    setItems((current) => {
      const existingIndex = current.findIndex((item) => item.variant_id === selectedVariant.id)
      const nextQty = existingIndex === -1 ? numericQty : current[existingIndex].qty + numericQty
      if (nextQty > Number(selectedVariant.stok)) {
        setError(`Total qty melebihi stok tersedia: ${selectedVariant.stok}.`)
        return current
      }

      const newItem = {
        variant_id: selectedVariant.id,
        nama_produk: selectedVariant.products?.nama_produk || '-',
        nama_varian: selectedVariant.nama_varian || '-',
        satuan: selectedVariant.satuan || '',
        qty: numericQty,
      }

      if (existingIndex === -1) return [...current, newItem]
      return current.map((item, index) => index === existingIndex ? { ...item, qty: nextQty } : item)
    })

    setSelectedVariantId('')
    setQty(1)
  }

  const resetForm = () => {
    setRecipient('')
    setNote('')
    setItems([])
    setSearch('')
    setSelectedVariantId('')
    setQty(1)
    setError('')
    setSuccess('')
  }

  const saveBonus = async () => {
    setError('')
    setSuccess('')
    if (!items.length) return setError('Tambahkan minimal 1 produk bonus.')

    setSaving(true)
    const changedStocks = []
    const mutationIds = []

    try {
      const currentStocks = new Map()

      for (const item of items) {
        const { data: currentVariant, error: stockReadError } = await supabase
          .from('product_variants')
          .select('stok, dijual, products(aktif)')
          .eq('id', item.variant_id)
          .single()

        if (stockReadError) throw stockReadError
        if (!currentVariant.dijual || !currentVariant.products?.aktif) throw new Error(`${item.nama_produk} sudah tidak aktif.`)
        if (Number(currentVariant.stok) < item.qty) throw new Error(`Stok ${item.nama_produk} tidak mencukupi. Tersedia ${currentVariant.stok}.`)
        currentStocks.set(item.variant_id, Number(currentVariant.stok))
      }

      const bonusNote = [
        'BONUS',
        recipient.trim() ? `Penerima: ${recipient.trim()}` : '',
        note.trim() ? `Catatan: ${note.trim()}` : '',
      ].filter(Boolean).join(' | ')

      for (const item of items) {
        const oldStock = currentStocks.get(item.variant_id)
        const { data: updatedVariant, error: stockError } = await supabase
          .from('product_variants')
          .update({ stok: oldStock - item.qty })
          .eq('id', item.variant_id)
          .eq('stok', oldStock)
          .select('id')

        if (stockError) throw stockError
        if (!updatedVariant?.length) throw new Error(`Stok ${item.nama_produk} berubah. Silakan ulangi input bonus.`)
        changedStocks.push({ variantId: item.variant_id, oldStock })

        const { data: mutation, error: mutationError } = await supabase
          .from('stock_mutations')
          .insert({
            variant_id: item.variant_id,
            tipe: 'BONUS',
            qty: -item.qty,
            catatan: `${bonusNote} | ${item.nama_produk}`,
            ref_id: null,
          })
          .select('id')
          .single()

        if (mutationError) throw mutationError
        mutationIds.push(mutation.id)
      }

      setVariants((current) => current.map((variant) => {
        const bonusItem = items.find((item) => item.variant_id === variant.id)
        return bonusItem ? { ...variant, stok: Number(variant.stok) - bonusItem.qty } : variant
      }))
      resetForm()
      setSuccess(`Bonus berhasil disimpan. ${totalQty} item mengurangi stok tanpa menambah nominal penjualan.`)
    } catch (saveError) {
      console.error('Gagal menyimpan bonus:', saveError)
      for (const stock of changedStocks) {
        const { error: restoreError } = await supabase
          .from('product_variants')
          .update({ stok: stock.oldStock })
          .eq('id', stock.variantId)
        if (restoreError) console.error('Gagal rollback stok bonus:', restoreError)
      }
      if (mutationIds.length) {
        const { error: mutationRollbackError } = await supabase.from('stock_mutations').delete().in('id', mutationIds)
        if (mutationRollbackError) console.error('Gagal rollback mutasi bonus:', mutationRollbackError)
      }
      setError(saveError.message || 'Gagal menyimpan bonus.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Inventori</span>
          <h2>Input Bonus</h2>
          <p>Catat produk bonus yang hanya mengurangi stok tanpa menambah nominal penjualan.</p>
        </div>
        <div className="heading-actions">
          <button className="button ghost" type="button" onClick={resetForm}><RotateCcw size={16} /> Reset Bonus</button>
        </div>
      </section>

      {success && <div className="notice success"><CheckCircle2 size={19} /><span>{success}</span></div>}
      {error && <div className="notice error"><AlertCircle size={19} /><span>{error}</span></div>}

      <div className="marketplace-order-layout">
        <div className="order-main marketplace-main">
          <section className="content-card order-section">
            <div className="section-title"><span>01</span><h3>Detail Bonus</h3></div>
            <div className="marketplace-form-grid">
              <Field label="Penerima / Keterangan"><input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Nama customer, event, atau alasan bonus" /></Field>
              <Field label="Catatan" wide><textarea rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Catatan bonus untuk riwayat mutasi stok" /></Field>
            </div>
          </section>

          <section className="content-card order-section">
            <div className="section-title"><span>02</span><h3>Input Produk Bonus</h3></div>
            <div className="order-item-picker marketplace-item-picker bonus-item-picker">
              <div className="product-picker">
                <label className="search-field">
                  <Search size={18} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari SKU, produk, atau brand..." />
                </label>
                {search && (
                  <div className="product-options">
                    {loadingProducts && <span className="picker-message"><LoaderCircle className="spin" size={16} /> Memuat pilihan...</span>}
                    {!loadingProducts && filteredVariants.length === 0 && <span className="picker-message">Produk tidak ditemukan.</span>}
                    {!loadingProducts && filteredVariants.map((variant) => (
                      <button type="button" key={variant.id} onClick={() => selectVariant(variant)}>
                        <div><strong>{variant.products?.nama_produk}</strong><span>{variant.products?.sku}</span></div>
                        <div><span>Stok: {variant.stok} {variant.satuan}</span></div>
                      </button>
                    ))}
                  </div>
                )}
                {selectedVariant && (
                  <div className="selected-product">
                    <div>
                      <strong>{selectedVariant.products?.nama_produk}</strong>
                      <span>Stok {selectedVariant.stok}</span>
                    </div>
                    <button type="button" onClick={() => setSelectedVariantId('')}>Ganti</button>
                  </div>
                )}
              </div>
              <Field label="Qty"><input type="number" min="1" value={qty} onChange={(event) => setQty(event.target.value)} /></Field>
              <button className="button primary add-item-button" type="button" onClick={addItem}><Plus size={17} /> Tambah Bonus</button>
            </div>
          </section>

          <section className="content-card order-section">
            <div className="section-title"><span>03</span><h3>Item Bonus</h3></div>
            <div className="table-wrap">
              <table className="order-items-table marketplace-items-table bonus-items-table">
                <thead><tr><th>Produk</th><th>Qty</th><th /></tr></thead>
                <tbody>
                  {!items.length && <tr><td colSpan="3"><div className="order-empty"><ShoppingBag size={22} /> Belum ada item bonus.</div></td></tr>}
                  {items.map((item, index) => (
                    <tr key={`${item.variant_id}-${index}`}>
                      <td><strong className="product-title">{productNameOnly(item.nama_produk)}</strong></td>
                      <td>{item.qty} {item.satuan}</td>
                      <td><button className="icon-button small danger" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Hapus item"><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="content-card order-summary">
          <span className="eyebrow">Ringkasan</span>
          <h3>Total Bonus</h3>
          <div className="marketplace-summary-icon"><Gift size={28} /><span>Bonus Stok</span></div>
          <div className="summary-lines">
            <div><span>Total produk</span><strong>{items.length}</strong></div>
            <div><span>Total qty</span><strong>{totalQty}</strong></div>
            <div><span>Nominal jual</span><strong>Rp 0</strong></div>
          </div>
          <div className="summary-total"><span>Dampak Penjualan</span><strong>Rp 0</strong></div>
          <button className="button primary save-order-button" type="button" onClick={saveBonus} disabled={saving}>
            {saving && <LoaderCircle className="spin" size={17} />}
            {saving ? 'Menyimpan Bonus...' : 'Simpan Bonus'}
          </button>
          <small>Bonus hanya mengurangi stok dan mencatat mutasi tipe BONUS. Tidak membuat order dan tidak menambah nominal penjualan.</small>
        </aside>
      </div>
    </div>
  )
}

function Field({ label, children, wide = false }) {
  return <label className={`form-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>
}
