import React from 'react';
import { CheckCircle, Lock, Package, AlertCircle } from 'lucide-react';

interface KioskLoadingScreenProps {
  type: 'opening' | 'success' | 'error';
  lockerId?: number;
  message?: string;
  onComplete?: () => void;
}

const KioskLoadingScreen: React.FC<KioskLoadingScreenProps> = ({
  type,
  lockerId,
  message,
  onComplete
}) => {
  React.useEffect(() => {
    if (type === 'success' && onComplete) {
      const timer = setTimeout(onComplete, 3000);
      return () => clearTimeout(timer);
    }
  }, [type, onComplete]);

  const getIcon = () => {
    switch (type) {
      case 'opening':
        return <Lock className="w-24 h-24 text-primary animate-pulse" />;
      case 'success':
        return <CheckCircle className="w-24 h-24 text-success" />;
      case 'error':
        return <AlertCircle className="w-24 h-24 text-error" />;
      default:
        return <Package className="w-24 h-24 text-primary" />;
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'opening':
        return `Dolap ${lockerId} açılıyor...`;
      case 'success':
        return 'Başarılı!';
      case 'error':
        return 'Hata oluştu';
      default:
        return 'İşlem yapılıyor...';
    }
  };

  const getSubtitle = () => {
    if (message) return message;
    
    switch (type) {
      case 'opening':
        return 'Dolabınız açılıyor, lütfen bekleyin...';
      case 'success':
        return 'Eşyalarınızı yerleştirin ve dolabı kapatın';
      case 'error':
        return 'Lütfen tekrar deneyin veya yardım isteyin';
      default:
        return 'İşlem yapılıyor...';
    }
  };

  const getProgressBar = () => {
    if (type !== 'opening') return null;

    return (
      <div className="w-full max-w-md">
        <div className="bg-muted rounded-full h-3 overflow-hidden">
          <div 
            className="bg-primary h-full rounded-full"
            style={{
              animation: 'progress-bar 2s ease-in-out infinite'
            }}
          ></div>
        </div>
        <style>{`
          @keyframes progress-bar {
            0% { width: 20%; }
            50% { width: 80%; }
            100% { width: 20%; }
          }
        `}</style>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center max-w-md w-full space-y-8">
        {/* Icon with Animation */}
        <div className={`
          kiosk-card kiosk-card-elevated bg-gradient-surface p-12 rounded-3xl
          ${type === 'opening' ? 'animate-pulse-glow' : ''}
          ${type === 'success' ? 'glow-effect animate-bounce' : ''}
          ${type === 'error' ? 'animate-pulse' : ''}
        `}>
          {getIcon()}
        </div>

        {/* Title */}
        <div className="text-center space-y-4">
          <h1 className={`text-4xl font-bold ${
            type === 'success' ? 'text-success' : 
            type === 'error' ? 'text-error' : 
            'text-gradient'
          }`}>
            {getTitle()}
          </h1>
          <p className="text-xl text-muted-foreground">
            {getSubtitle()}
          </p>
        </div>

        {/* Progress Bar */}
        {getProgressBar()}

        {/* Loading Spinner for opening state */}
        {type === 'opening' && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-2 h-2 bg-primary rounded-full animate-ping"></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-ping" style={{ animationDelay: '0.4s' }}></div>
          </div>
        )}

        {/* Success Instructions */}
        {type === 'success' && (
          <div className="kiosk-glass p-6 rounded-2xl space-y-3 w-full max-w-sm animate-card-appear">
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                <Package className="w-4 h-4 text-success" />
              </div>
              <span>Eşyalarınızı dolaba yerleştirin</span>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                <Lock className="w-4 h-4 text-success" />
              </div>
              <span>Dolap kapısını kapatın ve itin</span>
            </div>
            <div className="text-center mt-4 p-3 bg-success/10 rounded-xl">
              <p className="text-success text-sm font-medium">
                Dolap otomatik olarak kilitlenecektir
              </p>
            </div>
          </div>
        )}

        {/* Error Actions */}
        {type === 'error' && onComplete && (
          <div className="flex gap-4">
            <button
              onClick={onComplete}
              className="kiosk-button px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors"
            >
              Tekrar Dene
            </button>
            <button
              onClick={() => window.location.reload()}
              className="kiosk-button px-6 py-3 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-colors"
            >
              Ana Ekran
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default KioskLoadingScreen;