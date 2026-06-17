import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  Landmark,
  LoaderCircle,
  Plus,
  Printer,
  Search,
  Settings,
  ShoppingBag,
  Trash2,
  RotateCcw,
} from 'lucide-react'
import Modal from '../components/Modal'
import { formatDatePartWIB, formatRupiah } from '../lib/format'
import { productNameOnly } from '../lib/productDisplay'
import { buildLabelHTML, printLabel } from '../modules/labelPrinter'
import {
  buildBankMessage,
  buildOrderMessage,
  buildPaymentReceivedMessage,
  buildTrackingMessage,
  copyToClipboard,
} from '../modules/waGenerator'
import { supabase } from '../lib/supabase'

const emptyCustomer = {
  nama_customer: '',
  no_wa: '',
  alamat: '',
  ongkir: '',
  diskon: '',
}

const couriers = ['JNE REG', 'JNE YES', 'J&T', 'SiCepat', 'Anteraja', 'POS', 'Wahana', 'GoSend', 'GrabExpress', 'COD', 'Ambil di Toko']

const defaultLabelSettings = {
  sender_name: 'CERUTUMURAH',
  sender_phone: '0816283356',
  logo_url: '',
  tagline: 'whatever price or origin, a good cigar is a good cigar!',
  footer_note: 'CERUTUMURAH.COM',
}

const cleanText = (value) => String(value ?? '').trim()
const normalizePhone = (value) => cleanText(value).replace(/\D/g, '')

const isMarketplaceOrder = (order = {}) => {
  const customerName = cleanText(order.nama_customer).toLowerCase()
  const address = cleanText(order.alamat).toLowerCase()
  return address.includes('order marketplace:') || customerName.startsWith('tokopedia') || customerName.startsWith('toco')
}

const buildSavedCustomers = (orders = []) => {
  const customers = new Map()

  orders.forEach((order) => {
    if (isMarketplaceOrder(order)) return

    const name = cleanText(order.nama_customer)
    const phone = cleanText(order.no_wa)
    const address = cleanText(order.alamat)
    if (!name && !phone && !address) return

    const phoneKey = normalizePhone(phone)
    const key = phoneKey || `${name.toLowerCase()}|${address.toLowerCase()}`
    const existing = customers.get(key)

    if (!existing) {
      customers.set(key, {
        key,
        name,
        phone,
        address,
        lastOrderAt: order.created_at,
      })
      return
    }

    customers.set(key, {
      ...existing,
      name: existing.name || name,
      phone: existing.phone || phone,
      address: existing.address || address,
      lastOrderAt: new Date(order.created_at) > new Date(existing.lastOrderAt || 0)
        ? order.created_at
        : existing.lastOrderAt,
    })
  })

  return Array.from(customers.values()).sort((a, b) =>
    new Date(b.lastOrderAt || 0) - new Date(a.lastOrderAt || 0))
}

export default function Orders() {
  const [customer, setCustomer] = useState(emptyCustomer)
  const [savedCustomers, setSavedCustomers] = useState([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [loadingCustomers, setLoadingCustomers] = useState(true)
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
  const [courier, setCourier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [toolStatus, setToolStatus] = useState('')
  const [messageType, setMessageType] = useState('order')
  const [labelSettingsOpen, setLabelSettingsOpen] = useState(false)
  const [labelSettings, setLabelSettings] = useState(() => {
    try {
      return { ...defaultLabelSettings, ...JSON.parse(localStorage.getItem('cm_label_settings') || '{}') }
    } catch {
      return defaultLabelSettings
    }
  })

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
        console.error('Gagal memuat pilihan item order:', queryError)
        setError(queryError.message)
      } else {
        setVariants(variantResult.data || [])
        setSamplers(samplerResult.data || [])
      }
      setLoadingProducts(false)
    }

    loadOrderOptions()
  }, [])

  useEffect(() => {
    const loadSavedCustomers = async () => {
      setLoadingCustomers(true)
      const { data, error: customerError } = await supabase
        .from('orders')
        .select('id, nama_customer, no_wa, alamat, created_at')
        .order('created_at', { ascending: false })
        .range(0, 4999)

      if (customerError) {
        console.error('Gagal memuat data pelanggan tersimpan:', customerError)
      } else {
        setSavedCustomers(buildSavedCustomers(data || []))
      }
      setLoadingCustomers(false)
    }

    loadSavedCustomers()
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

  const filteredSavedCustomers = useMemo(() => {
    const keyword = customerSearch.trim().toLowerCase()
    if (!keyword) return savedCustomers.slice(0, 8)

    return savedCustomers
      .filter((savedCustomer) => [savedCustomer.name, savedCustomer.phone, savedCustomer.address]
        .join(' ')
        .toLowerCase()
        .includes(keyword))
      .slice(0, 8)
  }, [customerSearch, savedCustomers])

  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId)
  const selectedSampler = samplers.find((sampler) => sampler.id === selectedSamplerId)
  const selectedItem = itemType === 'product' ? selectedVariant : selectedSampler
  const itemsSubtotal = items.reduce((total, item) => total + item.subtotal, 0)
  const orderDiscount = Math.max(0, Number(customer.diskon) || 0)
  const orderTotal = Math.max(0, itemsSubtotal + (Number(customer.ongkir) || 0) - orderDiscount)
  const currentOrder = useMemo(() => ({
    receiver_name: customer.nama_customer,
    receiver_phone: customer.no_wa,
    receiver_address: customer.alamat,
    courier,
    tracking_number: trackingNumber,
    shipping: Number(customer.ongkir) || 0,
    discount: orderDiscount,
    total: orderTotal,
    ...labelSettings,
    items: items.map((item) => ({
      name: item.nama_produk,
      qty: item.qty,
      price: item.harga,
      total: item.subtotal,
    })),
  }), [courier, customer, items, labelSettings, orderDiscount, orderTotal, trackingNumber])
  const labelOrder = useMemo(() => ({
    ...currentOrder,
    items: items.map((item) => ({
      name: item.nama_produk,
      qty: item.qty,
    })),
  }), [currentOrder, items])
  const labelPreview = useMemo(() => buildLabelHTML(labelOrder), [labelOrder])
  const messageOptions = useMemo(() => ({
    order: buildOrderMessage(currentOrder),
    payment: buildPaymentReceivedMessage(currentOrder),
    tracking: buildTrackingMessage(currentOrder),
    bank: buildBankMessage(),
  }), [currentOrder])
  const messagePreview = messageOptions[messageType]

  const updateCustomer = (field, value) => {
    setCustomer((current) => ({ ...current, [field]: value }))
  }

  const selectSavedCustomer = (savedCustomer) => {
    setCustomer((current) => ({
      ...current,
      nama_customer: savedCustomer.name,
      no_wa: savedCustomer.phone,
      alamat: savedCustomer.address,
    }))
    setCustomerSearch('')
  }

  const updateLabelSetting = (field, value) => {
    setLabelSettings((current) => ({ ...current, [field]: value }))
  }

  useEffect(() => {
    localStorage.setItem('cm_label_settings', JSON.stringify(labelSettings))
  }, [labelSettings])

  const resetLabelSettings = () => {
    setLabelSettings(defaultLabelSettings)
  }

  const uploadLogo = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => updateLabelSetting('logo_url', String(reader.result || ''))
    reader.readAsDataURL(file)
  }

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

    if (!selectedItem) {
      setError(`Pilih ${itemType === 'product' ? 'produk' : 'paket sampler'} terlebih dahulu.`)
      return
    }
    if (numericQty <= 0) {
      setError('Qty harus lebih dari 0.')
      return
    }

    if (itemType === 'product' && (!selectedVariant.products?.aktif || !selectedVariant.dijual || Number(selectedVariant.stok) <= 0)) return setError('Produk ini tidak aktif atau stoknya kosong.')
    if (itemType === 'product' && numericQty > selectedVariant.stok) return setError(`Stok ${selectedVariant.products?.nama_produk} tidak mencukupi. Tersedia: ${selectedVariant.stok}.`)
    if (itemType === 'sampler' && !selectedSampler.sampler_items?.length) return setError('Paket sampler belum memiliki item penyusun.')
    if (itemType === 'sampler' && numericQty > samplerAvailableQty(selectedSampler)) return setError(`Stok penyusun paket sampler tidak mencukupi. Maksimal order: ${samplerAvailableQty(selectedSampler)} paket.`)

    setItems((current) => {
      const itemKey = itemType === 'product' ? selectedVariant.id : selectedSampler.id
      const existingIndex = current.findIndex((item) => item.type === itemType && item.item_id === itemKey)
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
        ? { ...item, qty: item.qty + numericQty, harga: numericPrice, subtotal: (item.qty + numericQty) * numericPrice }
        : item)
    })
    setSelectedVariantId('')
    setSelectedSamplerId('')
    setPrice('')
    setQty(1)
  }

  const copyOperationalText = async (text, message) => {
    try {
      await copyToClipboard(text)
      setToolStatus(message)
      setError('')
      window.setTimeout(() => setToolStatus(''), 2200)
    } catch (copyError) {
      console.error('Gagal menyalin teks:', copyError)
      setError('Gagal menyalin teks ke clipboard.')
    }
  }

  const selectMessageType = (type) => {
    setMessageType(type)
    setError(type === 'tracking' && !trackingNumber.trim() ? 'Isi nomor resi terlebih dahulu untuk melihat preview pesan resi.' : '')
  }

  const copyMessagePreview = () => {
    if (!messagePreview) return setError('Isi nomor resi terlebih dahulu.')
    copyOperationalText(messagePreview, 'Chat WhatsApp berhasil disalin.')
  }

  const printCurrentLabel = async () => {
    try {
      await printLabel(labelOrder)
      setError('')
    } catch (printError) {
      console.error('Gagal mencetak label:', printError)
      setError(printError.message || 'Gagal mencetak label.')
    }
  }

  const resetOrderForm = () => {
    setCustomer(emptyCustomer)
    setItems([])
    setItemType('product')
    setSearch('')
    setSelectedVariantId('')
    setSelectedSamplerId('')
    setQty(1)
    setPrice('')
    setCourier('')
    setTrackingNumber('')
    setMessageType('order')
    setError('')
    setSuccess('')
    setToolStatus('')
  }

  const createOrderNumber = async () => {
    const prefix = `CM-${formatDatePartWIB()}-`
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
      if (restoreError) console.error('Gagal rollback stok:', restoreError)
    }
    const { error: mutationError } = await supabase.from('stock_mutations').delete().eq('ref_id', orderId)
    if (mutationError) console.error('Gagal rollback mutasi:', mutationError)
    const { error: itemError } = await supabase.from('order_items').delete().eq('order_id', orderId)
    if (itemError) console.error('Gagal rollback item order:', itemError)
    const { error: orderError } = await supabase.from('orders').delete().eq('id', orderId)
    if (orderError) console.error('Gagal rollback order:', orderError)
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

  const saveOrder = async () => {
    setError('')
    setSuccess('')

    if (!customer.nama_customer.trim()) {
      setError('Nama customer wajib diisi.')
      return
    }
    if (!items.length) {
      setError('Order harus memiliki minimal 1 item.')
      return
    }
    if (items.some((item) => item.qty <= 0)) {
      setError('Qty harus lebih dari 0.')
      return
    }

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
          .select('stok')
          .eq('id', requirement.variantId)
          .single()

        if (stockReadError) throw stockReadError
        if (Number(currentVariant.stok) < requirement.qtyNeeded) {
          throw new Error(`Stok ${requirement.labels[0]} tidak mencukupi. Dibutuhkan ${requirement.qtyNeeded}, tersedia ${currentVariant.stok}.`)
        }
        currentStocks.set(requirement.variantId, Number(currentVariant.stok))
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          nomor_order: orderNumber,
          nama_customer: customer.nama_customer.trim(),
          no_wa: customer.no_wa.trim(),
          alamat: customer.alamat.trim(),
          ongkir: Number(customer.ongkir) || 0,
          total: orderTotal,
          status: 'baru',
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
            catatan: movement.type === 'SAMPLER' ? `${orderNumber} ${movement.note}` : orderNumber,
            ref_id: orderId,
          })
          if (mutationError) throw mutationError
        }
      }

      resetOrderForm()
      setSuccess(`Order berhasil disimpan. Nomor order: ${orderNumber}`)
      setVariants((current) => current.map((variant) => {
        const orderedQty = stockRequirements.find((requirement) => requirement.variantId === variant.id)?.qtyNeeded || 0
        return orderedQty ? { ...variant, stok: Number(variant.stok) - orderedQty } : variant
      }))
    } catch (saveError) {
      console.error('Gagal menyimpan order:', saveError)
      if (orderId) await rollbackOrder(orderId, changedStocks)
      setError(saveError.message || 'Gagal menyimpan order.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Penjualan</span>
          <h2>Input Order Manual</h2>
          <p>Buat order, kurangi stok, dan catat mutasi secara otomatis.</p>
        </div>
        <div className="heading-actions">
          <button className="button ghost" type="button" onClick={resetOrderForm}><RotateCcw size={16} /> Reset Order</button>
        </div>
      </section>

      {success && <div className="notice success"><CheckCircle2 size={19} /><span>{success}</span></div>}
      {toolStatus && <div className="notice success"><CheckCircle2 size={19} /><span>{toolStatus}</span></div>}
      {error && <div className="notice error"><AlertCircle size={19} /><span>{error}</span></div>}

      <div className="order-layout order-manual-layout">
        <div className="order-main">
          <div className="order-top-grid">
          <section className="content-card order-section">
            <SectionTitle number="01" title="Data Customer" />
            <div className="order-customer-grid">
              <div className="customer-picker wide">
                <span>Pelanggan Tersimpan</span>
                <div className="product-picker">
                  <label className="search-field">
                    <Search size={18} />
                    <input
                      value={customerSearch}
                      onChange={(event) => setCustomerSearch(event.target.value)}
                      placeholder="Cari pelanggan lama berdasarkan nama, nomor HP, atau alamat..."
                    />
                  </label>
                  {customerSearch && (
                    <div className="product-options customer-options">
                      {loadingCustomers && <span className="picker-message"><LoaderCircle className="spin" size={16} /> Memuat pelanggan...</span>}
                      {!loadingCustomers && filteredSavedCustomers.length === 0 && <span className="picker-message">Pelanggan tidak ditemukan.</span>}
                      {!loadingCustomers && filteredSavedCustomers.map((savedCustomer) => (
                        <button type="button" key={savedCustomer.key} onClick={() => selectSavedCustomer(savedCustomer)}>
                          <div>
                            <strong>{savedCustomer.name || '-'}</strong>
                            <span>{savedCustomer.address || '-'}</span>
                          </div>
                          <div>
                            <strong>{savedCustomer.phone || '-'}</strong>
                            <span>Pilih</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <Field label="Nama Customer"><input value={customer.nama_customer} onChange={(event) => updateCustomer('nama_customer', event.target.value)} required /></Field>
              <Field label="No WA"><input value={customer.no_wa} onChange={(event) => updateCustomer('no_wa', event.target.value)} /></Field>
              <Field label="Alamat Lengkap" wide><textarea value={customer.alamat} onChange={(event) => updateCustomer('alamat', event.target.value)} rows="3" placeholder="Nama jalan, nomor rumah, kecamatan, kota, kode pos" /></Field>
              <Field label="Ekspedisi">
                <select value={courier} onChange={(event) => setCourier(event.target.value)}>
                  <option value="">Pilih ekspedisi</option>
                  {couriers.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="Ongkir"><input type="number" min="0" value={customer.ongkir} onChange={(event) => updateCustomer('ongkir', event.target.value)} /></Field>
              <Field label="Diskon"><input type="number" min="0" value={customer.diskon} onChange={(event) => updateCustomer('diskon', event.target.value)} placeholder="Nominal diskon" /></Field>
            </div>
          </section>

          <aside className="content-card order-summary">
            <span className="eyebrow">Ringkasan</span>
            <h3>Total Order</h3>
            <div className="summary-lines">
              <div><span>Subtotal item</span><strong>{formatRupiah(itemsSubtotal)}</strong></div>
              <div><span>Ongkir</span><strong>{formatRupiah(customer.ongkir)}</strong></div>
              <div><span>Diskon</span><strong>- {formatRupiah(orderDiscount)}</strong></div>
            </div>
            <div className="summary-total"><span>Total</span><strong>{formatRupiah(orderTotal)}</strong></div>
            <button className="button primary save-order-button" onClick={saveOrder} disabled={saving}>
              {saving && <LoaderCircle className="spin" size={17} />}
              {saving ? 'Menyimpan Order...' : 'Simpan Order'}
            </button>
            <small>Stok akan langsung berkurang setelah order berhasil disimpan.</small>
            <div className="summary-quick-tools">
              <span>Alat Order</span>
              <div>
                <button type="button" onClick={copyMessagePreview} title="Copy Chat yang Dipreview"><Clipboard size={15} /> WA</button>
                <button type="button" onClick={() => copyOperationalText(buildBankMessage(), 'Semua rekening berhasil disalin.')} title="Copy Semua Rekening"><Landmark size={15} /> Bank</button>
                <button type="button" onClick={printCurrentLabel} title="Print Label"><Printer size={15} /> Label</button>
              </div>
              <em>Preview chat dan setting label tersedia pada bagian 04.</em>
            </div>
          </aside>
          </div>

          <section className="content-card order-section">
            <SectionTitle number="02" title="Tambah Item Order" />
            <div className="item-type-tabs">
              <button type="button" className={itemType === 'product' ? 'active' : ''} onClick={() => changeItemType('product')}>Produk</button>
              <button type="button" className={itemType === 'sampler' ? 'active' : ''} onClick={() => changeItemType('sampler')}>Paket Sampler</button>
            </div>
            <div className="order-item-picker">
              <div className="product-picker">
                <label className="search-field">
                  <Search size={18} />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={itemType === 'product' ? 'Cari SKU, produk, atau brand...' : 'Cari paket sampler...'} />
                </label>
                {search && (
                  <div className="product-options">
                    {loadingProducts && <span className="picker-message"><LoaderCircle className="spin" size={16} /> Memuat pilihan...</span>}
                    {!loadingProducts && itemType === 'product' && filteredVariants.length === 0 && <span className="picker-message">Produk tidak ditemukan.</span>}
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
            <SectionTitle number="03" title="Item Order" />
            <div className="table-wrap">
              <table className="order-items-table">
                <thead><tr><th>Produk</th><th>Qty</th><th>Harga</th><th>Subtotal</th><th /></tr></thead>
                <tbody>
                  {!items.length && <tr><td colSpan="5"><div className="order-empty"><ShoppingBag size={22} /> Belum ada item order.</div></td></tr>}
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

          <section className="content-card order-section order-tools-section">
            <SectionTitle number="04" title="Preview Chat & Pengiriman" />
            <div className="order-tools-layout">
              <div className="order-tools-controls">
                <div className="order-tool-fields">
                  <Field label="Nomor Resi">
                    <input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} placeholder="Isi setelah paket dikirim" />
                  </Field>
                </div>

                <div className="order-tool-group">
                  <span>Pilih Preview Chat WhatsApp</span>
                  <div className="message-type-tabs">
                    <button type="button" className={messageType === 'order' ? 'active' : ''} onClick={() => selectMessageType('order')}>Pesanan</button>
                    <button type="button" className={messageType === 'payment' ? 'active' : ''} onClick={() => selectMessageType('payment')}>Pembayaran</button>
                    <button type="button" className={messageType === 'tracking' ? 'active' : ''} onClick={() => selectMessageType('tracking')}>Resi</button>
                    <button type="button" className={messageType === 'bank' ? 'active' : ''} onClick={() => selectMessageType('bank')}>Rekening</button>
                  </div>
                  <textarea className="wa-chat-preview" value={messagePreview || 'Isi nomor resi untuk menampilkan preview chat.'} readOnly rows="14" />
                  <button className="button primary copy-preview-button" type="button" onClick={copyMessagePreview}><Clipboard size={15} /> Copy Chat yang Dipreview</button>
                </div>

                <div className="order-tool-group">
                  <span>Informasi Rekening</span>
                  <div className="order-tool-buttons">
                    {['bri', 'mandiri', 'bca'].map((bank) => (
                      <button className="button ghost" type="button" key={bank} onClick={() => copyOperationalText(buildBankMessage(bank), `Rekening ${bank.toUpperCase()} berhasil disalin.`)}>
                        <Landmark size={15} /> {bank.toUpperCase()}
                      </button>
                    ))}
                    <button className="button ghost" type="button" onClick={() => copyOperationalText(buildBankMessage(), 'Semua rekening berhasil disalin.')}><Landmark size={15} /> Semua</button>
                  </div>
                </div>

                <button className="button primary print-label-button" type="button" onClick={printCurrentLabel}><Printer size={16} /> Print Label 100 x 150 mm</button>
                <small>Ekspedisi dan nomor resi digunakan untuk pesan serta label. Data order dan stok tetap disimpan melalui tombol Simpan Order.</small>
              </div>

              <div className="order-label-preview">
                <div className="label-preview-head">
                  <div><span className="eyebrow">Preview Label</span><strong>100 x 150 mm</strong></div>
                  <button className="button ghost label-settings-button" type="button" onClick={() => setLabelSettingsOpen(true)}><Settings size={15} /> Setting Label</button>
                </div>
                <div className="label-preview-wrap" dangerouslySetInnerHTML={{ __html: labelPreview }} />
              </div>
            </div>
          </section>
        </div>
      </div>
      {labelSettingsOpen && (
        <Modal title="Setting Label Print" subtitle="Ubah info pengirim dan logo yang tampil pada label." onClose={() => setLabelSettingsOpen(false)}>
          <div className="modal-body label-settings-modal">
            <div className="form-grid">
              <Field label="Nama Pengirim"><input value={labelSettings.sender_name} onChange={(event) => updateLabelSetting('sender_name', event.target.value)} /></Field>
              <Field label="No HP Pengirim"><input value={labelSettings.sender_phone} onChange={(event) => updateLabelSetting('sender_phone', event.target.value)} /></Field>
              <Field label="Logo URL / Data URL" wide><input value={labelSettings.logo_url} onChange={(event) => updateLabelSetting('logo_url', event.target.value)} placeholder="Kosongkan untuk logo default" /></Field>
              <label className="logo-upload wide">
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadLogo(event.target.files?.[0])} />
                <span>Upload logo dari komputer</span>
                <small>PNG, JPG, atau WEBP. Logo tersimpan di browser lokal.</small>
              </label>
              <Field label="Tagline Label" wide><input value={labelSettings.tagline} onChange={(event) => updateLabelSetting('tagline', event.target.value)} /></Field>
              <Field label="Footer Label" wide><input value={labelSettings.footer_note} onChange={(event) => updateLabelSetting('footer_note', event.target.value)} /></Field>
            </div>
            <div className="label-settings-preview" dangerouslySetInnerHTML={{ __html: buildLabelHTML({ ...labelOrder, ...labelSettings }) }} />
          </div>
          <div className="modal-footer">
            <button className="button ghost" type="button" onClick={resetLabelSettings}>Reset Default</button>
            <button className="button primary" type="button" onClick={() => setLabelSettingsOpen(false)}>Simpan Setting</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function SectionTitle({ number, title }) {
  return <div className="section-title"><span>{number}</span><h3>{title}</h3></div>
}

function Field({ label, wide, children }) {
  return <label className={`form-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>
}
