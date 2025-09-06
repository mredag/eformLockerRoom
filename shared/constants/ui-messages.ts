/**
 * Turkish UI Messages - APPROVED WHITELIST ONLY
 * 
 * These are the ONLY approved Turkish messages. All other messages must map to these.
 * Every message ends with a period as required.
 */
export const UI_MESSAGES = {
  // Idle state
  idle: "Kartınızı okutun.",
  
  // Success messages
  success_new: "Dolabınız açıldı. Eşyalarınızı yerleştirin.",
  success_existing: "Önceki dolabınız açıldı.",
  
  // Special cases
  retrieve_overdue: "Süreniz doldu. Almanız için açılıyor.",
  reported_occupied: "Dolap dolu bildirildi. Yeni dolap açılıyor.",
  
  // Retry and error handling
  retry: "Tekrar deneniyor.",
  throttled: "Lütfen birkaç saniye sonra deneyin.",
  
  // Error states
  no_stock: "Boş dolap yok. Görevliye başvurun.",
  error: "Şu an işlem yapılamıyor.",
  
  // Manual mode fallback - removed, not in whitelist
} as const;

export type UIMessageKey = keyof typeof UI_MESSAGES;

/**
 * Get Turkish message by key
 */
export function getTurkishMessage(key: UIMessageKey): string {
  return UI_MESSAGES[key];
}

/**
 * Assignment action to message mapping - WHITELIST ONLY
 */
export const ACTION_MESSAGES: Record<string, string> = {
  'assign_new': UI_MESSAGES.success_new,
  'open_existing': UI_MESSAGES.success_existing,
  'retrieve_overdue': UI_MESSAGES.retrieve_overdue,
  'reopen_reclaim': UI_MESSAGES.success_existing,
  'reported_occupied': UI_MESSAGES.reported_occupied
};

/**
 * Error code to message mapping - WHITELIST ONLY
 * All unknown errors map to "Şu an işlem yapılamıyor."
 */
export const ERROR_MESSAGES: Record<string, string> = {
  'no_stock': UI_MESSAGES.no_stock,
  'system_error': UI_MESSAGES.error,
  'conflict_retry_failed': UI_MESSAGES.error,
  'hardware_error': UI_MESSAGES.error,
  'hardware_failure': UI_MESSAGES.error,
  'assignment_engine_error': UI_MESSAGES.error,
  'assignment_failed': UI_MESSAGES.error,
  'rate_limited': UI_MESSAGES.throttled,
  'rate_limit_exceeded': UI_MESSAGES.throttled
};

/**
 * Message validation function - ensures only whitelist messages are used
 */
export function validateAndMapMessage(message: string): string {
  // Check if message is in whitelist
  const whitelistValues = Object.values(UI_MESSAGES);
  if (whitelistValues.includes(message)) {
    return message;
  }
  
  // Map common non-whitelist messages to whitelist
  const messageMap: Record<string, string> = {
    // Loading messages - not allowed, use spinner only
    'Dolap otomatik atanıyor...': UI_MESSAGES.error, // Should not show loading text
    'Kart kontrol ediliyor...': UI_MESSAGES.error, // Should not show loading text
    
    // Error messages - map to whitelist
    'Otomatik atama hatası - Tekrar deneyin': UI_MESSAGES.error,
    'Çok hızlı işlem - Bekleyin': UI_MESSAGES.throttled,
    'Bağlantı kesildi - Yeniden bağlanıyor': UI_MESSAGES.error,
    'Sunucu hatası - Tekrar deneyin': UI_MESSAGES.error,
    
    // Remove hyphens and map
    'Dolap açılamadı - Tekrar deneyin': UI_MESSAGES.error,
    'Sistem bakımda - Görevliye başvurun': UI_MESSAGES.error,
    'Bağlantı hatası - Tekrar deneyin': UI_MESSAGES.error,
    'Müsait dolap yok - Daha sonra deneyin': UI_MESSAGES.no_stock,
    'Oturum süresi doldu - Kartınızı tekrar okutun': UI_MESSAGES.error,
    'Sistem hatası - Tekrar deneyin': UI_MESSAGES.error
  };
  
  // Check mapped messages
  if (messageMap[message]) {
    return messageMap[message];
  }
  
  // Default fallback for any unknown message
  console.warn(`Unknown message mapped to fallback: "${message}"`);
  return UI_MESSAGES.error;
}