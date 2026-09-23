import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles.css';
import { App } from './App';
import { ApiError } from './lib/api';

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e) => !(e instanceof ApiError && e.status < 500 && e.code !== 'TIMEOUT') && n < 3, retryDelay: (n) => Math.min(1500, 400 * (n + 1)), refetchOnWindowFocus: false },
  },
});

function Guarded() {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}><App /></ErrorBoundary>;
}
