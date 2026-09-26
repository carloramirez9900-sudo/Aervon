import { randomBytes } from 'node:crypto';
const secret = (bytes = 48) => randomBytes(bytes).toString('base64url');
console.log(`JWT_ACCESS_SECRET=${secret(48)}`);
console.log(`TELEGRAM_WEBHOOK_SECRET=${secret(32)}`);
