import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './login.css';
import './wbw-theme.css';
import './wbw-editor.css'; // 반드시 맨 마지막에 import (용지/쪽 레이아웃 덮어쓰기)

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

