import React, { useState, useEffect } from 'react';
import { Clock, User, ArrowLeft, RefreshCw } from 'lucide-react';

interface Locker {
  id: number;
  status: 'available' | 'occupied' | 'maintenance';
  size: 'small' | 'medium' | 'large';
}

interface KioskSessionScreenProps {
  cardId: string;
  sessionTimeLeft: number;
  lockers: Locker[];
  onLockerSelect: (lockerId: number) => void;
  onSessionEnd: () => void;
  selectedLocker?: number;
  isAssigning?: boolean;
}

const KioskSessionScreen: React.FC<KioskSessionScreenProps> = ({
  cardId,
  sessionTimeLeft,
  lockers,
  onLockerSelect,
  onSessionEnd,
  selectedLocker,
  isAssigning = false
}) => {
  const [timeLeft, setTimeLeft] = useState(sessionTimeLeft);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          onSessionEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onSessionEnd]);

  const formatTime = (seconds: number) => {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  const getLockerSizeLabel = (size: string) => {
    switch (size) {
      case 'small': return 'S';
      case 'medium': return 'M';
      case 'large': return 'L';
      default: return 'M';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'status-available';
      case 'occupied': return 'status-occupied';
      case 'maintenance': return 'status-maintenance';
      default: return 'status-available';
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onSessionEnd}
            className="kiosk-button p-3 bg-secondary text-secondary-foreground rounded-xl hover:bg-secondary/80 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Hoşgeldiniz</h2>
              <p className="text-muted-foreground text-sm">Kart: {cardId.slice(-4)}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl ${
            timeLeft <= 10 ? 'bg-error text-error-foreground animate-pulse' : 'bg-warning text-warning-foreground'
          }`}>
            <Clock className="w-5 h-5" />
            <span className="font-mono text-lg font-bold">
              {formatTime(timeLeft)}
            </span>
          </div>
          
          <button className="kiosk-button p-3 bg-secondary text-secondary-foreground rounded-xl hover:bg-secondary/80 transition-colors">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div className="kiosk-glass p-6 rounded-2xl mb-8 max-w-2xl">
        <h3 className="text-xl font-semibold mb-3 text-primary">Dolap seçin</h3>
        <p className="text-muted-foreground">
          Kullanmak istediğiniz dolabı seçin. Yeşil renkli dolaplar boş ve kullanıma hazırdır.
        </p>
        <div className="flex gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-success rounded"></div>
            <span>Boş</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-error rounded"></div>
            <span>Dolu</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-muted rounded"></div>
            <span>Kapalı</span>
          </div>
        </div>
      </div>

      {/* Locker Grid */}
      <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 max-w-6xl">
        {lockers.map((locker) => (
          <button
            key={locker.id}
            onClick={() => locker.status === 'available' && onLockerSelect(locker.id)}
            disabled={locker.status !== 'available' || isAssigning}
            className={`
              kiosk-button kiosk-card aspect-square p-4 rounded-2xl transition-all duration-300 relative overflow-hidden
              ${getStatusColor(locker.status)}
              ${selectedLocker === locker.id ? 'ring-4 ring-primary scale-105' : ''}
              ${locker.status === 'available' ? 'hover:scale-105 cursor-pointer' : 'cursor-not-allowed opacity-60'}
              ${isAssigning && selectedLocker === locker.id ? 'animate-pulse' : ''}
            `}
          >
            <div className="flex flex-col items-center justify-center h-full">
              <div className="text-2xl font-bold mb-1">
                {locker.id}
              </div>
              <div className="text-xs opacity-75 mb-2">
                {getLockerSizeLabel(locker.size)}
              </div>
              <div className="text-xs font-medium">
                {locker.status === 'available' ? 'BOŞ' : 
                 locker.status === 'occupied' ? 'DOLU' : 'KAPALI'}
              </div>
            </div>

            {/* Loading overlay for assignment */}
            {isAssigning && selectedLocker === locker.id && (
              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                <RefreshCw className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}

            {/* Selection glow effect */}
            {selectedLocker === locker.id && !isAssigning && (
              <div className="absolute inset-0 border-2 border-primary rounded-2xl animate-pulse"></div>
            )}
          </button>
        ))}
      </div>

      {/* Assignment Confirmation */}
      {selectedLocker && !isAssigning && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 animate-card-appear">
          <div className="kiosk-card bg-primary text-primary-foreground p-6 rounded-2xl shadow-elevated">
            <div className="flex items-center gap-4">
              <div className="text-2xl font-bold">
                Dolap {selectedLocker}
              </div>
              <div className="text-sm opacity-90">
                seçildi - Onayla ve devam et
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KioskSessionScreen;