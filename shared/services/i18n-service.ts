/**
 * Provides an internationalization (i18n) service for the E-form Locker System.
 * It supports both Turkish and English languages and allows for parameterized messages
 * to include dynamic data in translated strings.
 */

/**
 * Defines the structure for parameters that can be passed to a message string.
 */
export interface MessageParams {
  [key: string]: string | number;
}

/**
 * Defines the nested structure of all translation messages, organized by application section.
 */
export interface Messages {
  kiosk: {
    scan_card: string;
    scan_card_subtitle: string;
    master_access: string;
    back: string;
    loading: string;
    select_locker: string;
    select_locker_info: string;
    enter_master_pin: string;
    master_locker_control: string;
    master_locker_info: string;
    no_lockers: string;
    opening: string;
    opened_released: string;
    failed_open: string;
    card_already_has_locker: string;
    locker_opening: string;
    locker_opened: string;
    locker_released: string;
    pin_incorrect: string;
    pin_locked: string;
    pin_attempts_remaining: string;
    status_free: string;
    status_owned: string;
    status_reserved: string;
    status_blocked: string;
    status_vip: string;
    status_opening: string;
    error_network: string;
    error_server: string;
    error_timeout: string;
    error_unknown: string;
  };
  
  qr: {
    vip_blocked: string;
    network_required: string;
    private_mode_warning: string;
    locker_busy: string;
    action_success: string;
    action_failed: string;
    rate_limit_exceeded: string;
    invalid_request: string;
  };
  
  panel: {
    // Navigation
    dashboard: string;
    lockers: string;
    vip_contracts: string;
    events: string;
    settings: string;
    logout: string;
    
    // Authentication
    login: string;
    username: string;
    password: string;
    login_failed: string;
    session_expired: string;
    access_denied: string;
    
    // Dashboard
    total_lockers: string;
    available_lockers: string;
    occupied_lockers: string;
    blocked_lockers: string;
    vip_lockers: string;
    online_kiosks: string;
    offline_kiosks: string;
    
    // Locker management
    locker_id: string;
    locker_status: string;
    owner: string;
    assigned_at: string;
    actions: string;
    open_locker: string;
    block_locker: string;
    unblock_locker: string;
    override_open: string;
    bulk_open: string;
    end_of_day_open: string;
    locker_opened: string;
    locker_blocked: string;
    locker_unblocked: string;
    bulk_complete: string;
    operation_failed: string;
    confirm_action: string;
    reason_required: string;
    
    // VIP management
    create_contract: string;
    extend_contract: string;
    cancel_contract: string;
    change_card: string;
    contract_id: string;
    rfid_card: string;
    backup_card: string;
    start_date: string;
    end_date: string;
    contract_status: string;
    expires_soon: string;
    contract_created: string;
    contract_extended: string;
    contract_cancelled: string;
    card_changed: string;
    
    // Events
    event_type: string;
    timestamp: string;
    kiosk_id: string;
    staff_user: string;
    details: string;
    export_csv: string;
    
    // Settings
    system_config: string;
    master_pin: string;
    change_master_pin: string;
    language: string;
    save_settings: string;
    settings_saved: string;
    
    // Common
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    view: string;
    refresh: string;
    filter: string;
    search: string;
    clear: string;
    yes: string;
    no: string;
    success: string;
    error: string;
    warning: string;
    info: string;
  };
}

export type SupportedLanguage = 'tr' | 'en';

/**
 * A service class for handling internationalization (i18n).
 * It loads and manages translation messages for different languages.
 */
export class I18nService {
  private currentLanguage: SupportedLanguage = 'tr';
  private messages: Record<SupportedLanguage, Messages>;

  constructor() {
    this.messages = {
      tr: this.getTurkishMessages(),
      en: this.getEnglishMessages()
    };
  }

  /**
   * Sets the active language for the service.
   * @param {SupportedLanguage} language - The language to set (e.g., 'en', 'tr').
   */
  setLanguage(language: SupportedLanguage): void {
    if (this.messages[language]) {
      this.currentLanguage = language;
    }
  }

  /**
   * Gets the currently active language.
   * @returns {SupportedLanguage} The current language code.
   */
  getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  /**
   * Gets a list of all available languages.
   * @returns {SupportedLanguage[]} An array of supported language codes.
   */
  getAvailableLanguages(): SupportedLanguage[] {
    return Object.keys(this.messages) as SupportedLanguage[];
  }

  /**
   * Retrieves a translated message string using a dot-notation key path
   * and replaces any placeholders with the provided parameters.
   * @param {string} keyPath - The dot-notation path to the message (e.g., 'kiosk.scan_card').
   * @param {MessageParams} [params={}] - An object of parameters to replace in the message string.
   * @returns {string} The translated and formatted message, or the key path if not found.
   */
  get(keyPath: string, params: MessageParams = {}): string {
    const keys = keyPath.split('.');
    let message: any = this.messages[this.currentLanguage];

    for (const key of keys) {
      if (message && typeof message === 'object' && key in message) {
        message = message[key];
      } else {
        return keyPath;
      }
    }

    if (typeof message !== 'string') {
      return keyPath;
    }

    return this.replaceParams(message, params);
  }

  /**
   * Retrieves the entire message object for the currently active language.
   * @returns {Messages} The complete message tree.
   */
  getAllMessages(): Messages {
    return this.messages[this.currentLanguage];
  }

  /**
   * Retrieves a specific section of the message tree for the current language.
   * @param {keyof Messages} section - The section to retrieve (e.g., 'kiosk', 'panel').
   * @returns {any} The message sub-tree for the requested section.
   */
  getSection(section: keyof Messages): any {
    return this.messages[this.currentLanguage][section];
  }

  /**
   * Replaces placeholders in a message string with their corresponding values.
   * @private
   * @param {string} message - The message string with placeholders (e.g., 'Hello, {name}').
   * @param {MessageParams} params - The parameters to substitute.
   * @returns {string} The formatted message string.
   */
  private replaceParams(message: string, params: MessageParams): string {
    let result = message;
    Object.keys(params).forEach(param => {
      const regex = new RegExp(`\\{${param}\\}`, 'g');
      result = result.replace(regex, String(params[param]));
    });
    return result;
  }

  /**
   * Provides the full set of Turkish translations.
   * @private
   * @returns {Messages} The Turkish message tree.
   */
  private getTurkishMessages(): Messages {
    return {
      kiosk: {
        scan_card: 'Kart okutunuz',
        scan_card_subtitle: 'RFID kartınızı okutucuya yaklaştırın',
        master_access: 'Master Erişim',
        back: 'Geri',
        loading: 'Yükleniyor...',
        select_locker: 'Dolap Seçin',
        select_locker_info: 'Kullanmak istediğiniz dolabı seçin',
        enter_master_pin: 'Master PIN\'i girin',
        master_locker_control: 'Master Dolap Kontrolü',
        master_locker_info: 'Açmak istediğiniz dolabı seçin',
        no_lockers: 'Boş dolap yok',
        opening: 'Dolap {id} açılıyor',
        opened_released: 'Dolap {id} açıldı ve bırakıldı',
        failed_open: 'Açılamadı. Personeli çağırın',
        card_already_has_locker: 'Kartınızın zaten bir dolabı var',
        locker_opening: 'Dolap açılıyor...',
        locker_opened: 'Dolap açıldı',
        locker_released: 'Dolap bırakıldı',
        pin_incorrect: 'Yanlış PIN',
        pin_locked: 'PIN girişi kilitlendi. {minutes} dakika bekleyin',
        pin_attempts_remaining: '{attempts} deneme hakkınız kaldı',
        status_free: 'Boş',
        status_owned: 'Dolu',
        status_reserved: 'Rezerve',
        status_blocked: 'Bloklu',
        status_vip: 'VIP',
        status_opening: 'Açılıyor',
        error_network: 'Ağ hatası. Lütfen tekrar deneyin',
        error_server: 'Sunucu hatası. Personeli çağırın',
        error_timeout: 'Zaman aşımı. Lütfen tekrar deneyin',
        error_unknown: 'Bilinmeyen hata. Personeli çağırın'
      },
      qr: {
        vip_blocked: 'VIP dolap. QR kapalı',
        network_required: 'Ağ bağlantısı gerekli',
        private_mode_warning: 'Gizli tarama modunda QR erişimi sınırlıdır. Kart kullanmanız önerilir.',
        locker_busy: 'Dolap meşgul',
        action_success: 'İşlem başarılı',
        action_failed: 'İşlem başarısız',
        rate_limit_exceeded: 'Çok fazla istek. Lütfen bekleyin',
        invalid_request: 'Geçersiz istek'
      },
      panel: {
        // Navigation
        dashboard: 'Ana Sayfa',
        lockers: 'Dolaplar',
        vip_contracts: 'VIP Sözleşmeler',
        events: 'Olaylar',
        settings: 'Ayarlar',
        logout: 'Çıkış',
        
        // Authentication
        login: 'Giriş',
        username: 'Kullanıcı Adı',
        password: 'Şifre',
        login_failed: 'Giriş başarısız',
        session_expired: 'Oturum süresi doldu',
        access_denied: 'Erişim reddedildi',
        
        // Dashboard
        total_lockers: 'Toplam Dolap',
        available_lockers: 'Boş Dolaplar',
        occupied_lockers: 'Dolu Dolaplar',
        blocked_lockers: 'Bloklu Dolaplar',
        vip_lockers: 'VIP Dolaplar',
        online_kiosks: 'Çevrimiçi Kiosklar',
        offline_kiosks: 'Çevrimdışı Kiosklar',
        
        // Locker management
        locker_id: 'Dolap No',
        locker_status: 'Durum',
        owner: 'Sahip',
        assigned_at: 'Atanma Zamanı',
        actions: 'İşlemler',
        open_locker: 'Dolabı Aç',
        block_locker: 'Dolabı Blokla',
        unblock_locker: 'Bloğu Kaldır',
        override_open: 'Zorla Aç',
        bulk_open: 'Toplu Açma',
        end_of_day_open: 'Gün Sonu Açma',
        locker_opened: 'Dolap açıldı',
        locker_blocked: 'Dolap bloklandı',
        locker_unblocked: 'Dolap bloğu kaldırıldı',
        bulk_complete: 'Toplu açma tamamlandı',
        operation_failed: 'İşlem başarısız',
        confirm_action: 'İşlemi onayla',
        reason_required: 'Sebep gerekli',
        
        // VIP management
        create_contract: 'Sözleşme Oluştur',
        extend_contract: 'Sözleşme Uzat',
        cancel_contract: 'Sözleşme İptal',
        change_card: 'Kart Değiştir',
        contract_id: 'Sözleşme No',
        rfid_card: 'RFID Kart',
        backup_card: 'Yedek Kart',
        start_date: 'Başlangıç Tarihi',
        end_date: 'Bitiş Tarihi',
        contract_status: 'Sözleşme Durumu',
        expires_soon: 'Yakında Sona Eriyor',
        contract_created: 'Sözleşme oluşturuldu',
        contract_extended: 'Sözleşme uzatıldı',
        contract_cancelled: 'Sözleşme iptal edildi',
        card_changed: 'Kart değiştirildi',
        
        // Events
        event_type: 'Olay Türü',
        timestamp: 'Zaman',
        kiosk_id: 'Kiosk',
        staff_user: 'Personel',
        details: 'Detaylar',
        export_csv: 'CSV Dışa Aktar',
        
        // Settings
        system_config: 'Sistem Yapılandırması',
        master_pin: 'Master PIN',
        change_master_pin: 'Master PIN Değiştir',
        language: 'Dil',
        save_settings: 'Ayarları Kaydet',
        settings_saved: 'Ayarlar kaydedildi',
        
        // Common
        save: 'Kaydet',
        cancel: 'İptal',
        delete: 'Sil',
        edit: 'Düzenle',
        view: 'Görüntüle',
        refresh: 'Yenile',
        filter: 'Filtrele',
        search: 'Ara',
        clear: 'Temizle',
        yes: 'Evet',
        no: 'Hayır',
        success: 'Başarılı',
        error: 'Hata',
        warning: 'Uyarı',
        info: 'Bilgi'
      }
    };
  }

  /**
   * Provides the full set of English translations.
   * @private
   * @returns {Messages} The English message tree.
   */
  private getEnglishMessages(): Messages {
    return {
      kiosk: {
        scan_card: 'Scan your card',
        scan_card_subtitle: 'Hold your RFID card near the reader',
        master_access: 'Master Access',
        back: 'Back',
        loading: 'Loading...',
        select_locker: 'Select Locker',
        select_locker_info: 'Choose the locker you want to use',
        enter_master_pin: 'Enter Master PIN',
        master_locker_control: 'Master Locker Control',
        master_locker_info: 'Select the locker you want to open',
        no_lockers: 'No available lockers',
        opening: 'Opening locker {id}',
        opened_released: 'Locker {id} opened and released',
        failed_open: 'Failed to open. Call staff',
        card_already_has_locker: 'Your card already has a locker',
        locker_opening: 'Opening locker...',
        locker_opened: 'Locker opened',
        locker_released: 'Locker released',
        pin_incorrect: 'Incorrect PIN',
        pin_locked: 'PIN entry locked. Wait {minutes} minutes',
        pin_attempts_remaining: '{attempts} attempts remaining',
        status_free: 'Free',
        status_owned: 'Occupied',
        status_reserved: 'Reserved',
        status_blocked: 'Blocked',
        status_vip: 'VIP',
        status_opening: 'Opening',
        error_network: 'Network error. Please try again',
        error_server: 'Server error. Call staff',
        error_timeout: 'Timeout. Please try again',
        error_unknown: 'Unknown error. Call staff'
      },
      qr: {
        vip_blocked: 'VIP locker. QR disabled',
        network_required: 'Network connection required',
        private_mode_warning: 'QR access is limited in private browsing mode. Using a card is recommended.',
        locker_busy: 'Locker busy',
        action_success: 'Action successful',
        action_failed: 'Action failed',
        rate_limit_exceeded: 'Too many requests. Please wait',
        invalid_request: 'Invalid request'
      },
      panel: {
        // Navigation
        dashboard: 'Dashboard',
        lockers: 'Lockers',
        vip_contracts: 'VIP Contracts',
        events: 'Events',
        settings: 'Settings',
        logout: 'Logout',
        
        // Authentication
        login: 'Login',
        username: 'Username',
        password: 'Password',
        login_failed: 'Login failed',
        session_expired: 'Session expired',
        access_denied: 'Access denied',
        
        // Dashboard
        total_lockers: 'Total Lockers',
        available_lockers: 'Available Lockers',
        occupied_lockers: 'Occupied Lockers',
        blocked_lockers: 'Blocked Lockers',
        vip_lockers: 'VIP Lockers',
        online_kiosks: 'Online Kiosks',
        offline_kiosks: 'Offline Kiosks',
        
        // Locker management
        locker_id: 'Locker ID',
        locker_status: 'Status',
        owner: 'Owner',
        assigned_at: 'Assigned At',
        actions: 'Actions',
        open_locker: 'Open Locker',
        block_locker: 'Block Locker',
        unblock_locker: 'Unblock Locker',
        override_open: 'Override Open',
        bulk_open: 'Bulk Open',
        end_of_day_open: 'End of Day Open',
        locker_opened: 'Locker opened',
        locker_blocked: 'Locker blocked',
        locker_unblocked: 'Locker unblocked',
        bulk_complete: 'Bulk opening completed',
        operation_failed: 'Operation failed',
        confirm_action: 'Confirm action',
        reason_required: 'Reason required',
        
        // VIP management
        create_contract: 'Create Contract',
        extend_contract: 'Extend Contract',
        cancel_contract: 'Cancel Contract',
        change_card: 'Change Card',
        contract_id: 'Contract ID',
        rfid_card: 'RFID Card',
        backup_card: 'Backup Card',
        start_date: 'Start Date',
        end_date: 'End Date',
        contract_status: 'Contract Status',
        expires_soon: 'Expires Soon',
        contract_created: 'Contract created',
        contract_extended: 'Contract extended',
        contract_cancelled: 'Contract cancelled',
        card_changed: 'Card changed',
        
        // Events
        event_type: 'Event Type',
        timestamp: 'Timestamp',
        kiosk_id: 'Kiosk',
        staff_user: 'Staff User',
        details: 'Details',
        export_csv: 'Export CSV',
        
        // Settings
        system_config: 'System Configuration',
        master_pin: 'Master PIN',
        change_master_pin: 'Change Master PIN',
        language: 'Language',
        save_settings: 'Save Settings',
        settings_saved: 'Settings saved',
        
        // Common
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        edit: 'Edit',
        view: 'View',
        refresh: 'Refresh',
        filter: 'Filter',
        search: 'Search',
        clear: 'Clear',
        yes: 'Yes',
        no: 'No',
        success: 'Success',
        error: 'Error',
        warning: 'Warning',
        info: 'Info'
      }
    };
  }
}

/**
 * A singleton instance of the I18nService for easy access throughout the application.
 */
export const i18nService = new I18nService();
