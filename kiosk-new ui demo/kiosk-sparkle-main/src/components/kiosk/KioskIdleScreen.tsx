import React from 'react';
import { CreditCard, Wifi } from 'lucide-react';

interface KioskIdleScreenProps {
  onCardScan?: (cardId: string) => void;
}

const KioskIdleScreen: React.FC<KioskIdleScreenProps> = ({ onCardScan }) => {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      {/* Status Bar */}
      <div className="absolute top-6 left-6 flex items-center gap-2 text-muted-foreground">
        <div className="w-3 h-3 bg-success rounded-full animate-pulse"></div>
        <span className="text-sm font-medium">Bağlı</span>
        <Wifi className="w-4 h-4 ml-2" />
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center max-w-md w-full space-y-8">
        {/* RFID Icon with Animation */}
        <div className="relative">
          <div className="kiosk-card kiosk-card-elevated bg-gradient-surface p-12 rounded-3xl animate-pulse-glow">
            <CreditCard className="w-24 h-24 text-primary mx-auto" />
            
            {/* Scanning Line Animation */}
            <div className="absolute inset-0 rounded-3xl overflow-hidden">
              <div className="absolute w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-scan-line"></div>
            </div>
          </div>
          
          {/* Pulse Rings */}
          <div className="absolute inset-0 rounded-3xl border-2 border-primary/30 animate-ping"></div>
          <div className="absolute inset-4 rounded-3xl border-2 border-primary/20 animate-ping" style={{ animationDelay: '0.5s' }}></div>
        </div>

        {/* Title */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-gradient">
            Kartınızı okutun
          </h1>
          <p className="text-xl text-muted-foreground">
            RFID kartınızı okutucuya yaklaştırın
          </p>
        </div>

        {/* Instructions */}
        <div className="kiosk-glass p-6 rounded-2xl space-y-3 w-full max-w-sm">
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">1</span>
            </div>
            <span>Kartınızı okutucuya yaklaştırın</span>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">2</span>
            </div>
            <span>Dolap seçin ve eşyalarınızı yerleştirin</span>
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">3</span>
            </div>
            <span>Dolap otomatik olarak açılacaktır</span>
          </div>
        </div>

        {/* Warning Notice */}
        <div className="kiosk-glass p-4 rounded-xl border-l-4 border-primary/40 bg-primary/5">
          <p className="text-sm text-muted-foreground">
            <span className="text-primary font-medium">Bilgi:</span> Mevcut dolap sahibiyseniz, dolabınız otomatik açılır. Aynı dolabı tekrar kullanmak için kartınızı tekrar okutun.
          </p>
        </div>

        {/* Demo Button (for testing) */}
        <button 
          onClick={() => onCardScan?.('demo-card-123')}
          className="kiosk-button px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium opacity-50 hover:opacity-70 transition-opacity"
        >
          Demo Kart Tarama
        </button>
      </div>
    </div>
  );
};

export default KioskIdleScreen;