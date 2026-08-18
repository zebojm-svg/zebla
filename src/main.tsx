import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './zebo-design-system.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
