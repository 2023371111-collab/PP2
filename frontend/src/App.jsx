import { useEffect, useState } from 'react';
import { session } from './api.js';
import Login from './pages/Login.jsx';
import Products from './pages/Products.jsx';
import Users from './pages/Users.jsx';

export default function App() {
  const [user, setUser] = useState(session.token ? session.user : null);
  const [page, setPage] = useState('products');
  const [version, setVersion] = useState('');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setVersion(d.version || ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('session-expired', onExpired);
    return () => window.removeEventListener('session-expired', onExpired);
  }, []);

  if (!user) return <Login onLogin={setUser} />;

  const logout = () => {
    session.clear();
    setUser(null);
  };

  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand">
          📦 Sistema de Inventario
          {version && (
            <span className="version" data-testid="app-version">
              v{version.slice(0, 7)}
            </span>
          )}
        </div>
        <nav>
          <button
            data-testid="nav-products"
            className={page === 'products' ? 'tab active' : 'tab'}
            onClick={() => setPage('products')}
          >
            Productos
          </button>
          <button
            data-testid="nav-users"
            className={page === 'users' ? 'tab active' : 'tab'}
            onClick={() => setPage('users')}
          >
            Usuarios
          </button>
        </nav>
        <div className="user-box">
          <span data-testid="current-user">{user.name}</span>
          <button data-testid="logout" className="btn btn-light" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="content">{page === 'products' ? <Products /> : <Users currentUser={user} />}</main>
    </div>
  );
}
