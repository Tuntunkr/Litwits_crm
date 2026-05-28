import { createFileRoute } from '@tanstack/react-router'
import { getBearerSession } from '@/server/session'

export const Route = createFileRoute('/api/parse-document')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = getBearerSession(request)
        if (!session || session.role !== 'admin') {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        let body: { fileData?: string; fileType?: string }
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON' }, { status: 400 })
        }
        const b64 = body.fileData
        const fileType = String(body.fileType || '').toLowerCase()
        if (!b64 || (fileType !== 'docx' && fileType !== 'pdf')) {
          return Response.json({ error: 'Unsupported or missing file' }, { status: 400 })
        }
        try {
          const buf = Buffer.from(b64, 'base64')
          if (fileType === 'docx') {
            const mammoth = await import('mammoth')
            const { value: html } = await mammoth.convertToHtml({ buffer: buf })
            return Response.json({ html: html || '<p></p>' })
          }
          const { PDFParse } = await import('pdf-parse')
          const parser = new PDFParse({ data: buf })
          try {
            const result = await parser.getText()
            const text = result.text || ''
            const escaped = text
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
            const html = `<p>${escaped.replace(/\n+/g, '<br/>')}</p>`
            return Response.json({ html })
          } finally {
            await parser.destroy()
          }
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'Failed to parse' }, { status: 500 })
        }
      },
    },
  },
})
