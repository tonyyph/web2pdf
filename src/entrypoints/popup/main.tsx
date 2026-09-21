import React from 'react';
import ReactDOM from 'react-dom/client';
import { PopupApp } from '@/ui/PopupApp';
import '@/ui/styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Popup root element is missing');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
