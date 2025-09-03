# Hardware Dashboard Components

This directory contains the React-based hardware dashboard components that provide an enhanced interface for monitoring and managing Modbus relay cards and the locker system.

## Components

### HardwareDashboard (Main Component)
- **Location**: `HardwareDashboard.tsx` (embedded in `hardware-dashboard.html`)
- **Purpose**: Main dashboard container that orchestrates all hardware monitoring functionality
- **Features**:
  - Real-time hardware statistics display
  - Quick action buttons for scanning, testing, and wizard access
  - WebSocket integration for live updates
  - System overview with configuration mismatch detection
  - Error handling and user notifications

### DeviceStatusCard
- **Location**: `DeviceStatusCard.tsx` (embedded in `hardware-dashboard.html`)
- **Purpose**: Individual relay card status display and management
- **Features**:
  - Card information display (address, type, channels, locker range)
  - Health status indicators with color coding
  - Individual card testing functionality
  - Performance metrics (response time, last tested)
  - Quick actions for testing and configuration

### SystemHealthMonitor
- **Location**: `SystemHealthMonitor.tsx` (embedded in `hardware-dashboard.html`)
- **Purpose**: Comprehensive system health monitoring and diagnostics
- **Features**:
  - Overall system health status
  - Hardware and communication status indicators
  - Performance metrics (response time, success rate, uptime)
  - Issues and recommendations display
  - Diagnostic tools and troubleshooting links

## Styling

### CSS File
- **Location**: `hardware-dashboard.css`
- **Features**:
  - Responsive design for desktop, tablet, and mobile
  - Dark mode support
  - Accessibility improvements
  - Print-friendly styles
  - Smooth animations and transitions

## Integration

### Routes
The dashboard is integrated into the panel service through `hardware-config-routes.ts`:
- `/panel/hardware-dashboard` - Main dashboard page
- `/static/components/dashboard/hardware-dashboard.css` - CSS styles

### API Integration
The dashboard integrates with existing hardware configuration APIs:
- `GET /api/hardware-config` - Load system configuration
- `GET /api/hardware-config/stats` - Load hardware statistics
- `POST /api/hardware-config/detect-new-cards` - Scan for new devices
- `POST /api/hardware-config/test-all-lockers` - Test all hardware
- `POST /api/hardware-config/test-card` - Test individual cards

### WebSocket Integration
Real-time updates are provided through WebSocket connections:
- Port 8080 for WebSocket server
- Automatic reconnection on disconnect
- Hardware status and state update messages

## Features

### System Overview
- Total lockers, cards, channels, and maintenance mode status
- Configuration mismatch detection and warnings
- Visual status indicators with color coding

### Device Management
- Individual relay card status cards
- Health indicators (healthy, warning, error)
- Performance metrics and testing history
- Quick actions for testing and configuration

### Health Monitoring
- Overall system health assessment
- Hardware and communication status
- Performance metrics tracking
- Issues identification and recommendations
- Diagnostic tools and troubleshooting guides

### Real-time Updates
- WebSocket-based live data updates
- Connection status indicators
- Automatic data refresh on hardware changes

## Usage

### Accessing the Dashboard
Navigate to `/panel/hardware-dashboard` in the panel service to access the enhanced hardware dashboard.

### Quick Actions
- **Add New Card**: Launch the hardware configuration wizard
- **Scan Devices**: Detect new Modbus devices on the network
- **Test Hardware**: Run comprehensive hardware tests
- **Refresh**: Reload all dashboard data

### Individual Card Actions
- **Quick Test**: Test communication with a specific card
- **View Details**: Navigate to detailed card configuration
- **Configure**: Access card-specific settings

### Health Monitoring
- Click on the System Health Monitor header to expand/collapse details
- View performance metrics and system uptime
- Access diagnostic tools and troubleshooting guides

## Technical Implementation

### React Components
The dashboard uses React 18 with functional components and hooks:
- `useState` for component state management
- `useEffect` for lifecycle management and side effects
- `useCallback` for performance optimization

### WebSocket Integration
Real-time updates are handled through native WebSocket API:
- Automatic connection management
- Reconnection logic on disconnect
- Message parsing and state updates

### Error Handling
Comprehensive error handling throughout:
- API request error handling
- WebSocket connection error handling
- User-friendly error messages and recovery options

### Responsive Design
Mobile-first responsive design:
- Grid layouts that adapt to screen size
- Touch-friendly interface elements
- Optimized for tablets and mobile devices

## Browser Compatibility

The dashboard is compatible with modern browsers that support:
- ES6+ JavaScript features
- WebSocket API
- CSS Grid and Flexbox
- React 18

## Performance Considerations

- Efficient re-rendering with React hooks
- WebSocket connection pooling
- Lazy loading of diagnostic tools
- Optimized CSS with minimal reflows
- Caching of configuration data

## Accessibility

The dashboard includes accessibility features:
- ARIA labels and semantic markup
- Keyboard navigation support
- High contrast color schemes
- Screen reader compatibility
- Focus management and indicators

## Future Enhancements

Potential improvements for future versions:
- Real-time performance charts
- Historical data visualization
- Advanced filtering and search
- Bulk operations interface
- Mobile app integration
- Push notifications for critical issues