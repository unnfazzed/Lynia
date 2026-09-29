/** A `wa.me` link that opens the person's own WhatsApp with a message ready to send. `wa.me` wants
 *  international digits only; the API sends numbers that way for exactly this. */
export function whatsAppLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
