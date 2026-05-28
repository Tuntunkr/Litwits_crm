import { getStore } from '@netlify/blobs'

export const config = { path: '/api/parse-document' }

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function withCors(response: Response) {
  const headers = new Headers(response.headers)
  Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v))
  return new Response(response.body, { status: response.status, headers })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

async function getSession(request: Request) {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  try {
    const store = getStore('litwits-sessions')
    const session = await store.get(token, { type: 'json' }) as any
    if (!session || session.exp < Date.now()) return null
    return session
  } catch {
    return null
  }
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  if (request.method !== 'POST') {
    return withCors(json({ error: 'Method not allowed' }, 405))
  }

  const session = await getSession(request)
  if (!session) return withCors(json({ error: 'Unauthorized' }, 401))
  if (session.role !== 'admin') return withCors(json({ error: 'Forbidden — admin only' }, 403))

  try {
    const body = await request.json() as any
    const { fileData, fileType } = body

    if (!fileData || !fileType) {
      return withCors(json({ error: 'fileData and fileType required' }, 400))
    }

    let html = ''

    if (fileType === 'docx') {
      // Parse DOCX using mammoth
      const mammoth = await import('mammoth')
      const buffer = Buffer.from(fileData, 'base64')
      const result = await mammoth.convertToHtml({ buffer })
      html = result.value
    } else if (fileType === 'pdf') {
      // Parse PDF using pdf-parse
      const pdfParse = (await import('pdf-parse')).default
      const buffer = Buffer.from(fileData, 'base64')
      const data = await pdfParse(buffer)
      // Convert plain text to HTML with paragraph breaks
      html = data.text
        .split(/\n\n+/)
        .filter((p: string) => p.trim())
        .map((p: string) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join('\n')
    } else {
      return withCors(json({ error: 'Unsupported file type. Use docx or pdf.' }, 400))
    }

    return withCors(json({ html }))
  } catch (err: any) {
    console.error('POST /api/parse-document', err)
    return withCors(json({ error: err.message || 'Failed to parse document' }, 500))
  }
}
