import {
  Boxes,
  ClipboardCheck,
  LayoutDashboard,
  ListChecks,
  History,
  ArrowLeftRight,
  PackageOpen,
  ShoppingBag,
  Store,
  UsersRound,
  Warehouse,
} from 'lucide-react'

export const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  {
    to: '/products',
    label: 'Produk & Stok',
    icon: Boxes,
    children: [
      { to: '/products', label: 'Produk', icon: Boxes },
      { to: '/stock', label: 'Stok', icon: Warehouse },
    ],
  },
  {
    to: '/orders',
    label: 'Order',
    icon: ShoppingBag,
    children: [
      { to: '/orders', label: 'Order Manual', icon: ShoppingBag },
      { to: '/marketplace-orders', label: 'Order Marketplace', icon: Store },
      { to: '/bonus-orders', label: 'Input Bonus', icon: ShoppingBag },
      { to: '/order-history', label: 'Riwayat Order', icon: ListChecks },
      { to: '/customers', label: 'Data Pelanggan', icon: UsersRound },
    ],
  },
  { to: '/sampler', label: 'Paket Sampler', icon: PackageOpen },
  {
    to: '/stock-opname',
    label: 'Stock Opname',
    icon: ClipboardCheck,
    children: [
      { to: '/stock-opname', label: 'Input Opname', icon: ClipboardCheck },
      { to: '/opname-history', label: 'Riwayat Opname', icon: History },
    ],
  },
  { to: '/stock-mutations', label: 'Mutasi Stok', icon: ArrowLeftRight },
]

export const flatNavItems = navItems.flatMap((item) => item.children || item)

export const findNavItem = (pathname) =>
  flatNavItems.find((item) => item.to === pathname) ||
  navItems.find((item) => item.to === pathname) ||
  navItems[0]
