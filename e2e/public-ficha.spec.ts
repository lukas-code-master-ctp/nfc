import { test, expect } from '@playwright/test'

test('token inexistente muestra 404', async ({ page }) => {
  const res = await page.goto('/v/token-que-no-existe-000')
  expect(res?.status()).toBe(404)
})

test('login renderiza', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText('Continuar con Google')).toBeVisible()
})
