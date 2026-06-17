import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  LoaderCircle,
  Play,
  Save,
  Search,
} from 'lucide-react'
import Modal from '../components/Modal'
import { formatInputDateWIB } from '../lib/format'
import { supabase } from '../lib/supabase'

export default function StockOpname() {
  const [session, setSession] = useState(null)
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [categories, setCategories] = useState([])
  const [startOpen, setStartOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const loadDraft = async () => {
      const { data, error: draftError } = await supabase
        .from('stock_opnames')
        .select('*, stock_opname_items(id, opname_id, variant_id, stok_sistem, stok_fisik, selisih, catatan, product_variants(id, nama_varian, satuan, stok, products(id, sku, nama_produk, brand, kategori)))')
        .eq('status', 'draft')
        .order('tanggal', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (draftError) {
        console.error('Gagal memuat draft opname:', draftError)
        return
      }
      if (data) {
        setSession(data)
        setItems((data.stock_opname_items || []).map((item) => ({
          variant_id: item.variant_id,
          stok_sistem: Number(item.stok_sistem) || 0,
          stok_fisik: Number(item.stok_fisik) || 0,
          catatan: item.catatan || '',
          variant: item.product_variants,
        })))
      }
    }
    loadDraft()
  }, [])

  useEffect(() => {
    setCategories([...new Set(items.map((item) => item.variant?.products?.kategori).filter(Boolean))].sort())
  }, [items])

  const brands = useMemo(() => {
    return [...new Set(items
      .filter((item) => !category || item.variant?.products?.kategori === category)
      .map((item) => item.variant?.products?.brand)
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }))
  }, [category, items])

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return items
      .filter((item) => {
        const product = item.variant?.products || {}
        const matchesSearch = [product.sku, product.nama_produk, product.brand, product.kategori, item.variant?.nama_varian]
          .filter(Boolean).join(' ').toLowerCase().includes(keyword)
        return matchesSearch
          && (!category || product.kategori === category)
          && (!brand || product.brand === brand)
      })
      .sort((a, b) => {
        const productA = a.variant?.products || {}
        const productB = b.variant?.products || {}
        return (productA.kategori || '').localeCompare(productB.kategori || '', 'id', { sensitivity: 'base' })
          || (productA.brand || '').localeCompare(productB.brand || '', 'id', { sensitivity: 'base' })
          || (productA.nama_produk || '').localeCompare(productB.nama_produk || '', 'id', { sensitivity: 'base' })
      })
  }, [brand, category, items, search])

  const checkedItems = items.filter((item) => item.stok_fisik !== '')
  const totalPlus = checkedItems.reduce((total, item) => total + Math.max(0, Number(item.stok_fisik) - item.stok_sistem), 0)
  const totalMinus = checkedItems.reduce((total, item) => total + Math.min(0, Number(item.stok_fisik) - item.stok_sistem), 0)

  const startOpname = async (form) => {
    setLoading(true)
    setError('')

    const { data: opname, error: opnameError } = await supabase
      .from('stock_opnames')
      .insert({ tanggal: form.tanggal, nama_petugas: form.nama_petugas.trim(), catatan: form.catatan.trim(), status: 'draft' })
      .select('*')
      .single()

    if (opnameError) {
      console.error('Gagal memulai stock opname:', opnameError)
      setError(opnameError.message)
      setLoading(false)
      return
    }

    const { data: variants, error: variantError } = await supabase
      .from('product_variants')
      .select('id, nama_varian, satuan, stok, products(id, sku, nama_produk, brand, kategori)')
      .order('nama_varian')

    if (variantError) {
      console.error('Gagal memuat varian opname:', variantError)
      setError(variantError.message)
      setLoading(false)
      return
    }

    setSession(opname)
    setItems((variants || []).map((variant) => ({
      variant_id: variant.id,
      stok_sistem: Number(variant.stok) || 0,
      stok_fisik: Number(variant.stok) || 0,
      catatan: '',
      variant,
    })))
    setStartOpen(false)
    setSuccess('Stock opname dimulai.')
    setLoading(false)
  }

  const updatePhysicalStock = (variantId, value) => {
    setItems((current) => current.map((item) => item.variant_id === variantId ? { ...item, stok_fisik: value } : item))
  }

  const saveItems = async () => {
    const { error: deleteError } = await supabase.from('stock_opname_items').delete().eq('opname_id', session.id)
    if (deleteError) throw deleteError

    const payload = items.map((item) => ({
      opname_id: session.id,
      variant_id: item.variant_id,
      stok_sistem: item.stok_sistem,
      stok_fisik: Number(item.stok_fisik) || 0,
      selisih: (Number(item.stok_fisik) || 0) - item.stok_sistem,
      catatan: item.catatan,
    }))
    const { error: insertError } = await supabase.from('stock_opname_items').insert(payload)
    if (insertError) throw insertError
  }

  const saveDraft = async () => {
    if (!session) return
    setSaving(true)
    setError('')
    try {
      await saveItems()
      setSuccess('Draft stock opname berhasil disimpan.')
    } catch (saveError) {
      console.error('Gagal menyimpan draft opname:', saveError)
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  const finishOpname = async () => {
    if (!window.confirm('Selesaikan stock opname? Stok sistem akan diperbarui sesuai stok fisik.')) return
    setSaving(true)
    setError('')

    try {
      await saveItems()

      for (const item of items) {
        const physicalStock = Number(item.stok_fisik) || 0
        const difference = physicalStock - item.stok_sistem
        if (!difference) continue

        const { error: stockError } = await supabase.from('product_variants').update({ stok: physicalStock }).eq('id', item.variant_id)
        if (stockError) throw stockError

        const { error: mutationError } = await supabase.from('stock_mutations').insert({
          variant_id: item.variant_id,
          tipe: 'OPNAME',
          qty: difference,
          catatan: `Stock Opname ${session.tanggal}`,
          ref_id: session.id,
        })
        if (mutationError) throw mutationError
      }

      const { error: finishError } = await supabase.from('stock_opnames').update({ status: 'selesai' }).eq('id', session.id)
      if (finishError) throw finishError

      setSession(null)
      setItems([])
      setSearch('')
      setCategory('')
      setBrand('')
      setSuccess('Stock opname berhasil diselesaikan dan stok telah diperbarui.')
    } catch (finishError) {
      console.error('Gagal menyelesaikan opname:', finishError)
      setError(finishError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Inventori</span>
          <h2>Stock Opname</h2>
          <p>Cocokkan stok sistem dengan stok fisik seluruh produk.</p>
        </div>
        {!session && <button className="button primary" onClick={() => setStartOpen(true)}><Play size={17} /> Mulai Stock Opname</button>}
      </section>

      {success && <div className="notice success"><CheckCircle2 size={19} /><span>{success}</span></div>}
      {error && <div className="notice error"><AlertCircle size={19} /><span>{error}</span></div>}

      {!session && <section className="content-card empty-state opname-welcome"><ClipboardCheck size={31} /><strong>Belum ada stock opname aktif</strong><span>Mulai sesi baru untuk memeriksa stok produk.</span></section>}

      {session && (
        <>
          <section className="opname-summary-grid">
            <SummaryCard label="Total Produk Dicek" value={checkedItems.length} tone="brown" />
            <SummaryCard label="Total Selisih Plus" value={`+${totalPlus}`} tone="green" />
            <SummaryCard label="Total Selisih Minus" value={totalMinus} tone="red" />
          </section>

          <section className="content-card opname-meta">
            <div><span>Tanggal</span><strong>{session.tanggal}</strong></div>
            <div><span>Nama Petugas</span><strong>{session.nama_petugas}</strong></div>
            <div><span>Catatan</span><strong>{session.catatan || '-'}</strong></div>
            <span className="order-status baru">{session.status}</span>
          </section>

          <section className="content-card">
            <div className="table-toolbar">
              <label className="search-field"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari produk, kategori, atau brand..." /></label>
              <label className="select-field">
                <select value={category} onChange={(event) => { setCategory(event.target.value); setBrand('') }}><option value="">Semua kategori</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
                <ChevronDown size={17} />
              </label>
              <label className="select-field">
                <select value={brand} onChange={(event) => setBrand(event.target.value)}><option value="">Semua brand</option>{brands.map((item) => <option key={item}>{item}</option>)}</select>
                <ChevronDown size={17} />
              </label>
              <span className="result-count">{filteredItems.length} produk</span>
            </div>
            <div className="table-wrap">
              <table className="opname-table">
                <thead><tr><th>Produk</th><th>Kategori</th><th>Brand</th><th>Stok Sistem</th><th>Stok Fisik</th><th>Selisih</th></tr></thead>
                <tbody>{filteredItems.map((item) => {
                  const difference = (Number(item.stok_fisik) || 0) - item.stok_sistem
                  return <tr key={item.variant_id}>
                    <td><div className="product-name"><strong>{item.variant?.products?.nama_produk || '-'}</strong><span>{item.variant?.products?.sku || '-'}</span></div></td>
                    <td>{item.variant?.products?.kategori || '-'}</td>
                    <td>{item.variant?.products?.brand || '-'}</td>
                    <td><span className="stock-pill">{item.stok_sistem}</span></td>
                    <td><input className="stock-input" type="number" min="0" value={item.stok_fisik} onChange={(event) => updatePhysicalStock(item.variant_id, event.target.value)} /></td>
                    <td><span className={`difference ${difference > 0 ? 'plus' : difference < 0 ? 'minus' : ''}`}>{difference > 0 ? `+${difference}` : difference}</span></td>
                  </tr>
                })}</tbody>
              </table>
            </div>
            <div className="opname-actions">
              <button className="button ghost" onClick={saveDraft} disabled={saving}><Save size={16} /> Simpan Draft</button>
              <button className="button primary" onClick={finishOpname} disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />} Selesaikan Opname</button>
            </div>
          </section>
        </>
      )}

      {startOpen && <StartOpnameModal onClose={() => !loading && setStartOpen(false)} onStart={startOpname} loading={loading} />}
    </div>
  )
}

function StartOpnameModal({ onClose, onStart, loading }) {
  const [form, setForm] = useState({ tanggal: formatInputDateWIB(), nama_petugas: '', catatan: '' })
  return <Modal title="Mulai Stock Opname" subtitle="Seluruh produk akan dimuat untuk diperiksa." onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); onStart(form) }}>
      <div className="modal-body form-grid">
        <Field label="Tanggal"><input type="date" value={form.tanggal} readOnly /></Field>
        <Field label="Nama Petugas"><input value={form.nama_petugas} onChange={(event) => setForm((current) => ({ ...current, nama_petugas: event.target.value }))} required /></Field>
        <Field label="Catatan" wide><textarea rows="3" value={form.catatan} onChange={(event) => setForm((current) => ({ ...current, catatan: event.target.value }))} /></Field>
      </div>
      <div className="modal-footer"><button type="button" className="button ghost" onClick={onClose}>Batal</button><button className="button primary" disabled={loading}>{loading && <LoaderCircle className="spin" size={16} />} Mulai</button></div>
    </form>
  </Modal>
}

function SummaryCard({ label, value, tone }) {
  return <article className={`opname-summary ${tone}`}><span>{label}</span><strong>{value}</strong></article>
}

function Field({ label, wide, children }) {
  return <label className={`form-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>
}
