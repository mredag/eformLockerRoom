/**
 * Internationalization service for the Eform Locker System
 * Supports Turkish and English languages with parameterized messages
 */

export interface MessageParams {
  [key: string]: string | number;
}

export interface Messages {
  // Kiosk messages
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
    pin_locked_timer: string;
    pin_attempts_remaining: string;
    pin_security_notice: string;
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
    
    // Help system
    help_button: string;
    help_request: string;
    help_category: string;
    help_locker_number: string;
    help_note: string;
    help_contact: string;
    help_photo: string;
    category_lock_problem: string;
    category_other: string;
    capture_photo: string;
    submit_help: string;
    cancel: string;
    help_submitted: string;
    help_success_title: string;
    help_success_message: string;
    help_request_id: string;
    back_to_main: string;
    help_category_required: string;
    help_submit_failed: string;
    photo_capture_not_implemented: string;
    photo_capture_failed: string;
    
    // Lock failure messages
    lock_failure_title: string;
    lock_failure_message: string;
    lock_failure_description: string;
    retry: string;
    get_help: string;
    retry_failed: string;
    lock_failure_help_note: string;
    
    // Accessibility messages
    skip_to_main: string;
    text_size_toggle: string;
    text_size: string;
    text_size_large: string;
    text_size_normal: string;
    
    // Form placeholders
    help_note_placeholder: string;
    help_contact_placeholder: string;
  };
  
  // QR messages
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
  
  // Panel messages
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
    system_settings: string;
    master_pin: string;
    master_pin_management: string;
    master_pin_description: string;
    change_master_pin: string;
    current_master_pin: string;
    new_master_pin: string;
    confirm_master_pin: string;
    language: string;
    save_settings: string;
    settings_saved: string;
    security_settings: string;
    security_settings_description: string;
    lockout_attempts: string;
    lockout_attempts_description: string;
    lockout_duration: string;
    lockout_duration_description: string;
    pin_mismatch: string;
    pin_invalid_format: string;
    pin_changed_successfully: string;
    pin_change_failed: string;
    security_settings_updated: string;
    security_settings_failed: string;
    enter_current_pin: string;
    pin_test_successful: string;
    pin_test_failed: string;
    test: string;
    changing_pin: string;
    updating_settings: string;
    update_security_settings: string;
    security_information: string;
    pin_requirements: string;
    pin_requirement_digits: string;
    pin_requirement_unique: string;
    pin_requirement_secure: string;
    security_features: string;
    security_feature_lockout: string;
    security_feature_logging: string;
    security_feature_monitoring: string;
    
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
   * Set the current language
   */
  setLanguage(language: SupportedLanguage): void {
    if (this.messages[language]) {
      this.currentLanguage = language;
    }
  }

  /**
   * Get the current language
   */
  getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  /**
   * Get available languages
   */
  getAvailableLanguages(): SupportedLanguage[] {
    return Object.keys(this.messages) as SupportedLanguage[];
  }

  /**
   * Get a message by key path with optional parameters
   */
  get(keyPath: string, params: MessageParams = {}): string {
    const keys = keyPath.split('.');
    let message: any = this.messages[this.currentLanguage];

    // Navigate through the nested object
    for (const key of keys) {
      if (message && typeof message === 'object' && key in message) {
        message = message[key];
      } else {
        // Return the key path if message not found
        return keyPath;
      }
    }

    if (typeof message !== 'string') {
      return keyPath;
    }

    // Replace parameters in message
    return this.replaceParams(message, params);
  }

  /**
   * Get all messages for current language
   */
  getAllMessages(): Messages {
    return this.messages[this.currentLanguage];
  }

  /**
   * Get messages for a specific section
   */
  getSection(section: keyof Messages): any {
    return this.messages[this.currentLanguage][section];
  }

  /**
   * Replace parameters in a message string
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
   * Turkish messages
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
        pin_locked_timer: 'PIN kilitli - Kalan süre: {time}',
        pin_attempts_remaining: '{attempts} deneme hakkınız kaldı',
        pin_security_notice: 'Bu alan güvenlik kamerası ile izlenmektedir',
        status_free: 'Boş',
        status_owned: 'Dolu',
        status_reserved: 'Rezerve',
        status_blocked: 'Bloklu',
        status_vip: 'VIP',
        status_opening: 'Açılıyor',
        error_network: 'Ağ hatası. Lütfen tekrar deneyin',
        error_server: 'Sunucu hatası. Personeli çağırın',
        error_timeout: 'Zaman aşımı. Lütfen tekrar deneyin',
        error_unknown: 'Bilinmeyen hata. Personeli çağırın',
        
        // Help system
        help_button: 'Yardım',
        help_request: 'Yardım Talebi',
        help_category: 'Sorun Kategorisi',
        help_locker_number: 'Dolap Numarası (İsteğe bağlı)',
        help_note: 'Açıklama (İsteğe bağlı)',
        help_contact: 'İletişim (İsteğe bağlı)',
        help_photo: 'Fotoğraf (İsteğe bağlı)',
        category_lock_problem: 'Dolap Sorunu',
        category_other: 'Diğer',
        capture_photo: 'Fotoğraf Çek',
        submit_help: 'Yardım Talep Et',
        cancel: 'İptal',
        help_submitted: 'Yardım Talebi Gönderildi',
        help_success_title: 'Talebiniz Alındı',
        help_success_message: 'Yardım talebiniz personelimize iletildi. En kısa sürede size yardımcı olacağız.',
        help_request_id: 'Talep No',
        back_to_main: 'Ana Ekrana Dön',
        help_category_required: 'Lütfen bir kategori seçin',
        help_submit_failed: 'Yardım talebi gönderilemedi',
        photo_capture_not_implemented: 'Fotoğraf çekme özelliği henüz aktif değil',
        photo_capture_failed: 'Fotoğraf çekilemedi',
        
        // Lock failure messages
        lock_failure_title: 'Dolap Açılamadı',
        lock_failure_message: 'Dolap açılırken bir sorun oluştu',
        lock_failure_description: 'Lütfen tekrar deneyin veya yardım isteyin.',
        retry: 'Tekrar Dene',
        get_help: 'Yardım İste',
        retry_failed: 'Tekrar deneme başarısız',
        lock_failure_help_note: 'Dolap açılmadı, yardıma ihtiyacım var.',
        
        // Accessibility messages
        skip_to_main: 'Ana içeriğe geç',
        text_size_toggle: 'Metin boyutunu değiştir',
        text_size: 'A',
        text_size_large: 'Büyük metin boyutu',
        text_size_normal: 'Normal metin boyutu',
        
        // Form placeholders
        help_note_placeholder: 'Sorununuzu kısaca açıklayın...',
        help_contact_placeholder: 'Telefon veya e-posta'
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
        system_settings: 'Sistem Ayarları',
        master_pin: 'Master PIN',
        master_pin_management: 'Master PIN Yönetimi',
        master_pin_description: 'Kiosk master PIN\'ini değiştirin ve güvenlik ayarlarını yönetin',
        change_master_pin: 'Master PIN Değiştir',
        current_master_pin: 'Mevcut Master PIN',
        new_master_pin: 'Yeni Master PIN',
        confirm_master_pin: 'Master PIN Onayla',
        language: 'Dil',
        save_settings: 'Ayarları Kaydet',
        settings_saved: 'Ayarlar kaydedildi',
        security_settings: 'Güvenlik Ayarları',
        security_settings_description: 'Master PIN güvenlik parametrelerini yapılandırın',
        lockout_attempts: 'Kilitleme Deneme Sayısı',
        lockout_attempts_description: 'Kaç yanlış denemeden sonra PIN girişi kilitlensin',
        lockout_duration: 'Kilitleme Süresi (Dakika)',
        lockout_duration_description: 'PIN kilitlendiğinde ne kadar süre beklensin',
        pin_mismatch: 'PIN\'ler eşleşmiyor',
        pin_invalid_format: 'PIN 4 haneli sayı olmalıdır',
        pin_changed_successfully: 'Master PIN başarıyla değiştirildi',
        pin_change_failed: 'Master PIN değiştirilemedi',
        security_settings_updated: 'Güvenlik ayarları güncellendi',
        security_settings_failed: 'Güvenlik ayarları güncellenemedi',
        enter_current_pin: 'Mevcut PIN\'i girin',
        pin_test_successful: 'PIN testi başarılı',
        pin_test_failed: 'PIN testi başarısız',
        test: 'Test',
        changing_pin: 'PIN Değiştiriliyor...',
        updating_settings: 'Ayarlar Güncelleniyor...',
        update_security_settings: 'Güvenlik Ayarlarını Güncelle',
        security_information: 'Güvenlik Bilgileri',
        pin_requirements: 'PIN Gereksinimleri',
        pin_requirement_digits: '4 haneli sayı olmalıdır',
        pin_requirement_unique: 'Tahmin edilmesi zor olmalıdır',
        pin_requirement_secure: 'Güvenli bir yerde saklanmalıdır',
        security_features: 'Güvenlik Özellikleri',
        security_feature_lockout: 'Otomatik kilitleme koruması',
        security_feature_logging: 'Tüm PIN girişleri loglanır',
        security_feature_monitoring: 'Güvenlik olayları izlenir',
        
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
   * English messages
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
        pin_locked_timer: 'PIN locked - Time remaining: {time}',
        pin_attempts_remaining: '{attempts} attempts remaining',
        pin_security_notice: 'This area is monitored by security cameras',
        status_free: 'Free',
        status_owned: 'Occupied',
        status_reserved: 'Reserved',
        status_blocked: 'Blocked',
        status_vip: 'VIP',
        status_opening: 'Opening',
        error_network: 'Network error. Please try again',
        error_server: 'Server error. Call staff',
        error_timeout: 'Timeout. Please try again',
        error_unknown: 'Unknown error. Call staff',
        
        // Help system
        help_button: 'Help',
        help_request: 'Help Request',
        help_category: 'Issue Category',
        help_locker_number: 'Locker Number (Optional)',
        help_note: 'Description (Optional)',
        help_contact: 'Contact (Optional)',
        help_photo: 'Photo (Optional)',
        category_lock_problem: 'Lock Problem',
        category_other: 'Other',
        capture_photo: 'Take Photo',
        submit_help: 'Request Help',
        cancel: 'Cancel',
        help_submitted: 'Help Request Submitted',
        help_success_title: 'Request Received',
        help_success_message: 'Your help request has been sent to our staff. We will assist you as soon as possible.',
        help_request_id: 'Request No',
        back_to_main: 'Back to Main',
        help_category_required: 'Please select a category',
        help_submit_failed: 'Failed to submit help request',
        photo_capture_not_implemented: 'Photo capture feature is not yet active',
        photo_capture_failed: 'Failed to capture photo',
        
        // Lock failure messages
        lock_failure_title: 'Lock Failed',
        lock_failure_message: 'There was a problem opening the locker',
        lock_failure_description: 'Please try again or request help.',
        retry: 'Retry',
        get_help: 'Get Help',
        retry_failed: 'Retry failed',
        lock_failure_help_note: 'Locker failed to open, I need help.',
        
        // Accessibility messages
        skip_to_main: 'Skip to main content',
        text_size_toggle: 'Toggle text size',
        text_size: 'A',
        text_size_large: 'Large text size',
        text_size_normal: 'Normal text size',
        
        // Form placeholders
        help_note_placeholder: 'Briefly describe your issue...',
        help_contact_placeholder: 'Phone or email'
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
        system_settings: 'System Settings',
        master_pin: 'Master PIN',
        master_pin_management: 'Master PIN Management',
        master_pin_description: 'Change kiosk master PIN and manage security settings',
        change_master_pin: 'Change Master PIN',
        current_master_pin: 'Current Master PIN',
        new_master_pin: 'New Master PIN',
        confirm_master_pin: 'Confirm Master PIN',
        language: 'Language',
        save_settings: 'Save Settings',
        settings_saved: 'Settings saved',
        security_settings: 'Security Settings',
        security_settings_description: 'Configure master PIN security parameters',
        lockout_attempts: 'Lockout Attempts',
        lockout_attempts_description: 'How many wrong attempts before PIN entry is locked',
        lockout_duration: 'Lockout Duration (Minutes)',
        lockout_duration_description: 'How long to wait when PIN is locked',
        pin_mismatch: 'PINs do not match',
        pin_invalid_format: 'PIN must be 4 digits',
        pin_changed_successfully: 'Master PIN changed successfully',
        pin_change_failed: 'Failed to change master PIN',
        security_settings_updated: 'Security settings updated',
        security_settings_failed: 'Failed to update security settings',
        enter_current_pin: 'Enter current PIN',
        pin_test_successful: 'PIN test successful',
        pin_test_failed: 'PIN test failed',
        test: 'Test',
        changing_pin: 'Changing PIN...',
        updating_settings: 'Updating Settings...',
        update_security_settings: 'Update Security Settings',
        security_information: 'Security Information',
        pin_requirements: 'PIN Requirements',
        pin_requirement_digits: 'Must be 4 digits',
        pin_requirement_unique: 'Should be hard to guess',
        pin_requirement_secure: 'Must be stored securely',
        security_features: 'Security Features',
        security_feature_lockout: 'Automatic lockout protection',
        security_feature_logging: 'All PIN entries are logged',
        security_feature_monitoring: 'Security events are monitored',
        
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

// Export singleton instance
export const i18nService = new I18nService();
