import React from 'react';
import ReactDOM from 'react-dom/client';
import { OptionsApp } from '@/ui/OptionsApp';
import '@/ui/styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Options root element is missing');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>,
);
