// Live verification of T093/T094: the calendar-feed Edge Function, now that
// the user has deployed it (supabase functions deploy). Standalone
// chromium.launch() (bare `playwright`) to sign up + create a dated card
// through the real UI, then a direct fetch() against the deployed function
// to confirm the ICS feed actually serves that card, tokens are per-user,
// and regeneration invalidates the old token.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const SUPABASE_URL = env.VITE_SUPABASE_URL

const BASE = 'http://localhost:5173'
const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const userA = {
  username: `feeda_${unique}`.toLowerCase().slice(0, 32),
  email: `feeda.${unique}@nextventures.mx`,
  password: 'TestPass123!',
}
const userB = {
  username: `feedb_${unique}`.toLowerCase().slice(0, 32),
  email: `feedb.${unique}@nextventures.mx`,
  password: 'TestPass123!',
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))

function listColumn(pg, listName) {
  const heading = pg.getByRole('heading', { name: listName, level: 2, exact: true })
  return heading.locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " bg-slate-50 ")][1]',
  )
}

async function signup(pg, user) {
  await pg.goto(`${BASE}/signup`)
  await pg.getByLabel('Nombre de usuario').fill(user.username)
  await pg.getByLabel('Correo electrónico').fill(user.email)
  await pg.getByLabel('Contraseña').fill(user.password)
  await pg.getByRole('button', { name: 'Registrarse' }).click()
  await pg.getByRole('heading', { name: 'Tus tableros' }).waitFor({ timeout: 15000 })
}

async function getFeedUrl(pg) {
  await pg.goto(`${BASE}/calendar`)
  const input = pg.locator('input[readonly]').first()
  await input.evaluate((el) => el.value && el.value !== 'Cargando…', undefined, { timeout: 10000 }).catch(() => {})
  await pg.waitForFunction(
    () => {
      const el = document.querySelector('input[readonly]')
      return el && el.value && el.value !== 'Cargando…'
    },
    { timeout: 10000 },
  )
  return input.inputValue()
}

try {
  console.log('Signing up user A...')
  await signup(page, userA)

  console.log('Creating board + dated card for user A...')
  await page.getByRole('button', { name: '+ Crear nuevo tablero' }).click()
  await page.getByLabel('Nombre del tablero').fill('Feed Verify Board')
  await page.getByRole('button', { name: 'Crear' }).click()
  await page.waitForURL(/\/boards\/[^/]+$/, { timeout: 15000 })

  await page.getByLabel('Nombre de la nueva lista').fill('Fechas')
  await page.getByRole('button', { name: 'Agregar lista' }).click()
  await page.getByRole('heading', { name: 'Fechas', level: 2, exact: true }).waitFor({ timeout: 10000 })

  const col = listColumn(page, 'Fechas')
  await col.getByRole('button', { name: '+ Agregar una tarjeta' }).click()
  await col.getByPlaceholder('Escribe un título para esta tarjeta').fill('Evento del feed ICS')
  await col.getByRole('button', { name: 'Agregar tarjeta' }).click()
  await page.waitForTimeout(500)

  await page.getByText('Evento del feed ICS', { exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('#card-title')?.value === 'Evento del feed ICS',
    { timeout: 5000 },
  )
  await page.locator('#card-start-date').fill('2026-09-01T10:00')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Cerrar' }).click()

  console.log('Fetching feed URL from CalendarPage...')
  const feedUrl = await getFeedUrl(page)
  console.log('Feed URL:', feedUrl)

  console.log('\n--- Fetching the ICS feed directly ---')
  const res = await fetch(feedUrl)
  console.log('Status:', res.status)
  const body = await res.text()
  console.log('Content-Type:', res.headers.get('content-type'))
  const hasCard = body.includes('Evento del feed ICS')
  const hasVevent = body.includes('BEGIN:VEVENT')
  const hasVcalendar = body.includes('BEGIN:VCALENDAR')
  console.log('Contains BEGIN:VCALENDAR:', hasVcalendar)
  console.log('Contains BEGIN:VEVENT:', hasVevent)
  console.log('Contains card title:', hasCard)

  console.log('\n--- Regenerating token: old URL should stop working ---')
  await page.goto(`${BASE}/calendar`)
  await page.getByRole('button', { name: 'Regenerar enlace' }).click()
  await page.waitForTimeout(1000)
  const newFeedUrl = await getFeedUrl(page)
  console.log('New feed URL:', newFeedUrl)
  console.log('URL actually changed:', newFeedUrl !== feedUrl)

  const oldRes = await fetch(feedUrl)
  console.log('Old token status (expect 401/404, not 200):', oldRes.status)
  const newRes = await fetch(newFeedUrl)
  console.log('New token status (expect 200):', newRes.status)
  const newBody = await newRes.text()
  console.log('New token feed still contains the card:', newBody.includes('Evento del feed ICS'))

  console.log('\n--- Cross-user isolation: user B should not see user A\'s card via A\'s token ---')
  console.log('Signing up user B...')
  await signup(page, userB)
  const feedUrlB = await getFeedUrl(page)
  console.log('User B feed URL:', feedUrlB)
  const resB = await fetch(feedUrlB)
  const bodyB = await resB.text()
  console.log('User B feed status:', resB.status)
  console.log('User B feed contains user A\'s card (expect false):', bodyB.includes('Evento del feed ICS'))
  console.log('User B and user A tokens differ:', feedUrlB !== newFeedUrl)

  console.log('\nDONE')
} catch (err) {
  console.error('SCRIPT ERROR:', err)
  await page.screenshot({ path: '/tmp/t093-t094-error.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
