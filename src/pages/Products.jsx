import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Edit3,
  FileSpreadsheet,
  LoaderCircle,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import Modal from '../components/Modal'
import { formatRupiah } from '../lib/format'
import { supabase } from '../lib/supabase'

const initialForm = {
  sku: '',
  brand: '',
  nama_produk: '',
  kategori: '',
  nama_varian: '',
  satuan: 'pcs',
  harga_jual: '',
  stok: '',
  dijual: true,
  bisa_untuk_sampler: false,
  aktif: true,
}

const pageSize = 25

export default function Products() {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [categoryRows, setCategoryRows] = useState([])
  const [page, setPage] = useState(1)
  const [totalProducts, setTotalProducts] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkUnitOpen, setBulkUnitOpen] = useState(false)
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    setError('')

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    let query = supabase
      .from('products')
      .select('*, product_variants(*)', { count: 'exact' })
      .range(from, to)

    const keyword = search.trim().replace(/[,%().]/g, ' ')
    if (keyword) {
      query = query.or(`sku.ilike.%${keyword}%,brand.ilike.%${keyword}%,nama_produk.ilike.%${keyword}%,kategori.ilike.%${keyword}%`)
    }
    if (category) query = query.eq('kategori', category)
    if (brand) query = query.eq('brand', brand)
    query = category
      ? query.order('brand', { ascending: true }).order('nama_produk', { ascending: true })
      : query.order('created_at', { ascending: false })

    const { data, error: queryError, count } = await query

    if (queryError) {
      console.error('Gagal memuat produk:', queryError)
      setProducts([])
      setError(queryError.message)
    } else {
      setProducts(data || [])
      setTotalProducts(count || 0)
      setSelectedIds([])
    }

    setLoading(false)
  }, [brand, category, page, search])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  const loadCategoryRows = useCallback(async () => {
    const { data, error: categoryError } = await supabase
      .from('products')
      .select('id, kategori, brand')
      .not('kategori', 'is', null)

    if (categoryError) {
      console.error('Gagal memuat kategori produk:', categoryError)
      return
    }

    setCategoryRows(data || [])
  }, [])

  useEffect(() => {
    loadCategoryRows()
  }, [loadCategoryRows])

  const categoryCards = useMemo(() => {
    return [...new Set(categoryRows.map((product) => product.kategori || 'Tanpa Kategori'))]
      .sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }))
  }, [categoryRows])

  const brandOptions = useMemo(() => {
    if (!category) return []
    return [...new Set(
      categoryRows
        .filter((product) => (product.kategori || 'Tanpa Kategori') === category)
        .map((product) => product.brand || 'Tanpa Brand'),
    )].sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }))
  }, [category, categoryRows])

  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize))
  const allPageSelected = products.length > 0 && products.every((product) => selectedIds.includes(product.id))

  const toggleProduct = (productId) => {
    setSelectedIds((current) => current.includes(productId)
      ? current.filter((id) => id !== productId)
      : [...current, productId])
  }

  const togglePage = () => {
    setSelectedIds(allPageSelected ? [] : products.map((product) => product.id))
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingProduct(null)
  }

  const openCreateModal = () => {
    setEditingProduct(null)
    setModalOpen(true)
  }

  const openEditModal = (product) => {
    setEditingProduct(product)
    setModalOpen(true)
  }

  const handleProductSaved = async (message) => {
    closeModal()
    setError('')
    setSuccess(message)
    await Promise.all([loadProducts(), loadCategoryRows()])
  }

  const handleSearchChange = (event) => {
    setSearch(event.target.value)
    setPage(1)
  }

  const handleDelete = async (product) => {
    const confirmed = window.confirm(`Hapus produk "${product.nama_produk}" beserta data stoknya?`)
    if (!confirmed) return

    setDeletingId(product.id)
    setError('')
    setSuccess('')

    const { error: variantError } = await supabase
      .from('product_variants')
      .delete()
      .eq('product_id', product.id)

    if (variantError) {
      console.error('Gagal menghapus data stok produk:', variantError)
      setError(variantError.message)
      setDeletingId(null)
      return
    }

    const { error: productError } = await supabase
      .from('products')
      .delete()
      .eq('id', product.id)

    if (productError) {
      console.error('Gagal menghapus produk:', productError)
      setError(productError.message)
      setDeletingId(null)
      return
    }

    setDeletingId(null)
    setSuccess('Produk berhasil dihapus.')
    await Promise.all([loadProducts(), loadCategoryRows()])
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Katalog Inventori</span>
          <h2>Daftar Produk</h2>
          <p>Lihat dan tambahkan produk yang tersimpan di database Supabase.</p>
        </div>
        <div className="heading-actions">
          <button className="button ghost" onClick={loadProducts} disabled={loading}>
            <RefreshCw className={loading ? 'spin' : ''} size={17} />
            Refresh
          </button>
          <button className="button ghost" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet size={17} />
            Import Excel
          </button>
          <button className="button primary" onClick={openCreateModal}>
            <Plus size={17} />
            Tambah Produk
          </button>
        </div>
      </section>

      {success && (
        <div className="notice success">
          <CheckCircle2 size={19} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="notice error">
          <AlertCircle size={19} />
          <span>{error}</span>
        </div>
      )}

      <section className="category-section">
        <div className="category-section-title">
          <div><span className="eyebrow">Kelompok Produk</span><h3>Pilih Kategori</h3></div>
          {category && <button className="button ghost" onClick={() => { setCategory(''); setBrand(''); setPage(1) }}><X size={15} /> Hapus Filter</button>}
        </div>
        <div className="product-category-grid">
          {categoryCards.map((item) => (
            <ProductCategoryCard
              key={item}
              name={item}
              active={category === item}
              onClick={() => { setCategory(item); setBrand(''); setPage(1) }}
            />
          ))}
        </div>
      </section>

      <section className="content-card product-card">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={18} />
            <input
              value={search}
              onChange={handleSearchChange}
              placeholder="Search Produk"
            />
          </label>
          {category && <label className="select-field">
            <select value={brand} onChange={(event) => { setBrand(event.target.value); setPage(1) }}>
              <option value="">Semua Brand</option>
              {brandOptions.map((brandName) => <option key={brandName} value={brandName}>{brandName}</option>)}
            </select>
            <ChevronDown size={17} />
          </label>}
          <button
            className="button ghost bulk-edit-button"
            onClick={() => setBulkUnitOpen(true)}
            disabled={!selectedIds.length}
          >
            <Edit3 size={16} />
            Edit Satuan Massal ({selectedIds.length})
          </button>
          <button
            className="button ghost bulk-edit-button"
            onClick={() => setBulkStatusOpen(true)}
            disabled={!selectedIds.length}
          >
            <CheckCircle2 size={16} />
            Edit Status Massal
          </button>
          <span className="result-count">Total: {totalProducts} produk</span>
        </div>
        {category && <div className="brand-sort-notice">Kategori <strong>{category}</strong>{brand ? <> menampilkan brand <strong>{brand}</strong>.</> : ' dikelompokkan berdasarkan brand dan diurutkan A-Z.'}</div>}

        <div className="table-wrap">
          <table className="products-basic-table">
            <thead>
              <tr>
                <th className="select-column">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={togglePage}
                    aria-label="Pilih semua produk pada halaman ini"
                  />
                </th>
                <th>SKU</th>
                <th>Brand</th>
                <th>Nama Produk</th>
                <th>Kategori</th>
                <th>Stok</th>
                <th>Harga Jual</th>
                <th>Aktif</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="9">
                    <div className="empty-state">
                      <LoaderCircle className="spin" size={24} />
                      <strong>Memuat produk...</strong>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && products.length === 0 && (
                <tr>
                  <td colSpan="9">
                    <div className="empty-state">
                      <div className="empty-icon"><PackageOpen size={25} /></div>
                      <strong>Belum ada produk</strong>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && products.map((product, index) => {
                const currentBrand = product.brand || 'Tanpa Brand'
                const previousBrand = products[index - 1]?.brand || 'Tanpa Brand'
                return <Fragment key={product.id}>
                  {category && (index === 0 || currentBrand !== previousBrand) && <tr className="brand-group-row"><td colSpan="9">{currentBrand}</td></tr>}
                  <tr>
                    <td className="select-column">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(product.id)}
                        onChange={() => toggleProduct(product.id)}
                        aria-label={`Pilih ${product.nama_produk}`}
                      />
                    </td>
                    <td><span className="sku">{product.sku || '-'}</span></td>
                    <td>{product.brand || '-'}</td>
                    <td><strong className="product-title">{product.nama_produk || '-'}</strong></td>
                    <td>{product.kategori || '-'}</td>
                    <ProductStockPrice variants={product.product_variants} />
                    <td>
                      <span className={`status ${product.aktif ? 'active' : 'inactive'}`}>
                        {product.aktif ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button small"
                          onClick={() => openEditModal(product)}
                          aria-label={`Edit ${product.nama_produk}`}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          className="icon-button small danger"
                          onClick={() => handleDelete(product)}
                          disabled={deletingId === product.id}
                          aria-label={`Hapus ${product.nama_produk}`}
                        >
                          {deletingId === product.id
                            ? <LoaderCircle className="spin" size={16} />
                            : <Trash2 size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              })}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>Total data: <strong>{totalProducts}</strong></span>
          <div>
            <button
              className="button ghost"
              onClick={() => setPage((current) => current - 1)}
              disabled={loading || page <= 1}
            >
              Previous
            </button>
            <span>Halaman {page} dari {totalPages}</span>
            <button
              className="button ghost"
              onClick={() => setPage((current) => current + 1)}
              disabled={loading || page >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {modalOpen && (
        <ProductModal
          product={editingProduct}
          productOptions={categoryRows}
          onClose={closeModal}
          onSuccess={handleProductSaved}
        />
      )}

      {importOpen && (
        <ImportExcelModal
          onClose={() => setImportOpen(false)}
          onImported={async (result) => {
            setSuccess(`Import selesai. Berhasil: ${result.success}, Gagal: ${result.failed}`)
            await Promise.all([loadProducts(), loadCategoryRows()])
          }}
        />
      )}

      {bulkUnitOpen && (
        <BulkUnitModal
          productIds={selectedIds}
          onClose={() => setBulkUnitOpen(false)}
          onSuccess={async (message) => {
            setBulkUnitOpen(false)
            setSuccess(message)
            await loadProducts()
          }}
        />
      )}

      {bulkStatusOpen && (
        <BulkStatusModal
          productIds={selectedIds}
          onClose={() => setBulkStatusOpen(false)}
          onSuccess={async (message) => {
            setBulkStatusOpen(false)
            setSuccess(message)
            await Promise.all([loadProducts(), loadCategoryRows()])
          }}
        />
      )}
    </div>
  )
}

function ProductStockPrice({ variants }) {
  const items = Array.isArray(variants) ? variants : variants ? [variants] : []
  const totalStock = items.reduce((sum, item) => sum + (Number(item.stok) || 0), 0)
  const primaryPrice = items[0]?.harga_jual

  return <>
    <td><span className={`stock-pill ${totalStock <= 5 ? 'low' : ''}`}>{items.length ? totalStock : '-'}</span></td>
    <td className="money product-price">{items.length ? formatRupiah(primaryPrice) : '-'}</td>
  </>
}

function BulkStatusModal({ productIds, onClose, onSuccess }) {
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')

    const { error: updateError } = await supabase
      .from('products')
      .update({ aktif: active })
      .in('id', productIds)

    if (updateError) {
      console.error('Gagal mengubah status produk secara massal:', updateError)
      setError(updateError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    await onSuccess(`${productIds.length} produk berhasil diubah menjadi ${active ? 'Aktif' : 'Nonaktif'}.`)
  }

  return (
    <Modal
      title="Edit Status Massal"
      subtitle={`Ubah status ${productIds.length} produk terpilih.`}
      onClose={() => !saving && onClose()}
    >
      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          {error && <div className="notice error"><AlertCircle size={19} /><span>{error}</span></div>}
          <label className="form-field bulk-unit-field">
            <span>Status Produk</span>
            <select value={active ? 'active' : 'inactive'} onChange={(event) => setActive(event.target.value === 'active')}>
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
            </select>
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="button ghost" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="button primary" disabled={saving}>
            {saving && <LoaderCircle className="spin" size={17} />}
            {saving ? 'Menyimpan...' : 'Simpan Status'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function BulkUnitModal({ productIds, onClose, onSuccess }) {
  const [unit, setUnit] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    const normalizedUnit = unit.trim()
    if (!normalizedUnit) return

    setSaving(true)
    setError('')

    const { error: updateError } = await supabase
      .from('product_variants')
      .update({ satuan: normalizedUnit })
      .in('product_id', productIds)

    if (updateError) {
      console.error('Gagal mengubah satuan secara massal:', updateError)
      setError(updateError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    await onSuccess(`Satuan ${productIds.length} produk berhasil diubah menjadi "${normalizedUnit}".`)
  }

  return (
    <Modal
      title="Edit Satuan Massal"
      subtitle={`Ubah satuan ${productIds.length} produk terpilih.`}
      onClose={() => !saving && onClose()}
    >
      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          {error && <div className="notice error"><AlertCircle size={19} /><span>{error}</span></div>}
          <label className="form-field bulk-unit-field">
            <span>Satuan Baru</span>
            <input
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              placeholder="Contoh: pcs, box, batang"
              autoFocus
              required
            />
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="button ghost" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="button primary" disabled={saving || !unit.trim()}>
            {saving && <LoaderCircle className="spin" size={17} />}
            {saving ? 'Menyimpan...' : 'Simpan Satuan'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ProductCategoryCard({ name, active, onClick }) {
  return (
    <button type="button" className={`product-category-card ${active ? 'active' : ''}`} onClick={onClick}>
      <PackageOpen size={17} />
      <span>{name}</span>
    </button>
  )
}

const importColumns = [
  'sku',
  'brand',
  'nama_produk',
  'kategori',
  'satuan',
  'harga_jual',
  'stok_awal',
  'dijual',
  'bisa_untuk_sampler',
  'aktif',
]

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return ['true', 'ya', 'yes', '1', 'aktif'].includes(String(value ?? '').trim().toLowerCase())
}

const normalizeImportRow = (row) => ({
  sku: String(row.sku ?? '').trim(),
  brand: String(row.brand ?? '').trim(),
  nama_produk: String(row.nama_produk ?? '').trim(),
  kategori: String(row.kategori ?? '').trim(),
  nama_varian: String(row.nama_varian ?? row.nama_produk ?? '').trim(),
  satuan: String(row.satuan ?? '').trim(),
  harga_jual: Number(row.harga_jual) || 0,
  stok_awal: Number(row.stok_awal) || 0,
  dijual: parseBoolean(row.dijual),
  bisa_untuk_sampler: parseBoolean(row.bisa_untuk_sampler),
  aktif: parseBoolean(row.aktif),
})

function ImportExcelModal({ onClose, onImported }) {
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setReading(true)
    setError('')
    setResult(null)
    setFileName(file.name)

    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' })
      const parsedRows = rawRows.map(normalizeImportRow).filter((row) => row.sku)

      if (!parsedRows.length) {
        throw new Error('Tidak ada data valid. Pastikan kolom sku tersedia dan terisi.')
      }

      setRows(parsedRows)
    } catch (readError) {
      console.error('Gagal membaca file Excel:', readError)
      setRows([])
      setError(readError.message)
    } finally {
      setReading(false)
    }
  }

  const importNow = async () => {
    setImporting(true)
    setProgress(0)
    setError('')
    setResult(null)

    const { data: existingProducts, error: existingError } = await supabase
      .from('products')
      .select('sku')

    if (existingError) {
      console.error('Gagal memeriksa SKU:', existingError)
      setError(existingError.message)
      setImporting(false)
      return
    }

    const knownSkus = new Set((existingProducts || []).map((item) => String(item.sku).toLowerCase()))
    const failures = []
    let successCount = 0

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      setProgress(index + 1)
      const normalizedSku = row.sku.toLowerCase()

      if (knownSkus.has(normalizedSku)) {
        failures.push({ sku: row.sku, reason: 'SKU sudah ada' })
        continue
      }

      if (!row.nama_produk || !row.satuan) {
        failures.push({ sku: row.sku, reason: 'Nama produk atau satuan kosong' })
        continue
      }

      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          sku: row.sku,
          brand: row.brand,
          nama_produk: row.nama_produk,
          kategori: row.kategori,
          aktif: row.aktif,
        })
        .select('id')
        .single()

      if (productError) {
        console.error(`Gagal import SKU ${row.sku}:`, productError)
        failures.push({ sku: row.sku, reason: productError.message })
        continue
      }

      const { error: variantError } = await supabase
        .from('product_variants')
        .insert({
          product_id: product.id,
          nama_varian: row.nama_varian,
          satuan: row.satuan,
          harga_jual: row.harga_jual,
          stok: row.stok_awal,
          dijual: row.dijual,
          bisa_untuk_sampler: row.bisa_untuk_sampler,
        })

      if (variantError) {
        console.error(`Gagal import data stok SKU ${row.sku}:`, variantError)
        const { error: cleanupError } = await supabase.from('products').delete().eq('id', product.id)
        if (cleanupError) console.error(`Gagal membersihkan produk SKU ${row.sku}:`, cleanupError)
        failures.push({ sku: row.sku, reason: variantError.message })
        continue
      }

      knownSkus.add(normalizedSku)
      successCount += 1
    }

    const importResult = { success: successCount, failed: failures.length, failures }
    setResult(importResult)
    setImporting(false)
    await onImported(importResult)
  }

  return (
    <Modal
      title="Import Excel Produk"
      subtitle="Upload file .xlsx, periksa preview, lalu mulai import."
      onClose={() => !importing && onClose()}
    >
      <div className="modal-body import-body">
        <label className="excel-upload">
          <FileSpreadsheet size={24} />
          <div>
            <strong>{fileName || 'Pilih file Excel'}</strong>
            <span>Sheet pertama akan dibaca. Format yang didukung: .xlsx</span>
          </div>
          <input type="file" accept=".xlsx" onChange={handleFile} disabled={importing} />
        </label>

        <div className="import-columns">
          <strong>Kolom wajib:</strong>
          <span>{importColumns.join(', ')}</span>
        </div>

        {error && <div className="notice error"><AlertCircle size={19} /><span>{error}</span></div>}
        {reading && <div className="import-progress"><LoaderCircle className="spin" size={18} /> Membaca file...</div>}
        {importing && (
          <div className="import-progress">
            <LoaderCircle className="spin" size={18} />
            Importing {progress}/{rows.length}
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="import-summary">
              <strong>Preview data</strong>
              <span>{rows.length} baris siap diperiksa</span>
            </div>
            <div className="table-wrap import-preview">
              <table>
                <thead>
                  <tr>
                    {importColumns.map((column) => <th key={column}>{column}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((row, index) => (
                    <tr key={`${row.sku}-${index}`}>
                      {importColumns.map((column) => (
                        <td key={column}>
                          {typeof row[column] === 'boolean' ? (row[column] ? 'Ya' : 'Tidak') : row[column]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 20 && <small className="preview-note">Preview menampilkan 20 baris pertama.</small>}
          </>
        )}

        {result && (
          <div className="import-result">
            <div><strong>Berhasil: {result.success}</strong><strong>Gagal: {result.failed}</strong></div>
            {result.failures.length > 0 && (
              <ul>
                {result.failures.map((failure, index) => (
                  <li key={`${failure.sku}-${index}`}><b>{failure.sku}</b>: {failure.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button type="button" className="button ghost" onClick={onClose} disabled={importing}>Tutup</button>
        <button type="button" className="button primary" onClick={importNow} disabled={!rows.length || importing || reading}>
          {importing && <LoaderCircle className="spin" size={17} />}
          Import Sekarang
        </button>
      </div>
    </Modal>
  )
}

function ProductModal({ product, productOptions, onClose, onSuccess }) {
  const variant = Array.isArray(product?.product_variants)
    ? product.product_variants[0]
    : product?.product_variants

  const [form, setForm] = useState(() => product ? {
    sku: product.sku || '',
    brand: product.brand || '',
    nama_produk: product.nama_produk || '',
    kategori: product.kategori || '',
    nama_varian: variant?.nama_varian || '',
    satuan: variant?.satuan || 'pcs',
    harga_jual: variant?.harga_jual ?? '',
    stok: variant?.stok ?? '',
    dijual: variant?.dijual ?? true,
    bisa_untuk_sampler: variant?.bisa_untuk_sampler ?? false,
    aktif: product.aktif ?? true,
  } : initialForm)
  const [saving, setSaving] = useState(false)
  const [generatingSku, setGeneratingSku] = useState(!product)
  const [error, setError] = useState('')

  const brands = useMemo(() => [...new Set(
    productOptions.map((item) => item.brand).filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' })), [productOptions])

  const categories = useMemo(() => [...new Set(
    productOptions.map((item) => item.kategori).filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' })), [productOptions])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  useEffect(() => {
    if (product) return

    const generateSku = async () => {
      setGeneratingSku(true)
      setError('')

      const prefix = 'P'
      const { data, error: skuError } = await supabase
        .from('products')
        .select('sku')
        .ilike('sku', `${prefix}%`)

      if (skuError) {
        console.error('Gagal membuat SKU otomatis:', skuError)
        setError(skuError.message)
        setGeneratingSku(false)
        return
      }

      const nextNumber = Math.max(0, ...(data || []).map((item) => {
        const match = String(item.sku || '').trim().match(/^P(\d+)$/i)
        const number = Number(match?.[1])
        return Number.isFinite(number) ? number : 0
      })) + 1

      setForm((current) => ({ ...current, sku: `${prefix}${String(nextNumber).padStart(3, '0')}` }))
      setGeneratingSku(false)
    }

    generateSku()
  }, [product])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')

    const productPayload = {
      sku: form.sku.trim(),
      brand: form.brand.trim(),
      nama_produk: form.nama_produk.trim(),
      kategori: form.kategori.trim(),
      aktif: form.aktif,
    }

    let productId = product?.id
    let productError

    if (product) {
      const result = await supabase
        .from('products')
        .update(productPayload)
        .eq('id', product.id)
      productError = result.error
    } else {
      const result = await supabase
        .from('products')
        .insert(productPayload)
        .select('id')
        .single()
      productId = result.data?.id
      productError = result.error
    }

    if (productError) {
      console.error(product ? 'Gagal mengubah produk:' : 'Gagal menambahkan produk:', productError)
      setError(productError.message)
      setSaving(false)
      return
    }

    const variantPayload = {
      product_id: productId,
      nama_varian: form.nama_varian.trim() || form.nama_produk.trim() || 'Utama',
      satuan: form.satuan.trim(),
      harga_jual: Number(form.harga_jual),
      stok: Number(form.stok),
      dijual: form.dijual,
      bisa_untuk_sampler: form.bisa_untuk_sampler,
    }

    let variantError
    if (variant?.id) {
      const result = await supabase
        .from('product_variants')
        .update(variantPayload)
        .eq('id', variant.id)
      variantError = result.error
    } else {
      const result = await supabase
        .from('product_variants')
        .insert(variantPayload)
      variantError = result.error
    }

    if (variantError) {
      console.error(product ? 'Gagal mengubah data stok produk:' : 'Gagal menambahkan data stok produk:', variantError)
      setError(variantError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    await onSuccess(product ? 'Produk berhasil diperbarui.' : 'Produk berhasil ditambahkan.')
  }

  return (
    <Modal
      title={product ? 'Edit Produk' : 'Tambah Produk'}
      subtitle={product ? 'Perbarui data produk dan stok utama.' : 'Produk dan stok utama akan disimpan bersama.'}
      onClose={() => !saving && onClose()}
    >
      <form onSubmit={handleSubmit}>
        <div className="modal-body form-grid">
          {error && (
            <div className="notice error wide">
              <AlertCircle size={19} />
              <span>{error}</span>
            </div>
          )}

          <Field label="SKU Otomatis">
            <input value={generatingSku ? 'Membuat SKU...' : form.sku} readOnly required />
          </Field>
          <Field label="Brand">
            <input
              list="product-brand-options"
              value={form.brand}
              onChange={(event) => updateField('brand', event.target.value)}
              placeholder="Pilih atau ketik brand baru"
              required
            />
            <datalist id="product-brand-options">
              {brands.map((item) => <option key={item} value={item} />)}
            </datalist>
          </Field>
          <Field label="Nama Produk" wide>
            <input value={form.nama_produk} onChange={(event) => updateField('nama_produk', event.target.value)} required />
          </Field>
          <Field label="Kategori">
            <input
              list="product-category-options"
              value={form.kategori}
              onChange={(event) => updateField('kategori', event.target.value)}
              placeholder="Pilih kategori tersedia"
              required
            />
            <datalist id="product-category-options">
              {categories.map((item) => <option key={item} value={item} />)}
            </datalist>
          </Field>
          <Field label="Satuan">
            <input value={form.satuan} onChange={(event) => updateField('satuan', event.target.value)} required />
          </Field>
          <Field label="Harga Jual">
            <input type="number" min="0" value={form.harga_jual} onChange={(event) => updateField('harga_jual', event.target.value)} required />
          </Field>
          <Field label="Stok">
            <input type="number" min="0" value={form.stok} onChange={(event) => updateField('stok', event.target.value)} required />
          </Field>

          <div className="switch-grid wide">
            <Switch label="Dijual" checked={form.dijual} onChange={(value) => updateField('dijual', value)} />
            <Switch label="Bisa Untuk Sampler" checked={form.bisa_untuk_sampler} onChange={(value) => updateField('bisa_untuk_sampler', value)} />
            <Switch label="Aktif" checked={form.aktif} onChange={(value) => updateField('aktif', value)} />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="button ghost" onClick={onClose} disabled={saving}>
            Batal
          </button>
          <button type="submit" className="button primary" disabled={saving || generatingSku || !form.sku}>
            {saving && <LoaderCircle className="spin" size={17} />}
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Field({ label, wide, children }) {
  return (
    <label className={`form-field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}

function Switch({ label, checked, onChange }) {
  return (
    <label className="switch-row">
      <button
        type="button"
        className={`switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <i />
      </button>
      <span>{label}</span>
    </label>
  )
}
