import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Eye, LoaderCircle, Search } from 'lucide-react'
import Modal from '../components/Modal'
import { supabase } from '../lib/supabase'

const pageSize = 25

export default function OpnameHistory() {
  const [opnames, setOpnames] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)

  const loadHistory = useCallback(async () => {
    setLoading(true)
    setError('')
    const from = (page - 1) * pageSize
    let query = supabase
      .from('stock_opnames')
      .select('*, stock_opname_items(id, opname_id, variant_id, stok_sistem, stok_fisik, selisih, catatan, product_variants(id, nama_varian, products(id, sku, nama_produk)))', { count: 'exact' })
      .order('tanggal', { ascending: false })
      .range(from, from + pageSize - 1)
    const keyword = search.trim().replace(/[,%().]/g, ' ')
    if (keyword) query = query.or(`nama_petugas.ilike.%${keyword}%,catatan.ilike.%${keyword}%`)
    const { data, error: queryError, count } = await query
    if (queryError) {
      console.error('Gagal memuat riwayat opname:', queryError)
      setError(queryError.message)
    } else {
      setOpnames(data || [])
      setTotal(count || 0)
    }
    setLoading(false)
  }, [page, search])

  useEffect(() => { loadHistory() }, [loadHistory])
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return <div className="page-stack">
    <section className="page-heading"><div><span className="eyebrow">Inventori</span><h2>Riwayat Opname</h2><p>Lihat hasil stock opname yang pernah dilakukan.</p></div></section>
    {error && <div className="notice error"><AlertCircle size={19} /><span>{error}</span></div>}
    <section className="content-card">
      <div className="table-toolbar"><label className="search-field"><Search size={18} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Cari petugas atau catatan..." /></label><span className="result-count">Total: {total} opname</span></div>
      <div className="table-wrap"><table className="history-table">
        <thead><tr><th>Tanggal</th><th>Petugas</th><th>Status</th><th>Produk Dicek</th><th>Selisih Plus</th><th>Selisih Minus</th><th>Aksi</th></tr></thead>
        <tbody>
          {loading && <tr><td colSpan="7"><div className="empty-state"><LoaderCircle className="spin" /><strong>Memuat riwayat...</strong></div></td></tr>}
          {!loading && !opnames.length && <tr><td colSpan="7"><div className="empty-state"><strong>Belum ada riwayat opname</strong></div></td></tr>}
          {!loading && opnames.map((opname) => {
            const plus = (opname.stock_opname_items || []).reduce((sum, item) => sum + Math.max(0, Number(item.selisih)), 0)
            const minus = (opname.stock_opname_items || []).reduce((sum, item) => sum + Math.min(0, Number(item.selisih)), 0)
            return <tr key={opname.id}><td>{opname.tanggal}</td><td>{opname.nama_petugas}</td><td><span className={`order-status ${opname.status === 'selesai' ? 'selesai' : 'baru'}`}>{opname.status}</span></td><td>{opname.stock_opname_items?.length || 0}</td><td className="difference plus">+{plus}</td><td className="difference minus">{minus}</td><td><button className="icon-button small" onClick={() => setDetail(opname)} aria-label="Lihat detail"><Eye size={16} /></button></td></tr>
          })}
        </tbody>
      </table></div>
      <div className="pagination"><span>Total data: <strong>{total}</strong></span><div><button className="button ghost" onClick={() => setPage((current) => current - 1)} disabled={page <= 1}>Previous</button><span>Halaman {page} dari {totalPages}</span><button className="button ghost" onClick={() => setPage((current) => current + 1)} disabled={page >= totalPages}>Next</button></div></div>
    </section>
    {detail && <OpnameDetail opname={detail} onClose={() => setDetail(null)} />}
  </div>
}

function OpnameDetail({ opname, onClose }) {
  return <Modal title={`Stock Opname ${opname.tanggal}`} subtitle={`${opname.nama_petugas} · ${opname.status}`} onClose={onClose}>
    <div className="modal-body"><div className="table-wrap"><table className="opname-table">
      <thead><tr><th>Produk</th><th>Stok Sistem</th><th>Stok Fisik</th><th>Selisih</th></tr></thead>
      <tbody>{(opname.stock_opname_items || []).map((item) => <tr key={item.id}><td>{item.product_variants?.products?.nama_produk || '-'}</td><td>{item.stok_sistem}</td><td>{item.stok_fisik}</td><td><span className={`difference ${item.selisih > 0 ? 'plus' : item.selisih < 0 ? 'minus' : ''}`}>{item.selisih > 0 ? `+${item.selisih}` : item.selisih}</span></td></tr>)}</tbody>
    </table></div></div>
    <div className="modal-footer"><button className="button primary" onClick={onClose}>Tutup</button></div>
  </Modal>
}
