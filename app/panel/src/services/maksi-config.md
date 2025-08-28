# Maksisoft Integration Configuration

## Environment Variables

The Maksisoft integration requires the following environment variables to be configured:

### Required Variables

- **MAKSI_BASE**: Base URL for the Maksisoft system
  - Example: `https://eformhatay.maksionline.com`
  - This is the root domain of your Maksisoft installation

- **MAKSI_SEARCH_PATH**: API endpoint path for user search
  - Example: `/react-system/api_php/user_search/users.php`
  - This is the specific endpoint that handles user searches

- **MAKSI_CRITERIA_FOR_RFID**: Search criteria for RFID lookups
  - **MUST BE SET TO 0**: `MAKSI_CRITERIA_FOR_RFID=0`
  - This value is required for RFID-based searches in Maksisoft
  - Other criteria values are used for different search types (name, phone, etc.)

- **MAKSI_BOOTSTRAP_COOKIE**: Session cookie for authentication
  - Example: `PHPSESSID=abc123def456; AC-C=ac-c`
  - Obtain this from a valid Maksisoft session
  - Must include both PHPSESSID and AC-C cookies

- **MAKSI_ENABLED**: Feature flag to enable/disable integration
  - Set to `true` to enable Maksisoft features
  - Set to `false` to disable (buttons will be hidden)

### Optional Variables

- **RFID_LOG_SALT**: Salt for hashing RFID numbers in logs
  - Used to protect privacy by hashing RFID numbers before logging
  - Should be a unique, random string for each installation
  - Example: `locker-system-salt-change-in-production`

## Configuration Examples

### Development Environment
```bash
MAKSI_BASE=https://eformhatay.maksionline.com
MAKSI_SEARCH_PATH=/react-system/api_php/user_search/users.php
MAKSI_CRITERIA_FOR_RFID=0
MAKSI_BOOTSTRAP_COOKIE=PHPSESSID=dev123; AC-C=ac-c
MAKSI_ENABLED=true
RFID_LOG_SALT=dev-salt-123
```

### Production Environment
```bash
MAKSI_BASE=https://eformhatay.maksionline.com
MAKSI_SEARCH_PATH=/react-system/api_php/user_search/users.php
MAKSI_CRITERIA_FOR_RFID=0
MAKSI_BOOTSTRAP_COOKIE=PHPSESSID=prod456def789; AC-C=ac-c
MAKSI_ENABLED=true
RFID_LOG_SALT=prod-unique-salt-789xyz
```

## Important Notes

### RFID Search Criteria
- **Always use criteria=0 for RFID searches**
- This is a requirement of the Maksisoft API for proximity card lookups
- Using other criteria values will not return RFID-based results

### Session Cookie Management
- The bootstrap cookie must be obtained from a valid Maksisoft session
- Cookies may expire and need to be refreshed periodically
- In MVP, manual cookie updates are required
- Future versions may include automatic session management

### Security Considerations
- RFID numbers are hashed in logs using the RFID_LOG_SALT
- No personal information is logged, only status codes and hashed identifiers
- Session cookies are stored server-side only, never exposed to browser
- Rate limiting prevents API abuse (1 request per second per IP+RFID)

### Feature Flag Usage
- When MAKSI_ENABLED=false, all Maksisoft buttons are hidden from UI
- API endpoints return 404 when feature is disabled
- This allows for easy deployment without breaking existing functionality

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Check if MAKSI_BOOTSTRAP_COOKIE is valid and current
   - Verify cookie format includes both PHPSESSID and AC-C

2. **No Search Results**
   - Ensure MAKSI_CRITERIA_FOR_RFID=0 (not 1, 2, or other values)
   - Verify RFID format matches Maksisoft expectations

3. **Network Timeouts**
   - Check MAKSI_BASE URL is accessible from server
   - Verify firewall allows outbound connections to Maksisoft

4. **Rate Limiting**
   - Wait 1 second between requests for same IP+RFID combination
   - Rate limits reset automatically after 60 seconds

### Testing Configuration

Use these curl commands to test the configuration:

```bash
# Test direct Maksisoft API access
curl -H "Cookie: PHPSESSID=your-session; AC-C=ac-c" \
     "https://eformhatay.maksionline.com/react-system/api_php/user_search/users.php?text=0006851540&criteria=0"

# Test panel API endpoint
curl "http://localhost:3001/api/maksi/search-by-rfid?rfid=0006851540"
```