# Design Document

## Overview

The Maksisoft Integration feature adds RFID-based member search functionality to the admin panel's locker management interface. The design follows a simple client-server architecture where the panel server acts as a proxy to the Maksisoft API, handling authentication and session management while the browser provides the user interface through modal dialogs.

## Architecture

### High-Level Flow
```
Browser → Panel Server → Maksisoft API → Panel Server → Browser
   ↓           ↓              ↓              ↓           ↓
Click      Proxy API     Search API      JSON         Modal
Button     + Session     + Cookie       Response     Display
```

### Component Interaction
1. **Browser**: Handles UI interactions, modal display, and API calls to panel server
2. **Panel Server**: Proxies requests to Maksisoft, manages session cookies, handles rate limiting
3. **Maksisoft API**: External member management system providing search functionality

## Components and Interfaces

### 1. Environment Configuration

**Purpose**: Store all Maksisoft integration settings securely

**Configuration Variables**:
```bash
# Required
MAKSI_BASE=https://eformhatay.maksionline.com
MAKSI_SEARCH_PATH=/react-system/api_php/user_search/users.php
MAKSI_CRITERIA_FOR_RFID=0
MAKSI_BOOTSTRAP_COOKIE=PHPSESSID=...; AC-C=ac-c
MAKSI_ENABLED=true

# Optional for future phases
MAKSI_LOGIN_URL=https://eformhatay.maksionline.com/ceo/login.php
MAKSI_LOGIN_FORM_JSON={"username":"admin","password":"972257"}
```

### 2. Server-Side Components

#### A. Maksisoft Service (`app/panel/src/services/maksi.ts`)

**Purpose**: Handle Maksisoft API communication and data mapping

**Key Types**:
```typescript
export type MaksiHit = {
  id: number;
  name: string;
  phone: string;
  type: number;
  sex: string;
  gsm: string;
  photo: string;
  checkListDate: string;
  checkListStatus: string;
  endDate: string;
  proximity: string;
  tc: string;
};

export type MaksiUser = {
  id: number;
  fullName: string | null;
  phone: string | null;
  rfid: string;
  membershipEndsAt: string | null;
  lastCheckAt: string | null;
  lastCheckStatus: string | null;
};
```

**Key Functions**:
- `mapMaksi(hit: MaksiHit): MaksiUser` - Transform API response to simplified format
- `searchMaksiByRFID(rfid: string)` - Main search function with error handling

#### B. API Route Handler

**Endpoint**: `GET /api/maksi/search-by-rfid?rfid={rfid}`

**Request Flow**:
1. Validate RFID parameter
2. Check rate limiting (IP + RFID combination)
3. Call Maksisoft API with session cookie
4. Transform response data
5. Return JSON result

**Response Format**:
```typescript
// Success
{
  success: true,
  hits: MaksiUser[],
  disabled?: boolean
}

// Error
{
  success: false,
  error: string
}
```

#### C. Rate Limiting

**Implementation**: Simple in-memory Map with timestamp tracking
**Logic**: Allow 1 request per second per IP+RFID combination
**Cleanup**: Automatic cleanup of old entries

### 3. Client-Side Components

#### A. UI Button Integration

**Location**: Each locker card on `/lockers` page
**HTML Structure**:
```html
<button
  class="btn btn-secondary btn-maksi"
  data-locker-id="{{locker.id}}"
  data-owner-rfid="{{locker.owner?.rfid || ''}}"
>
  Maksisoft
</button>
```

**Visibility Logic**: Only show when `MAKSI_ENABLED=true`

#### B. JavaScript Handler (`app/panel/src/public/js/lockers.js`)

**Key Functions**:
- `searchMaksi(rfid)` - API call to panel server
- `ensureModal()` - Create modal DOM if not exists
- `renderSummary(user)` - Format user data for display
- `openModal(payload, rfid)` - Show results in modal
- `onMaksiClick(event)` - Handle button clicks

**Event Flow**:
1. Button click → Extract RFID (from locker or prompt)
2. Show loading state → Disable button, change text
3. API call → Fetch member data
4. Display results → Show modal with formatted data
5. Reset state → Re-enable button

#### C. Modal Dialog

**Structure**:
- Header: "Maksisoft Arama" title with close button
- Body: Member information or error message
- Footer: "Profili Aç" link + "Kapat" button

**Member Display Format**:
```
ID: 1026
RFID: 0006851540
Ad: [Full Name]
Telefon: [Phone Number]
Üyelik Bitiş: 2019-11-05
Son Giriş Çıkış: 2019-04-20 16:38 (out)
```

## Data Models

### Input Data Flow
```
Locker Card → RFID Number → Maksisoft API → Raw JSON → Mapped Object → UI Display
```

### Data Transformation
- **Input**: Raw Maksisoft API response (MaksiHit)
- **Processing**: Map only the 6 displayed fields
- **Output**: Simplified user object (MaksiUser) with exactly: ID, RFID, Full name, Phone, Membership end, Last check status

### Error Handling States
1. **No RFID**: Prompt user for manual entry
2. **Network Error**: "Bağlantı hatası"
3. **Auth Error**: "Kimlik doğrulama hatası"  
4. **Rate Limited**: "Çok fazla istek"
5. **No Results**: "Kayıt bulunamadı"

## Error Handling

### Server-Side Error Mapping
- HTTP 401/403 → "auth_error"
- HTTP 429 → "rate_limited"
- Network timeout → "network_error"
- Invalid JSON → "invalid_response"
- No results → Empty hits array

### Client-Side Error Display
- Map server error codes to Turkish messages
- Always show user-friendly messages in modal
- Log technical details to console only
- Reset button state after any error

## Testing Strategy

### Unit Tests
1. **Maksi Service**: Test data mapping and error handling
2. **Rate Limiting**: Verify timing and cleanup logic
3. **API Route**: Test request validation and response format

### Integration Tests
1. **End-to-End Flow**: Button click → API call → Modal display
2. **Error Scenarios**: Network failures, invalid responses
3. **Rate Limiting**: Multiple rapid requests

### Manual Testing Checklist
1. Button appears on locker cards when enabled
2. Button hidden when `MAKSI_ENABLED=false`
3. RFID auto-populated from locker owner
4. Manual RFID entry when no owner
5. Loading state during API call
6. Modal displays member information correctly
7. "Profili Aç" link opens correct Maksisoft page
8. Error messages display in Turkish
9. Rate limiting prevents spam requests
10. Button re-enables after completion/error

## Security Considerations

### Data Protection
- No personal data in server logs
- Only log status codes and hashed RFID numbers
- Session cookies stored server-side only
- No credentials exposed to browser

### Rate Limiting
- Prevent API abuse with simple throttling
- Track by IP + RFID combination
- Automatic cleanup of old tracking data

### Error Information
- Never expose technical error details to users
- Use predefined Turkish error messages
- Log full errors server-side for debugging

## Performance Considerations

### Response Times
- 5-second total timeout for API calls
- No caching in MVP
- No retry logic in MVP
- Single request per button click

### Resource Usage
- Minimal memory footprint for rate limiting
- No persistent storage requirements
- Bootstrap cookie only (no auto-login)

### Deferred Features (Phase 2)
- Auto-login when session expires
- 60-second response caching
- Strict typing for all Maksisoft fields
- Multi-instance rate limiting with Redis