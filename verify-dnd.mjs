import { chromium } from 'playwright'

const BASE = 'http://localhost:5183'
const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const user = {
  username: `dndtest_${unique}`.toLowerCase().slice(0, 32),
  email: `dndtest.${unique}@nextventures.mx`,
  password: 'TestPass123!',
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text())
})
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))

async function dragTo(source, target) {
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox) throw new Error('missing bounding box')
  const startX = sourceBox.x + sourceBox.width / 2
  const startY = sourceBox.y + sourceBox.height / 2
  const endX = targetBox.x + targetBox.width / 2
  const endY = targetBox.y + targetBox.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 15, startY + 15, { steps: 5 })
  await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 10 })
  return { endX, endY }
}

try {
  console.log('Signing up test user', user.email)
  await page.goto(`${BASE}/signup`)
  await page.getByLabel('Nombre de usuario').fill(user.username)
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña').fill(user.password)
  await page.getByRole('button', { name: 'Registrarse' }).click()
  await page.getByRole('heading', { name: 'Tus tableros' }).waitFor({ timeout: 15000 })
  console.log('Signed up OK')

  console.log('Creating board')
  await page.getByRole('button', { name: '+ Crear nuevo tablero' }).click()
  await page.getByLabel('Nombre del tablero').fill('DnD Verify Board')
  await page.getByRole('button', { name: 'Crear' }).click()
  await page.waitForURL(/\/boards\/[^/]+$/, { timeout: 15000 })
  console.log('Board created:', page.url())

  // Create enough lists to force horizontal overflow
  const listNames = ['List A', 'List B', 'List C', 'List D', 'List E', 'List F', 'List G']
  for (const name of listNames) {
    await page.getByLabel('Nombre de la nueva lista').fill(name)
    await page.getByRole('button', { name: 'Agregar lista' }).click()
    await page.getByRole('heading', { name, level: 2, exact: true }).waitFor({ timeout: 10000 })
  }
  console.log('Lists created')

  function listColumn(listName) {
    const heading = page.getByRole('heading', { name: listName, level: 2, exact: true })
    return heading.locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " bg-slate-50 ")][1]',
    )
  }

  // Add a couple cards to List A
  const colA = listColumn('List A')
  await colA.getByRole('button', { name: '+ Agregar una tarjeta' }).click()
  await colA.getByPlaceholder('Escribe un título para esta tarjeta').fill('Drag Me Card')
  await colA.getByRole('button', { name: 'Agregar tarjeta' }).click()
  await colA.getByRole('button', { name: '+ Agregar una tarjeta' }).click()
  await colA.getByPlaceholder('Escribe un título para esta tarjeta').fill('Second Card')
  await colA.getByRole('button', { name: 'Agregar tarjeta' }).click()
  console.log('Cards added to List A')

  // === BUG 1: mid-drag disappearing card ===
  const source = colA.getByRole('button').filter({ hasText: /^Drag Me Card(\s*\d.*)?$/ })
  const colC = listColumn('List C')
  const { endX, endY } = await dragTo(source, colC)
  // Now hover midway into List C, mid-drag, take a screenshot BEFORE releasing.
  await page.mouse.move(endX, endY, { steps: 10 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: '/tmp/dnd-mid-drag.png' })
  console.log('Mid-drag screenshot saved to /tmp/dnd-mid-drag.png')

  // Check the drag overlay preview text is visible on screen (proves it's not invisible/clipped)
  const overlayVisible = await page.getByText('Drag Me Card', { exact: false }).first().isVisible().catch(() => false)
  console.log('Some "Drag Me Card" text visible mid-drag:', overlayVisible)

  await page.mouse.up()
  await page.waitForTimeout(500)
  await page.screenshot({ path: '/tmp/dnd-after-drop.png' })

  const nowInC = await colC.getByRole('button').filter({ hasText: /^Drag Me Card(\s*\d.*)?$/ }).isVisible().catch(() => false)
  console.log('Card ended up visible in List C after drop:', nowInC)

  // === BUG 2: white rectangle after scrolling right ===
  const scrollContainer = page.locator('div.overflow-x-auto').first()
  const before = await scrollContainer.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
  console.log('Scroll container dims BEFORE extra drags:', before)

  // Do a few more cross-list drags near the far right to see if scrollWidth balloons
  await colA.getByRole('button', { name: '+ Agregar una tarjeta' }).click()
  await colA.getByPlaceholder('Escribe un título para esta tarjeta').fill('Third Card')
  await colA.getByRole('button', { name: 'Agregar tarjeta' }).click()

  const colG = listColumn('List G')
  await scrollContainer.evaluate((el) => { el.scrollLeft = el.scrollWidth })
  await page.waitForTimeout(200)

  const source2 = colA.getByRole('button').filter({ hasText: /^Third Card(\s*\d.*)?$/ })
  await dragTo(source2, colG)
  await page.mouse.move(1270, 400, { steps: 10 })
  await page.waitForTimeout(300)
  await page.mouse.up()
  await page.waitForTimeout(500)

  const after = await scrollContainer.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
  console.log('Scroll container dims AFTER cross-list drag near edge:', after)

  await scrollContainer.evaluate((el) => { el.scrollLeft = el.scrollWidth })
  await page.waitForTimeout(300)
  await page.screenshot({ path: '/tmp/dnd-scrolled-right.png' })
  console.log('Scrolled-right screenshot saved to /tmp/dnd-scrolled-right.png')

  console.log('DONE')
} catch (err) {
  console.error('SCRIPT ERROR:', err)
  await page.screenshot({ path: '/tmp/dnd-error.png' }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
