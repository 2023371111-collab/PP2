const { test, expect } = require('@playwright/test');
const { login, unique } = require('./helpers');

test.describe('CRUD de usuarios (Frontend)', () => {
  test('crear, editar, iniciar sesión y eliminar un usuario desde la interfaz', async ({ page }) => {
    const email = `${unique('qa')}@test.com`;
    page.on('dialog', (d) => d.accept());

    await login(page);
    await page.getByTestId('nav-users').click();
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();

    // Crear
    await page.getByTestId('user-new').click();
    await page.getByTestId('user-name').fill('Usuario QA');
    await page.getByTestId('user-email').fill(email);
    await page.getByTestId('user-password').fill('clave123');
    await page.getByTestId('user-role').selectOption('user');
    await page.getByTestId('user-save').click();

    const row = page.getByTestId('user-row').filter({ hasText: email });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Usuario QA');

    // Editar
    await row.getByTestId('user-edit').click();
    await page.getByTestId('user-name').fill('Usuario QA Editado');
    await page.getByTestId('user-save').click();
    await expect(row).toContainText('Usuario QA Editado');

    // El nuevo usuario puede iniciar sesión
    await page.getByTestId('logout').click();
    await login(page, { email, password: 'clave123' });
    await expect(page.getByTestId('current-user')).toHaveText('Usuario QA Editado');
    await page.getByTestId('logout').click();

    // Eliminar (como administrador)
    await login(page);
    await page.getByTestId('nav-users').click();
    await page.getByTestId('user-row').filter({ hasText: email }).getByTestId('user-delete').click();
    await expect(page.getByTestId('user-row').filter({ hasText: email })).toHaveCount(0);
  });

  test('el administrador no puede eliminarse a sí mismo', async ({ page }) => {
    await login(page);
    await page.getByTestId('nav-users').click();
    const adminRow = page.getByTestId('user-row').filter({ hasText: 'Administrador' }).first();
    await expect(adminRow.getByTestId('user-delete')).toBeDisabled();
  });
});
