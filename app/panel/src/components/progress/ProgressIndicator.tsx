import React, { useState, useEffect, useRef } from 'react';
import './ProgressIndicator.css';

export interface ProgressIndicatorProps {
  sessionId?: string;
  title: string;
  progress: number; // 0-100
  status: 'idle' | 'running' | 'success' | 'error' | 'warning';
  message?: string;
  showPercentage?: boolean;
  showElapsedTime?: boolean;
  animated?: boolean;
  size?: 'small' | 'medium' | 'large';
  variant?: 'linear' | 'circular';
  onCancel?: () => void;
  onRetry?: () => void;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  sessionId,
  title,
  progress,
  status,
  message,
  showPercentage = true,
  showElapsedTime = false,
  animated = true,
  size = 'medium',
  variant = 'linear',
  onCancel,
  onRetry
}) => {
  const [startTime] = useState<Date>(new Date());
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update elapsed time
  useEffect(() => {
    if (showElapsedTime && status === 'running') {
      intervalRef.current = setInterval(() => {
        setElapsedTime(Date.now() - startTime.getTime());
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [showElapsedTime, status, startTime]);

  const formatElapsedTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${remainingSeconds}s`;
  };

  const getStatusIcon = (): string => {
    switch (status) {
      case 'running':
        return '⏳';
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      default:
        return '⏸️';
    }
  };

  const getStatusClass = (): string => {
    return `progress-indicator--${status}`;
  };

  const getSizeClass = (): string => {
    return `progress-indicator--${size}`;
  };

  const getVariantClass = (): string => {
    return `progress-indicator--${variant}`;
  };

  const renderLinearProgress = () => (
    <div className="progress-indicator__bar-container">
      <div 
        className={`progress-indicator__bar ${animated ? 'progress-indicator__bar--animated' : ''}`}
        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
      />
      {status === 'running' && animated && (
        <div className="progress-indicator__bar-shimmer" />
      )}
    </div>
  );

  const renderCircularProgress = () => {
    const radius = size === 'small' ? 16 : size === 'large' ? 32 : 24;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
      <div className="progress-indicator__circular">
        <svg 
          className="progress-indicator__circular-svg" 
          width={radius * 2 + 8} 
          height={radius * 2 + 8}
        >
          <circle
            className="progress-indicator__circular-bg"
            cx={radius + 4}
            cy={radius + 4}
            r={radius}
            strokeWidth="3"
          />
          <circle
            className={`progress-indicator__circular-progress ${animated ? 'progress-indicator__circular-progress--animated' : ''}`}
            cx={radius + 4}
            cy={radius + 4}
            r={radius}
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${radius + 4} ${radius + 4})`}
          />
        </svg>
        {showPercentage && (
          <div className="progress-indicator__circular-text">
            {Math.round(progress)}%
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      className={`progress-indicator ${getStatusClass()} ${getSizeClass()} ${getVariantClass()}`}
      data-session-id={sessionId}
    >
      <div className="progress-indicator__header">
        <div className="progress-indicator__title">
          <span className="progress-indicator__icon">{getStatusIcon()}</span>
          <span className="progress-indicator__title-text">{title}</span>
        </div>
        
        <div className="progress-indicator__meta">
          {showPercentage && variant === 'linear' && (
            <span className="progress-indicator__percentage">
              {Math.round(progress)}%
            </span>
          )}
          {showElapsedTime && (
            <span className="progress-indicator__time">
              {formatElapsedTime(elapsedTime)}
            </span>
          )}
        </div>
      </div>

      <div className="progress-indicator__progress">
        {variant === 'linear' ? renderLinearProgress() : renderCircularProgress()}
      </div>

      {message && (
        <div className="progress-indicator__message">
          {message}
        </div>
      )}

      {(onCancel || onRetry) && (
        <div className="progress-indicator__actions">
          {onRetry && status === 'error' && (
            <button 
              className="progress-indicator__action progress-indicator__action--retry"
              onClick={onRetry}
              type="button"
            >
              🔄 Retry
            </button>
          )}
          {onCancel && status === 'running' && (
            <button 
              className="progress-indicator__action progress-indicator__action--cancel"
              onClick={onCancel}
              type="button"
            >
              ❌ Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProgressIndicator;