declare module 'html-to-docx' {
  export default function htmlToDocx(
    html: string,
    headerHtml: string | null,
    options?: Record<string, any>
  ): Promise<Blob>
}
