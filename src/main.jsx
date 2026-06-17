import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import './styles/global.css'
import './styles/label-print.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename="/cmstock">
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
