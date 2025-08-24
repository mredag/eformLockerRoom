import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Alert, AlertDescription } from '../components/ui/alert';
import { useI18n } from '../hooks/useI18n';
import { useApi } from '../services/api-client';

interface MasterPinSettings {
  current_pin: string;
  new_pin: string;
  confirm_pin: string;
}

interface SecuritySettings {
  lockout_attempts: number;
  lockout_minutes: number;
}

interface LockoutStatus {
  kiosk_id: string;
  locked: boolean;
  lockout_end?: number;
  attempts: number;
}

export default function Settings() {
  const { t } = useI18n();
  const api = useApi();
  
  const [pinSettings, setPinSettings] = useState<MasterPinSettings>({
    current_pin: '',
    new_pin: '',
    confirm_pin: ''
  });
  
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({
    lockout_attempts: 5,
    lockout_minutes: 5
  });
  
  const [lockoutStatus, setLockoutStatus] = useState<LockoutStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);

  useEffect(() => {
    loadSecuritySettings();
    loadLockoutStatus();
    
    // Refresh lockout status every 30 seconds
    const interval = setInterval(loadLockoutStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadSecuritySettings = async () => {
    try {
      const response = await api.get('/api/settings/security');
      if (response.data) {
        setSecuritySettings({
          lockout_attempts: response.data.lockout_attempts || 5,
          lockout_minutes: response.data.lockout_minutes || 5
        });
      }
    } catch (error) {
      console.error('Failed to load security settings:', error);
    }
  };

  const loadLockoutStatus = async () => {
    try {
      const response = await api.get('/api/settings/lockout-status');
      if (response.data) {
        setLockoutStatus(response.data);
      }
    } catch (error) {
      console.error('Failed to load lockout status:', error);
    }
  };

  const handlePinChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (pinSettings.new_pin !== pinSettings.confirm_pin) {
      setMessage({ type: 'error', text: t('pin_mismatch') });
      return;
    }
    
    if (pinSettings.new_pin.length !== 4 || !/^\d{4}$/.test(pinSettings.new_pin)) {
      setMessage({ type: 'error', text: t('pin_invalid_format') });
      return;
    }
    
    setLoading(true);
    setMessage(null);
    
    try {
      await api.post('/api/settings/master-pin', {
        current_pin: pinSettings.current_pin,
        new_pin: pinSettings.new_pin
      });
      
      setMessage({ type: 'success', text: t('pin_changed_successfully') });
      setPinSettings({ current_pin: '', new_pin: '', confirm_pin: '' });
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || t('pin_change_failed') 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSecuritySettingsChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setLoading(true);
    setMessage(null);
    
    try {
      await api.post('/api/settings/security', securitySettings);
      setMessage({ type: 'success', text: t('security_settings_updated') });
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || t('security_settings_failed') 
      });
    } finally {
      setLoading(false);
    }
  };

  const testMasterPin = async () => {
    if (!pinSettings.current_pin) {
      setMessage({ type: 'error', text: t('enter_current_pin') });
      return;
    }
    
    setLoading(true);
    setMessage(null);
    
    try {
      await api.post('/api/settings/test-master-pin', {
        pin: pinSettings.current_pin
      });
      
      setMessage({ type: 'success', text: t('pin_test_successful') });
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || t('pin_test_failed') 
      });
    } finally {
      setLoading(false);
    }
  };

  const clearLockout = async (kioskId: string) => {
    if (!confirm(t('confirm_clear_lockout', { kiosk_id: kioskId }))) {
      return;
    }
    
    setLoading(true);
    setMessage(null);
    
    try {
      await api.post('/api/settings/clear-lockout', {
        kiosk_id: kioskId
      });
      
      setMessage({ type: 'success', text: t('lockout_cleared_successfully') });
      await loadLockoutStatus(); // Refresh status
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || t('lockout_clear_failed') 
      });
    } finally {
      setLoading(false);
    }
  };

  const formatRemainingTime = (lockoutEnd: number) => {
    const now = Date.now();
    if (lockoutEnd <= now) return t('expired');
    
    const remainingMs = lockoutEnd - now;
    const minutes = Math.floor(remainingMs / (60 * 1000));
    const seconds = Math.floor((remainingMs % (60 * 1000)) / 1000);
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('system_settings')}</h1>
      </div>

      {message && (
        <Alert className={message.type === 'error' ? 'border-red-500 bg-red-50' : 'border-green-500 bg-green-50'}>
          <AlertDescription className={message.type === 'error' ? 'text-red-700' : 'text-green-700'}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Master PIN Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🔐 {t('master_pin_management')}
            </CardTitle>
            <CardDescription>
              {t('master_pin_description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePinChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-pin">{t('current_master_pin')}</Label>
                <div className="relative">
                  <Input
                    id="current-pin"
                    type={showCurrentPin ? 'text' : 'password'}
                    value={pinSettings.current_pin}
                    onChange={(e) => setPinSettings(prev => ({ ...prev, current_pin: e.target.value }))}
                    placeholder="••••"
                    maxLength={4}
                    pattern="[0-9]{4}"
                    className="pr-20"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCurrentPin(!showCurrentPin)}
                      className="h-6 px-2 text-xs"
                    >
                      {showCurrentPin ? '👁️' : '👁️‍🗨️'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={testMasterPin}
                      disabled={loading || !pinSettings.current_pin}
                      className="h-6 px-2 text-xs"
                    >
                      {t('test')}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-pin">{t('new_master_pin')}</Label>
                <div className="relative">
                  <Input
                    id="new-pin"
                    type={showNewPin ? 'text' : 'password'}
                    value={pinSettings.new_pin}
                    onChange={(e) => setPinSettings(prev => ({ ...prev, new_pin: e.target.value }))}
                    placeholder="••••"
                    maxLength={4}
                    pattern="[0-9]{4}"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNewPin(!showNewPin)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-6 px-2 text-xs"
                  >
                    {showNewPin ? '👁️' : '👁️‍🗨️'}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-pin">{t('confirm_master_pin')}</Label>
                <Input
                  id="confirm-pin"
                  type="password"
                  value={pinSettings.confirm_pin}
                  onChange={(e) => setPinSettings(prev => ({ ...prev, confirm_pin: e.target.value }))}
                  placeholder="••••"
                  maxLength={4}
                  pattern="[0-9]{4}"
                />
              </div>

              <Button 
                type="submit" 
                disabled={loading || !pinSettings.current_pin || !pinSettings.new_pin || !pinSettings.confirm_pin}
                className="w-full"
              >
                {loading ? t('changing_pin') : t('change_master_pin')}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Security Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              🛡️ {t('security_settings')}
            </CardTitle>
            <CardDescription>
              {t('security_settings_description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSecuritySettingsChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lockout-attempts">{t('lockout_attempts')}</Label>
                <Input
                  id="lockout-attempts"
                  type="number"
                  min="3"
                  max="10"
                  value={securitySettings.lockout_attempts}
                  onChange={(e) => setSecuritySettings(prev => ({ 
                    ...prev, 
                    lockout_attempts: parseInt(e.target.value) || 5 
                  }))}
                />
                <p className="text-sm text-gray-600">
                  {t('lockout_attempts_description')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lockout-minutes">{t('lockout_duration')}</Label>
                <Input
                  id="lockout-minutes"
                  type="number"
                  min="1"
                  max="60"
                  value={securitySettings.lockout_minutes}
                  onChange={(e) => setSecuritySettings(prev => ({ 
                    ...prev, 
                    lockout_minutes: parseInt(e.target.value) || 5 
                  }))}
                />
                <p className="text-sm text-gray-600">
                  {t('lockout_duration_description')}
                </p>
              </div>

              <Button 
                type="submit" 
                disabled={loading}
                className="w-full"
              >
                {loading ? t('updating_settings') : t('update_security_settings')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Lockout Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🔒 {t('lockout_status')}
          </CardTitle>
          <CardDescription>
            {t('lockout_status_description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lockoutStatus.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              {t('no_lockouts')}
            </div>
          ) : (
            <div className="space-y-3">
              {lockoutStatus.map((status) => (
                <div
                  key={status.kiosk_id}
                  className={`p-4 rounded-lg border-2 ${
                    status.locked
                      ? 'border-red-200 bg-red-50'
                      : status.attempts > 0
                      ? 'border-yellow-200 bg-yellow-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">
                        {t('kiosk')} {status.kiosk_id}
                      </h4>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>
                          {t('attempts')}: {status.attempts}/{securitySettings.lockout_attempts}
                        </div>
                        {status.locked && status.lockout_end && (
                          <div className="text-red-600 font-medium">
                            {t('locked_until')}: {formatRemainingTime(status.lockout_end)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          status.locked
                            ? 'bg-red-100 text-red-800'
                            : status.attempts > 0
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {status.locked
                          ? t('locked')
                          : status.attempts > 0
                          ? t('warning')
                          : t('normal')}
                      </div>
                      {status.locked && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => clearLockout(status.kiosk_id)}
                          disabled={loading}
                          className="text-red-600 border-red-300 hover:bg-red-50"
                        >
                          {t('emergency_unlock')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-4 border-t">
            <Button
              variant="outline"
              onClick={loadLockoutStatus}
              disabled={loading}
              className="w-full"
            >
              {loading ? t('refreshing') : t('refresh_status')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Security Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            ℹ️ {t('security_information')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="p-3 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-blue-900">{t('pin_requirements')}</h4>
              <ul className="text-sm text-blue-700 mt-1 space-y-1">
                <li>• {t('pin_requirement_digits')}</li>
                <li>• {t('pin_requirement_unique')}</li>
                <li>• {t('pin_requirement_secure')}</li>
              </ul>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg">
              <h4 className="font-semibold text-amber-900">{t('security_features')}</h4>
              <ul className="text-sm text-amber-700 mt-1 space-y-1">
                <li>• {t('security_feature_lockout')}</li>
                <li>• {t('security_feature_logging')}</li>
                <li>• {t('security_feature_monitoring')}</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}