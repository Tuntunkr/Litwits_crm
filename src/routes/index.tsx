import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { getUser } from '@/lib/auth'

export const Route = createFileRoute('/')({
  component: IndexRedirect,
})

function IndexRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    const user = getUser()
    if (!user) {
      navigate({ to: '/login' })
    } else if (user.role === 'admin') {
      navigate({ to: '/admin' })
    } else if (user.role === 'mentor') {
      navigate({ to: '/mentor' })
    } else {
      navigate({ to: '/student' })
    }
  }, [navigate])

  return null
}
