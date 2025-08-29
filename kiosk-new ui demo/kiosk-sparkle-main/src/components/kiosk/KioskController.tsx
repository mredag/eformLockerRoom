import React, { useState, useEffect, useCallback } from 'react';
import KioskIdleScreen from './KioskIdleScreen';
import KioskSessionScreen from './KioskSessionScreen';
import KioskLoadingScreen from './KioskLoadingScreen';
import { useToast } from '@/hooks/use-toast';

type KioskState = 'idle' | 'session' | 'opening' | 'success' | 'error';

interface Locker {
  id: number;
  status: 'available' | 'occupied' | 'maintenance';
  size: 'small' | 'medium' | 'large';
}

const KioskController: React.FC = () => {
  const [state, setState] = useState<KioskState>('idle');
  const [cardId, setCardId] = useState<string>('');
  const [sessionTimeLeft, setSessionTimeLeft] = useState(30);
  const [selectedLocker, setSelectedLocker] = useState<number | undefined>();
  const [isAssigning, setIsAssigning] = useState(false);
  const [lockers, setLockers] = useState<Locker[]>([]);
  const { toast } = useToast();

  // Initialize mock lockers data
  useEffect(() => {
    const mockLockers: Locker[] = Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      status: Math.random() > 0.7 ? 'occupied' : Math.random() > 0.9 ? 'maintenance' : 'available',
      size: i % 3 === 0 ? 'large' : i % 2 === 0 ? 'medium' : 'small'
    }));
    setLockers(mockLockers);
  }, []);

  // Handle RFID card scanning
  const handleCardScan = useCallback((scannedCardId: string) => {
    console.log('Card scanned:', scannedCardId);
    setCardId(scannedCardId);
    setState('session');
    setSessionTimeLeft(30);
    
    toast({
      title: "Kart okundu",
      description: `Hoşgeldiniz! Kart: ${scannedCardId.slice(-4)}`,
    });
  }, [toast]);

  // Handle locker selection
  const handleLockerSelect = useCallback(async (lockerId: number) => {
    if (isAssigning) return;
    
    setSelectedLocker(lockerId);
    setIsAssigning(true);
    
    // Simulate API call delay
    try {
      setState('opening');
      
      // Mock API call - replace with actual endpoint
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update locker status
      setLockers(prev => prev.map(locker => 
        locker.id === lockerId 
          ? { ...locker, status: 'occupied' as const }
          : locker
      ));
      
      setState('success');
      
      toast({
        title: "Dolap açıldı",
        description: `Dolap ${lockerId} başarıyla açıldı`,
      });
      
    } catch (error) {
      console.error('Error assigning locker:', error);
      setState('error');
      
      toast({
        title: "Hata",
        description: "Dolap açılırken bir hata oluştu",
        variant: "destructive",
      });
    } finally {
      setIsAssigning(false);
    }
  }, [isAssigning, toast]);

  // Handle session end
  const handleSessionEnd = useCallback(() => {
    setState('idle');
    setCardId('');
    setSelectedLocker(undefined);
    setSessionTimeLeft(30);
    
    toast({
      title: "Oturum sona erdi",
      description: "Ana ekrana dönüldü",
    });
  }, [toast]);

  // Handle success completion
  const handleSuccessComplete = useCallback(() => {
    setState('idle');
    setCardId('');
    setSelectedLocker(undefined);
    setSessionTimeLeft(30);
  }, []);

  // Handle error retry
  const handleErrorRetry = useCallback(() => {
    setState('session');
    setSelectedLocker(undefined);
  }, []);

  // Listen for RFID input (keyboard mode)
  useEffect(() => {
    let cardBuffer = '';
    let cardTimer: NodeJS.Timeout;

    const handleKeyPress = (event: KeyboardEvent) => {
      // Only process if we're in idle state
      if (state !== 'idle') return;

      // Clear buffer after timeout
      clearTimeout(cardTimer);
      cardTimer = setTimeout(() => {
        cardBuffer = '';
      }, 100);

      // Add character to buffer
      if (event.key.length === 1) {
        cardBuffer += event.key;
      }

      // Process when Enter is pressed (end of card scan)
      if (event.key === 'Enter' && cardBuffer.length > 0) {
        const cleanCardId = cardBuffer.trim();
        if (cleanCardId.length >= 4) {
          handleCardScan(cleanCardId);
        }
        cardBuffer = '';
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => {
      window.removeEventListener('keypress', handleKeyPress);
      clearTimeout(cardTimer);
    };
  }, [state, handleCardScan]);

  // Render current state
  switch (state) {
    case 'idle':
      return <KioskIdleScreen onCardScan={handleCardScan} />;
      
    case 'session':
      return (
        <KioskSessionScreen
          cardId={cardId}
          sessionTimeLeft={sessionTimeLeft}
          lockers={lockers}
          onLockerSelect={handleLockerSelect}
          onSessionEnd={handleSessionEnd}
          selectedLocker={selectedLocker}
          isAssigning={isAssigning}
        />
      );
      
    case 'opening':
      return (
        <KioskLoadingScreen
          type="opening"
          lockerId={selectedLocker}
        />
      );
      
    case 'success':
      return (
        <KioskLoadingScreen
          type="success"
          lockerId={selectedLocker}
          onComplete={handleSuccessComplete}
        />
      );
      
    case 'error':
      return (
        <KioskLoadingScreen
          type="error"
          lockerId={selectedLocker}
          message="Dolap açılırken bir hata oluştu"
          onComplete={handleErrorRetry}
        />
      );
      
    default:
      return <KioskIdleScreen onCardScan={handleCardScan} />;
  }
};

export default KioskController;