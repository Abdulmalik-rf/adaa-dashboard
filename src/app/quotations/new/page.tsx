import { createBlankQuotation } from '@/app/actions/quotations'

// "New quote" action: creates a blank quotation row and redirects to its
// detail page. From there the user can edit inline or (easier) tell the
// WhatsApp agent what to put on it.
export default async function NewQuotationPage() {
  await createBlankQuotation()
  return null
}
