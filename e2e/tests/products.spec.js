const { test, expect } = require('@playwright/test');
const { login, unique } = require('./helpers');

test.describe('CRUD de productos (Frontend)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByTestId('nav-products').click();
  });

  test('crear, editar y eliminar un producto desde la interfaz', async ({ page }) => {
    const name = unique('Teclado');
    page.on('dialog', (d) => d.accept());

    // Crear
    await page.getByTestId('product-new').click();
    await page.getByTestId('product-name').fill(name);
    await page.getByTestId('product-description').fill('Teclado mecánico de prueba');
    await page.getByTestId('product-price').fill('899.90');
    await page.getByTestId('product-stock').fill('15');
    await page.getByTestId('product-save').click();

    const row = page.getByTestId('product-row').filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText('899.90');
    await expect(row).toContainText('15');

    // Editar
    await row.getByTestId('product-edit').click();
    await expect(page.getByTestId('product-name')).toHaveValue(name);
    await page.getByTestId('product-price').fill('750');
    await page.getByTestId('product-stock').fill('8');
    await page.getByTestId('product-save').click();
    await expect(row).toContainText('750.00');
    await expect(row).toContainText('8');

    // Buscar
    await page.getByTestId('product-search').fill(name);
    await expect(page.getByTestId('product-row')).toHaveCount(1);
    await page.getByTestId('product-search').fill('');

    // Eliminar
    await row.getByTestId('product-delete').click();
    await expect(row).toHaveCount(0);
  });

  test('el formulario no se envía sin los campos obligatorios', async ({ page }) => {
    await page.getByTestId('product-new').click();
    await page.getByTestId('product-save').click();
    // Validación HTML5: el modal sigue abierto
    await expect(page.getByTestId('product-form')).toBeVisible();
  });
});
