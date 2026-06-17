import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  LoaderCircle,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import {
  currentMonthValueWIB,
  formatDateTimeWIB,
  formatFullDateWIB,
  formatMonthWIB,
  getWibDateParts,
  formatInputDateWIB,
  formatRupiah,
} from '../lib/format'
import { supabase } from '../lib/supabase'

const formatNumber = (value) => new Intl.NumberFormat('id-ID').format(Number(value) || 0)

const todayRange = () => {
  const date = formatInputDateWIB()
  const { year, month, day } = getWibDateParts()
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1, 12))
  const nextDate = formatInputDateWIB(tomorrow)
  return {
    start: `${date}T00:00:00+07:00`,
    end: `${nextDate}T00:00:00+07:00`,
  }
}

const monthRange = (monthValue = currentMonthValueWIB()) => {
  const [year, month] = monthValue.split('-').map(Number)
  const endMonthDate = new Date(Date.UTC(year, month, 1, 12))
  const endMonth = currentMonthValueWIB(endMonthDate)
  const startDate = new Date(Date.UTC(year, month - 1, 1, 12))
  return {
    start: `${monthValue}-01T00:00:00+07:00`,
    end: `${endMonth}-01T00:00:00+07:00`,
    days: new Date(Date.UTC(year, month, 0)).getUTCDate(),
    label: formatMonthWIB(startDate),
    year,
    month,
  }
}

const yearRange = (year = getWibDateParts().year) => {
  const start = new Date(Date.UTC(year, 0, 1, 12))
  const end = new Date(Date.UTC(year, 11, 1, 12))
  return {
    start: `${year}-01-01T00:00:00+07:00`,
    end: `${year + 1}-01-01T00:00:00+07:00`,
    label: `${formatMonthWIB(start)} - ${formatMonthWIB(end)}`,
  }
}

const isMarketplaceOrder = (order = {}) => {
  const customer = String(order.nama_customer || '').toLowerCase()
  const address = String(order.alamat || '').toLowerCase()
  return address.includes('order marketplace:') || customer.startsWith('tokopedia') || customer.startsWith('toco')
}

const getOrderProductTotal = (order = {}) =>
  (order.order_items || []).reduce((total, item) => total + (Number(item.subtotal) || 0), 0)

export default function Dashboard() {
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValueWIB)
  const [stats, setStats] = useState({
    ordersToday: 0,
    directSalesToday: 0,
    marketplaceSalesToday: 0,
    ordersThisMonth: 0,
    directSalesThisMonth: 0,
    marketplaceSalesThisMonth: 0,
    shippingThisMonth: 0,
    salesThisMonth: 0,
    salesThisYear: 0,
    monthPeriod: '',
    yearPeriod: '',
  })
  const [dailySales, setDailySales] = useState([])
  const [bestSellers, setBestSellers] = useState([])
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    const today = todayRange()
    const month = monthRange(selectedMonth)
    const year = yearRange(month.year)

    const results = await Promise.all([
      supabase.from('orders').select('id, total, nama_customer, alamat, order_items(subtotal)').gte('created_at', today.start).lt('created_at', today.end),
      supabase.from('orders').select('id, total, ongkir, nama_customer, alamat, created_at, order_items(subtotal)').gte('created_at', month.start).lt('created_at', month.end),
      supabase.from('orders').select('id, order_items(subtotal)').gte('created_at', year.start).lt('created_at', year.end),
      supabase
        .from('order_items')
        .select('id, qty, subtotal, orders!inner(created_at), product_variants(id, products(id, sku, nama_produk, kategori))')
        .gte('orders.created_at', month.start)
        .lt('orders.created_at', month.end),
      supabase
        .from('orders')
        .select('id, nomor_order, nama_customer, total, status, created_at, order_items(subtotal)')
        .gte('created_at', month.start)
        .lt('created_at', month.end)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    const firstError = results.find((result) => result.error)?.error
    if (firstError) {
      console.error('Gagal memuat dashboard:', firstError)
      setError(firstError.message)
      setLoading(false)
      return
    }

    const [todayOrdersResult, monthOrdersResult, yearOrdersResult, orderItemsResult, recentOrdersResult] = results
    const todayOrders = todayOrdersResult.data || []
    const monthOrders = monthOrdersResult.data || []
    const yearOrders = yearOrdersResult.data || []
    const dailyTotals = Array.from({ length: month.days }, (_, index) => ({
      day: index + 1,
      total: 0,
      orders: 0,
    }))
    monthOrders.forEach((order) => {
      const day = getWibDateParts(order.created_at).day
      if (!dailyTotals[day - 1]) return
      dailyTotals[day - 1].total += getOrderProductTotal(order)
      dailyTotals[day - 1].orders += 1
    })

    const sellerMap = new Map()
    ;(orderItemsResult.data || []).forEach((item) => {
      const product = item.product_variants?.products
      if (!product) return
      const category = product.kategori || 'Tanpa Kategori'
      const key = `${category}::${product.id || product.nama_produk}`
      const current = sellerMap.get(key) || {
        category,
        productName: product.nama_produk || '-',
        sku: product.sku || '-',
        qty: 0,
        sales: 0,
      }
      current.qty += Number(item.qty) || 0
      current.sales += Number(item.subtotal) || 0
      sellerMap.set(key, current)
    })
    const bestByCategory = [...sellerMap.values()]
      .reduce((accumulator, item) => {
        const current = accumulator.get(item.category)
        if (!current || item.qty > current.qty || (item.qty === current.qty && item.sales > current.sales)) {
          accumulator.set(item.category, item)
        }
        return accumulator
      }, new Map())

    setStats({
      ordersToday: todayOrders.length,
      directSalesToday: todayOrders.filter((order) => !isMarketplaceOrder(order)).reduce((total, order) => total + getOrderProductTotal(order), 0),
      marketplaceSalesToday: todayOrders.filter(isMarketplaceOrder).reduce((total, order) => total + getOrderProductTotal(order), 0),
      ordersThisMonth: monthOrders.length,
      directSalesThisMonth: monthOrders.filter((order) => !isMarketplaceOrder(order)).reduce((total, order) => total + getOrderProductTotal(order), 0),
      marketplaceSalesThisMonth: monthOrders.filter(isMarketplaceOrder).reduce((total, order) => total + getOrderProductTotal(order), 0),
      shippingThisMonth: monthOrders.reduce((total, order) => total + (Number(order.ongkir) || 0), 0),
      salesThisMonth: monthOrders.reduce((total, order) => total + getOrderProductTotal(order), 0),
      salesThisYear: yearOrders.reduce((total, order) => total + getOrderProductTotal(order), 0),
      monthPeriod: month.label,
      yearPeriod: year.label,
    })
    setDailySales(dailyTotals)
    setBestSellers([...bestByCategory.values()].sort((a, b) => a.category.localeCompare(b.category, 'id')).slice(0, 12))
    setRecentOrders(recentOrdersResult.data || [])
    setLoading(false)
  }, [selectedMonth])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const cards = useMemo(() => [
    { label: 'Jumlah Order Hari Ini', value: formatNumber(stats.ordersToday), note: 'Total order masuk hari ini', icon: CalendarDays, tone: 'today' },
    { label: 'Penjualan Manual Hari Ini', value: formatRupiah(stats.directSalesToday), note: 'Produk dari order manual, tanpa ongkir', icon: WalletCards, tone: 'manualToday' },
    { label: 'Penjualan Marketplace Hari Ini', value: formatRupiah(stats.marketplaceSalesToday), note: 'Produk Tokopedia & Toco, tanpa ongkir', icon: ShoppingBag, tone: 'marketToday' },
    { label: 'Jumlah Order Bulan Terpilih', value: formatNumber(stats.ordersThisMonth), note: `Total order pada ${stats.monthPeriod || '-'}`, icon: ShoppingBag, tone: 'monthOrder' },
    { label: 'Penjualan Manual Bulan Terpilih', value: formatRupiah(stats.directSalesThisMonth), note: `Produk manual pada ${stats.monthPeriod || '-'}, tanpa ongkir`, icon: WalletCards, tone: 'manualMonth' },
    { label: 'Penjualan Marketplace Bulan Terpilih', value: formatRupiah(stats.marketplaceSalesThisMonth), note: `Produk Tokopedia & Toco pada ${stats.monthPeriod || '-'}`, icon: ShoppingBag, tone: 'marketMonth' },
    { label: 'Total Ongkir Bulan Terpilih', value: formatRupiah(stats.shippingThisMonth), note: `Akumulasi ongkir ${stats.monthPeriod || '-'}`, icon: CalendarDays, tone: 'shipping' },
    { label: 'Total Penjualan Produk Bulan Terpilih', value: formatRupiah(stats.salesThisMonth), note: `Manual + marketplace tanpa ongkir pada ${stats.monthPeriod || '-'}`, icon: TrendingUp, tone: 'monthSales' },
    { label: 'Total Penjualan Produk Tahunan', value: formatRupiah(stats.salesThisYear), note: `Tanpa ongkir, periode ${stats.yearPeriod || '-'}`, icon: WalletCards, tone: 'yearSales' },
  ], [stats])

  const maxDailySales = Math.max(...dailySales.map((item) => item.total), 1)

  return (
    <div className="page-stack">
      <section className="welcome-panel">
        <div>
          <span className="eyebrow">{formatFullDateWIB()}</span>
          <h2>Selamat datang kembali.</h2>
          <p>Pantau produk, stok, dan aktivitas toko dari satu tempat.</p>
        </div>
        <div className="welcome-actions">
          <label className="dashboard-month-filter">
            <span>Periode</span>
            <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value || currentMonthValueWIB())} />
          </label>
          <button className="button dashboard-refresh" onClick={loadDashboard} disabled={loading}>
            <RefreshCw className={loading ? 'spin' : ''} size={17} /> Refresh Dashboard
          </button>
          <div className="welcome-visual"><TrendingUp size={31} /></div>
        </div>
      </section>

      {error && <div className="notice error"><AlertCircle size={19} /><span>{error}</span></div>}

      <section className="stats-grid dashboard-stats">
        {cards.map(({ label, value, note, icon: Icon, tone }) => (
          <article className={`stat-card ${tone}`} key={label}>
            <div className="stat-card-head">
              <div className={`stat-icon ${tone}`}>{loading ? <LoaderCircle className="spin" size={20} /> : <Icon size={21} />}</div>
              <span>{label}</span>
            </div>
            <strong>{loading ? '-' : value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>

      <section className="content-card dashboard-chart-card">
        <div className="dashboard-card-title">
          <div><span className="eyebrow">Grafik Penjualan</span><h3>Penjualan Produk Harian {stats.monthPeriod || '-'}</h3></div>
          <span>{formatRupiah(stats.salesThisMonth)}</span>
        </div>
        <div className="daily-sales-chart">
          {loading && <div className="dashboard-table-empty"><LoaderCircle className="spin" size={18} /> Memuat grafik...</div>}
          {!loading && dailySales.map((item) => (
            <div className="daily-bar" key={item.day} title={`${item.day} ${stats.monthPeriod}: ${formatRupiah(item.total)} (${item.orders} order)`}>
              <span>{item.total ? formatRupiah(item.total) : ''}</span>
              <i style={{ height: `${Math.max(4, (item.total / maxDailySales) * 100)}%` }} />
              <small>{item.day}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-tables">
        <article className="content-card dashboard-table-card">
          <div className="dashboard-card-title">
            <div><span className="eyebrow">Penjualan</span><h3>Best Seller per Kategori</h3></div>
            <span>{bestSellers.length} kategori</span>
          </div>
          <div className="table-wrap">
            <table className="dashboard-table best-seller-table">
              <thead><tr><th>Kategori</th><th>Produk</th><th>Qty</th><th>Penjualan</th></tr></thead>
              <tbody>
                {loading && <tr><td colSpan="4"><div className="dashboard-table-empty"><LoaderCircle className="spin" size={18} /> Memuat...</div></td></tr>}
                {!loading && !bestSellers.length && <tr><td colSpan="4"><div className="dashboard-table-empty">Belum ada penjualan produk pada periode ini.</div></td></tr>}
                {!loading && bestSellers.map((item) => <tr key={`${item.category}-${item.sku}`}>
                  <td><span className="sku">{item.category}</span></td>
                  <td><div className="product-name"><strong>{item.productName}</strong><span>{item.sku}</span></div></td>
                  <td><strong>{formatNumber(item.qty)}</strong></td>
                  <td className="money">{formatRupiah(item.sales)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </article>

        <article className="content-card dashboard-table-card">
          <div className="dashboard-card-title">
            <div><span className="eyebrow">Penjualan</span><h3>Order Terbaru</h3></div>
            <span>{stats.monthPeriod || '-'} · {recentOrders.length} order</span>
          </div>
          <div className="table-wrap">
            <table className="dashboard-table recent-order-table">
              <thead><tr><th>Nomor Order</th><th>Nama Customer</th><th>Penjualan Produk</th><th>Status</th><th>Tanggal</th></tr></thead>
              <tbody>
                {loading && <tr><td colSpan="5"><div className="dashboard-table-empty"><LoaderCircle className="spin" size={18} /> Memuat...</div></td></tr>}
                {!loading && !recentOrders.length && <tr><td colSpan="5"><div className="dashboard-table-empty">Belum ada order.</div></td></tr>}
                {!loading && recentOrders.map((order) => <tr key={order.id}>
                  <td><span className="sku">{order.nomor_order}</span></td>
                  <td>{order.nama_customer || '-'}</td>
                  <td className="money">{formatRupiah(getOrderProductTotal(order))}</td>
                  <td><span className={`order-status ${order.status || 'baru'}`}>{order.status || 'baru'}</span></td>
                  <td>{formatDateTimeWIB(order.created_at)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  )
}
