// Live verification of T080-T088 (per-member board backgrounds, T084; and
// realtime card-complete sync + task-completion notifications, T088) via two
// isolated browser contexts standing in for two separate logged-in members --
// same standalone chromium.launch() technique as verify-dnd.mjs, bypassing
// the shared/contended MCP browser.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5176'
const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const owner = {
  username: `bgowner_${unique}`.toLowerCase().slice(0, 32),
  email: `bgowner.${unique}@nextventures.mx`,
  password: 'TestPass123!',
}
const member = {
  username: `bgmember_${unique}`.toLowerCase().slice(0, 32),
  email: `bgmember.${unique}@nextventures.mx`,
  password: 'TestPass123!',
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const memberCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const ownerPage = await ownerCtx.newPage()
const memberPage = await memberCtx.newPage()
for (const [label, page] of [['OWNER', ownerPage], ['MEMBER', memberPage]]) {
  page.on('pageerror', (err) => console.log(`${label} PAGE ERROR:`, err.message))
}

function listColumn(page, listName) {
  const heading = page.getByRole('heading', { name: listName, level: 2, exact: true })
  return heading.locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " bg-slate-50 ")][1]',
  )
}
function cardItem(page, listName, cardTitle) {
  // Allows an optional "✓" (rendered once the card is marked complete,
  // between the title and the trailing created_at timestamp) so this still
  // matches after the checkmark toggle -- see fixtures.ts's cardItem() for
  // the same trailing-timestamp allowance this is built on.
  return listColumn(page, listName)
    .getByRole('button')
    .filter({ hasText: new RegExp(`^${cardTitle}(✓)?(\\s*\\d.*)?$`) })
}

async function signup(page, user) {
  await page.goto(`${BASE}/signup`)
  await page.getByLabel('Nombre de usuario').fill(user.username)
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña').fill(user.password)
  await page.getByRole('button', { name: 'Registrarse' }).click()
  await page.getByRole('heading', { name: 'Tus tableros' }).waitFor({ timeout: 15000 })
}

// The bare `playwright` package's locator.isVisible() has no real polling
// wait (unlike @playwright/test's expect().toBeVisible()) -- roll a small
// poll loop instead of trusting an {timeout} option that may be silently
// ignored.
async function waitForCondition(fn, { timeout = 8000, interval = 300 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await fn().catch(() => false)) return true
    await new Promise((r) => setTimeout(r, interval))
  }
  return false
}

async function bgColor(page) {
  return page.evaluate(() => {
    const el = document.querySelector('div.min-h-screen.flex-col')
    return el ? getComputedStyle(el).backgroundColor : null
  })
}

try {
  console.log('Signing up member first (so the owner can invite them by email)...')
  await signup(memberPage, member)
  console.log('Signing up owner...')
  await signup(ownerPage, owner)

  console.log('Owner creating board...')
  await ownerPage.getByRole('button', { name: '+ Crear nuevo tablero' }).click()
  await ownerPage.getByLabel('Nombre del tablero').fill('BG/Realtime Verify Board')
  await ownerPage.getByRole('button', { name: 'Crear' }).click()
  await ownerPage.waitForURL(/\/boards\/[^/]+$/, { timeout: 15000 })
  const boardUrl = ownerPage.url()
  console.log('Board created:', boardUrl)

  console.log('Owner inviting member by email...')
  await ownerPage.getByRole('button', { name: 'Miembros' }).click()
  await ownerPage.getByLabel('Invitar por nombre de usuario o correo').fill(member.email)
  await ownerPage.getByRole('button', { name: 'Invitar' }).click()
  await ownerPage.getByText(member.username).first().waitFor({ timeout: 10000 })
  await ownerPage.getByRole('button', { name: 'Cerrar' }).click()
  await ownerPage.mouse.click(5, 5) // close panel (click outside)

  // Lists themselves aren't Realtime-synced (only cards are, per T085's
  // scope) -- create the "Tareas" list now, before the member's first page
  // load, so it's already part of their initial fetch. Only a *card* added
  // to this already-known list later is a fair test of the cards Realtime
  // subscription.
  console.log('Owner creating the "Tareas" list before the member ever loads the board...')
  await ownerPage.getByLabel('Nombre de la nueva lista').fill('Tareas')
  await ownerPage.getByRole('button', { name: 'Agregar lista' }).click()
  await ownerPage.getByRole('heading', { name: 'Tareas', level: 2, exact: true }).waitFor({ timeout: 10000 })

  console.log('Member navigating to the board...')
  await memberPage.goto(boardUrl)
  await memberPage.getByRole('heading', { name: 'BG/Realtime Verify Board' }).waitFor({ timeout: 10000 })

  // ================= T084: per-member board backgrounds =================
  console.log('\n--- T084: per-member board backgrounds ---')

  console.log('Owner sets board-wide background color (blue)...')
  await ownerPage.getByRole('button', { name: 'Fondo' }).click()
  await ownerPage.locator('#background-color').fill('#0000ff')
  await ownerPage.getByRole('button', { name: 'Aplicar color' }).click()
  await ownerPage.waitForTimeout(800)
  await ownerPage.getByRole('button', { name: 'Cerrar' }).click()

  console.log('Member sets a personal override color (red) via "Mi fondo personalizado"...')
  await memberPage.getByRole('button', { name: 'Fondo' }).click()
  await memberPage.getByRole('heading', { name: 'Mi fondo personalizado' }).waitFor({ timeout: 5000 })
  await memberPage.locator('#my-background-color').fill('#ff0000')
  await memberPage.getByRole('button', { name: 'Aplicar', exact: true }).click()
  await memberPage.waitForTimeout(800)
  await memberPage.getByRole('button', { name: 'Cerrar' }).click()

  const ownerColorBefore = await bgColor(ownerPage)
  const memberColorBefore = await bgColor(memberPage)
  console.log('Owner sees board color:', ownerColorBefore, '(expect blue rgb(0, 0, 255))')
  console.log('Member sees own override:', memberColorBefore, '(expect red rgb(255, 0, 0))')

  await ownerPage.screenshot({ path: '/tmp/t084-owner-blue.png' })
  await memberPage.screenshot({ path: '/tmp/t084-member-red.png' })

  console.log('Reloading both and confirming persistence...')
  await ownerPage.reload()
  await memberPage.reload()
  await ownerPage.getByRole('button', { name: 'Fondo' }).waitFor({ timeout: 10000 })
  await memberPage.getByRole('button', { name: 'Fondo' }).waitFor({ timeout: 10000 })
  console.log('Owner after reload:', await bgColor(ownerPage))
  console.log('Member after reload:', await bgColor(memberPage))

  console.log('Owner changes board background to green -- member override should NOT change...')
  await ownerPage.getByRole('button', { name: 'Fondo' }).click()
  await ownerPage.locator('#background-color').fill('#00ff00')
  await ownerPage.getByRole('button', { name: 'Aplicar color' }).click()
  await ownerPage.waitForTimeout(800)
  await ownerPage.getByRole('button', { name: 'Cerrar' }).click()
  await memberPage.reload()
  await memberPage.getByRole('button', { name: 'Fondo' }).waitFor({ timeout: 10000 })
  console.log('Owner now sees:', await bgColor(ownerPage), '(expect green)')
  console.log('Member still sees own override after owner change:', await bgColor(memberPage), '(expect still red)')

  console.log('Member clears their override -- should revert to owner\'s (green) background...')
  await memberPage.getByRole('button', { name: 'Fondo' }).click()
  await memberPage.getByRole('button', { name: 'Quitar' }).click()
  await memberPage.waitForTimeout(800)
  await memberPage.getByRole('button', { name: 'Cerrar' }).click()
  console.log('Member after clearing override:', await bgColor(memberPage), '(expect green, matching owner)')

  // ================= T088: realtime completion + notification =================
  console.log('\n--- T088: realtime card completion sync + notification ---')

  console.log('Owner adding a card to the already-shared "Tareas" list...')
  const ownerCol = listColumn(ownerPage, 'Tareas')
  await ownerCol.getByRole('button', { name: '+ Agregar una tarjeta' }).click()
  await ownerCol.getByPlaceholder('Escribe un título para esta tarjeta').fill('Realtime Task')
  await ownerCol.getByRole('button', { name: 'Agregar tarjeta' }).click()
  await cardItem(ownerPage, 'Tareas', 'Realtime Task').waitFor({ timeout: 10000 })
  console.log('Card created by owner.')

  console.log('Waiting for the card to appear on the member\'s already-open board via Realtime INSERT...')
  await cardItem(memberPage, 'Tareas', 'Realtime Task').waitFor({ timeout: 8000 })
  console.log('Member saw the new card appear live, no reload.')

  console.log('Member marks the card complete...')
  await cardItem(memberPage, 'Tareas', 'Realtime Task')
    .getByRole('button', { name: 'Marcar como completada', exact: true })
    .click()
  await memberPage.waitForTimeout(500)

  const memberOwnCardComplete = await cardItem(memberPage, 'Tareas', 'Realtime Task')
    .getByRole('button', { name: 'Marcar como no completada', exact: true })
    .isVisible()
    .catch(() => false)
  console.log('DEBUG: member\'s own view shows the card as complete right after clicking:', memberOwnCardComplete)

  console.log('Waiting for owner\'s already-open board to reflect the completion via Realtime UPDATE...')
  const ownerCardCompleteVisible = await waitForCondition(() =>
    cardItem(ownerPage, 'Tareas', 'Realtime Task')
      .getByRole('button', { name: 'Marcar como no completada', exact: true })
      .isVisible(),
  )
  console.log('Owner sees the card as complete live, no reload:', ownerCardCompleteVisible)

  console.log('Checking owner got a task_completed notification (and member did not get one for their own action)...')
  await ownerPage.waitForTimeout(1000)

  await ownerPage.getByRole('button', { name: 'Notificaciones' }).click()
  await ownerPage.getByRole('heading', { name: 'Notificaciones' }).waitFor({ timeout: 5000 })
  const ownerNotifText = await ownerPage.getByText(/fue marcada como completada por/).first().textContent().catch(() => null)
  console.log('Owner notification message:', ownerNotifText)

  await memberPage.getByRole('button', { name: 'Notificaciones' }).click()
  await memberPage.getByRole('heading', { name: 'Notificaciones' }).waitFor({ timeout: 5000 })
  const memberSelfNotif = await memberPage.getByText(/fue marcada como completada por/).count().catch(() => 0)
  console.log('Member notifications containing "fue marcada como completada por" (expect 0, own action):', memberSelfNotif)

  console.log('Reloading both, confirming persisted state...')
  await ownerPage.reload()
  await memberPage.reload()
  await ownerPage.getByRole('button', { name: 'Fondo' }).waitFor({ timeout: 10000 })
  await memberPage.getByRole('button', { name: 'Fondo' }).waitFor({ timeout: 10000 })
  const ownerPersistedComplete = await cardItem(ownerPage, 'Tareas', 'Realtime Task')
    .getByRole('button', { name: 'Marcar como no completada', exact: true })
    .isVisible()
    .catch(() => false)
  console.log('Owner sees card still complete after reload:', ownerPersistedComplete)

  console.log('\nDONE')
} catch (err) {
  console.error('SCRIPT ERROR:', err)
  await ownerPage.screenshot({ path: '/tmp/t080-t088-owner-error.png' }).catch(() => {})
  await memberPage.screenshot({ path: '/tmp/t080-t088-member-error.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
