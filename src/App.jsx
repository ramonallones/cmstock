import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import MarketplaceOrders from './pages/MarketplaceOrders'
import BonusOrders from './pages/BonusOrders'
import OrderHistory from './pages/OrderHistory'
import Customers from './pages/Customers'
import Products from './pages/Products'
import Sampler from './pages/Sampler'
import StockOpname from './pages/StockOpname'
import OpnameHistory from './pages/OpnameHistory'
import StockMutations from './pages/StockMutations'
import Login from './pages/Login'
import Stock from './pages/Stock'

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="stock" element={<Stock />} />
          <Route path="orders" element={<Orders />} />
          <Route path="marketplace-orders" element={<MarketplaceOrders />} />
          <Route path="bonus-orders" element={<BonusOrders />} />
          <Route path="order-history" element={<OrderHistory />} />
          <Route path="customers" element={<Customers />} />
          <Route path="sampler" element={<Sampler />} />
          <Route path="stock-opname" element={<StockOpname />} />
          <Route path="opname-history" element={<OpnameHistory />} />
          <Route path="stock-mutations" element={<StockMutations />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
