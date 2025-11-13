import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { TeamBuilderProvider } from './hooks/useTeamBuilderLogic';

createRoot(document.getElementById('root')).render(
  <StrictMode>
      <TeamBuilderProvider>
          <App />
      </TeamBuilderProvider>
  </StrictMode>,
)
