import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/theme.css';
import './styles/themes.css';
import './styles/app.css';
import { initUiTheme } from './themes/uiThemes';

// restore UI theme + custom CSS before first paint
initUiTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
