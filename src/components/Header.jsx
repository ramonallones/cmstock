import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, CheckCheck, LogOut, Menu, Search } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { formatRupiah, formatShortDateTimeWIB } from '../lib/format'
import { supabase } from '../lib/supabase'
import { findNavItem } from './navigation'

const lowStockLimit = 5

const makeNotificationId = (type, id, time = Date.now()) => `${type}-${id || time}-${time}`

export default function Header({ onMenuClick }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const current = findNavItem(pathname)
  const email = user?.email || 'Admin'
  const initial = email.charAt(0).toUpperCase()
  const [notifications, setNotifications] = useState([])
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const notificationRef = useRef(null)

  const logout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Logout gagal:', error)
  }

  const unreadCount = useMemo(() => notifications.filter((item) => !item.read).length, [notifications])

  const pushNotification = useCallback((notification, showBrowser = true) => {
    const nextNotification = {
      id: makeNotificationId(notification.type, notification.refId),
      time: new Date().toISOString(),
      read: false,
      ...notification,
    }

    setNotifications((currentItems) => {
      const filtered = currentItems.filter((item) => item.id !== nextNotification.id)
      return [nextNotification, ...filtered].slice(0, 20)
    })

    if (
      showBrowser &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      new Notification(nextNotification.title, {
        body: nextNotification.message,
        tag: nextNotification.id,
      })
    }
  }, [])

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported')
      return
    }
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
  }

  const openNotificationTarget = (notification) => {
    setNotifications((currentItems) => currentItems.map((item) => (
      item.id === notification.id ? { ...item, read: true } : item
    )))
    setNotificationOpen(false)
    if (notification.to) navigate(notification.to)
  }

  const markAllRead = () => {
    setNotifications((currentItems) => currentItems.map((item) => ({ ...item, read: true })))
  }

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!notificationRef.current?.contains(event.target)) setNotificationOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  useEffect(() => {
    let active = true

    const loadInitialNotifications = async () => {
      const [ordersResult, stockResult] = await Promise.all([
        supabase
          .from('orders')
          .select('id, nomor_order, nama_customer, total, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('product_variants')
          .select('id, stok, satuan, products!inner(nama_produk, sku, aktif)')
          .eq('products.aktif', true)
          .lte('stok', lowStockLimit)
          .order('stok', { ascending: true })
          .limit(5),
      ])

      if (!active) return

      const initialNotifications = [
        ...(ordersResult.data || []).map((order) => ({
          id: `recent-order-${order.id}`,
          type: 'order',
          title: `Order terbaru ${order.nomor_order || ''}`.trim(),
          message: `${order.nama_customer || 'Customer'} - ${formatRupiah(order.total)}`,
          time: order.created_at,
          read: true,
          to: '/order-history',
        })),
        ...(stockResult.data || []).map((variant) => ({
          id: `low-stock-${variant.id}`,
          type: 'stock',
          title: 'Stok menipis',
          message: `${variant.products?.nama_produk || 'Produk'} tersisa ${variant.stok || 0} ${variant.satuan || ''}`.trim(),
          time: new Date().toISOString(),
          read: true,
          to: '/stock',
        })),
      ]

      setNotifications(initialNotifications.slice(0, 10))
    }

    loadInitialNotifications()

    const ordersChannel = supabase
      .channel('app-order-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const order = payload.new || {}
        pushNotification({
          type: 'order',
          refId: order.id,
          title: `Order baru ${order.nomor_order || ''}`.trim(),
          message: `${order.nama_customer || 'Customer'} - ${formatRupiah(order.total)}`,
          to: '/order-history',
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        const nextOrder = payload.new || {}
        const previousOrder = payload.old || {}
        const nextTracking = nextOrder.nomor_resi || nextOrder.resi || nextOrder.tracking_number
        const previousTracking = previousOrder.nomor_resi || previousOrder.resi || previousOrder.tracking_number
        if (nextOrder.status === previousOrder.status && nextTracking === previousTracking) return

        pushNotification({
          type: 'tracking',
          refId: `${nextOrder.id}-${nextOrder.status || nextTracking || Date.now()}`,
          title: `Update order ${nextOrder.nomor_order || ''}`.trim(),
          message: nextTracking ? `Nomor resi tersimpan: ${nextTracking}` : `Status berubah menjadi ${nextOrder.status || 'diproses'}`,
          to: '/order-history',
        })
      })
      .subscribe()

    const stockChannel = supabase
      .channel('app-stock-notifications')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'product_variants' }, async (payload) => {
        const nextVariant = payload.new || {}
        const previousVariant = payload.old || {}
        if (Number(nextVariant.stok) > lowStockLimit || Number(previousVariant.stok) <= lowStockLimit) return

        const { data: product } = await supabase
          .from('products')
          .select('nama_produk, sku, aktif')
          .eq('id', nextVariant.product_id)
          .single()

        if (!product?.aktif) return
        pushNotification({
          type: 'stock',
          refId: nextVariant.id,
          title: 'Stok menipis',
          message: `${product.nama_produk || product.sku || 'Produk'} tersisa ${nextVariant.stok || 0}`,
          to: '/stock',
        })
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(ordersChannel)
      supabase.removeChannel(stockChannel)
    }
  }, [pushNotification])

  return (
    <header className="topbar">
      <div className="topbar-title">
        <button className="icon-button mobile-menu" onClick={onMenuClick} aria-label="Buka menu">
          <Menu size={21} />
        </button>
        <div>
          <span>Ruang kerja</span>
          <h1>{current.label}</h1>
        </div>
      </div>
      <div className="topbar-actions">
        <label className="top-search">
          <Search size={17} />
          <input placeholder="Cari cepat..." />
        </label>
        <div className="notification-center" ref={notificationRef}>
          <button
            className={`icon-button notification-button ${notificationOpen ? 'active' : ''}`}
            aria-label="Notifikasi"
            onClick={() => setNotificationOpen((currentOpen) => !currentOpen)}
          >
            <Bell size={19} />
            {unreadCount > 0 && <b>{unreadCount > 9 ? '9+' : unreadCount}</b>}
          </button>
          {notificationOpen && (
            <div className="notification-panel">
              <div className="notification-panel-head">
                <div>
                  <strong>Notifikasi</strong>
                  <span>{unreadCount ? `${unreadCount} belum dibaca` : 'Semua sudah dibaca'}</span>
                </div>
                <button type="button" onClick={markAllRead} disabled={!notifications.length}>
                  <CheckCheck size={15} /> Tandai
                </button>
              </div>

              {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
                <button className="notification-permission" type="button" onClick={requestNotificationPermission}>
                  Aktifkan notifikasi browser
                </button>
              )}

              <div className="notification-list">
                {!notifications.length && (
                  <div className="notification-empty">Belum ada notifikasi.</div>
                )}
                {notifications.map((notification) => (
                  <button
                    className={`notification-item ${notification.read ? '' : 'unread'}`}
                    key={notification.id}
                    type="button"
                    onClick={() => openNotificationTarget(notification)}
                  >
                    <span>{notification.title}</span>
                    <p>{notification.message}</p>
                    <small>{notification.time ? formatShortDateTimeWIB(notification.time) : 'Baru saja'}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="profile">
          <div className="profile-avatar">{initial}</div>
          <div>
            <strong>{email}</strong>
            <span>Admin</span>
          </div>
        </div>
        <button className="icon-button" onClick={logout} aria-label="Logout" title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}
