// T028: owner-vs-member permission scenarios. Two independent browser
// contexts stand in for two separate logged-in users so both sides of the
// interaction (owner inviting, member acting, owner re-checking) can be
// observed within a single deterministic test.
//
// The assertions for "member cannot do X" target the exact UI gating that
// T027 built (grepped from BoardPage.tsx / MembersPanel.tsx before writing
// this):
//   - BoardPage.tsx: `isOwner = currentRole === 'owner'`; the board-name <h1>
//     only becomes an editable <input id="board-name"> `onClick` when
//     `isOwner` is true -- for a member, clicking it is a no-op.
//   - MembersPanel.tsx: the invite form is wrapped in `{isOwner && (...)}`;
//     each member row's role <select>/"Remove" button only render when
//     `isOwner && member.user_id !== currentUserId`; "Leave board" only
//     renders when `!isOwner && member.user_id === currentUserId`.
// List/card CRUD (lists, cards, labels, checklists, comments) is
// intentionally NOT owner-gated per T027's note -- it matches T010's RLS,
// which treats any board member as having full content CRUD -- so the
// member is expected to be able to do all of that.
import { test, expect } from '@playwright/test'
import {
  addCard,
  addList,
  autoAcceptDialogs,
  cardItem,
  closeCardModal,
  createBoard,
  makeTestUser,
  openCard,
  openCardField,
  openMembersPanel,
  signUp,
} from './fixtures'

test.describe('owner vs member permissions', () => {
  test('member gets full content CRUD but not owner-only controls; owner retains them; member can self-remove', async ({
    browser,
  }) => {
    const owner = makeTestUser('owner')
    const member = makeTestUser('member')
    const boardName = `Perm Board ${Date.now()}`

    const ownerContext = await browser.newContext()
    const memberContext = await browser.newContext()
    const ownerPage = await ownerContext.newPage()
    const memberPage = await memberContext.newPage()
    autoAcceptDialogs(ownerPage)
    autoAcceptDialogs(memberPage)

    try {
      await test.step('both users sign up', async () => {
        await signUp(ownerPage, owner)
        await signUp(memberPage, member)
      })

      let boardId = ''
      await test.step('user A creates a board and becomes owner', async () => {
        boardId = await createBoard(ownerPage, boardName)
      })

      await test.step('owner invites user B by username via MembersPanel', async () => {
        await openMembersPanel(ownerPage)
        await ownerPage.getByLabel('Invitar por nombre de usuario o correo').fill(member.username)
        await ownerPage.getByRole('button', { name: 'Invitar' }).click()
        await expect(ownerPage.getByText(member.username, { exact: true })).toBeVisible()
        // The new row is a plain member by default (no role-change UI needed
        // to prove this -- MembersPanel renders the role as plain text next
        // to their own row, and as a <select> defaulting to "member" in the
        // owner's row for that user).
        await expect(ownerPage.getByLabel(`Rol de ${member.username}`)).toHaveValue('member')
        await ownerPage.getByRole('button', { name: 'Cerrar' }).click()
      })

      await test.step('member opens the board and can create/edit/delete lists and cards', async () => {
        await memberPage.goto(`/boards/${boardId}`)
        await expect(memberPage.getByRole('heading', { name: boardName, level: 1 })).toBeVisible()

        await addList(memberPage, 'Member List')
        await addCard(memberPage, 'Member List', 'Member Card')

        await openCard(memberPage, 'Member List', 'Member Card')
        const titleInput = memberPage.getByLabel('Título de la tarjeta')
        await titleInput.fill('Member Card edited')
        await titleInput.blur()
        await closeCardModal(memberPage)
        await expect(cardItem(memberPage, 'Member List', 'Member Card edited')).toBeVisible()
      })

      await test.step('member can create labels (from inside a card) and they get auto-assigned', async () => {
        await openCard(memberPage, 'Member List', 'Member Card edited')
        await openCardField(memberPage, 'etiquetas')
        await memberPage.getByLabel('Nueva etiqueta').fill('Member Label')
        await memberPage.getByRole('button', { name: 'Elegir color azul' }).click()
        await memberPage.getByRole('button', { name: 'Agregar etiqueta' }).click()
        // exact: true -- once assigned, the underlying CardItem's label pill
        // (a childless <span title="Member Label">) folds that title into
        // the card button's own accessible name too (see cardItem()'s doc
        // comment in fixtures.ts), so a non-exact match becomes ambiguous.
        await expect(
          memberPage.getByRole('button', { name: 'Member Label', exact: true }),
        ).toHaveAttribute('aria-pressed', 'true')
        await closeCardModal(memberPage)
      })

      await test.step('member can add a checklist and toggle items, and add/delete a comment', async () => {
        await openCard(memberPage, 'Member List', 'Member Card edited')
        await openCardField(memberPage, 'checklist')
        await memberPage.getByLabel('Título de la nueva lista de verificación').fill('Member Checklist')
        await memberPage.getByRole('button', { name: 'Agregar lista de verificación' }).click()
        await memberPage.getByPlaceholder('Agregar un elemento').fill('Member Item')
        await memberPage.getByRole('button', { name: 'Agregar', exact: true }).click()
        // click() + toBeChecked() rather than check(): the checkbox only
        // flips after its Supabase update round-trips (see fixtures.ts's
        // board-flow equivalent for the full explanation).
        const memberItemCheckbox = memberPage.getByLabel('Member Item', { exact: true })
        await memberItemCheckbox.click()
        await expect(memberItemCheckbox).toBeChecked()
        await expect(memberPage.getByText('1/1', { exact: true })).toBeVisible()

        await memberPage.getByLabel('Agregar un comentario').fill('A member comment')
        await memberPage.getByRole('button', { name: 'Comentar' }).click()
        await expect(memberPage.getByText('A member comment')).toBeVisible()
        await memberPage.getByRole('button', { name: 'Eliminar comentario' }).click()
        await expect(memberPage.getByText('A member comment')).toHaveCount(0)
        await closeCardModal(memberPage)
      })

      await test.step('member CANNOT rename the board', async () => {
        const heading = memberPage.getByRole('heading', { name: boardName, level: 1 })
        await heading.click()
        // BoardPage only swaps the <h1> for an <input id="board-name"> when
        // isOwner is true; for a member the click is a no-op.
        await expect(memberPage.getByLabel('Nombre del tablero')).toHaveCount(0)
        await expect(heading).toBeVisible()
      })

      await test.step('member CANNOT see owner-only MembersPanel controls', async () => {
        await openMembersPanel(memberPage)
        await expect(memberPage.getByLabel('Invitar por nombre de usuario o correo')).toHaveCount(0)
        await expect(memberPage.getByLabel(`Rol de ${owner.username}`)).toHaveCount(0)
        await expect(memberPage.getByRole('button', { name: 'Quitar' })).toHaveCount(0)
        // but they DO see their own self-service leave control
        await expect(memberPage.getByRole('button', { name: 'Salir del tablero' })).toBeVisible()
        await memberPage.getByRole('button', { name: 'Cerrar' }).click()
      })

      await test.step('owner retains board rename and MembersPanel management controls', async () => {
        const heading = ownerPage.getByRole('heading', { name: boardName, level: 1 })
        await heading.click()
        const renameInput = ownerPage.getByLabel('Nombre del tablero')
        await expect(renameInput).toBeVisible()
        const renamed = `${boardName} (renamed)`
        await renameInput.fill(renamed)
        await renameInput.blur()
        await expect(ownerPage.getByRole('heading', { name: renamed, level: 1 })).toBeVisible()

        await openMembersPanel(ownerPage)
        await expect(ownerPage.getByLabel('Invitar por nombre de usuario o correo')).toBeVisible()
        await expect(ownerPage.getByLabel(`Rol de ${member.username}`)).toBeVisible()
        await expect(ownerPage.getByRole('button', { name: 'Quitar' })).toBeVisible()
        await ownerPage.getByRole('button', { name: 'Cerrar' }).click()
      })

      await test.step('member leaves the board (self-remove)', async () => {
        await openMembersPanel(memberPage)
        await memberPage.getByRole('button', { name: 'Salir del tablero' }).click()
        // MembersPanel's onLeave prop is wired to navigate('/') in BoardPage.
        await expect(memberPage).toHaveURL('/')
      })

      await test.step('owner sees the member removed from MembersPanel', async () => {
        await ownerPage.reload()
        await openMembersPanel(ownerPage)
        await expect(ownerPage.getByText(member.username, { exact: true })).toHaveCount(0)
      })
    } finally {
      await ownerContext.close()
      await memberContext.close()
    }
  })
})
