export interface User {
  id: string
  name: string
  email: string
  role: 'teacher' | 'student' | 'admin'
  status: 'active' | 'inactive'
}

export interface TeacherProfile extends User {
  role: 'teacher'
  subjects: string[]
  schedule?: {
    availableHours: {
      day: string
      hours: string[]
    }[]
  }
}
