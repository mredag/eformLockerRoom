# Implementation Plan

- [x] 1. Verify command queue architecture and shared database access

  - Confirm both panel and kiosk services use the same SQLite database path for command queue
  - If separate databases, implement gateway endpoint /api/commands/enqueue for centralized queuing
  - Test CommandQueueManager import and initialization in panel service
  - _Requirements: 2.1, 2.2_

- [x] 2. Implement single locker open API route

  - Add POST /api/lockers/:kioskId/:lockerId/open route in app/panel/src/routes/locker-routes.ts
  - Add Fastify schema validation for kioskId (string) and lockerId (numeric) parameters
  - Add request body schema validation for reason (string, optional) and override (boolean, optional)
  - Implement session validation and CSRF protection for the route
  - Add per-locker command lock to reject new open if one is pending/executing for that locker
  - Enqueue 'open_locker' command with locker_id, staff_user, reason, force parameters
  - Return 202 Accepted with command_id and lockerId for status polling
  - Log staff_user, reason, and comman

d_id when enqueuing command

- _Requirements: 1.1, 1.6, 2.1, 2.3_

- [x] 3. Implement bulk locker open API route

  - Add POST /api/lockers/bulk/open route in app/panel/src/routes/locker-routes.ts
  - Add request body schema validation for kioskId, lockerIds array, rea
    son, exclude_vip, interval_ms (snake_case)
  - Filter invalid locker IDs and remove duplicates from lockerIds array
  - When exclude_vip is true, filter out VIP lockers from the operation
  - Check per-locker command locks and reject if any selected locker has pending command
  - Enqueue 'bulk_open' command with l

ocker_ids, staff_user, reason, exclude_vip, interval_ms

- Return 202 Accepted with command_i
  d and processed locker count for status polling
- Log staff_user, reason, and command_id when enqueuing bulk command
- _Requirements: 1.8, 2.2, 2.3, 2.8_

- [x] 4. Add input validation and error handling

  - Validate kioskId exists and is accessible to the staff user

  - Validate lockerId is numeric and within valid range
  - Validate intervalMs is b
    etween 100-5000ms for bulk operations
  - Return 400 with clear error messages for invalid input
  - Add idempotency check to reject duplicate open commands for same locker
  - _Requirements: 1.3, 2.6_

- [x] 5. Update client-side locker opening functions

  - Hook into existing performAction('open') or add wrapper function in app/panel/src/views/lockers.html
  - Update function to POST to new route with reason in request body
  - Handle 202 Accepted response with command_id for status polling
  - Show success toast message and optionally poll command status before refreshing
  - Add error handling for 400/401/500 responses with specific error messages
  - _Requirements: 1.5, 1.6_

- [x] 6. Update bulk open client functionality

  - Modify performBulkOpen() to POST to /api/lockers/bulk/open route
  - Send kioskId, lockerIds, reason, exclude_vip, interval_ms in request body (snake_case)
  - Handle 202 Accepted response with command_id for status polling
  - Calculate estimated completion time based on locker count and interval_ms
  - Optionally poll command status or refresh after estimated completion time plus buffer
  - Handle bulk operation errors and show appropriate user feedback
  - _Requirements: 1.8, 2.8_

- [x] 7. Verify kiosk service command processing

  - Confirm kiosk service processes 'open_locker' commands by calling modbusController.openLocker()
  - Verify locker_id is correctly mapped to cardId (Math.ceil(locker_id / 16)) and relayId (((locker_id - 1) % 16) + 1)
  - Implement fallback: try 0x0F (write multiple coils), fall back to 0x05 (single coil) if it fails
  - Add read-coils verification after write operation to confirm relay state
  - Ensure database update via lockerStateManager.releaseLocker() only occurs after successful relay pulse
  - Log staff_user, reason, and command_id in kiosk command execution
  - _Requirements: 1.1, 1.2, 2.4, 2.5_

- [x] 8. Verify service port configuration

  - Confirm admin panel listens on port 3003 in app/panel/src/index.ts
  - Update any hardcoded URLs in client code to use relative paths
  - Test that accessing panel through correct port avoids 500 errors
  - Verify credentials: 'same-origin' works properly with port 3003
  - _Requirements: 1.4_

- [x] 9. Run hardware validation tests

  - Execute npx tsx scripts/validate-waveshare-hardware.js to confirm RS-485 connectivity
  - Run npx tsx scripts/simple-relay-test.js to test manual relay pulsing
  - Verify DIP switch settings: card addresses 1&2, switch 9 off (9600 baud), switch 10 off (no parity)
  - Confirm /dev/ttyUSB0 device exists and has proper permissions
  - Test ModbusController with use_multiple_coils: true and 400ms pulse duration
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 10. Add command status polling endpoint

  - Add GET /api/commands/:id route in app/panel/src/routes/locker-routes.ts
  - Return command status: pending, executing, completed, failed with timestamps
  - Include locker_id(s) and any error messages in response
  - Use for testing and optional UI status polling
  - _Requirements: 2.6, 2.7_

- [x] 11. End-to-end testing and validation

  - Test complete flow: staff login → select kiosk → single locker open → verify physical unlock
  - Test bulk open with 3 lockers using 1000ms interval_ms, verify timing and sequential operation
  - Test error scenarios: invalid locker ID, missing kiosk, hardware failure, pending command rejection
  - Test command status polling endpoint with various command states
  - Verify logging includes staff_user, reason, command_id, timestamp for all operations
  - Confirm UI shows appropriate feedback and updated locker status after operations complete
  - _Requirements: 1.1, 1.5, 1.6, 1.7, 2.7, 3.8_
