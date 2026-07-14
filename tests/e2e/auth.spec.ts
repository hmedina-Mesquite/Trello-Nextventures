// Covers T029's "signup -> land on dashboard" and "login with existing user"
// flows, plus the ProtectedRoute redirect behavior (src/App.tsx,
// src/components/ProtectedRoute.tsx) that everything else in this suite
// depends on.
import { test, expect } from '@playwright/test'
import { login, logout, makeTestUser, signUp } from './fixtures'

test.describe('auth', () => {
  test('unauthenticated visitors are redirected to /login from protected routes', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)

    await page.goto('/boards/00000000-0000-0000-0000-000000000000')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('an unknown route redirects home, which then redirects to /login when logged out', async ({ page }) => {
    await page.goto('/this-route-does-not-exist')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('signup lands the new user on the dashboard', async ({ page }) => {
    const user = makeTestUser('signup')
    await signUp(page, user)
    await expect(page).toHaveURL('/')
    await expect(page.getByText(user.email)).toBeVisible()
  })

  test('an existing user can log out and log back in', async ({ page }) => {
    const user = makeTestUser('relogin')
    await signUp(page, user)
    await logout(page)

    await login(page, user)
    await expect(page.getByText(user.email)).toBeVisible()
  })

  test('logging in with a wrong password shows an error and does not navigate', async ({ page }) => {
    const user = makeTestUser('wrongpw')
    await signUp(page, user)
    await page.getByRole('button', { name: 'Sign out' }).click()

    await page.goto('/login')
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill('definitely-not-the-password')
    await page.getByRole('button', { name: 'Log in' }).click()

    await expect(page).toHaveURL(/\/login$/)
    // LoginPage renders the Supabase error message text (src/pages/LoginPage.tsx);
    // exact wording is Supabase's, so just assert *some* error text appeared.
    await expect(page.locator('p.text-red-600')).toBeVisible()
  })
})
