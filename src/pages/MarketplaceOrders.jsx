import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  Store,
  Trash2,
} from 'lucide-react'
import { formatDatePartWIB, formatRupiah } from '../lib/format'
import { productNameOnly } from '../lib/productDisplay'
import { supabase } from '../lib/supabase'

const marketplaces = ['Tokopedia', 'Toco']

export default function MarketplaceOrders() {
  const [marketplace, setMarketplace] = useState('Tokopedia')
  const [invoice, setInvoice] = useState('')
  const [note, setNote] = useState('')
  const [variants, setVariants] = useState([])
  const [samplers, setSamplers] = useState([])
  const [items, setItems] = useState([])
  const [itemType, setItemType] = useState('product')
  const [search, setSearch] = useState('')
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [selectedSamplerId, setSelectedSamplerId] = useState('')
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const loadOrderOptions = async () => {
      setLoadingProducts(true)
      const [variantResult, samplerResult] = await Promise.all([
        supabase
          .from('product_variants')
          .select('id, product_id, nama_varian, satuan, harga_jual, stok, dijual, products(id, sku, nama_produk, brand, aktif)')
          .eq('dijual', true)
          .gt('stok', 0)
          .order('nama_varian')
          .limit(500),
        supabase
          .from('sampler_packages')
          .select('id, nama_paket, harga_jual, aktif, sampler_items(id, sampler_id, variant_id, qty, product_variants(id, nama_varian, stok, dijual, products(id, nama_produk, aktif)))')
          .eq('aktif', true)
          .order('nama_paket')
          .limit(500),
      ])

      if (variantResult.error || samplerResult.error) {
        const queryError = variantResult.error || samplerResult.error
        console.error('Gagal memuat produk marketplace:', queryError)
        setError(queryError.message)
      } else {
        setVariants(variantResult.data || [])
        setSamplers(samplerResult.data || [])
      }
      setLoadingProducts(false)
    }

    loadOrderOptions()
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

  const samplerAvailableQty = (sampler) => {
    const samplerItems = sampler.sampler_items || []
    if (!samplerItems.length) return 0
    return Math.min(...samplerItems.map((samplerItem) => {
      const variant = samplerItem.product_variants || {}
      const product = variant.products || {}
      if (!product.aktif || !variant.dijual || Number(samplerItem.qty) <= 0) return 0
      return Math.floor(Number(variant.stok || 0) / Number(samplerItem.qty))
    }))
  }

  const filteredSamplers = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return samplers
      .filter((sampler) => samplerAvailableQty(sampler) > 0 && sampler.nama_paket?.toLowerCase().includes(keyword))
      .slice(0, 30)
  }, [samplers, search])

  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId)
  const selectedSampler = samplers.find((sampler) => sampler.id === selectedSamplerId)
  const selectedItem = itemType === 'product' ? selectedVariant : selectedSampler
  const subtotal = items.reduce((total, item) => total + item.subtotal, 0)

  const selectVariant = (variant) => {
    setSelectedVariantId(variant.id)
    setPrice(variant.harga_jual ?? 0)
    setQty(1)
    setSearch('')
  }

  const selectSampler = (sampler) => {
    setSelectedSamplerId(sampler.id)
    setPrice(sampler.harga_jual ?? 0)
    setQty(1)
    setSearch('')
  }

  const changeItemType = (type) => {
    setItemType(type)
    setSelectedVariantId('')
    setSelectedSamplerId('')
    setSearch('')
    setPrice('')
    setQty(1)
  }

  const addItem = () => {
    setError('')
    const numericQty = Number(qty)
    const numericPrice = Number(price)

    if (!selectedItem) return setError(`Pilih ${itemType === 'product' ? 'produk' : 'paket sampler'} terlebih dahulu.`)
    if (numericQty <= 0) return setError('Qty harus lebih dari 0.')
    if (itemType === 'product' && (!selectedVariant.products?.aktif || !selectedVariant.dijual || Number(selectedVariant.stok) <= 0)) return setError('Produk ini tidak aktif atau stoknya kosong.')
    if (itemType === 'product' && numericQty > Number(selectedVariant.stok)) return setError(`Stok tidak mencukupi. Tersedia: ${selectedVariant.stok}.`)
    if (itemType === 'sampler' && !selectedSampler.sampler_items?.length) return setError('Paket sampler belum memiliki item penyusun.')
    if (itemType === 'sampler' && numericQty > samplerAvailableQty(selectedSampler)) return setError(`Stok penyusun paket sampler tidak mencukupi. Maksimal order: ${samplerAvailableQty(selectedSampler)} paket.`)

    setItems((current) => {
      const itemKey = itemType === 'product' ? selectedVariant.id : selectedSampler.id
      const existingIndex = current.findIndex((item) => item.type === itemType && item.item_id === itemKey)
      const nextQty = existingIndex === -1 ? numericQty : current[existingIndex].qty + numericQty
      if (itemType === 'product' && nextQty > Number(selectedVariant.stok)) {
        setError(`Total qty melebihi stok tersedia: ${selectedVariant.stok}.`)
        return current
      }
      if (itemType === 'sampler' && nextQty > samplerAvailableQty(selectedSampler)) {
        setError(`Total qty melebihi stok penyusun paket sampler. Maksimal order: ${samplerAvailableQty(selectedSampler)} paket.`)
        return current
      }

      const newItem = itemType === 'product' ? {
        type: 'product',
        item_id: selectedVariant.id,
        variant_id: selectedVariant.id,
        nama_produk: selectedVariant.products?.nama_produk || '-',
        nama_varian: selectedVariant.nama_varian || '-',
        satuan: selectedVariant.satuan || '',
        sampler_items: [],
        qty: numericQty,
        harga: numericPrice,
        subtotal: numericQty * numericPrice,
      } : {
        type: 'sampler',
        item_id: selectedSampler.id,
        variant_id: null,
        nama_produk: selectedSampler.nama_paket,
        nama_varian: 'Paket Sampler',
        satuan: 'paket',
        sampler_items: selectedSampler.sampler_items || [],
        qty: numericQty,
        harga: numericPrice,
        subtotal: numericQty * numericPrice,
      }

      if (existingIndex === -1) return [...current, newItem]
      return current.map((item, index) => index === existingIndex
        ? { ...item, qty: nextQty, harga: numericPrice, subtotal: nextQty * numericPrice }
        : item)
    })

    setSelectedVariantId('')
    setSelectedSamplerId('')
    setPrice('')
    setQty(1)
  }

  const resetForm = () => {
    setMarketplace('Tokopedia')
    setInvoice('')
    setNote('')
    setItems([])
    setItemType('product')
    setSearch('')
    setSelectedVariantId('')
    setSelectedSamplerId('')
    setQty(1)
    setPrice('')
    setError('')
    setSuccess('')
  }

  const createOrderNumber = async () => {
    const prefix = `MP-${formatDatePartWIB()}-`
    const { count, error: countError } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .like('nomor_order', `${prefix}%`)

    if (countError) throw countError
    return `${prefix}${String((count || 0) + 1).padStart(3, '0')}`
  }

  const rollbackOrder = async (orderId, changedStocks) => {
    for (const stock of changedStocks) {
      const { error: restoreError } = await supabase
        .from('product_variants')
        .update({ stok: stock.oldStock })
        .eq('id', stock.variantId)
      if (restoreError) console.error('Gagal rollback stok marketplace:', restoreError)
    }
    const { error: mutationError } = await supabase.from('stock_mutations').delete().eq('ref_id', orderId)
    if (mutationError) console.error('Gagal rollback mutasi marketplace:', mutationError)
    const { error: itemError } = await supabase.from('order_items').delete().eq('order_id', orderId)
    if (itemError) console.error('Gagal rollback item marketplace:', itemError)
    const { error: orderError } = await supabase.from('orders').delete().eq('id', orderId)
    if (orderError) console.error('Gagal rollback order marketplace:', orderError)
  }

  const buildStockRequirements = () => {
    const requirements = new Map()

    const addRequirement = (variantId, qtyNeeded, label, mutationType, mutationNote) => {
      const current = requirements.get(variantId) || { variantId, qtyNeeded: 0, labels: [], movements: [] }
      current.qtyNeeded += qtyNeeded
      current.labels.push(label)
      current.movements.push({ qty: qtyNeeded, type: mutationType, note: mutationNote })
      requirements.set(variantId, current)
    }

    items.forEach((item) => {
      if (item.type === 'product') {
        addRequirement(item.variant_id, item.qty, item.nama_produk, 'ORDER', '')
        return
      }

      item.sampler_items.forEach((samplerItem) => {
        const label = samplerItem.product_variants?.products?.nama_produk || 'Produk'
        addRequirement(samplerItem.variant_id, item.qty * Number(samplerItem.qty), label, 'SAMPLER', item.nama_produk)
      })
    })

    return [...requirements.values()]
  }

  const saveMarketplaceOrder = async () => {
    setError('')
    setSuccess('')
    if (!marketplace) return setError('Pilih marketplace terlebih dahulu.')
    if (!items.length) return setError('Tambahkan minimal 1 item pesanan.')

    setSaving(true)
    let orderId
    const changedStocks = []

    try {
      const orderNumber = await createOrderNumber()
      const stockRequirements = buildStockRequirements()
      const currentStocks = new Map()

      for (const requirement of stockRequirements) {
        const { data: currentVariant, error: stockReadError } = await supabase
          .from('product_variants')
          .select('stok, dijual, products(aktif)')
          .eq('id', requirement.variantId)
          .single()

        if (stockReadError) throw stockReadError
        if (!currentVariant.dijual || !currentVariant.products?.aktif) throw new Error(`${requirement.labels[0]} sudah tidak aktif.`)
        if (Number(currentVariant.stok) < requirement.qtyNeeded) throw new Error(`Stok ${requirement.labels[0]} tidak mencukupi. Dibutuhkan ${requirement.qtyNeeded}, tersedia ${currentVariant.stok}.`)
        currentStocks.set(requirement.variantId, Number(currentVariant.stok))
      }

      const marketplaceLabel = invoice.trim() ? `${marketplace} - ${invoice.trim()}` : marketplace
      const internalNote = [`Order Marketplace: ${marketplace}`, invoice.trim() ? `No Pesanan: ${invoice.trim()}` : '', note.trim() ? `Catatan: ${note.trim()}` : '']
        .filter(Boolean)
        .join(' | ')

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          nomor_order: orderNumber,
          nama_customer: marketplaceLabel,
          no_wa: '',
          alamat: internalNote,
          ongkir: 0,
          total: subtotal,
          status: 'dikirim',
        })
        .select('id')
        .single()

      if (orderError) throw orderError
      orderId = order.id

      for (const item of items) {
        const { error: itemError } = await supabase.from('order_items').insert({
          order_id: orderId,
          variant_id: item.variant_id,
          nama_produk_snapshot: item.nama_produk,
          qty: item.qty,
          harga: item.harga,
          subtotal: item.subtotal,
        })
        if (itemError) throw itemError
      }

      for (const requirement of stockRequirements) {
        const oldStock = currentStocks.get(requirement.variantId)
        const { data: updatedVariant, error: stockError } = await supabase
          .from('product_variants')
          .update({ stok: oldStock - requirement.qtyNeeded })
          .eq('id', requirement.variantId)
          .eq('stok', oldStock)
          .select('id')

        if (stockError) throw stockError
        if (!updatedVariant?.length) throw new Error(`Stok ${requirement.labels[0]} berubah. Silakan ulangi order.`)
        changedStocks.push({ variantId: requirement.variantId, oldStock })

        for (const movement of requirement.movements) {
          const { error: mutationError } = await supabase.from('stock_mutations').insert({
            variant_id: requirement.variantId,
            tipe: movement.type,
            qty: -movement.qty,
            catatan: movement.type === 'SAMPLER' ? `${orderNumber} ${marketplaceLabel} ${movement.note}` : `${orderNumber} ${marketplaceLabel}`,
            ref_id: orderId,
          })
          if (mutationError) throw mutationError
        }
      }

      setVariants((current) => current.map((variant) => {
        const ordered = stockRequirements.find((requirement) => requirement.variantId === variant.id)?.qtyNeeded || 0
        return ordered ? { ...variant, stok: Number(variant.stok) - ordered } : variant
      }))
      resetForm()
      setSuccess(`Order marketplace berhasil disimpan. Nomor order: ${orderNumber}`)
    } catch (saveError) {
      console.error('Gagal menyimpan order marketplace:', saveError)
      if (orderId) await rollbackOrder(orderId, changedStocks)
      setError(saveError.message || 'Gagal menyimpan order marketplace.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Penjualan</span>
          <h2>Order Marketplace</h2>
          <p>Input pesanan Tokopedia atau Toco tanpa data alamat. Stok langsung berkurang saat disimpan.</p>
        </div>
        <div className="heading-actions">
          <button className="button ghost" type="button" onClick={resetForm}><RotateCcw size={16} /> Reset</button>
        </div>
      </section>

      {success && <div className="notice success"><CheckCircle2 size={19} /><span>{success}</span></div>}
      {error && <div className="notice error"><AlertCircle size={19} /><span>{error}</span></div>}

      <div className="marketplace-order-layout">
        <div className="order-main marketplace-main">
          <section className="content-card order-section">
            <SectionTitle number="01" title="Info Marketplace" />
            <div className="marketplace-form-grid">
              <Field label="Marketplace">
                <select value={marketplace} onChange={(event) => setMarketplace(event.target.value)}>
                  {marketplaces.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="No Pesanan / Invoice"><input value={invoice} onChange={(event) => setInvoice(event.target.value)} placeholder="Opsional" /></Field>
              <Field label="Catatan / Pesan" wide><textarea rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Catatan internal atau pesan dari marketplace" /></Field>
            </div>
          </section>

          <section className="content-card order-section">
            <SectionTitle number="02" title="Input Item Pesanan" />
            <div className="item-type-tabs">
              <button type="button" className={itemType === 'product' ? 'active' : ''} onClick={() => changeItemType('product')}>Produk</button>
              <button type="button" className={itemType === 'sampler' ? 'active' : ''} onClick={() => changeItemType('sampler')}>Paket Sampler</button>
            </div>
            <div className="order-item-picker marketplace-item-picker">
              <div className="product-picker">
                <label className="search-field">
                  <Search size={18} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={itemType === 'product' ? 'Cari SKU, produk, atau brand...' : 'Cari paket sampler...'} />
                </label>
                {search && (
                  <div className="product-options">
                    {loadingProducts && <span className="picker-message"><LoaderCircle className="spin" size={16} /> Memuat pilihan...</span>}
                    {!loadingProducts && itemType === 'product' && filteredVariants.length === 0 && <span className="picker-message">Produk aktif dengan stok tersedia tidak ditemukan.</span>}
                    {!loadingProducts && itemType === 'product' && filteredVariants.map((variant) => (
                      <button type="button" key={variant.id} onClick={() => selectVariant(variant)}>
                        <div><strong>{variant.products?.nama_produk}</strong><span>{variant.products?.sku}</span></div>
                        <div><strong>{formatRupiah(variant.harga_jual)}</strong><span>Stok: {variant.stok}</span></div>
                      </button>
                    ))}
                    {!loadingProducts && itemType === 'sampler' && filteredSamplers.length === 0 && <span className="picker-message">Paket sampler tidak ditemukan.</span>}
                    {!loadingProducts && itemType === 'sampler' && filteredSamplers.map((sampler) => (
                      <button type="button" key={sampler.id} onClick={() => selectSampler(sampler)}>
                        <div><strong>{sampler.nama_paket}</strong><span>{sampler.sampler_items?.length || 0} item penyusun</span></div>
                        <div><strong>{formatRupiah(sampler.harga_jual)}</strong><span>Paket Sampler</span></div>
                      </button>
                    ))}
                  </div>
                )}
                {selectedItem && (
                  <div className="selected-product">
                    <div>
                      <strong>{itemType === 'product' ? selectedVariant.products?.nama_produk : selectedSampler.nama_paket}</strong>
                      <span>{itemType === 'product' ? `Stok ${selectedVariant.stok}` : `${selectedSampler.sampler_items?.length || 0} item penyusun`}</span>
                    </div>
                    <button type="button" onClick={() => { setSelectedVariantId(''); setSelectedSamplerId('') }}>Ganti</button>
                  </div>
                )}
              </div>
              <Field label="Qty"><input type="number" min="1" value={qty} onChange={(event) => setQty(event.target.value)} /></Field>
              <Field label="Harga"><input type="number" min="0" value={price} onChange={(event) => setPrice(event.target.value)} /></Field>
              <button className="button primary add-item-button" type="button" onClick={addItem}><Plus size={17} /> Tambah Item</button>
            </div>
          </section>

          <section className="content-card order-section">
            <SectionTitle number="03" title="Item Pesanan" />
            <div className="table-wrap">
              <table className="order-items-table marketplace-items-table">
                <thead><tr><th>Produk</th><th>Qty</th><th>Harga</th><th>Subtotal</th><th /></tr></thead>
                <tbody>
                  {!items.length && <tr><td colSpan="5"><div className="order-empty"><ShoppingBag size={22} /> Belum ada item marketplace.</div></td></tr>}
                  {items.map((item, index) => (
                    <tr key={`${item.type}-${item.item_id}-${index}`}>
                      <td><strong className="product-title">{productNameOnly(item.nama_produk)}</strong>{item.type === 'sampler' && <span className="item-kind">Paket Sampler</span>}</td>
                      <td>{item.qty} {item.satuan}</td>
                      <td>{formatRupiah(item.harga)}</td>
                      <td className="money">{formatRupiah(item.subtotal)}</td>
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
          <h3>Total Marketplace</h3>
          <div className="marketplace-summary-icon"><Store size={28} /><span>{marketplace}</span></div>
          <div className="summary-lines">
            <div><span>Total item</span><strong>{items.reduce((total, item) => total + item.qty, 0)}</strong></div>
            <div><span>Subtotal</span><strong>{formatRupiah(subtotal)}</strong></div>
          </div>
          <div className="summary-total"><span>Total</span><strong>{formatRupiah(subtotal)}</strong></div>
          <button className="button primary save-order-button" onClick={saveMarketplaceOrder} disabled={saving}>
            {saving && <LoaderCircle className="spin" size={17} />}
            {saving ? 'Menyimpan...' : 'Simpan Order Marketplace'}
          </button>
          <small>Order marketplace tidak memakai data alamat. Catatan disimpan sebagai info internal order.</small>
        </aside>
      </div>
    </div>
  )
}

function SectionTitle({ number, title }) {
  return <div className="section-title"><span>{number}</span><h3>{title}</h3></div>
}

function Field({ label, wide, children }) {
  return <label className={`form-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>
}
