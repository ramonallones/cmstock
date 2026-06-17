import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, LoaderCircle, Search, UsersRound } from 'lucide-react'
import { supabase } from '../lib/supabase'

const pageSize = 25

const cleanText = (value) => String(value ?? '').trim()
const normalizePhone = (value) => cleanText(value).replace(/\D/g, '')

const isMarketplaceOrder = (order = {}) => {
  const customer = cleanText(order.nama_customer).toLowerCase()
  const address = cleanText(order.alamat).toLowerCase()
  return address.includes('order marketplace:') || customer.startsWith('tokopedia') || customer.startsWith('toco')
}

const buildCustomerRows = (orders = []) => {
  const customers = new Map()

  orders.forEach((order) => {
    if (isMarketplaceOrder(order)) return

    const name = cleanText(order.nama_customer)
    const phone = cleanText(order.no_wa)
    const address = cleanText(order.alamat)
    if (!name && !phone && !address) return

    const phoneKey = normalizePhone(phone)
    const fallbackKey = `${name.toLowerCase()}|${address.toLowerCase()}`
    const key = phoneKey || fallbackKey
    const existing = customers.get(key)

    if (!existing) {
      customers.set(key, {
        key,
        name: name || '-',
        phone: phone || '-',
        address: address || '-',
        orderCount: 1,
        lastOrderAt: order.created_at,
      })
      return
    }

    customers.set(key, {
      ...existing,
      name: existing.name === '-' && name ? name : existing.name,
      phone: existing.phone === '-' && phone ? phone : existing.phone,
      address: existing.address === '-' && address ? address : existing.address,
      orderCount: existing.orderCount + 1,
      lastOrderAt: new Date(order.created_at) > new Date(existing.lastOrderAt || 0)
        ? order.created_at
        : existing.lastOrderAt,
    })
  })

  return Array.from(customers.values()).sort((a, b) =>
    new Date(b.lastOrderAt || 0) - new Date(a.lastOrderAt || 0))
}

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data, error: queryError } = await supabase
      .from('orders')
      .select('id, nama_customer, no_wa, alamat, created_at')
      .order('created_at', { ascending: false })
      .range(0, 4999)

    if (queryError) {
      console.error('Gagal memuat data pelanggan:', queryError)
      setCustomers([])
      setError(queryError.message)
    } else {
      setCustomers(buildCustomerRows(data || []))
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return customers

    return customers.filter((customer) =>
      [customer.name, customer.phone, customer.address]
        .join(' ')
        .toLowerCase()
        .includes(keyword))
  }, [customers, search])

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize))
  const visibleCustomers = filteredCustomers.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    setPage(1)
  }, [search])

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Order</span>
          <h2>Data Pelanggan</h2>
          <p>Daftar pelanggan otomatis dari riwayat order tersimpan.</p>
        </div>
      </section>

      {error && <div className="notice error"><AlertCircle size={17} />{error}</div>}

      <section className="content-card">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama, nomor HP, atau alamat..."
            />
          </label>
          <span className="result-count">Total: {filteredCustomers.length} pelanggan</span>
        </div>

        <div className="table-wrap">
          <table className="customer-table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Nomor HP</th>
                <th>Alamat</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="3">
                    <div className="empty-state">
                      <LoaderCircle className="spin" size={23} />
                      <strong>Memuat data pelanggan...</strong>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && !visibleCustomers.length && (
                <tr>
                  <td colSpan="3">
                    <div className="empty-state">
                      <UsersRound size={28} />
                      <strong>Belum ada data pelanggan</strong>
                      <span>Data akan muncul setelah order manual tersimpan.</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && visibleCustomers.map((customer) => (
                <tr key={customer.key}>
                  <td><strong className="customer-name">{customer.name}</strong></td>
                  <td>{customer.phone}</td>
                  <td>{customer.address}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <span>Menampilkan {visibleCustomers.length} dari {filteredCustomers.length} pelanggan</span>
          <div>
            <button className="button ghost" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Sebelumnya</button>
            <span>Halaman <strong>{page}</strong> / {totalPages}</span>
            <button className="button ghost" type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages}>Berikutnya</button>
          </div>
        </div>
      </section>
    </div>
  )
}
