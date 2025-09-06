# Akıllı Dolap Atama Yapılandırma Arayüzü Kullanım Kılavuzu

## Genel Bakış

Akıllı Dolap Atama Yapılandırma Arayüzü, otomatik dolap atama sisteminin tüm ayarlarını yönetmek için kapsamlı bir web arayüzüdür. Bu arayüz global yapılandırma, kiosk-özel geçersiz kılmalar, denetim geçmişi ve doğrulama özelliklerini içerir.

## Erişim

Yapılandırma arayüzüne şu yollarla erişebilirsiniz:

1. **Ana Sayfa'dan**: Dashboard'da "Akıllı Dolap Atama" kartına tıklayın
2. **Doğrudan URL**: `/smart-config` adresine gidin
3. **Navigasyon**: Üst menüden "Akıllı Atama" linkine tıklayın

## Arayüz Bölümleri

### 1. Global Yapılandırma

Bu bölümde tüm kiosklarda geçerli olan temel ayarları yönetirsiniz:

#### Özellik Bayrakları

- **Akıllı Atama Etkin**: Sistemin açık/kapalı durumu
- **Karantina Sırasında Geri Alma**: Karantina süresinde dolap geri alımı

#### Puanlama Algoritması

- **Temel Puan**: Tüm dolaplar için başlangıç puanı (varsayılan: 1)
- **Serbest Saat Çarpanı**: Dolabın serbest kaldığı saat başına puan (varsayılan: 1.0)
- **Son Sahip Çarpanı**: Son sahibinden geçen saat başına puan (varsayılan: 0.5)
- **Aşınma Böleni**: Aşınma sayısı için bölme faktörü (varsayılan: 0.05)
- **Bekleme Bonusu**: Uzun süre bekleyen dolaplar için bonus çarpanı (varsayılan: 0.1)
- **En İyi K Aday**: Seçim için değerlendirilecek dolap sayısı (varsayılan: 5)
- **Seçim Sıcaklığı**: Rastgele seçim için sıcaklık parametresi (varsayılan: 1.0)

#### Karantina Ayarları

- **Minimum Karantina**: Düşük kapasitede minimum süre (varsayılan: 5 dakika)
- **Maksimum Karantina**: Yüksek kapasitede maksimum süre (varsayılan: 20 dakika)
- **Çıkış Karantinası**: Geri alma sonrası sabit süre (varsayılan: 20 dakika)

#### Geri Dönüş Ayarları

- **Geri Dönüş Tetik Süresi**: Kısa errand algılaması için maksimum süre (varsayılan: 120 saniye)
- **Geri Dönüş Bekleme**: Dolabın aynı kullanıcı için bekletilme süresi (varsayılan: 15 dakika)

#### Oturum Yönetimi

- **Oturum Limiti**: Varsayılan oturum süresi (varsayılan: 180 dakika)
- **Alma Penceresi**: Gecikmiş alma için pencere süresi (varsayılan: 10 dakika)

#### Donanım Ayarları

- **Darbe Süresi**: Röle darbe süresi (varsayılan: 800 ms)
- **Açma Penceresi**: Tekrar deneme için bekleme penceresi (varsayılan: 10 saniye)
- **Tekrar Deneme Sayısı**: Başarısız açma sonrası tekrar deneme (varsayılan: 1)
- **Tekrar Deneme Gecikmesi**: Tekrar denemeler arası bekleme (varsayılan: 500 ms)

#### Hız Sınırlama

- **Kart Hız Limiti**: Aynı kart için minimum bekleme süresi (varsayılan: 10 saniye)
- **Dolap Açma Penceresi**: Dolap açma hız limiti için zaman penceresi (varsayılan: 60 saniye)
- **Pencere Başına Maksimum Açma**: Zaman penceresi içinde aynı dolap için maksimum açma (varsayılan: 3)
- **Komut Bekleme**: Röle komutları arası minimum bekleme (varsayılan: 3 saniye)
- **Günlük Rapor Limiti**: Kullanıcı başına günlük şüpheli dolap raporu (varsayılan: 2)

#### Rezerv Kapasite

- **Rezerv Oranı**: Toplam kapasiteden rezerv olarak ayrılacak oran (varsayılan: 0.10)
- **Minimum Rezerv**: Her zaman rezervde tutulacak minimum dolap sayısı (varsayılan: 2)

### 2. Kiosk için Geçersiz Kıl

Bu bölümde belirli kiosklar için özel ayarlar yapabilirsiniz:

1. **Kiosk Seçimi**: Dropdown menüden kiosk seçin
2. **Özel Ayarlar**: Sadece o kiosk için geçerli olacak değerleri girin
3. **Geçersiz Kılma**: "Kiosk için Geçersiz Kıl" butonuna tıklayın
4. **Silme**: "Tüm Geçersiz Kılmaları Sil" ile tüm özel ayarları kaldırın

**Not**: Kiosk-özel ayarlar global ayarları geçersiz kılar. Boş bırakılan alanlar global değerleri kullanır.

### 3. Denetim Geçmişi

Tüm yapılandırma değişikliklerinin detaylı kaydını görüntüler:

#### Filtreleme Seçenekleri

- **Kiosk Filtresi**: Belirli bir kiosk için değişiklikleri görün
- **Ayar Filtresi**: Belirli bir ayar için değişiklikleri görün
- **Tarih Aralığı**: Başlangıç ve bitiş tarihi belirleyin

#### Geçmiş Bilgileri

- **Tarih**: Değişikliğin yapıldığı zaman
- **Kiosk**: Hangi kiosk için yapıldı (Global ise tüm kiosklar)
- **Ayar**: Değiştirilen ayar adı
- **Eski Değer**: Önceki değer
- **Yeni Değer**: Yeni değer
- **Değiştiren**: Değişikliği yapan kullanıcı

### 4. Doğrulama

Yapılandırmanın geçerliliğini kontrol etmek için:

1. **Tam Doğrulama Çalıştır**: Tüm ayarları kontrol eder
2. **Yapılandırma Sürümü Kontrol Et**: Mevcut sürüm bilgisini gösterir

## Kullanım Senaryoları

### Senaryo 1: Akıllı Atamayı Etkinleştirme

1. **Global Yapılandırma** sekmesine gidin
2. **Akıllı Atama Etkin** ayarını "Açık" yapın
3. **Kaydet** butonuna tıklayın
4. Sistem otomatik olarak tüm kiosklarda akıllı atamayı etkinleştirir

### Senaryo 2: Belirli Bir Kiosk için Özel Ayar

1. **Kiosk için Geçersiz Kıl** sekmesine gidin
2. Dropdown'dan kiosk seçin
3. Değiştirmek istediğiniz ayarları girin
4. **Kiosk için Geçersiz Kıl** butonuna tıklayın

### Senaryo 3: Değişiklik Geçmişini İnceleme

1. **Denetim Geçmişi** sekmesine gidin
2. Gerekirse filtreleri ayarlayın
3. Değişiklik listesini inceleyin
4. Sayfalama ile eski kayıtlara erişin

## Güvenlik ve İzinler

### Gerekli Yetkiler

- **Okuma işlemleri**: `VIEW_LOCKERS` yetkisi gereklidir
- **Yazma işlemleri**: `SYSTEM_CONFIG` yetkisi gereklidir
- **CSRF Koruması**: Tüm yazma işlemlerinde CSRF token zorunludur
- **Oturum Doğrulama**: Geçerli oturum gereklidir

### Hata Yanıt Şeması

Tüm API endpoints aşağıdaki JSON hata formatını kullanır:

```json
{
  "success": false,
  "error": "Hata mesajı açıklaması",
  "code": "ERROR_CODE", // Opsiyonel
  "details": {} // Opsiyonel ek detaylar
}
```

**Yaygın Hata Kodları:**

- `400`: Geçersiz istek veya doğrulama hatası
- `401`: Kimlik doğrulama gerekli
- `403`: Yetkisiz erişim
- `404`: Kaynak bulunamadı
- `500`: Sunucu hatası

## Teknik Detaylar

### API Endpoints

Tüm API endpoints `/api/admin/config/*` prefix'i kullanır:

- `GET /api/admin/config/global` - Global yapılandırmayı getir
- `PUT /api/admin/config/global` - Global yapılandırmayı güncelle
- `GET /api/admin/config/effective?kiosk_id=X` - Etkili yapılandırmayı getir
- `PUT /api/admin/config/override/{kioskId}` - Kiosk geçersiz kılması ayarla
- `DELETE /api/admin/config/override/{kioskId}` - Kiosk geçersiz kılmasını sil
- `GET /api/admin/config/history` - Yapılandırma geçmişini getir
- `GET /api/admin/config/version` - Yapılandırma sürümünü getir
- `POST /api/admin/config/reload` - Yapılandırmayı yeniden yükle

### Pagination Parameters

Geçmiş API'si için pagination parametreleri:

- `page`: Sayfa numarası (varsayılan: 1)
- `limit`: Sayfa başına kayıt sayısı (varsayılan: 50)
- Sıralama: `updated_at DESC` (yeniden eskiye)

### Doğrulama Kuralları

- **base_score**: 0-1000 arası pozitif sayı
- **session_limit_minutes**: 60-480 dakika arası
- **quarantine_min_floor**: 1-60 dakika arası
- **quarantine_min_ceiling**: 5-120 dakika arası
- **reserve_ratio**: 0-0.5 arası ondalık sayı
- **pulse_ms**: 200-2000 ms arası
- **open_window_sec**: 5-20 saniye arası
- **retry_backoff_ms**: 200-1000 ms arası
- **top_k_candidates**: 1-20 arası
- **selection_temperature**: 0.1-5.0 arası
- **score_factor_d**: 0-5 arası
- **locker_opens_window_sec**: 10-300 saniye arası
- **locker_opens_max_per_window**: 1-10 arası
- **command_cooldown_sec**: 1-10 saniye arası
- **Boolean değerler**: true/false
- **Rate limit değerleri**: Pozitif sayılar

### Hata Yönetimi

- Geçersiz değerler için açıklayıcı hata mesajları
- Ağ hatalarında otomatik yeniden deneme
- Kullanıcı dostu Türkçe hata mesajları
- Başarılı işlemler için onay mesajları

## Sorun Giderme

### Yaygın Sorunlar

1. **Ayarlar kaydedilmiyor**

   - Yetki kontrolü yapın
   - Ağ bağlantısını kontrol edin
   - Tarayıcı konsolunda hata mesajlarını inceleyin

2. **Kiosk geçersiz kılmaları çalışmıyor**

   - Kiosk ID'sinin doğru olduğundan emin olun
   - Effective configuration API'sini test edin

3. **Geçmiş yüklenmiyor**
   - Sayfa boyutunu küçültün
   - Filtreleri temizleyin
   - Tarih aralığını daraltın

### Destek

Teknik destek için:

- Tarayıcı konsolundaki hata mesajlarını kaydedin
- Yapılan işlemlerin adımlarını not edin
- Sistem yöneticisine başvurun

## Güncelleme Notları

Bu arayüz Task 24 kapsamında geliştirilmiştir ve şu özellikleri içerir:

- Global yapılandırma düzenleme
- Kiosk-özel geçersiz kılma yönetimi
- Yapılandırma doğrulama ve hata yönetimi
- Denetim geçmişi ve izleme
- Türkçe etiketler: "Kaydet", "Varsayılanı Yükle", "Kiosk için Geçersiz Kıl"
- Responsive tasarım ve kullanıcı dostu arayüz
- Seeded varsayılan değerlerle tam uyumluluk
- Tek API prefix kullanımı (/api/admin/config/\*)
- Standart pagination (page, limit) ve sıralama (updated_at DESC)
- Açık yetki gereksinimleri (VIEW_LOCKERS, SYSTEM_CONFIG)
- CSRF koruması tüm yazma işlemlerinde
- Standart JSON hata şeması

### Teknik Uyumluluk

- **Alan Adları**: Seeded migration'daki tam alan adları kullanılır
- **Varsayılan Değerler**: Migration'dan alınan gerçek değerler gösterilir
- **API Tutarlılığı**: Tek prefix stili (/api/admin/config/\*)
- **Pagination**: Standart page/limit parametreleri (varsayılan limit: 50)
- **Sıralama**: updated_at DESC (yeniden eskiye)
- **Yetkilendirme**: Açık scope gereksinimleri
- **Hata Yönetimi**: Tutarlı JSON hata formatı
