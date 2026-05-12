import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { QueryProvider } from './app/providers/QueryProvider.tsx';
import { AgentProvider } from './app/contexts/AgentContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <AgentProvider>
        <App />
      </AgentProvider>
    </QueryProvider>
  </StrictMode>,
);
