import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Eye,
  LoaderCircle,
  PackageOpen,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import Modal from '../components/Modal'
import { formatRupiah } from '../lib/format'
import { supabase } from '../lib/supabase'

const emptyPackage = {
  nama_paket: '',
  harga_jual: '',
  aktif: true,
}

const packageCapacity = (items = []) => {
  if (!items.length) return 0
  return Math.min(...items.map((item) => {
    const stock = Number(item.product_variants?.stok) || 0
    const qty = Number(item.qty) || 0
    return qty > 0 ? Math.floor(stock / qty) : 0
  }))
}

export default function Sampler() {
  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingPackage, setEditingPackage] = useState(null)
  const [detailPackage, setDetailPackage] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const loadPackages = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data, error: queryError } = await supabase
      .from('sampler_packages')
      .select('*, sampler_items(id, sampler_id, variant_id, qty, product_variants(id, nama_varian, satuan, stok, products(id, sku, nama_produk, brand)))')
      .order('created_at', { ascending: false })

    if (queryError) {
      console.error('Gagal memuat paket sampler:', queryError)
      setPackages([])
      setError(queryError.message)
    } else {
      setPackages(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadPackages()
  }, [loadPackages])

  const handleSaved = async (message) => {
    setEditingPackage(null)
    setSuccess(message)
    setError('')
    await loadPackages()
  }

  const handleDelete = async (samplerPackage) => {
    if (!window.confirm(`Hapus paket "${samplerPackage.nama_paket}" beserta seluruh isinya?`)) return

    setDeletingId(samplerPackage.id)
    setError('')
    setSuccess('')

    const { error: itemError } = await supabase
      .from('sampler_items')
      .delete()
      .eq('sampler_id', samplerPackage.id)

    if (itemError) {
      console.error('Gagal menghapus isi paket:', itemError)
      setError(itemError.message)
      setDeletingId(null)
      return
    }

    const { error: packageError } = await supabase
      .from('sampler_packages')
      .delete()
      .eq('id', samplerPackage.id)

    if (packageError) {
      console.error('Gagal menghapus paket sampler:', packageError)
      setError(packageError.message)
    } else {
      setSuccess('Paket sampler berhasil dihapus.')
      await loadPackages()
    }
    setDeletingId(null)
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Kurasi Produk</span>
          <h2>Paket Sampler</h2>
          <p>Susun paket dan pantau maksimal paket yang dapat dibuat dari stok tersedia.</p>
        </div>
        <button className="button primary" onClick={() => setEditingPackage({})}>
          <Plus size={17} /> Tambah Paket
        </button>
      </section>

      {success && <div className="notice success"><CheckCircle2 size={19} /><span>{success}</span></div>}
      {error && <div className="notice error"><AlertCircle size={19} /><span>{error}</span></div>}

      <section className="sampler-grid">
        {loading && <div className="content-card empty-state sampler-loading"><LoaderCircle className="spin" size={25} /><strong>Memuat paket sampler...</strong></div>}
        {!loading && !packages.length && <div className="content-card empty-state sampler-loading"><PackageOpen size={28} /><strong>Belum ada paket sampler</strong></div>}
        {!loading && packages.map((samplerPackage) => (
          <article className="content-card sampler-card" key={samplerPackage.id}>
            <div className="sampler-card-head">
              <div className="sampler-icon"><PackageOpen size={20} /></div>
              <span className={`status ${samplerPackage.aktif ? 'active' : 'inactive'}`}>{samplerPackage.aktif ? 'Aktif' : 'Nonaktif'}</span>
            </div>
            <h3>{samplerPackage.nama_paket}</h3>
            <strong className="sampler-price">{formatRupiah(samplerPackage.harga_jual)}</strong>
            <div className="sampler-metrics">
              <div><span>Isi Paket</span><strong>{samplerPackage.sampler_items?.length || 0} item</strong></div>
              <div><span>Maksimal Dibuat</span><strong>{packageCapacity(samplerPackage.sampler_items)} paket</strong></div>
            </div>
            <div className="sampler-card-actions">
              <button className="button ghost" onClick={() => setDetailPackage(samplerPackage)}><Eye size={15} /> Detail</button>
              <button className="icon-button small" onClick={() => setEditingPackage(samplerPackage)} aria-label="Edit paket"><Edit3 size={16} /></button>
              <button className="icon-button small danger" onClick={() => handleDelete(samplerPackage)} disabled={deletingId === samplerPackage.id} aria-label="Hapus paket">
                {deletingId === samplerPackage.id ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
              </button>
            </div>
          </article>
        ))}
      </section>

      {editingPackage && (
        <SamplerFormModal
          samplerPackage={editingPackage.id ? editingPackage : null}
          onClose={() => setEditingPackage(null)}
          onSuccess={handleSaved}
        />
      )}
      {detailPackage && <SamplerDetail samplerPackage={detailPackage} onClose={() => setDetailPackage(null)} />}
    </div>
  )
}

function SamplerFormModal({ samplerPackage, onClose, onSuccess }) {
  const [form, setForm] = useState(() => samplerPackage ? {
    nama_paket: samplerPackage.nama_paket || '',
    harga_jual: samplerPackage.harga_jual ?? '',
    aktif: samplerPackage.aktif ?? true,
  } : emptyPackage)
  const [items, setItems] = useState(() => (samplerPackage?.sampler_items || []).map((item) => ({
    variant_id: item.variant_id,
    qty: Number(item.qty) || 1,
    product_variants: item.product_variants,
  })))
  const [variants, setVariants] = useState([])
  const [search, setSearch] = useState('')
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [qty, setQty] = useState(1)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loadingVariants, setLoadingVariants] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadVariants = async () => {
      setLoadingVariants(true)
      const { data, error: queryError } = await supabase
        .from('product_variants')
        .select('id, nama_varian, satuan, stok, dijual, bisa_untuk_sampler, products(id, sku, nama_produk, brand, aktif)')
        .order('nama_varian')
        .range(0, 4999)

      if (queryError) {
        console.error('Gagal memuat produk sampler:', queryError)
        setError(queryError.message)
      } else {
        setVariants(data || [])
      }
      setLoadingVariants(false)
    }
    loadVariants()
  }, [])

  const filteredVariants = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return variants
      .filter((variant) => {
        const product = variant.products || {}
        if (!product.aktif || Number(variant.stok) <= 0) return false
        return [product.sku, product.nama_produk, product.brand, variant.nama_varian]
          .filter(Boolean).join(' ').toLowerCase().includes(keyword)
      })
      .slice(0, 30)
  }, [search, variants])

  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId)

  const addItem = () => {
    const numericQty = Number(qty)
    if (!selectedVariant) return setError('Pilih produk untuk isi paket.')
    if (numericQty <= 0) return setError('Qty harus lebih dari 0.')

    setItems((current) => {
      const existing = current.find((item) => item.variant_id === selectedVariant.id)
      if (existing) return current.map((item) => item.variant_id === selectedVariant.id ? { ...item, qty: item.qty + numericQty } : item)
      return [...current, { variant_id: selectedVariant.id, qty: numericQty, product_variants: selectedVariant }]
    })
    setSelectedVariantId('')
    setSearch('')
    setPickerOpen(false)
    setQty(1)
    setError('')
  }

  const savePackage = async (event) => {
    event.preventDefault()
    if (!items.length) return setError('Paket harus memiliki minimal 1 item.')

    setSaving(true)
    setError('')
    const payload = {
      nama_paket: form.nama_paket.trim(),
      harga_jual: Number(form.harga_jual) || 0,
      aktif: form.aktif,
    }

    let packageId = samplerPackage?.id
    let packageError
    if (samplerPackage) {
      const result = await supabase.from('sampler_packages').update(payload).eq('id', samplerPackage.id)
      packageError = result.error
    } else {
      const result = await supabase.from('sampler_packages').insert(payload).select('id').single()
      packageId = result.data?.id
      packageError = result.error
    }

    if (packageError) {
      console.error('Gagal menyimpan paket sampler:', packageError)
      setError(packageError.message)
      setSaving(false)
      return
    }

    if (samplerPackage) {
      const { error: deleteError } = await supabase.from('sampler_items').delete().eq('sampler_id', packageId)
      if (deleteError) {
        console.error('Gagal memperbarui isi paket:', deleteError)
        setError(deleteError.message)
        setSaving(false)
        return
      }
    }

    const { error: itemsError } = await supabase.from('sampler_items').insert(
      items.map((item) => ({ sampler_id: packageId, variant_id: item.variant_id, qty: item.qty })),
    )

    if (itemsError) {
      console.error('Gagal menyimpan isi paket:', itemsError)
      setError(itemsError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    await onSuccess(samplerPackage ? 'Paket sampler berhasil diperbarui.' : 'Paket sampler berhasil ditambahkan.')
  }

  return (
    <Modal title={samplerPackage ? 'Edit Paket Sampler' : 'Tambah Paket Sampler'} subtitle="Atur informasi paket dan produk penyusunnya." onClose={() => !saving && onClose()}>
      <form onSubmit={savePackage}>
        <div className="modal-body sampler-form">
          {error && <div className="notice error"><AlertCircle size={19} /><span>{error}</span></div>}
          <div className="form-grid">
            <Field label="Nama Paket" wide><input value={form.nama_paket} onChange={(event) => setForm((current) => ({ ...current, nama_paket: event.target.value }))} required /></Field>
            <Field label="Harga Jual"><input type="number" min="0" value={form.harga_jual} onChange={(event) => setForm((current) => ({ ...current, harga_jual: event.target.value }))} required /></Field>
            <Switch label="Aktif" checked={form.aktif} onChange={(value) => setForm((current) => ({ ...current, aktif: value }))} />
          </div>

          <div className="sampler-form-section">
            <div><span className="eyebrow">Isi Paket</span><strong>Tambah produk penyusun</strong></div>
            <div className="sampler-item-picker">
              <div className="product-picker">
                <label className="search-field"><Search size={17} /><input value={search} onFocus={() => setPickerOpen(true)} onChange={(event) => { setSearch(event.target.value); setPickerOpen(true) }} placeholder="Cari produk atau varian..." /></label>
                {pickerOpen && <div className="product-options">
                  {loadingVariants && <span className="picker-message"><LoaderCircle className="spin" size={16} /> Memuat...</span>}
                  {!loadingVariants && filteredVariants.length === 0 && <span className="picker-message">Belum ada produk aktif dengan stok tersedia.</span>}
                  {!loadingVariants && filteredVariants.map((variant) => (
                    <button type="button" key={variant.id} onClick={() => { setSelectedVariantId(variant.id); setSearch(''); setPickerOpen(false) }}>
                      <div><strong>{variant.products?.nama_produk}</strong><span>{variant.products?.sku} · {variant.nama_varian}</span></div>
                      <div><span>Stok: {variant.stok}</span></div>
                    </button>
                  ))}
                </div>}
                {selectedVariant && <div className="selected-product"><div><strong>{selectedVariant.products?.nama_produk}</strong><span>{selectedVariant.nama_varian} · Stok {selectedVariant.stok}</span></div><button type="button" onClick={() => setSelectedVariantId('')}>Ganti</button></div>}
              </div>
              <Field label="Qty"><input type="number" min="1" value={qty} onChange={(event) => setQty(event.target.value)} /></Field>
              <button type="button" className="button primary" onClick={addItem}><Plus size={16} /> Tambah</button>
            </div>
          </div>

          <div className="table-wrap sampler-items-editor">
            <table className="order-items-table">
              <thead><tr><th>Produk</th><th>Varian</th><th>Stok</th><th>Qty</th><th>Kapasitas</th><th /></tr></thead>
              <tbody>
                {!items.length && <tr><td colSpan="6"><div className="order-empty">Belum ada isi paket.</div></td></tr>}
                {items.map((item) => (
                  <tr key={item.variant_id}>
                    <td>{item.product_variants?.products?.nama_produk || '-'}</td>
                    <td>{item.product_variants?.nama_varian || '-'}</td>
                    <td>{item.product_variants?.stok ?? 0}</td>
                    <td>{item.qty}</td>
                    <td>{Math.floor((Number(item.product_variants?.stok) || 0) / item.qty)} paket</td>
                    <td><button type="button" className="icon-button small danger" onClick={() => setItems((current) => current.filter((currentItem) => currentItem.variant_id !== item.variant_id))}><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sampler-capacity">Simulasi maksimal paket: <strong>{packageCapacity(items)} paket</strong></div>
        </div>
        <div className="modal-footer">
          <button type="button" className="button ghost" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={17} />}{saving ? 'Menyimpan...' : 'Simpan Paket'}</button>
        </div>
      </form>
    </Modal>
  )
}

function SamplerDetail({ samplerPackage, onClose }) {
  return (
    <Modal title={samplerPackage.nama_paket} subtitle={`${formatRupiah(samplerPackage.harga_jual)} · Maksimal ${packageCapacity(samplerPackage.sampler_items)} paket`} onClose={onClose}>
      <div className="modal-body">
        <div className="table-wrap">
          <table className="order-items-table">
            <thead><tr><th>Nama Produk</th><th>Varian</th><th>Qty</th><th>Stok</th></tr></thead>
            <tbody>{(samplerPackage.sampler_items || []).map((item) => (
              <tr key={item.id}><td>{item.product_variants?.products?.nama_produk || '-'}</td><td>{item.product_variants?.nama_varian || '-'}</td><td>{item.qty}</td><td>{item.product_variants?.stok ?? 0}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <div className="modal-footer"><button className="button primary" onClick={onClose}>Tutup</button></div>
    </Modal>
  )
}

function Field({ label, wide, children }) {
  return <label className={`form-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>
}

function Switch({ label, checked, onChange }) {
  return <label className="switch-row"><button type="button" className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked}><i /></button><span>{label}</span></label>
}
