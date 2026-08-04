import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { performance } from 'node:perf_hooks'
import { io as createClient, type Socket } from 'socket.io-client'

type BrowserUser = {
  context: BrowserContext
  page: Page
  username: string
}

const browserStudents = 10
const simulatedStudents = Number(process.env.MIXED_SIMULATED_STUDENTS ?? 130)
const totalParticipants = 1 + browserStudents + simulatedStudents
const serverUrl = 'http://127.0.0.1:3001'

const waitForEvent = <T>(socket: Socket, event: string, timeout = 30_000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler)
      reject(new Error(`Timed out waiting for ${event}`))
    }, timeout)
    const handler = (payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    }
    socket.once(event, handler)
  })

const waitUntil = async (description: string, condition: () => boolean, timeout = 30_000) => {
  const deadline = performance.now() + timeout
  while (!condition()) {
    if (performance.now() > deadline) throw new Error(`Timed out waiting for ${description}`)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

async function connectSimulatedStudent(roomId: string, index: number) {
  const username = `simulated-${index}`
  const socket = createClient(serverUrl, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    auth: { token: `student:${username}` },
  })
  await waitForEvent(socket, 'connect')
  const roomState = waitForEvent<{ participants: unknown[] }>(socket, 'room_state')
  socket.emit('join_room', {
    roomId,
    user: { id: 'untrusted', username, role: 'student', status: 'online' },
  })
  await roomState
  return socket
}

async function joinBrowser(page: Page, roomId: string, role: 'teacher' | 'student', username: string) {
  await page.goto('/')
  await page.getByLabel('Room ID').fill(roomId)
  await page.getByLabel('Display name').fill(username)
  await page.getByLabel('Role').selectOption(role)
  await page.getByLabel('Auth token').fill(`${role}:${username}`)
  await page.getByRole('button', { name: 'Join without media' }).click()
  await expect(page.getByText('Live session')).toBeVisible()
}

test('@mixed one teacher and ten browser students remain interactive with 130 simulated students', async ({ browser }, testInfo) => {
  test.setTimeout(240_000)
  expect(Number.isInteger(simulatedStudents) && simulatedStudents > 0).toBe(true)

  const roomId = `mixed-capacity-${Date.now()}`
  const sockets: Socket[] = []
  const browserUsers: BrowserUser[] = []
  const pageErrors: string[] = []
  const metrics: Record<string, number> = {}

  const createBrowserUser = async (role: 'teacher' | 'student', username: string) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.on('pageerror', error => pageErrors.push(`${username}: ${error.message}`))
    browserUsers.push({ context, page, username })
    await joinBrowser(page, roomId, role, username)
    return page
  }

  try {
    const simulatedAdmissionStarted = performance.now()
    for (let offset = 0; offset < simulatedStudents; offset += 20) {
      const batchSize = Math.min(20, simulatedStudents - offset)
      sockets.push(...await Promise.all(Array.from({ length: batchSize }, (_, index) =>
        connectSimulatedStudent(roomId, offset + index + 1))))
    }
    metrics.simulatedAdmissionMs = Math.round(performance.now() - simulatedAdmissionStarted)

    const browserAdmissionStarted = performance.now()
    const [teacher, ...students] = await Promise.all([
      createBrowserUser('teacher', 'mixed-teacher'),
      ...Array.from({ length: browserStudents }, (_, index) =>
        createBrowserUser('student', `browser-student-${index + 1}`)),
    ])
    metrics.browserAdmissionMs = Math.round(performance.now() - browserAdmissionStarted)

    await Promise.all([teacher, ...students].map(page =>
      expect(page.getByText(`${totalParticipants} participants`)).toBeVisible({ timeout: 30_000 })))
    await expect(teacher.locator('.person')).toHaveCount(totalParticipants)

    let simulatedChatRecipients = 0
    sockets.forEach(socket => socket.once('new_message', () => { simulatedChatRecipients += 1 }))
    const browserChatStarted = performance.now()
    await teacher.getByPlaceholder('Message the classroom…').fill('hello from the mixed-capacity teacher')
    await teacher.getByRole('button', { name: 'Send message' }).click()
    await waitUntil('teacher chat delivery to simulated students',
      () => simulatedChatRecipients === simulatedStudents)
    await Promise.all(students.map(student => expect(student.locator('.chat-message').filter({
      hasText: 'hello from the mixed-capacity teacher',
    })).toHaveCount(1)))
    metrics.browserChatFanoutMs = Math.round(performance.now() - browserChatStarted)

    const simulatedChatStarted = performance.now()
    sockets[0].emit('send_message', {
      roomId,
      message: {
        userId: 'untrusted',
        username: 'untrusted',
        content: 'hello from a simulated student',
      },
    })
    await Promise.all([teacher, ...students].map(page => expect(page.locator('.chat-message').filter({
      hasText: 'hello from a simulated student',
    })).toHaveCount(1)))
    metrics.simulatedChatFanoutMs = Math.round(performance.now() - simulatedChatStarted)

    const handRaiseStarted = performance.now()
    sockets.forEach((socket, index) => socket.emit('raise_hand', {
      roomId,
      userId: `dev-student-simulated-${index + 1}`,
    }))
    await expect(teacher.getByText('Hand raised')).toHaveCount(simulatedStudents, { timeout: 30_000 })
    metrics.handRaiseFanoutMs = Math.round(performance.now() - handRaiseStarted)

    let simulatedMuteRecipients = 0
    sockets.forEach(socket => socket.once('mute_all', () => { simulatedMuteRecipients += 1 }))
    const muteStarted = performance.now()
    await teacher.getByRole('button', { name: 'Mute all' }).click()
    await waitUntil('mute-all delivery to simulated students',
      () => simulatedMuteRecipients === simulatedStudents)
    await Promise.all(students.map(student => expect(student.getByRole('button', { name: 'Unmute' })).toBeVisible()))
    metrics.muteAllFanoutMs = Math.round(performance.now() - muteStarted)

    const disconnectCount = Math.ceil(simulatedStudents * 0.1)
    const disconnectStarted = performance.now()
    sockets.splice(-disconnectCount).forEach(socket => socket.disconnect())
    const remainingParticipants = totalParticipants - disconnectCount
    await Promise.all([teacher, ...students].map(page =>
      expect(page.getByText(`${remainingParticipants} participants`)).toBeVisible({ timeout: 30_000 })))
    metrics.disconnectCleanupMs = Math.round(performance.now() - disconnectStarted)

    await teacher.screenshot({ path: testInfo.outputPath('mixed-capacity-teacher.png'), fullPage: true })
    const report = {
      browserStudents,
      simulatedStudents,
      peakParticipants: totalParticipants,
      ...metrics,
    }
    console.log(`Mixed capacity metrics: ${JSON.stringify(report)}`)
    await testInfo.attach('mixed-capacity-metrics', {
      body: Buffer.from(JSON.stringify(report, null, 2)),
      contentType: 'application/json',
    })
    expect(pageErrors).toEqual([])
  } finally {
    sockets.forEach(socket => socket.disconnect())
    for (const user of browserUsers) await user.context.close()
  }
})
