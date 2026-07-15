import { chromium } from 'playwright'

const BASE = 'http://localhost:5183'

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

try {
  // Reuse the most recently created test user isn't possible (random creds), so sign up fresh.
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const user = {
    username: `wrtest_${unique}`.toLowerCase().slice(0, 32),
    email: `wrtest.${unique}@nextventures.mx`,
    password: 'TestPass123!',
  }
  await page.goto(`${BASE}/signup`)
  await page.getByLabel('Nombre de usuario').fill(user.username)
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña').fill(user.password)
  await page.getByRole('button', { name: 'Registrarse' }).click()
  await page.getByRole('heading', { name: 'Tus tableros' }).waitFor({ timeout: 15000 })

  await page.getByRole('button', { name: '+ Crear nuevo tablero' }).click()
  await page.getByLabel('Nombre del tablero').fill('White Rect Board')
  await page.getByRole('button', { name: 'Crear' }).click()
  await page.waitForURL(/\/boards\/[^/]+$/, { timeout: 15000 })

  for (const name of ['List A', 'List B', 'List C', 'List D', 'List E', 'List F', 'List G']) {
    await page.getByLabel('Nombre de la nueva lista').fill(name)
    await page.getByRole('button', { name: 'Agregar lista' }).click()
    await page.getByRole('heading', { name, level: 2, exact: true }).waitFor({ timeout: 10000 })
  }

  const diag1 = await page.evaluate(() => {
    const inner = document.querySelector('div.overflow-x-auto')
    const innerRect = inner.getBoundingClientRect()
    const outer = inner.closest('div.flex.min-h-screen')
    const outerRect = outer ? outer.getBoundingClientRect() : null
    return {
      window: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
      docEl: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
      body: { scrollWidth: document.body.scrollWidth, clientWidth: document.body.clientWidth },
      inner: { scrollWidth: inner.scrollWidth, clientWidth: inner.clientWidth, rect: innerRect },
      outer: outerRect,
    }
  })
  console.log('DIAGNOSTIC BEFORE SCROLL:', JSON.stringify(diag1, null, 2))

  await page.evaluate(() => {
    const inner = document.querySelector('div.overflow-x-auto')
    inner.scrollLeft = inner.scrollWidth
  })
  await page.waitForTimeout(300)

  const diag2 = await page.evaluate(() => {
    const inner = document.querySelector('div.overflow-x-auto')
    const innerRect = inner.getBoundingClientRect()
    const outer = inner.closest('div.flex.min-h-screen')
    const outerRect = outer ? outer.getBoundingClientRect() : null
    const outerStyle = outer ? getComputedStyle(outer) : null
    return {
      window: { innerWidth: window.innerWidth, innerHeight: window.innerHeight, scrollX: window.scrollX },
      docEl: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
      body: { scrollWidth: document.body.scrollWidth, clientWidth: document.body.clientWidth },
      inner: { scrollLeft: inner.scrollLeft, scrollWidth: inner.scrollWidth, clientWidth: inner.clientWidth, rect: innerRect },
      outer: outerRect,
      outerBg: outerStyle ? outerStyle.backgroundColor : null,
    }
  })
  console.log('DIAGNOSTIC AFTER SCROLL:', JSON.stringify(diag2, null, 2))

  await page.screenshot({ path: '/tmp/white-rect-diag.png' })
  console.log('Screenshot saved to /tmp/white-rect-diag.png')
} catch (err) {
  console.error('SCRIPT ERROR:', err)
} finally {
  await browser.close()
}
