import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { setToken, setUser } from '@/lib/auth'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [validityExpired, setValidityExpired] = useState<{ endDate: string; renewalLink: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setValidityExpired(null)

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'validity_expired') {
          setValidityExpired({
            endDate: data.endDate || 'N/A',
            renewalLink: data.renewalLink || 'https://litwits.in/membership',
          })
          return
        }
        setError(data.error || 'Invalid credentials')
        return
      }

      setToken(data.token)
      setUser(data.user)

      if (data.user.role === 'admin') navigate({ to: '/admin' })
      else if (data.user.role === 'mentor') navigate({ to: '/mentor' })
      else navigate({ to: '/student' })
    } catch {
      setError('Unable to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-xs flex flex-col items-center">
        {/* LW Monogram */}
        <div
          className="text-8xl font-bold text-[#A52A2A] leading-none mb-4 select-none"
          style={{ fontFamily: '"Playfair Display", serif', letterSpacing: '-0.04em' }}
        >
          LW
        </div>

        {/* Tagline */}
        <p className="text-xs tracking-[0.35em] text-gray-400 uppercase mb-12">
          THINK. DEBATE. WRITE.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="w-full space-y-5">
          <div>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-transparent border-0 border-b border-gray-300 py-3 text-sm outline-none focus:border-[#A52A2A] transition-colors placeholder-gray-400"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-transparent border-0 border-b border-gray-300 py-3 text-sm outline-none focus:border-[#A52A2A] transition-colors placeholder-gray-400"
            />
          </div>

          {error && <p className="text-xs text-red-600 text-center">{error}</p>}

          {validityExpired && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center space-y-2">
              <p className="text-sm text-red-700 font-medium">
                Your validity is expired on {validityExpired.endDate}
              </p>
              <p className="text-xs text-red-600">
                Kindly renewal your package by clicking the link below
              </p>
              <a
                href={validityExpired.renewalLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-[#A52A2A] underline hover:text-[#8B1A1A] font-medium"
              >
                {validityExpired.renewalLink}
              </a>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 bg-[#A52A2A] text-white py-3 text-xs tracking-[0.2em] uppercase font-medium hover:bg-[#8B1A1A] active:bg-[#7A1515] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
