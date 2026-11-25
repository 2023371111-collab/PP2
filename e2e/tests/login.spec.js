const { test, expect } = require('@playwright/test');
const { ADMIN, login } = require('./helpers');

test.describe('Login (Frontend)', () => {
  test('muestra el formulario de inicio de sesión', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.getByTestId('login-email')).toBeVisible();
    await expect(page.getByTestId('login-password')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toBeEnabled();
  });

  test('credenciales incorrectas muestran un mensaje de error', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('login-email').fill(ADMIN.email);
    await page.getByTestId('login-password').fill('contraseña-incorrecta');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toHaveText('Credenciales inválidas');
    await expect(page.getByTestId('logout')).toHaveCount(0);
  });

  test('credenciales correctas entran al sistema y se puede cerrar sesión', async ({ page }) => {
    await login(page);
    await expect(page.getByTestId('current-user')).toHaveText('Administrador');
    await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible();

    // La sesión persiste al recargar
    await page.reload();
    await expect(page.getByTestId('logout')).toBeVisible();

    await page.getByTestId('logout').click();
    await expect(page.getByTestId('login-form')).toBeVisible();
  });
});
