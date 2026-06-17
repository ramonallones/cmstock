import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Boxes,
  ChevronDown,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Search,
  TriangleAlert,
  WalletCards,
  X,
} from 'lucide-react'
import { formatRupiah } from '../lib/format'
import { supabase } from '../lib/supabase'

const pageSize = 25
const formatNumber = (value) => new Intl.NumberFormat('id-ID').format(Number(value) || 0)

export default function Stock() {
  const [rows, setRows] = useState([])
  const [summaryRows, setSummaryRows] = useState([])
  const [categoryRows, setCategoryRows] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [productStatus, setProductStatus] = useState('active')
  const [stockStatus, setStockStatus] = useState('available')
  const [sort, setSort] = useState('stock_desc')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const getMatchingProductIds = useCallback(async (keyword) => {
    if (!keyword) return null
    const safeKeyword = keyword.replace(/[,%().]/g, ' ')
    const { data, error: productError } = await supabase
      .from('products')
      .select('id')
      .or(`sku.ilike.%${safeKeyword}%,brand.ilike.%${safeKeyword}%,nama_produk.ilike.%${safeKeyword}%,kategori.ilike.%${safeKeyword}%`)

    if (productError) throw productError
    return (data || []).map((product) => product.id)
  }, [])

  const applyFilters = useCallback((query, productIds, includeSelection = true) => {
    let filteredQuery = query
    if (productStatus === 'active') filteredQuery = filteredQuery.eq('products.aktif', true)
    if (productStatus === 'inactive') filteredQuery = filteredQuery.eq('products.aktif', false)
    if (stockStatus === 'available') filteredQuery = filteredQuery.gt('stok', 0)
    if (stockStatus === 'empty') filteredQuery = filteredQuery.eq('stok', 0)

    const keyword = search.trim().replace(/[,%().]/g, ' ')
    if (keyword && productIds?.length) filteredQuery = filteredQuery.in('product_id', productIds)
    if (includeSelection && category) filteredQuery = filteredQuery.eq('products.kategori', category)
    if (includeSelection && brand) filteredQuery = filteredQuery.eq('products.brand', brand)
    return filteredQuery
  }, [brand, category, productStatus, search, stockStatus])

  const loadStock = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const productIds = await getMatchingProductIds(search.trim())
      if (search.trim() && !productIds?.length) {
        setRows([])
        setSummaryRows([])
        setCategoryRows([])
        setTotal(0)
        setLoading(false)
        return
      }

      let categoryQuery = supabase
        .from('product_variants')
        .select('id, product_id, stok, harga_jual, products!inner(id, sku, brand, nama_produk, kategori, aktif)')
      categoryQuery = applyFilters(categoryQuery, productIds, false)
      const { data: categoryData, error: categoryError } = await categoryQuery
      if (categoryError) throw categoryError
      setCategoryRows(categoryData || [])

      let summaryQuery = supabase
        .from('product_variants')
        .select('id, product_id, stok, harga_jual, products!inner(id, sku, brand, nama_produk, kategori, aktif)')
      summaryQuery = applyFilters(summaryQuery, productIds)

      const { data: summaryData, error: summaryError } = await summaryQuery
      if (summaryError) throw summaryError
      const filteredSummary = summaryData || []
      setSummaryRows(filteredSummary)
      setTotal(filteredSummary.length)

      if (category || sort === 'asset_desc') {
        const sortedPage = [...filteredSummary]
          .sort((a, b) => {
            if (category) {
              const brandOrder = (a.products?.brand || 'Tanpa Brand').localeCompare(
                b.products?.brand || 'Tanpa Brand',
                'id',
                { sensitivity: 'base' },
              )
              if (brandOrder !== 0) return brandOrder
              return (a.products?.nama_produk || '').localeCompare(b.products?.nama_produk || '', 'id', { sensitivity: 'base' })
            }
            return (Number(b.stok) * Number(b.harga_jual)) - (Number(a.stok) * Number(a.harga_jual))
          })
          .slice((page - 1) * pageSize, page * pageSize)
        const ids = sortedPage.map((item) => item.id)

        if (!ids.length) {
          setRows([])
        } else {
          const { data, error: detailError } = await supabase
            .from('product_variants')
            .select('id, product_id, satuan, stok, harga_jual, products!inner(id, sku, brand, nama_produk, kategori, aktif)')
            .in('id', ids)
          if (detailError) throw detailError
          const byId = new Map((data || []).map((item) => [item.id, item]))
          setRows(ids.map((id) => byId.get(id)).filter(Boolean))
        }
      } else {
        const from = (page - 1) * pageSize
        let tableQuery = supabase
          .from('product_variants')
          .select('id, product_id, satuan, stok, harga_jual, products!inner(id, sku, brand, nama_produk, kategori, aktif)')
        tableQuery = applyFilters(tableQuery, productIds)
          .order('stok', { ascending: sort === 'stock_asc' })
          .range(from, from + pageSize - 1)

        const { data, error: tableError } = await tableQuery
        if (tableError) throw tableError
        setRows(data || [])
      }
    } catch (queryError) {
      console.error('Gagal memuat halaman stok:', queryError)
      setRows([])
      setSummaryRows([])
      setCategoryRows([])
      setTotal(0)
      setError(queryError.message)
    } finally {
      setLoading(false)
    }
  }, [applyFilters, category, getMatchingProductIds, page, search, sort])

  useEffect(() => {
    loadStock()
  }, [loadStock])

  const stats = useMemo(() => ({
    activeSku: summaryRows.filter((item) => item.products?.aktif).length,
    units: summaryRows.reduce((sum, item) => sum + (Number(item.stok) || 0), 0),
    asset: summaryRows.reduce((sum, item) => sum + ((Number(item.stok) || 0) * (Number(item.harga_jual) || 0)), 0),
    lowStock: summaryRows.filter((item) => Number(item.stok) <= 5).length,
  }), [summaryRows])

  const categoryCards = useMemo(() => {
    const groups = new Map()
    categoryRows.forEach((item) => {
      const name = item.products?.kategori || 'Tanpa Kategori'
      const group = groups.get(name) || { name, productIds: new Set(), asset: 0, units: 0 }
      group.productIds.add(item.product_id)
      group.asset += (Number(item.stok) || 0) * (Number(item.harga_jual) || 0)
      group.units += Number(item.stok) || 0
      groups.set(name, group)
    })
    return [...groups.values()]
      .map((group) => ({ ...group, products: group.productIds.size }))
      .sort((a, b) => b.asset - a.asset)
  }, [categoryRows])

  const brandOptions = useMemo(() => {
    if (!category) return []
    return [...new Set(
      categoryRows
        .filter((item) => (item.products?.kategori || 'Tanpa Kategori') === category)
        .map((item) => item.products?.brand || 'Tanpa Brand'),
    )].sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }))
  }, [category, categoryRows])

  const pageAsset = rows.reduce((sum, item) => sum + ((Number(item.stok) || 0) * (Number(item.harga_jual) || 0)), 0)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const resetPage = (setter) => (event) => {
    setter(event.target.value)
    setPage(1)
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div><span className="eyebrow">Inventori</span><h2>Stok</h2><p>Monitoring stok aktif dan nilai asset seluruh varian produk.</p></div>
        <button className="button primary" onClick={loadStock} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={17} /> Refresh</button>
      </section>

      {error && <div className="notice error"><AlertCircle size={19} /><span>{error}</span></div>}

      <section className="stock-stats">
        <StockStat label="Total SKU Aktif" value={formatNumber(stats.activeSku)} icon={Boxes} tone="brown" loading={loading} />
        <StockStat label="Total Unit Stok" value={formatNumber(stats.units)} icon={Layers3} tone="gold" loading={loading} />
        <StockStat label="Total Nilai Asset" value={formatRupiah(stats.asset)} icon={WalletCards} tone="green" loading={loading} />
        <StockStat label="Produk Menipis" value={formatNumber(stats.lowStock)} icon={TriangleAlert} tone="red" loading={loading} />
      </section>

      <section className="category-section">
        <div className="category-section-title">
          <div><span className="eyebrow">Kelompok Stok</span><h3>Pilih Kategori</h3></div>
          {category && <button className="button ghost" onClick={() => { setCategory(''); setBrand(''); setPage(1) }}><X size={15} /> Hapus Filter</button>}
        </div>
        <div className="category-card-grid">
          {categoryCards.map((item) => (
            <CategoryCard
              key={item.name}
              name={item.name}
              products={item.products}
              units={item.units}
              asset={item.asset}
              active={category === item.name}
              onClick={() => { setCategory(item.name); setBrand(''); setPage(1) }}
            />
          ))}
        </div>
      </section>

      <section className="content-card">
        <div className="stock-toolbar">
          <label className="search-field"><Search size={18} /><input value={search} onChange={resetPage(setSearch)} placeholder="Cari SKU, brand, produk, atau kategori..." /></label>
          <Select value={productStatus} onChange={resetPage(setProductStatus)}>
            <option value="active">Produk Aktif</option><option value="inactive">Produk Nonaktif</option><option value="all">Semua Produk</option>
          </Select>
          <Select value={stockStatus} onChange={resetPage(setStockStatus)}>
            <option value="available">Ada Stok</option><option value="empty">Kosong</option><option value="all">Semua Stok</option>
          </Select>
          {category
            ? <Select value={brand} onChange={resetPage(setBrand)}>
                <option value="">Semua Brand</option>
                {brandOptions.map((brandName) => <option key={brandName} value={brandName}>{brandName}</option>)}
              </Select>
            : <Select value={sort} onChange={resetPage(setSort)}>
                <option value="stock_desc">Stok Terbesar</option><option value="stock_asc">Stok Terkecil</option><option value="asset_desc">Nilai Asset Terbesar</option>
              </Select>}
        </div>
        {category && <div className="brand-sort-notice">Kategori <strong>{category}</strong>{brand ? <> menampilkan brand <strong>{brand}</strong>.</> : ' dikelompokkan berdasarkan brand dan diurutkan A-Z.'}</div>}

        <div className="table-wrap">
          <table className="stock-monitor-table">
            <thead><tr><th>SKU</th><th>Brand</th><th>Nama Produk</th><th>Kategori</th><th>Satuan</th><th>Stok</th><th>Harga Jual</th><th>Nilai Asset</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan="8"><div className="empty-state"><LoaderCircle className="spin" /><strong>Memuat stok...</strong></div></td></tr>}
              {!loading && !rows.length && <tr><td colSpan="8"><div className="empty-state"><strong>Data stok tidak ditemukan</strong></div></td></tr>}
              {!loading && rows.map((item, index) => {
                const currentBrand = item.products?.brand || 'Tanpa Brand'
                const previousBrand = rows[index - 1]?.products?.brand || 'Tanpa Brand'
                return <Fragment key={item.id}>
                  {category && (index === 0 || currentBrand !== previousBrand) && <tr className="brand-group-row"><td colSpan="8">{currentBrand}</td></tr>}
                  <tr>
                    <td><span className="sku">{item.products?.sku || '-'}</span></td>
                    <td>{item.products?.brand || '-'}</td>
                    <td><strong className="product-title">{item.products?.nama_produk || '-'}</strong></td>
                    <td>{item.products?.kategori || '-'}</td>
                    <td>{item.satuan || '-'}</td>
                    <td><span className={`stock-pill ${Number(item.stok) <= 5 ? 'low' : ''}`}>{item.stok ?? 0}</span></td>
                    <td className="money">{formatRupiah(item.harga_jual)}</td>
                    <td className="money asset-value">{formatRupiah(Number(item.stok) * Number(item.harga_jual))}</td>
                  </tr>
                </Fragment>
              })}
            </tbody>
            <tfoot><tr><td colSpan="7">Total Nilai Asset Halaman Ini</td><td>{formatRupiah(pageAsset)}</td></tr></tfoot>
          </table>
        </div>

        <div className="stock-total-footer"><span>Total Nilai Asset Sesuai Filter</span><strong>{formatRupiah(stats.asset)}</strong></div>
        <div className="pagination"><span>Total data: <strong>{total}</strong></span><div><button className="button ghost" onClick={() => setPage((current) => current - 1)} disabled={loading || page <= 1}>Previous</button><span>Halaman {page} dari {totalPages}</span><button className="button ghost" onClick={() => setPage((current) => current + 1)} disabled={loading || page >= totalPages}>Next</button></div></div>
      </section>
    </div>
  )
}

function StockStat({ label, value, icon: Icon, tone, loading }) {
  const displayValue = loading ? '-' : value
  const isLongValue = String(displayValue).length > 12
  return (
    <article className={`stat-card stock-stat-card ${tone}`}>
      <div className="stat-card-head">
        <div className={`stat-icon ${tone}`}>{loading ? <LoaderCircle className="spin" size={20} /> : <Icon size={21} />}</div>
        <span>{label}</span>
      </div>
      <strong className={isLongValue ? 'compact-value' : ''}>{displayValue}</strong>
    </article>
  )
}

function Select({ value, onChange, children, disabled = false }) {
  return <label className={`select-field ${disabled ? 'disabled' : ''}`}><select value={value} onChange={onChange} disabled={disabled}>{children}</select><ChevronDown size={17} /></label>
}

function CategoryCard({ name, products, units, asset, active, onClick }) {
  return (
    <button type="button" className={`category-card ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="category-card-top"><span>{name}</span><Boxes size={18} /></div>
      <div className="category-card-metrics">
        <div><span>Produk Tersedia</span><strong>{formatNumber(products)}</strong></div>
        <div><span>Total Unit</span><strong>{formatNumber(units)}</strong></div>
      </div>
      <div className="category-card-asset"><span>Nilai Total Aset</span><strong>{formatRupiah(asset)}</strong></div>
    </button>
  )
}
