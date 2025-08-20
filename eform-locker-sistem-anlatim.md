# Eform Locker — Sistem Nasıl Çalışır

## Amaç
- Üyelik yok. Kart ve opsiyonel statik QR ile çalışır.
- “Aç” komutu bırakır. VIP dolap hariç.
- Zaman sınırı yok.
- Çok odalı yapı. Her oda ayrı kiosk.

## Roller
- Kullanıcı. RFID kart sahibi.
- Personel. Panel ve kiosk master PIN yetkilisi.
- Kiosk. Oda içi kontrol bilgisayarı.
- Panel sunucusu. Tüm odaları gösterir.

## Temel Kavramlar
- Dolap durumları: Free, Reserved, Owned, Opening, Blocked.
- Free. Sahipsiz ve kilitli.
- Reserved. Seçilmiş. 90 saniye içinde açma kabul edilir.
- Owned. Sahipli ve kilitli.
- Opening. Açma darbesi gönderilir.
- Blocked. Bakımda. Atama yapılmaz.

## Kullanıcı Akışları

### 1) Dolap alma
1. Kiosk ana ekranında “Kart okutunuz”.
2. Kartta dolap yoksa boş dolap listesi gelir.
3. Kullanıcı bir dolap seçer. Sistem Reserved yapar ve açma burst’u başlatır.
4. Dolap açılır. Durum Owned olur.
5. Kullanıcı eşyayı koyar ve kapıyı iter. Mekanik kilit devreye girer.

### 2) Dolabı açma ve bırakma
1. Kullanıcı kartı okutur.
2. Sistem atanmış dolabı tek darbe ile açar.
3. VIP değilse sahiplik anında silinir. Durum Free olur.
4. Ekranda “Dolap X açıldı ve bırakıldı” mesajı kısa süre görünür.

### 3) Yeniden dolap alma
- Tekrar kart okutulur.
- Boş dolap listesi gelir.
- Kullanıcı ister aynı dolabı ister başka dolabı seçer.

### 4) Statik QR (opsiyonel)
- Her dolap üstünde URL bulunur. Örnek: http://oda-ip/lock/{id}
- Free ise ilk taramada atama yapılır ve açılır. owner=device_id.
- Aynı cihaz tekrar tararsa açılır ve bırakılır. Free olur.
- Farklı cihaz tararsa “Dolu” yanıtı verilir.
- VIP dolapta QR kapalıdır.

## VIP Dolaplar

### Özellik
- 3–12 ay tek karta atanır.
- Kart ile açılınca sahiplik düşmez. Owned kalır.
- Free listesinde görünmez.
- Gün sonu toplu açmada varsayılan hariç tutulur.

### Atama
- Panelden VIP sözleşmesi oluşturulur. locker_id ve kart tanımlanır.
- Gerekirse yedek kart girilir.
- Başlangıç ve bitiş tarihi kaydedilir.

### Erişim
- Tanımlı kart okutulunca dolap açılır. Owned kalır.
- Farklı kart reddedilir.
- QR bu dolapta çalışmaz.
- Personel master veya panel ile açarsa yine Owned kalır.
- Sözleşme iptal edilirse dolap normal akışa döner.

## Personel İşlemleri

### Panel
- Tüm odaları ve kioskları görür. Filtreler ile arar.
- Dolap listesinde durum, VIP etiketi ve son açılma zamanı görünür.
- İşlemler: Aç, blokla, blok kaldır, override aç.
- Toplu aç: Seçilen dolaplar veya tümü. Sıralı çalışır.
- Gün sonu aç: Owned ve Reserved açılır ve bırakılır. VIP hariç seçeneği vardır.
- Kiosk master PIN yönetimi: Oluştur, değiştir, devre dışı bırak.
- VIP sözleşme yönetimi: Oluştur, uzat, kart değiştir, iptal.
- Olay geçmişi ve CSV dışa aktarım.

### Kiosk master PIN
- Kiosk ana ekranda “Master” butonu vardır.
- Personel dolabı seçer. PIN girer.
- Doğru PIN ile dolap açılır ve Free olur.
- Hatalı 5 denemede 5 dakika kilit uygulanır.
- PIN panelden tanımlanır ve değişir.

## Sahipliğin Silindiği Durumlar
- Kullanıcı kartu ile açınca (VIP hariç).
- Aynı cihaz QR ile açınca.
- Personel panelden “Aç” komutu verince.
- Kiosk master PIN ile açınca.
- Toplu açma çalışınca.

## Kenar Durumları ve Tepkiler

### Kapı çekilmedi
- Reserved 90 saniyede düşer. Dolap Free olur.

### Kilit açılmadı
- Burst biter. “Açılamadı. Personeli çağırın.” mesajı çıkar.
- Personel panelden “override aç” dener.
- Sık tekrar eden arıza için dolap Blocked yapılır.

### Kart kayboldu
- Personel panelden override aç yapar.
- VIP dolapta “kart değiştir” ile yeni kart tanımlanır.

### Kiosk offline
- Panelde kiosk “offline” görünür.
- Komut kuyruğa yazılır. Kiosk tekrar bağlanınca uygulanır.

### RS485 hatası
- Panel /health uyarır.
- Kablolama ve sonlandırma kontrol edilir.
- Gerekirse kiosk yeniden başlatılır.

### QR gizli mod
- device_id silinir. QR ile açınca bırakma çalışmaz.
- Ekranda yerel uyarı metni gösterilir.
- Kullanıcı karta yönlendirilir.

## Çok Odalı Çalışma
- Her oda kendi Raspberry Pi ve röle setini kullanır.
- Kiosk panelde register olur. Heartbeat gönderir.
- Personel paneli odaları tek ekranda gösterir.
- Komutlar panelden kuyruğa alınır. Kiosk 2 saniyede bir çeker.

## Güvenlik
- Admin ve master PIN hash’leri Argon2id ile tutulur.
- Personel oturumu HttpOnly çerez ile korunur.
- QR device_id çerezi HttpOnly ve SameSite Strict’tir.
- action_token tek kullanımlıktır ve 5 saniye geçerlidir.
- Oran sınırlama uygulanır. IP, kart ve dolap bazında.

## Mesajlar
- “Kart okutunuz”
- “Boş dolap yok”
- “Dolap X açılıyor”
- “Dolap X açıldı ve bırakıldı”
- “Açılamadı. Personeli çağırın”
- “VIP dolap. QR kapalı”
- “Hatalı PIN. 5 deneme kaldı”
- “Geçici kilit. Lütfen bekleyin”

## Ölçüm ve Kayıt
- Tüm işlemler events tablosuna yazılır.
- Panelde günlük CSV indirme vardır.
- Gözlemlenen metrikler: açma sayısı, master denemeleri, bloklu dolaplar, offline kiosklar.

## Tipik Senaryolar

1) Yeni kullanıcı dolap alır
- Kart okutulur. Free liste gelir. Dolap 12 seçilir.
- Sistem 12’yi açar ve Owned yapar.
- Kullanıcı eşyayı koyar ve kapatır.

2) Kullanıcı eşya alır ve bırakır
- Kart okutulur.
- Sistem dolabı açar ve Free yapar.
- Kullanıcı isterse tekrar boş dolap listesinden seçim yapar.

3) Kullanıcı yanlış dolabı seçti
- 90 saniye içinde kapı çekilmezse Reserved düşer.
- Free listesine geri döner.

4) VIP kullanıcı erişimi
- Kart okutulur. Dolap açılır. Owned kalır.
- Kullanıcı gün içinde istediği kadar açar.
- Sözleşme bitince panelde expire edilir. Dolap normal akışa döner.

5) Dolap sıkıştı
- Kiosk “Açılamadı” mesajı verir.
- Personel panelden override aç dener.
- Gerekirse dolap Blocked yapılır.
- Tamir sonrası “blok kaldır” yapılır.

6) Gün sonu açma
- Personel panelden “Gün sonu aç” seçer.
- VIP hariç tüm Owned ve Reserved açılır ve Free olur.
- Olaylar kaydedilir.

7) Çok odalı komut
- Panelde “Kadın Oda” seçilir.
- Dolap 5 için open komutu verilir.
- Komut kuyruğa düşer. Kiosk çekip uygular.
- Sonuç panelde görünür.

## Statik QR Tasarımı

### Hedef
- Kartı olmayan ama yerel ağa bağlı kullanıcı için yedek erişim.
- Donanım eklemeden çalışır.
- VIP dolaplarda kapalıdır.

### Mimari
- Her dolapta sabit URL etiketi: `http://<kiosk_ip>/lock/{locker_id}`
- Sunucu kiosk üzerindedir. Panel gerekmez.
- Yerel SSID opsiyoneldir. Captive portal ile DNS yönlenir.

### Kimlik ve oturum
- device_id çerezi. 128 bit rasgele. HttpOnly. SameSite=Strict. Süre 1 yıl.
- action_token. Tek kullanımlık. 5 saniye geçerli. HMAC-SHA256 ile imzalı.
- Token URL’de taşınmaz. POST gövdesi ile gelir.

### Akış
1) GET /lock/{id}
- VIP ise 423 döner. “VIP dolap. QR kapalı.”
- device_id yoksa üretir.
- action_token üretir.
- Basit HTML döner. Sayfa otomatik POST /act yapar.

2) POST /act { locker_id, action_token }
- Token doğrulanır. Süre ve imza kontrol edilir.
- Dolap Free ise: assign(owner_type=device, owner_key=device_id) + openPulse + burst. Yanıt 200.
- Dolap Owned ve owner_key aynı device_id ise: openPulse + release → Free. Yanıt 200.
- Aksi halde: 423 Dolu.
- Eşzamanlılıkta version alanı ile CAS yapılır. Çakışma 409 ve tekrar.

### Güvenlik
- HMAC gizli anahtar kiosk üzerinde tutulur.
- Rate limit: IP 30/dk. locker 6/dk. aynı device 1/20 sn.
- Referer isteğe bağlı kontrol. Origin eşleşmesi.
- JSON yanıt ver. Hata kodları: 400, 401, 409, 423, 429.

### RFID ve master etkileşimi
- RFID ile açılırsa: release_on_open. QR sahipliği düşer.
- Panel açarsa: release_on_open. QR sahipliği düşer.
- Master PIN ile açılırsa: release_on_open.
- VIP dolapta tüm QR istekleri 423 döner.

### Mesajlar
- “Dolap X açılıyor”
- “Dolap X açıldı ve bırakıldı”
- “Dolu. Lütfen kartınızı kullanın”
- “VIP dolap. QR kapalı”
- “Sık işlem denemesi. Bir süre sonra tekrar deneyin”

### Kenar durumları
- Gizli mod: device_id kalıcı olmaz. Aynı cihaz aç-kapat akışı çalışmayabilir. Ekranda kısa bilgilendirme.
- Ağ yok: QR çalışmaz. Kiosk ve RFID çalışır.
- Birden çok sekme: Token tek kullanımlık olduğu için yalnız ilk istek geçer.
- Kiosk yeniden başladı: device_id korunur. Tokenlar geçersiz olur.

### Günlük ve olaylar
- assign_qr, release_qr
- qr_invalid_token, qr_rate_limited
- qr_vip_blocked
- Her işlem ts, kiosk_id, locker_id, device_id hash ile kayda geçer.

### Test senaryoları
- Free → ilk tarama: assign + open. 200.
- Aynı cihaz → ikinci tarama: open + release. 200.
- Farklı cihaz → tarama: 423.
- Token süresi geçti → 401.
- Rate limit → 429.
- VIP dolap → 423.
- RFID ile açınca → release_on_open event’i düşer.

## Ek Notlar ve Politikalar

### Güç ve akım
- K02 tepe ~2 A. Aynı anda tek kilit sür. BULK_INTERVAL_MS ≥ 300.
- 12 V PSU pay bırak. 30 dolapta 10–15 A yeterli.
- Her kilide 2 A sigorta. 12 V omurgaya TVS diyot.

### Enerji kesintisi
- Otomatik açma yok. Kiosk açılınca “restarted” event’i.
- Kuyruk temizlenir. Panel uyarır. Personel kontrol eder.

### Watchdog ve yedekleme
- systemd restart. Donanım watchdog.
- High Endurance SD. WAL. Logrotate.
- Gecelik DB/config yedeği.

### RS485
- Uçta 120 Ω. Failsafe dirençleri: A 680 Ω pull-up, B 680 Ω pull-down.
- Daisy chain. Yıldız yok. Ortak GND şart.

### Röle ve kilit
- 400–600 ms darbe. Sürekli tutma yok.
- Mandal hizalaması standardize edilir.

### Acil durum
- Mekanik açma yolu. Personel erişimi zorunlu.
- Panelde “acil durum aç” yetkisi ve log.

### RFID güvenliği
- VIP için 13.56 MHz DESFire öner. 125 kHz’te VIP riskli.
- UID hash formatı sabit.

### QR yolu
- Captive portal tek IP’lere çözer. Origin kontrolü. Gizli mod uyarısı.

### Çok odalı
- HEARTBEAT_SEC 10. OFFLINE_SEC 30.
- Komut kuyruğu kalıcı. Tekrar dene.

### Panel ve UX
- TR/EN. Büyük butonlar.
- Gün sonu raporu CSV.
- VIP yaklaşan bitiş listesi.

### Operasyon
- Günlük otomatik test turu.
- Isı/çevrim hatalarında Blocked.

### Ağ güvenliği
- Panel personel VLAN. Kiosk çıkışı kısıtlı.
- PIN rotasyonu 90 gün.

## Tech stack

- OS. Raspberry Pi OS Lite 64 bit.
- Dil. Node.js 20 LTS ve TypeScript.
- Web. Fastify ve pino log.
- DB. SQLite3. WAL açık.
- Modbus. modbus-serial.
- RFID. node-hid veya HID klavye okuma.
- Şifreleme. Argon2id.
- Rate limit. Token bucket. Bellek içi.
- Kiosk UI. HTML ve Vanilla JS.
- Panel. Server rendered HTML. Minimal JS.
- Paketleme. esbuild. tar.gz.
- İmza. minisign. SHA256 checksum.
- Test. Vitest. Modbus mock.

## Dizin yapısı

```
/opt/eform/
  app/
  config/
  data/
  logs/
  migrations/
  updates/
  static/
```

## Kurulum tek komut

Panel PC küçük web sunucusu ile paketi yayınlar. Pi üzerinde çalıştır.

```
curl -fsSL http://10.0.0.10:8081/eform-install.sh | sudo bash -s --   --panel-url http://10.0.0.10:8080   --kiosk-id ERK-01   --zone Erkek   --serial /dev/ttyUSB0   --baud 9600   --slaves 1,2   --pkg-url http://10.0.0.10:8081/eform-2025.08.17-r1.tar.gz
```

## install.sh özeti

```
apt-get update
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs sqlite3 jq unzip ca-certificates
useradd -r -m -s /usr/sbin/nologin eform || true
install -d -o eform -g eform /opt/eform/{app,config,data,logs,migrations,updates,static}
dd if=/dev/urandom bs=32 count=1 | base64 > /opt/eform/config/hmac.key
chmod 600 /opt/eform/config/hmac.key && chown eform:eform /opt/eform/config/hmac.key
curl -fsSL "$PKG_URL" -o /tmp/eform.tgz && tar -xzf /tmp/eform.tgz -C /opt/eform
chown -R eform:eform /opt/eform
# config.yml yazılır. systemd servisleri enable edilir. servisler başlatılır.
```

## Systemd servisleri

```
[Unit]
Description=Eform Gateway
After=network-online.target
Wants=network-online.target
[Service]
User=eform
WorkingDirectory=/opt/eform/app
ExecStart=/usr/bin/node /opt/eform/app/gateway.js --config /opt/eform/config/config.yml
Restart=always
Environment=NODE_ENV=production
[Install]
WantedBy=multi-user.target
```

Aynı kalıp ile eform-kiosk, eform-panel, eform-agent servisleri çalışır.

## Güncelleme

- Panel PC latest.json yayınlar. {version, url, sha256, sig}.
- eform-agent 30 dakikada bir kontrol eder.
- Akış. İndir. Doğrula. Servisleri durdur. Yedek al. Migrasyonları uygula. Başlat. /health doğrula.
- Başarısızsa rollback.

Manuel güncelleme.

```
sudo /opt/eform/app/bin/eform-update apply /opt/eform/updates/eform-2025.08.24-r2.tar.gz
sudo systemctl restart eform-gateway eform-kiosk eform-panel
```

Offline kurulum.

```
sudo bash /media/usb/eform-install.sh   --panel-url http://10.0.0.10:8080   --kiosk-id ERK-01   --zone Erkek   --serial /dev/ttyUSB0   --baud 9600   --slaves 1,2   --pkg-url file:///media/usb/eform-2025.08.17-r1.tar.gz
```

## Sağlık ve izleme

```
curl -fsS http://localhost:8080/health
journalctl -u eform-gateway -n 200 --no-pager
```
