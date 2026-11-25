import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';

const EMPTY = { name: '', email: '', password: '', role: 'user' };

export default function Users({ currentUser }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | user
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState('');

  const load = () => api('/users').then(setItems).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setForm(EMPTY);
    setFormError('');
    setEditing('new');
  }
  function openEdit(u) {
    setForm({ name: u.name, email: u.email, password: '', role: u.role });
    setFormError('');
    setEditing(u);
  }

  async function save(e) {
    e.preventDefault();
    setFormError('');
    const body = { ...form };
    if (editing !== 'new' && !body.password) delete body.password;
    try {
      if (editing === 'new') await api('/users', { method: 'POST', body });
      else await api(`/users/${editing.id}`, { method: 'PUT', body });
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function remove(u) {
    if (!window.confirm(`¿Eliminar al usuario "${u.name}"?`)) return;
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <section>
      <div className="section-header">
        <h1>Usuarios</h1>
        <button className="btn btn-primary" onClick={openNew} data-testid="user-new">
          + Nuevo usuario
        </button>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="card table-wrap">
        <table data-testid="users-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} data-testid="user-row">
                <td>{u.id}</td>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <span className={`badge ${u.role}`}>{u.role === 'admin' ? 'Administrador' : 'Usuario'}</span>
                </td>
                <td className="row-actions">
                  <button className="btn btn-light" onClick={() => openEdit(u)} data-testid="user-edit">
                    Editar
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => remove(u)}
                    disabled={u.id === currentUser.id}
                    data-testid="user-delete"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Nuevo usuario' : 'Editar usuario'} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="form" data-testid="user-form">
            <label>
              Nombre
              <input value={form.name} onChange={set('name')} required data-testid="user-name" />
            </label>
            <label>
              Correo electrónico
              <input type="email" value={form.email} onChange={set('email')} required data-testid="user-email" />
            </label>
            <label>
              Contraseña {editing !== 'new' && <span className="muted">(dejar vacío para no cambiarla)</span>}
              <input
                type="password"
                value={form.password}
                onChange={set('password')}
                required={editing === 'new'}
                minLength={6}
                data-testid="user-password"
              />
            </label>
            <label>
              Rol
              <select value={form.role} onChange={set('role')} data-testid="user-role">
                <option value="user">Usuario</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            {formError && <div className="alert">{formError}</div>}
            <div className="form-actions">
              <button type="button" className="btn btn-light" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" data-testid="user-save">
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
