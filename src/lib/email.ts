// Lightweight email sender. Uses Resend (https://resend.com) — free tier
// covers 3,000 emails/month and the API is a single fetch with no SDK
// needed. If RESEND_API_KEY isn't set, we fall back to console.log so
// admins can still grab the verification code from Hostinger logs while
// they finish wiring up Resend.

type SendArgs = {
  to: string
  subject: string
  /** Plain-text body. The HTML body is auto-derived from this if `html`
   *  isn't provided. */
  text: string
  html?: string
  /** Override sender. Defaults to Resend's onboarding sender (works
   *  without domain verification) so first-time setup isn't blocked
   *  on DNS records. Replace with your own verified sender once the
   *  domain is added in resend.com → Domains. */
  from?: string
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  from = 'Emergize <onboarding@resend.dev>',
}: SendArgs): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    // Fallback: log to stdout so the value is retrievable from
    // Hostinger's runtime logs / your Mac's agent.log even before
    // Resend is configured. Admin can grep for [EMAIL_FALLBACK].
    console.warn('[EMAIL_FALLBACK] RESEND_API_KEY not set — printing email to logs:')
    console.warn(`[EMAIL_FALLBACK] To: ${to}`)
    console.warn(`[EMAIL_FALLBACK] Subject: ${subject}`)
    console.warn(`[EMAIL_FALLBACK] Body:\n${text}`)
    return {
      ok: false,
      error: 'Email service not configured (RESEND_API_KEY missing). Body printed to server logs.',
    }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html: html ?? `<pre style="font-family:Inter,sans-serif;font-size:14px">${escapeHtml(text)}</pre>`,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
