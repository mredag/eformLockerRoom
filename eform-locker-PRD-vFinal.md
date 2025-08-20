# Eform Locker — PRD vFinal

Kayıtsız dolap sistemi. RFID ana akış. Opsiyonel statik QR. Zaman sınırı yok. “Aç” her zaman bırakır. VIP dolap desteği.

## Hedefler
- Üyelik isteme.
- Bir kart bir dolap.
- İnternetsiz çalışma.
- Hızlı kurulum.
- Düşük bakım.

## Kapsam
- Oda başı kiosk. 30 dolap örnek.
- RFID ana yol.
- Statik QR yedek yol.
- Personel paneli.
- Kiosk master PIN.
- VIP dolap sözleşmesi.

## Roller
- Kullanıcı. Kart ile işlem yapar.
- Personel. Panel ve master PIN kullanır.
- Sistem. Kiosk, API, röle köprüsü.

## Donanım
- 2× RS485 16 kanal Modbus röle kartı.
- 1× USB RS485 dönüştürücü. 1× yedek.
- 30× K02 12V selenoid kilit.
- 1× 12V PSU 10–15A.
- 1× Raspberry Pi 4 veya 5 ve dokunmatik ekran.
- 1× USB HID RFID okuyucu.
- 30× 1N5408 diyot. 30× 2A sigorta ve yuva.
- RS485 kablosu. 2×0.75 mm² güç kablosu. Klemens.

## Ağ
- Yerel LAN. Kiosk IP sabit.
- Panel resepsiyon PC’den erişir.
- QR için yerel SSID opsiyonel. Captive portal.

## İş kuralları
- “Aç” komutu sahipliği siler. Dolap Free olur.
- Kartı olan kullanıcı Free listeden dolap seçer. Sistem açar. Sahiplik atanır.
- Zaman sınırı yok. Bırakma yalnız açma ile olur.
- Panel tek tek ya da toplu açar.
- Kiosk master PIN ile seçilen dolap açılır.
- VIP dolapta “Aç” bırakmaz. Sahiplik sürer.

## Durumlar
- Free. Sahipsiz. Kilitli.
- Reserved. Seçilmiş. 90 saniye.
- Owned. Sahipli. Kilitli.
- Opening. Darbe gönderiliyor.
- Blocked. Bakımda.

### Geçişler
- Free → Reserved. Kart ile seçim.
- Reserved → Owned. Açma kabul edilince.
- Reserved → Free. 90 saniye dolarsa.
- Owned → Free. Kart ile açınca. Panel ile açınca. Master ile açınca. QR aynı cihaz ile açınca. VIP hariç.
- Her durum → Blocked. Personel.

## UX akışları

### Kiosk ana ekran
- Metin. Kart okutunuz.
- Kartta dolap yok. Free liste gelir. Seç. Açılır. Owned olur. Ana ekrana dön.
- Kartta dolap var. Tek darbe. Açılır. Free olur. Mesaj 2 saniye.

### Kiosk master
- Master butonu.
- Grid. Tüm dolaplar.
- Dolabı seç. PIN gir. Doğru ise aç ve Free. Hatalı 5 denemede 5 dakika kilit.
- PIN panelden kurulur ve değişir. Kiosk bazında tutulur.

### Panel
- Canlı durum. Free. Reserved. Owned. Blocked.
- İşlemler. Aç. Blokla. Blok kaldır. Override aç.
- Toplu aç. Tümü ya da seçili. Sıralı gönderim.
- Gün sonu aç. Owned ve Reserved açılır ve bırakılır. VIP hariç seçeneği vardır.
- Master PIN yönetimi. Oluştur. Değiştir. İptal.
- VIP yönetimi. Oluştur. Uzat. Kart değiştir. İptal.

### Statik QR opsiyonel
- Etiket. http://oda-ip/lock/{id}
- Free. İlk tarama. assign(device_id) ve aç.
- Aynı cihaz tekrar tarama. aç ve bırak.
- Başka cihaz. Dolu yanıtı.
- VIP dolapta QR kapalıdır.

## VIP dolap
- Sözleşme süresi 3–12 ay.
- Kart eşleşiyorsa aç. Owned kalır. release yok.
- Free listesinde görünmez.
- Panelden oluşturulup yönetilir.
- Gün sonu açımında VIP hariçtir. İstenirse dahil edilir.

## Güvenlik
- Admin ve master PIN. Argon2id.
- Master girişlerinde oran sınırlama. 5 hata kilit.
- Panel yalnız personel ağında.
- QR device_id çerezi. HttpOnly. SameSite Strict.
- action_token tek kullanımlık. 5 saniye TTL. HMAC.
- Rate limit. IP. kart. dolap.

## Zamanlama ve parametreler
- OPEN_PULSE_MS 400
- OPEN_BURST_SECONDS 10
- OPEN_BURST_INTERVAL_MS 2000
- RESERVE_TTL_SECONDS 90
- BULK_INTERVAL_MS 300
- MASTER_LOCKOUT_FAILS 5
- MASTER_LOCKOUT_MINUTES 5
- HEARTBEAT_SEC 10
- OFFLINE_SEC 30

## Modbus ve kablolama
- RS485. 9600 8N1. A→A. B→B. GND ortak. Uçta 120 Ω.
- Failsafe: A hattına 680 Ω pull-up, B hattına 680 Ω pull-down önerilir.
- Yıldız topoloji yok. Daisy chain.
- Röle kanalı. 12V + → 2A sigorta → COM. NO → kilit +. Kilit − → GND.
- Bobine 1N5408 ters paralel.
- Darbe 400–600 ms. Açılışta burst 10 saniye boyunca 2 saniye aralık.
- Aynı anda tek kanal sürülür. Kuyruk zorunlu.

## Güç ve koruma
- K02 tepe akım ~2 A. Aynı anda tek kilit sür.
- 12 V PSU’ya DC taraf ana sigorta ekle. Her kilide seri 2 A sigorta.
- 12 V hattına uygun TVS diyot ekle (ör. SMBJ14A).
- Ortak toprak kullan. AC ve SELV hatlarını ayır.

## Enerji kesintisi ve yeniden başlatma
- Otomatik açma yok. Kiosk açılınca “restarted” olayı kaydedilir.
- Yarım kalan komut kuyruğu temizlenir. Panel uyarı gösterir.
- Acil erişim için mekanik açma veya personel arka erişimi zorunludur.

## Dayanıklılık
- systemd Restart=always. Donanım watchdog açık.
- microSD High Endurance. SQLite WAL. Logrotate.
- Gecelik yedek: DB ve konfig USB veya ağ konumuna.

## RFID güvenliği
- 125 kHz kopyalanabilir. VIP için 13.56 MHz DESFire seçeneği sun.
- UID hash standardı ve byte sırası sabitlenir.

## QR güvenliği
- Captive portal yalnız kiosk IP’lerine çözer. İnternet kapalı.
- Origin/Referer kontrolü. Rate limit uygulanır.
- Gizli mod uyarısı QR sayfasında görünür.

## Çok odalı operasyon
- Kiosk heartbeat 10 sn. Offline eşiği 30 sn.
- Komut kuyruğu kalıcı. DB kesintisinde yeniden dene.
- Panelde zone/kiosk filtreleri ve durum rozetleri.

## Panel ve raporlar
- Büyük butonlar. TR/EN dil seçimi.
- Gün sonu aç raporu CSV: kiosk_id, locker_id, saat, sonuç.
- VIP uyarı listesi: 7 gün içinde bitecek sözleşmeler.

## Operasyon ve bakım
- Günlük otomatik test: Her kilit için aç-kapat turu ve rapor.
- Isı/çevrim testi: Sorunlular otomatik Blocked’a düşsün.
- Yedek röle, kilit, dönüştürücü stokta tutulur.

## Ağ güvenliği
- Panel yalnız personel VLAN’ında. Kiosk firewall çıkışı kısıtlı.
- Admin/master PIN rotasyonu 90 günde bir.

## Uygulama güvenliği
- Tüm personel işlemleri event olarak zorunlu kayda alınır.

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
