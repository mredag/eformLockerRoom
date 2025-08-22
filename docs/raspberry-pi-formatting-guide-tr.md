# 🍓 Raspberry Pi Formatlama ve Kurulum Rehberi
*eForm Locker Sistemi için Özel Hazırlanmış*

## ⚠️ Formatlama Öncesi Kritik Kontroller

### 1. **Veri Yedekleme**
```bash
# Mevcut verileri yedekleyin
sudo cp -r /home/pi/eform-locker /media/usb-backup/
sudo cp /etc/systemd/system/eform-*.service /media/usb-backup/
sudo cp -r /etc/nginx/sites-available/ /media/usb-backup/
```

### 2. **Donanım Bağlantılarını Kontrol Edin**
- USB-RS485 dönüştürücüyü çıkarın
- RFID okuyucuyu güvenli şekilde ayırın
- Röle kartlarının güç bağlantısını kesin
- MicroSD kartı güvenli şekilde çıkarın

### 3. **Lisans ve Konfigürasyon Bilgilerini Kaydedin**
```bash
# Sistem konfigürasyonunu yedekleyin
sudo cp /boot/config.txt /media/backup/
sudo cp /boot/cmdline.txt /media/backup/
sudo cp /etc/dhcpcd.conf /media/backup/
```

## 💾 SD Kart Formatlama Süreci

### Adım 1: Doğru SD Kart Seçimi
- **Minimum:** 32GB Class 10 microSD
- **Önerilen:** 64GB Class 10 veya daha hızlı
- **Marka:** SanDisk, Samsung, Kingston gibi güvenilir markalar

### Adım 2: Raspberry Pi Imager Kullanımı
```
1. Raspberry Pi Imager'ı indirin (rpi.org)
2. "Raspberry Pi OS (64-bit)" seçin
3. ⚙️ Gelişmiş ayarları açın
4. Aşağıdaki ayarları yapın:
```

### Adım 3: Kritik Ayarlar (Gelişmiş Seçenekler)

#### 🔧 **Sistem Ayarları**
```
✅ SSH'yi etkinleştir
✅ Kullanıcı adı ve şifre belirle
   Kullanıcı: pi
   Şifre: [güçlü bir şifre]

✅ WiFi yapılandır
   SSID: [ağ adınız]
   Şifre: [wifi şifreniz]
   Ülke: TR

✅ Yerel ayarları yapılandır
   Saat dilimi: Europe/Istanbul
   Klavye düzeni: Turkish
```

#### 🌐 **Ağ Ayarları**
```
✅ Hostname belirle: pi-eform-locker
✅ SSH public key (opsiyonel)
✅ Telemetri devre dışı bırak
```

## 🚀 İlk Kurulum Sonrası Yapılacaklar

### 1. **Sistem Güncellemesi**
```bash
sudo apt update && sudo apt upgrade -y
sudo apt autoremove -y
sudo rpi-update
```

### 2. **Gerekli Paketlerin Kurulumu**
```bash
# Node.js 20 kurulumu
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Sistem araçları
sudo apt install -y git vim htop screen ufw
sudo apt install -y python3-pip python3-serial

# USB ve seri port araçları
sudo apt install -y minicom setserial
```

### 3. **Kullanıcı İzinleri**
```bash
# Pi kullanıcısını gerekli gruplara ekle
sudo usermod -a -G dialout,gpio,i2c,spi,audio,video pi

# USB cihazları için izinler
sudo chmod 666 /dev/ttyUSB*
echo 'SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", MODE="0666"' | sudo tee /etc/udev/rules.d/99-usb-serial.rules
```

### 4. **Güvenlik Ayarları**
```bash
# UFW firewall kurulumu
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 3000:3003/tcp  # eForm servisleri için

# SSH güvenliği
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

## 🔌 Donanım Kurulumu Sonrası

### 1. **USB Cihazlarını Kontrol Edin**
```bash
# USB cihazları listele
lsusb

# Seri portları kontrol et
ls -la /dev/ttyUSB*

# RFID okuyucu kontrolü
ls -la /dev/input/event*
```

### 2. **GPIO ve I2C Ayarları**
```bash
# Raspberry Pi konfigürasyon
sudo raspi-config

# Aşağıdaki seçenekleri etkinleştirin:
# - Interface Options > SSH (Enable)
# - Interface Options > I2C (Enable) 
# - Interface Options > SPI (Enable)
# - Advanced Options > Expand Filesystem
```

### 3. **Dokunmatik Ekran Kalibrasyonu**
```bash
# Dokunmatik ekran için
sudo apt install -y xinput-calibrator

# Kalibrasyon çalıştır
xinput_calibrator
```

## 📱 eForm Locker Sistemi Kurulumu

### 1. **Proje Klonlama**
```bash
cd /home/pi
git clone https://github.com/mredag/eformLockerRoom.git eform-locker
cd eform-locker
```

### 2. **Bağımlılıkları Kurma**
```bash
npm install
```

### 3. **Konfigürasyon**
```bash
# Sistem konfigürasyonunu kopyala
cp config/system.json.example config/system.json

# Raspberry Pi için özel ayarlar
nano config/system.json
```

### 4. **Veritabanı Kurulumu**
```bash
npm run migrate
```

### 5. **Servisleri Kurma**
```bash
# Systemd servisleri kur
sudo cp scripts/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable eform-gateway eform-kiosk eform-panel
```

## 🧪 Sistem Testi

### 1. **Donanım Validasyonu**
```bash
# Waveshare donanım testi
node scripts/validate-waveshare-hardware.js

# Genel donanım testi
node scripts/hardware-diagnostics.js
```

### 2. **Servis Testleri**
```bash
# Servisleri başlat
sudo systemctl start eform-gateway
sudo systemctl start eform-kiosk  
sudo systemctl start eform-panel

# Durumları kontrol et
sudo systemctl status eform-*
```

### 3. **Web Arayüzü Testi**
```
Kiosk: http://pi-eform-locker.local:3001
Panel: http://pi-eform-locker.local:3002
API: http://pi-eform-locker.local:3000/health
```

## ⚠️ Önemli Uyarılar

### 🔴 **Güç Kesintisi Koruması**
```bash
# UPS kullanın veya güç kesintisi koruması ekleyin
sudo apt install -y nut-client

# Otomatik yeniden başlatma
echo '@reboot sleep 30 && sudo systemctl start eform-*' | crontab -
```

### 🔴 **SD Kart Koruması**
```bash
# Log2ram kurarak SD kart ömrünü uzatın
echo "deb http://packages.azlux.fr/debian/ buster main" | sudo tee /etc/apt/sources.list.d/azlux.list
wget -qO - https://azlux.fr/repo.gpg.key | sudo apt-key add -
sudo apt update
sudo apt install log2ram
```

### 🔴 **Yedekleme Stratejisi**
```bash
# Günlük otomatik yedekleme
echo "0 2 * * * rsync -av /home/pi/eform-locker/ /media/backup/" | crontab -

# SD kart imajı yedekleme (haftalık)
echo "0 3 * * 0 sudo dd if=/dev/mmcblk0 of=/media/backup/pi-backup-$(date +%Y%m%d).img bs=4M" | crontab -
```

## 🔧 Sorun Giderme

### Problem: USB cihazları tanınmıyor
```bash
# USB güç ayarları
echo 'max_usb_current=1' | sudo tee -a /boot/config.txt

# USB hub kullanıyorsanız powered hub tercih edin
```

### Problem: Seri port izin hatası
```bash
sudo chmod 666 /dev/ttyUSB0
sudo usermod -a -G dialout pi
```

### Problem: Dokunmatik ekran çalışmıyor
```bash
# Ekran sürücülerini kontrol et
sudo dmesg | grep -i touch

# Konfigürasyonu güncelle
sudo nano /boot/config.txt
# Ekran için gerekli ayarları ekleyin
```

### Problem: WiFi bağlantı sorunu
```bash
# WiFi konfigürasyonu
sudo nano /etc/wpa_supplicant/wpa_supplicant.conf

# Ağ yeniden başlatma
sudo systemctl restart networking
```

## 📋 Kurulum Sonrası Kontrol Listesi

- [ ] Sistem güncellemeleri tamamlandı
- [ ] Node.js 20 kuruldu ve çalışıyor
- [ ] USB-RS485 dönüştürücü tanındı
- [ ] RFID okuyucu çalışıyor
- [ ] Röle kartları iletişim kuruyor
- [ ] Dokunmatik ekran kalibre edildi
- [ ] WiFi bağlantısı stabil
- [ ] SSH erişimi çalışıyor
- [ ] eForm servisleri otomatik başlıyor
- [ ] Web arayüzleri erişilebilir
- [ ] Yedekleme sistemi kuruldu
- [ ] Güvenlik ayarları yapıldı

## 🎯 Performans Optimizasyonu

### GPU Bellek Ayarı
```bash
# /boot/config.txt dosyasına ekleyin
gpu_mem=128  # Dokunmatik ekran için
```

### Swap Ayarları
```bash
# Swap boyutunu artır
sudo dphys-swapfile swapoff
sudo nano /etc/dphys-swapfile
# CONF_SWAPSIZE=2048
sudo dphys-swapfile setup
sudo dphys-swapfile swapon
```

### CPU Performansı
```bash
# CPU governor ayarı
echo 'performance' | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
```

Bu rehberi takip ederek Raspberry Pi'nizi eForm Locker Sistemi için optimal şekilde hazırlayabilirsiniz. Herhangi bir sorunla karşılaştığınızda sorun giderme bölümünü kontrol edin.