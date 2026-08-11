// LJ.help — the Help & support hub. Static: a "Browse topics" list of three topic cards plus (when a
// support number is configured) a "Chat with us on WhatsApp" row. No react-query, no auth context, no
// mount-time fetch. NOTE: the WhatsApp row + the tappable-topic chevrons are gated on
// config.supportWhatsAppUrl(), which reads Constants.expoConfig.extra.supportWhatsApp — the shared
// parity expo-constants shim provides no such number, so this renders the topics in their inert
// (no-WhatsApp) state. Showing the WhatsApp CTA would need `supportWhatsApp` added to that shim's
// `extra`, which is a shared file outside a fixture's scope.
export default {};
