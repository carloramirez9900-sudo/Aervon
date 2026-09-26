# Authentication implementation (v0.4)

## Registration flow

1. `POST /auth/register/start` receives a full international phone number and optional referral code.
2. Backend validates/normalizes the number to E.164, verifies that the number is not already registered, creates a 10-minute one-time challenge and returns a Telegram deep link.
3. The user opens the bot using the generated `/start <token>` deep link.
4. Telegram bot requests the user's own contact using `request_contact`.
5. The `/start` event binds that challenge to the Telegram user ID. The webhook then accepts the contact only when `contact.user_id === message.from.id`, normalizes the Telegram phone number, and matches phone + Telegram user ID to the same pending unexpired challenge.
6. Frontend polls `POST /auth/register/status` with the registration token.
7. Once Telegram verification is complete, `POST /auth/register/complete` receives the registration token and password. Only then is the final `User` document created.
8. Referral binding is immutable at account creation. Phone and Telegram user ID are unique.

## Login/session flow

- `POST /auth/login`: E.164 phone + password.
- Passwords are hashed with bcrypt cost 12.
- Access token: JWT, default 15 minutes.
- Refresh token: cryptographically random opaque token, default 30 days; only SHA-256 hash is stored in MongoDB.
- Refresh rotates the refresh token and revokes the prior session.
- `POST /auth/logout` revokes the supplied refresh token.
- `GET /auth/me` verifies the Bearer access token.

## Telegram webhook

Endpoint: `POST /auth/telegram/webhook`.

Requests must include `X-Telegram-Bot-Api-Secret-Token` matching `TELEGRAM_WEBHOOK_SECRET`. Configure this same secret when registering the webhook with Telegram.

## Required environment variables

- `JWT_ACCESS_SECRET`: at least 32 random characters.
- `JWT_ACCESS_TTL_SECONDS`: default 900.
- `REFRESH_TOKEN_TTL_DAYS`: default 30.
- `REGISTRATION_CHALLENGE_TTL_MINUTES`: default 10.
- `TELEGRAM_BOT_TOKEN`.
- `TELEGRAM_BOT_USERNAME` without or with `@`.
- `TELEGRAM_WEBHOOK_SECRET`.

## Security properties

- One phone number per account.
- One Telegram user ID per account.
- Registration challenges are random, hashed at rest, one-time, and expire automatically using a MongoDB TTL index.
- Telegram usernames are metadata only and are never used as identity.
- Referral code is resolved only before account creation.
- Auth routes are rate limited; login and registration have stricter limits.
- Refresh tokens are never stored in plaintext.
- Password and refresh-token hashes are excluded from normal API output.

## Frontend contract

The future frontend country/flag selector must submit a full international number. Password visibility (eye icon) is a presentation-only concern and requires no API change.
