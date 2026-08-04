import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { stat } from 'node:fs/promises'

type ClassroomUser = {
  context: BrowserContext
  page: Page
  username: string
}

const studentCount = 10

test('development token follows the selected role and display name', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByLabel('Display name').fill('Greg')
  await page.getByLabel('Role').selectOption('student')
  await expect(page.getByLabel('Auth token')).toHaveValue('student:Greg')
  await page.screenshot({ path: testInfo.outputPath('greg-development-identity.png'), fullPage: true })
})

async function joinClassroom(
  page: Page,
  role: 'teacher' | 'student',
  username: string,
  roomId = 'clinical-skills-101',
  withMedia = false,
) {
  await page.goto('/')
  await page.getByLabel('Room ID').fill(roomId)
  await page.getByLabel('Display name').fill(username)
  await page.getByLabel('Role').selectOption(role)
  await page.getByLabel('Auth token').fill(`${role}:${username}`)
  await page.getByRole('button', { name: withMedia ? 'Join with camera' : 'Join without media' }).click()
  await expect(page.getByText('Live session')).toBeVisible()
}

test('one teacher moderates ten simultaneous students', async ({ browser }, testInfo) => {
  const errors: string[] = []
  const users: ClassroomUser[] = []

  const createUser = async (role: 'teacher' | 'student', username: string) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(`${username}: ${error.message}`))
    users.push({ context, page, username })
    await joinClassroom(page, role, username)
    return page
  }

  try {
    const teacherPromise = createUser('teacher', 'teacher')
    const studentPromises = Array.from({ length: studentCount }, (_, index) =>
      createUser('student', `student-${index + 1}`))
    const [teacher, ...students] = await Promise.all([teacherPromise, ...studentPromises])

    await expect(teacher.getByText(`${studentCount + 1} participants`)).toBeVisible()
    await expect(teacher.locator('.person')).toHaveCount(studentCount + 1)

    const teacherRow = teacher.locator('.person').filter({ has: teacher.getByText('teacher', { exact: true }) })
    await expect(teacherRow.getByRole('button', { name: 'Remove' })).toHaveCount(0)

    await students[0].getByPlaceholder('Message the classroom…').fill('Hello from student 1')
    await students[0].getByRole('button', { name: 'Send message' }).click()
    await expect(teacher.locator('.chat-message').filter({ hasText: 'Hello from student 1' })).toHaveCount(1)
    await Promise.all(students.map(student =>
      expect(student.locator('.chat-message').filter({ hasText: 'Hello from student 1' })).toHaveCount(1)))

    await Promise.all(students.map(student => student.getByRole('button', { name: 'Raise hand' }).click()))
    await expect(teacher.getByText('Hand raised')).toHaveCount(studentCount)

    await teacher.getByRole('button', { name: 'Mute all' }).click()
    await Promise.all(students.map(student => expect(student.getByRole('button', { name: 'Unmute' })).toBeVisible()))

    await students[0].getByRole('button', { name: 'Unmute' }).click()
    const firstStudentRow = teacher.locator('.person').filter({
      has: teacher.getByText('student-1', { exact: true }),
    })
    await firstStudentRow.getByRole('button', { name: 'Mute' }).click()
    await expect(students[0].getByRole('button', { name: 'Unmute' })).toBeVisible()

    const lastStudentRow = teacher.locator('.person').filter({
      has: teacher.getByText(`student-${studentCount}`, { exact: true }),
    })
    teacher.once('dialog', dialog => dialog.accept())
    await lastStudentRow.getByRole('button', { name: 'Remove' }).click()
    await expect(students.at(-1)!.getByText('You were removed: Removed by instructor')).toBeVisible()
    await expect(teacher.getByText(`${studentCount} participants`)).toBeVisible()
    await expect(teacher.locator('.person')).toHaveCount(studentCount)

    await teacher.screenshot({
      path: testInfo.outputPath('teacher-with-ten-students.png'),
      fullPage: true,
    })
    expect(errors).toEqual([])
  } finally {
    for (const user of users) await user.context.close()
  }
})

test('a late student receives chat history and subsequent messages', async ({ browser }) => {
  const teacherContext = await browser.newContext({ permissions: ['camera', 'microphone'] })
  const studentContext = await browser.newContext()
  const teacher = await teacherContext.newPage()
  const student = await studentContext.newPage()
  const roomId = `chat-history-${Date.now()}`

  try {
    await joinClassroom(teacher, 'teacher', 'history-teacher', roomId, true)
    await teacher.getByPlaceholder('Message the classroom…').fill('hello')
    await teacher.getByRole('button', { name: 'Send message' }).click()
    await expect(teacher.locator('.chat-message')).toHaveCount(1)

    await joinClassroom(student, 'student', 'history-student', roomId)
    await expect(student.locator('.chat-message')).toHaveCount(1)
    await expect(student.locator('.chat-message').filter({ hasText: 'hello' })).toHaveCount(1)

    await student.getByPlaceholder('Message the classroom…').fill('hi')
    await student.getByRole('button', { name: 'Send message' }).click()
    await expect(teacher.locator('.chat-message')).toHaveCount(2)
    await expect(student.locator('.chat-message')).toHaveCount(2)
    await expect(teacher.locator('.chat-message p').getByText('hi', { exact: true })).toHaveCount(1)
    await expect(student.locator('.chat-message p').getByText('hi', { exact: true })).toHaveCount(1)
  } finally {
    await teacherContext.close()
    await studentContext.close()
  }
})

test('teacher and student receive each other media', async ({ browser }, testInfo) => {
  const errors: string[] = []
  const teacherContext = await browser.newContext({ permissions: ['camera', 'microphone'] })
  await teacherContext.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas')
        canvas.width = 640
        canvas.height = 360
        const context = canvas.getContext('2d')
        context?.fillRect(0, 0, canvas.width, canvas.height)
        ;(window as typeof window & { testDisplayCanvas?: HTMLCanvasElement }).testDisplayCanvas = canvas
        return canvas.captureStream(10)
      },
    })
  })
  const studentContext = await browser.newContext({ permissions: ['camera', 'microphone'] })
  const teacher = await teacherContext.newPage()
  const student = await studentContext.newPage()
  teacher.on('pageerror', error => errors.push(`teacher: ${error.message}`))
  student.on('pageerror', error => errors.push(`student: ${error.message}`))
  const roomId = `media-${Date.now()}`
  let teacherClosed = false

  try {
    await joinClassroom(teacher, 'teacher', 'media-teacher', roomId, true)
    await joinClassroom(student, 'student', 'media-student', roomId, true)

    await expect(teacher.getByText('2 participants')).toBeVisible()
    await expect(student.getByText('2 participants')).toBeVisible()
    await expect(teacher.locator('.video-card:not(.local):not(.empty) video')).toHaveCount(1)
    await expect(student.locator('.video-card:not(.local):not(.empty) video')).toHaveCount(1)
    await expect.poll(() => teacher.locator('.video-card:not(.local):not(.empty) video').evaluateAll(
      videos => videos.every(video => (video as HTMLVideoElement).srcObject instanceof MediaStream),
    )).toBe(true)
    await expect.poll(() => student.locator('.video-card:not(.local):not(.empty) video').evaluateAll(
      videos => videos.every(video => (video as HTMLVideoElement).srcObject instanceof MediaStream),
    )).toBe(true)

    await teacher.locator('.media-bar button').filter({ hasText: 'Mute' }).click()
    await expect(teacher.locator('.media-bar button').filter({ hasText: 'Unmute' })).toBeVisible()
    await expect.poll(() => teacher.locator('.video-card.local video').evaluate(video =>
      ((video as HTMLVideoElement).srcObject as MediaStream).getAudioTracks()[0]?.enabled)).toBe(false)
    await teacher.locator('.media-bar button').filter({ hasText: 'Unmute' }).click()

    await teacher.getByRole('button', { name: 'Camera' }).click()
    await expect(teacher.getByRole('button', { name: 'Start camera' })).toBeVisible()
    await expect.poll(() => teacher.locator('.video-card.local video').evaluate(video =>
      ((video as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0]?.enabled)).toBe(false)
    await teacher.getByRole('button', { name: 'Start camera' }).click()

    await teacher.getByRole('button', { name: 'Share screen' }).click()
    await expect(teacher.getByRole('button', { name: 'Stop sharing' })).toBeVisible()
    await teacher.getByRole('button', { name: 'Stop sharing' }).click()
    await expect(teacher.getByRole('button', { name: 'Share screen' })).toBeVisible()

    await teacher.getByRole('button', { name: 'Record' }).click()
    await expect(teacher.getByRole('button', { name: /Stop ·/ })).toBeVisible()
    await teacher.waitForTimeout(1_200)
    const downloadPromise = teacher.waitForEvent('download')
    await teacher.getByRole('button', { name: /Stop ·/ }).click()
    const download = await downloadPromise
    const recordingPath = testInfo.outputPath('classroom-recording.webm')
    await download.saveAs(recordingPath)
    expect(download.suggestedFilename()).toMatch(/\.webm$/)
    expect((await stat(recordingPath)).size).toBeGreaterThan(0)
    expect(errors).toEqual([])

    await teacher.getByRole('button', { name: 'Leave classroom' }).click()
    await expect(student.getByText('1 participant', { exact: true })).toBeVisible()
    await expect(student.locator('.video-card:not(.local):not(.empty) video')).toHaveCount(0)

    await teacher.getByRole('button', { name: 'Join with camera' }).click()
    await expect(teacher.getByText('Live session')).toBeVisible()
    await expect(student.getByText('2 participants')).toBeVisible()
    await expect(student.locator('.video-card:not(.local):not(.empty) video')).toHaveCount(1)

    await teacherContext.close()
    teacherClosed = true
    await expect(student.getByText('1 participant', { exact: true })).toBeVisible()
    await expect(student.locator('.video-card:not(.local):not(.empty) video')).toHaveCount(0)
  } finally {
    if (!teacherClosed) await teacherContext.close()
    await studentContext.close()
  }
})
