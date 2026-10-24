// Run locally. Keep the access key private; upload neither output nor key to hosting.
const crypto = require('node:crypto');
const email = process.argv[2];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node security-review/generate-access-key.cjs user@example.com');
  process.exitCode = 1;
} else {
  const key = crypto.randomBytes(32).toString('base64url');
  const digest = crypto.createHash('sha256').update(key).digest('hex');
  console.log('Private access key (save in your password manager; enter in the app):');
  console.log(key);
  console.log('\nMYBANK_ACCESS_KEYS Script Property value (merge entries for multiple users):');
  console.log(JSON.stringify({ [digest]: email }, null, 2));
}
