# State Flow

## Request Lifecycle
states:
- idle
- input_received

transitions:
- idle → input_received (user clicks a lobby button)
- input_received → idle (input processed with no state mutation)

## Sync Lifecycle
states:
- static
- interaction_detected

transitions:
- static → interaction_detected (user interacts with lobby UI)
- interaction_detected → static (no update/state change occurs)
