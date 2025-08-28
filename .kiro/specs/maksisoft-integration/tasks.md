# Implementation Plan

- [x] 1. Set up environment configuration and types

  - Create environment variables: MAKSI_BASE, MAKSI_SEARCH_PATH, MAKSI_CRITERIA_FOR_RFID=0, MAKSI_BOOTSTRAP_COOKIE, MAKSI_ENABLED
  - Define TypeScript types for exact response format: {success:true,hits:[...]} or {success:false,error:'...'}
  - Document criteria=0 for RFID searches throughout implementation
  - _Requirements: 5.1_

- [x] 2. Implement Maksisoft service layer

  - [x] 2.1 Create basic Maksisoft API service

    - Write `searchMaksiByRFID(rfid)` function with bootstrap cookie and criteria=0
    - Implement data mapping to exactly 6 fields: ID, RFID, Ad (name), Telefon (phone), Üyelik Bitiş (endDate), Son Giriş/Çıkış (checkListDate + checkListStatus)
    - Add hard 5-second timeout with no retry logic
    - _Requirements: 4.1, 4.2, 4.5_

  - [x] 2.2 Add rate limiting functionality

    - Implement simple in-memory rate limiting (1 req/sec per IP+RFID)
    - Add automatic cleanup of old rate limit entries
    - _Requirements: 5.3_

- [x] 3. Create API endpoint for RFID search

  - [x] 3.1 Add Maksisoft search route to panel server

    - Create `GET /api/maksi/search-by-rfid` endpoint with RFID parameter validation
    - Return 404 when MAKSI_ENABLED=false, integrate rate limiting middleware
    - Return exact JSON format: {success:true,hits:[...]} or {success:false,error:'...'}
    - _Requirements: 1.1, 1.4, 6.4_

  - [x] 3.2 Implement error handling and logging

    - Map server errors to user-friendly Turkish messages

    - Log only request duration, HTTP status, and hashed RFID with stable salt (no PII)

    - Return 404 for disabled feature, handle all error scenarios
    - _Requirements: 5.4, 6.1, 6.2, 6.3_

- [x] 4. Add UI components to locker management page

  - [x] 4.1 Add Maksisoft buttons to locker cards

    - Modify locker card template to include "Maksisoft" button
    - Show button only when MAKSI_ENABLED=true

    - Pre-populate RFID from locker owner data
    - _Requirements: 1.1, 1.2, 5.2_

  - [x] 4.2 Create modal dialog for member information display

    - Build modal HTML structure with header, body, and footer
    - Format exactly 6 fields in Turkish: ID, RFID, Ad, Telefon, Üyelik Bitiş, Son Giriş/Çıkış

    - Add "Profili Aç" link that opens Maksisoft profile page with searched RFID
    - _Requirements: 2.1, 2.2, 3.1, 3.2_

- [x] 5. Implement client-side JavaScript functionality

  - [x] 5.1 Create button click handler and API integration

    - Handle button clicks with RFID extraction or manual prompt
    - Implement loading state (disable button, show "Sorgulanıyor…")
    - Make API calls to panel server endpoint
    - _Requirements: 1.2, 1.3, 1.5_

  - [x] 5.2 Add modal display and error handling

  - [x] 5.2 Add modal display and error handling

    - Display search results in modal with formatted member information
    - Show Turkish error messages for different failure scenarios
    - Reset button state after completion or error
    - _Requirements: 2.3, 2.4, 6.5_

- [x] 6. Create focused MVP testing suite

  - [x] 6.1 Write essential unit tests

    - Test data mapping function with sample MaksiHit response
    - Test rate limiter with timing scenarios

    - Test service happy path and timeout path
    - _Requirements: Core functionality validation_

  - [x] 6.2 Add key integration tests

        - Test one happy path: button click to modal display
        - Test one auth error path with Turkish error message
        - Test one "no match" scenario showing "Kayıt bu

    lunamadı" - _Requirements: Critical user flows validation_

- [x] 7. Validate MVP acceptance criteria

- [ ] 7. Validate MVP acceptance criteria

  - Verify button visibility controlled by feature flag
  - Test known RFID returns member summary under 5 seconds
  - Confirm unknown RFID shows "Kayıt bulunamadı" message

  - Validate expired cookie returns auth error message
  - Check server logs contain only status codes and hashed RFID
  - Ensure browser DevTools shows no requests to eformhatay domain
  - _Requirements: All requirements final validation_
