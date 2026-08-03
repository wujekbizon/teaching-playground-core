import TeachingPlayground from '../engine/TeachingPlayground'

describe('TeachingPlayground authorization', () => {
  it('stops an unauthorized lecture operation before creating data', async () => {
    const playground = new TeachingPlayground({})
    playground.setCurrentUser({
      id: 'student-1',
      username: 'student',
      role: 'student',
      status: 'online',
    })

    await expect(playground.scheduleLecture({
      name: 'Forbidden lecture',
      date: new Date().toISOString(),
      roomId: 'room-1',
    })).rejects.toMatchObject({ code: 'LECTURE_SCHEDULING_FAILED' })

    await expect(playground.listLectures('room-1')).resolves.toHaveLength(0)
  })

  it('shares one communication system with room management', () => {
    const playground = new TeachingPlayground({})
    expect(playground.roomSystem.getCommsSystem()).toBe(
      (playground as unknown as { commsSystem: unknown }).commsSystem
    )
  })
})
