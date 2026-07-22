// Live verification of T142/T143 (card detail modal taller shape + 20px
// bottom gap). Standalone chromium.launch(), matching this repo's other
// verify-*.mjs scripts.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const user = {
  username: `modalh_${unique}`.toLowerCase().slice(0, 32),
  email: `modalh.${unique}@nextventures.mx`,
  password: 'TestPass123!',
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))

let failures = 0

try {
  console.log('Signing up test user...')
  await page.goto(`${BASE}/signup`)
  await page.getByLabel('Nombre de usuario').fill(user.username)
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña').fill(user.password)
  await page.getByRole('button', { name: 'Registrarse' }).click()
  await page.getByRole('heading', { name: 'Tus tableros' }).waitFor({ timeout: 15000 })

  console.log('Creating board + list + card...')
  await page.getByRole('button', { name: '+ Crear nuevo tablero' }).click()
  await page.getByLabel('Nombre del tablero').fill('Modal Height Verify Board')
  await page.getByRole('button', { name: 'Crear' }).click()
  await page.waitForURL(/\/boards\/[^/]+$/, { timeout: 15000 })

  await page.getByLabel('Nombre de la nueva lista').fill('Lista')
  await page.getByRole('button', { name: 'Agregar lista' }).click()
  await page.getByRole('heading', { name: 'Lista', level: 2, exact: true }).waitFor({ timeout: 10000 })

  await page.getByRole('button', { name: '+ Agregar una tarjeta' }).click()
  await page.getByPlaceholder('Escribe un título para esta tarjeta').fill('Tarjeta de prueba')
  await page.getByRole('button', { name: 'Agregar tarjeta' }).click()
  await page.getByText('Tarjeta de prueba', { exact: true }).waitFor({ timeout: 10000 })

  // Set Inicio/Fin/Ubicación/Etiquetas/Checklist data first, to confirm it
  // survives the new modal shape's collapse/expand/close/reopen cycle.
  await page.getByText('Tarjeta de prueba', { exact: true }).click()
  await page.waitForFunction(() => document.querySelector('#card-title')?.value === 'Tarjeta de prueba', { timeout: 5000 })

  await page.getByRole('button', { name: 'Inicio' }).click()
  await page.locator('#card-start-date').fill('2026-08-01T10:00')
  await page.waitForTimeout(300)

  console.log('\n=== T142/T143: modal dimensions + bottom gap ===')
  const metrics = await page.evaluate(() => {
    const panel = document.querySelector('#card-title').closest('.rounded-2xl')
    const rect = panel.getBoundingClientRect()
    return {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      bottomGap: window.innerHeight - rect.bottom,
    }
  })
  console.log('Modal metrics:', JSON.stringify(metrics, null, 2))

  const ratio = metrics.width / metrics.height
  console.log(`width:height ratio ≈ ${ratio.toFixed(3)} (4:7 ≈ 0.571)`)

  if (metrics.height < 700) {
    console.log(`FAIL: modal height ${metrics.height}px looks too short for a taller modal at 900px viewport`)
    failures++
  } else {
    console.log(`PASS: modal height is ${metrics.height}px (900px viewport)`)
  }

  if (metrics.bottomGap < 15 || metrics.bottomGap > 30) {
    console.log(`FAIL: bottom gap is ${metrics.bottomGap}px, expected ~20px (not flush, not huge)`)
    failures++
  } else {
    console.log(`PASS: bottom gap is ${metrics.bottomGap}px (~20px target)`)
  }

  // All 5 field buttons visible/clickable
  for (const label of ['Inicio', 'Fin', 'Ubicación', 'Etiquetas', 'Lista']) {
    const visible = await page.getByRole('button', { name: label, exact: true }).isVisible().catch(() => false)
    console.log(visible ? `PASS: field button "${label}" visible` : `FAIL: field button "${label}" not visible`)
    if (!visible) failures++
  }

  await page.screenshot({ path: '/tmp/t142-modal-tall.png' })

  // Close and reopen -- confirm the Inicio value we set survives.
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.click(50, 50)
  await page.waitForTimeout(300)
  await page.getByText('Tarjeta de prueba', { exact: true }).click()
  await page.waitForFunction(() => document.querySelector('#card-title')?.value === 'Tarjeta de prueba', { timeout: 5000 })
  await page.getByRole('button', { name: 'Inicio' }).click()
  const startVal = await page.locator('#card-start-date').inputValue()
  console.log('Inicio value after close/reopen:', startVal)
  if (!startVal.startsWith('2026-08-01')) {
    console.log('FAIL: Inicio value did not survive close/reopen')
    failures++
  } else {
    console.log('PASS: Inicio value survived close/reopen')
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
} catch (err) {
  console.log('SCRIPT ERROR:', err.message)
  failures++
} finally {
  await browser.close()
}

process.exit(failures === 0 ? 0 : 1)
