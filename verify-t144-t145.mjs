// Live verification of T144 (password show/hide toggle on Signup + Login)
// and T145 (signup rejects letters-only/numbers-only passwords, requires a
// mix). Standalone chromium.launch(), matching this repo's other
// verify-*.mjs scripts (see verify-t142-t143.mjs).
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))

let failures = 0

function check(label, cond) {
  console.log(cond ? `PASS: ${label}` : `FAIL: ${label}`)
  if (!cond) failures++
}

try {
  // --- T144 on the signup page ---
  console.log('\n=== T144: password toggle on SignupPage ===')
  await page.goto(`${BASE}/signup`)
  const signupPwInput = page.getByLabel('Contraseña', { exact: true })
  check('signup password input starts as type=password', (await signupPwInput.getAttribute('type')) === 'password')

  await signupPwInput.fill('SecretVal123')
  const signupToggle = page.getByRole('button', { name: /Mostrar contraseña/ })
  await signupToggle.click()
  check('signup password input becomes type=text after toggle click', (await signupPwInput.getAttribute('type')) === 'text')
  check('signup password value visible/unchanged after toggle', (await signupPwInput.inputValue()) === 'SecretVal123')

  await page.getByRole('button', { name: /Ocultar contraseña/ }).click()
  check('signup password input reverts to type=password after second toggle click', (await signupPwInput.getAttribute('type')) === 'password')

  // --- T144 on the login page ---
  console.log('\n=== T144: password toggle on LoginPage ===')
  await page.goto(`${BASE}/login`)
  const loginPwInput = page.getByLabel('Contraseña', { exact: true })
  check('login password input starts as type=password', (await loginPwInput.getAttribute('type')) === 'password')

  await loginPwInput.fill('AnotherSecret9')
  const loginToggle = page.getByRole('button', { name: /Mostrar contraseña/ })
  await loginToggle.click()
  check('login password input becomes type=text after toggle click', (await loginPwInput.getAttribute('type')) === 'text')
  check('login password value visible/unchanged after toggle', (await loginPwInput.inputValue()) === 'AnotherSecret9')

  await page.getByRole('button', { name: /Ocultar contraseña/ }).click()
  check('login password input reverts to type=password after second toggle click', (await loginPwInput.getAttribute('type')) === 'password')

  // Independence: toggling on one page's earlier visit didn't leak into the
  // other (each page starts fresh at type=password above), already covered.

  // --- T145: reject letters-only password ---
  console.log('\n=== T145: signup password strength rule ===')

  async function attemptSignup(passwordValue, emailLocalPart) {
    await page.goto(`${BASE}/signup`)
    let signUpCalled = false
    await page.route('**/auth/v1/signup**', (route) => {
      signUpCalled = true
      route.continue()
    })
    await page.getByLabel('Nombre de usuario').fill(`t145_${unique}`.slice(0, 32))
    await page.getByLabel('Correo electrónico').fill(`${emailLocalPart}.${unique}@nextventures.mx`)
    await page.getByLabel('Contraseña', { exact: true }).fill(passwordValue)
    await page.getByRole('button', { name: 'Registrarse' }).click()
    await page.waitForTimeout(500)
    const errorText = await page.locator('p.text-danger').textContent().catch(() => null)
    await page.unroute('**/auth/v1/signup**')
    return { signUpCalled, errorText, url: page.url() }
  }

  const lettersOnly = await attemptSignup('abcdefgh', 'lettersonly')
  check('all-letters password rejected client-side (signUp never called)', lettersOnly.signUpCalled === false)
  check(
    'all-letters password shows expected Spanish error',
    !!lettersOnly.errorText && lettersOnly.errorText.includes('La contraseña debe contener letras y números'),
  )
  check('all-letters password: still on /signup (no navigation)', lettersOnly.url.includes('/signup'))
  console.log('  error shown:', lettersOnly.errorText)

  const numbersOnly = await attemptSignup('12345678', 'numbersonly')
  check('all-numbers password rejected client-side (signUp never called)', numbersOnly.signUpCalled === false)
  check(
    'all-numbers password shows expected Spanish error',
    !!numbersOnly.errorText && numbersOnly.errorText.includes('La contraseña debe contener letras y números'),
  )
  check('all-numbers password: still on /signup (no navigation)', numbersOnly.url.includes('/signup'))
  console.log('  error shown:', numbersOnly.errorText)

  // --- T145: accept mixed password, full signup succeeds ---
  console.log('\n=== T145: mixed letters+numbers password is accepted ===')
  await page.goto(`${BASE}/signup`)
  const mixedUser = {
    username: `t145mix_${unique}`.toLowerCase().slice(0, 32),
    email: `t145mix.${unique}@nextventures.mx`,
    password: 'abc123def',
  }
  await page.getByLabel('Nombre de usuario').fill(mixedUser.username)
  await page.getByLabel('Correo electrónico').fill(mixedUser.email)
  await page.getByLabel('Contraseña', { exact: true }).fill(mixedUser.password)
  await page.getByRole('button', { name: 'Registrarse' }).click()
  const reachedDashboard = await page
    .getByRole('heading', { name: 'Tus tableros' })
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false)
  check('mixed letters+numbers password: signup succeeds, reaches "Tus tableros"', reachedDashboard)
  console.log('  test user created (needs manual DB cleanup):', mixedUser.email)

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
} catch (err) {
  console.log('SCRIPT ERROR:', err.message)
  failures++
} finally {
  await browser.close()
}

process.exit(failures === 0 ? 0 : 1)
