import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './login.css';
import './wbw-theme.css'; // 반드시 styles.css, login.css 뒤에 오도록 마지막에 import

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
