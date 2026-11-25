import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';

const EMPTY = { name: '', description: '', price: '', stock: '' };
const money = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

export default function Products() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | product
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');

  const load = () => api('/products').then(setItems).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setForm(EMPTY);
    setFormError('');
    setEditing('new');
  }
  function openEdit(p) {
    setForm({ name: p.name, description: p.description, price: String(p.price), stock: String(p.stock) });
    setFormError('');
    setEditing(p);
  }

  async function save(e) {
    e.preventDefault();
    setFormError('');
    const body = { ...form, price: Number(form.price), stock: Number(form.stock || 0) };
    try {
      if (editing === 'new') await api('/products', { method: 'POST', body });
      else await api(`/products/${editing.id}`, { method: 'PUT', body });
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function remove(p) {
    if (!window.confirm(`¿Eliminar el producto "${p.name}"?`)) return;
    try {
      await api(`/products/${p.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const filtered = items.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <section>
      <div className="section-header">
        <h1>Productos</h1>
        <div className="actions">
          <input
            className="search"
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="product-search"
          />
          <button className="btn btn-primary" onClick={openNew} data-testid="product-new">
            + Nuevo producto
          </button>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="card table-wrap">
        <table data-testid="products-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Descripción</th>
              <th className="num">Precio</th>
              <th className="num">Stock</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} data-testid="product-row">
                <td>{p.id}</td>
                <td>{p.name}</td>
                <td className="muted">{p.description}</td>
                <td className="num">{money(p.price)}</td>
                <td className="num">{p.stock}</td>
                <td className="row-actions">
                  <button className="btn btn-light" onClick={() => openEdit(p)} data-testid="product-edit">
                    Editar
                  </button>
                  <button className="btn btn-danger" onClick={() => remove(p)} data-testid="product-delete">
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan="6" className="empty">
                  No hay productos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Nuevo producto' : 'Editar producto'} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="form" data-testid="product-form">
            <label>
              Nombre
              <input value={form.name} onChange={set('name')} required data-testid="product-name" />
            </label>
            <label>
              Descripción
              <textarea value={form.description} onChange={set('description')} data-testid="product-description" />
            </label>
            <div className="grid-2">
              <label>
                Precio
                <input type="number" step="0.01" min="0" value={form.price} onChange={set('price')} required data-testid="product-price" />
              </label>
              <label>
                Stock
                <input type="number" step="1" min="0" value={form.stock} onChange={set('stock')} required data-testid="product-stock" />
              </label>
            </div>
            {formError && <div className="alert">{formError}</div>}
            <div className="form-actions">
              <button type="button" className="btn btn-light" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" data-testid="product-save">
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
