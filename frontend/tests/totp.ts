import crypto from 'crypto';

function base32ToBuffer(base32Str: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  const clean = base32Str.toUpperCase().replace(/=+$/, '');
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val !== -1) {
      bits += val.toString(2).padStart(5, '0');
    }
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTOTP(secret: string, timeStep: number = 30): string {
  const key = base32ToBuffer(secret);
  const epoch = Math.floor(Date.now() / 1000);
  const counter = BigInt(Math.floor(epoch / timeStep));
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigUInt64BE(counter);

  const digest = crypto.createHmac('sha1', key).update(timeBuffer).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

import fs from 'fs';
import path from 'path';

export function getTestAccounts() {
  const accounts: Record<string, { email: string; password: string; totpSecret: string | null; role: string }> = {
    ADMIN: {
      email: 'admin@example.com',
      password: 'Sprint2026!Admin',
      totpSecret: 'MRYYKLJ3GNBXCF3JLRIBHR6QV4IFLCN2',
      role: 'ADMIN',
    },
    ANALYST: {
      email: 'analyst@example.com',
      password: 'Sprint2026!Analyst',
      totpSecret: 'WLNJMOIXHFS442MVSNNA5WQJE74JWV3I',
      role: 'ANALYST',
    },
    PROVIDER: {
      email: 'provider@example.com',
      password: 'Sprint2026!Provider',
      totpSecret: 'FKH56R4XUAXHWHFGNX3QE5TY6KFOOMOH',
      role: 'PROVIDER',
    },
    SUBJECT: {
      email: 'subject@example.com',
      password: 'Sprint2026!Subject',
      totpSecret: null,
      role: 'SUBJECT',
    },
  };

  try {
    const p = path.resolve(__dirname, '../../TEST_ACCOUNTS.md');
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.includes('**ADMIN**')) {
          const m = line.match(/`([^`]+)`/g);
          if (m && m.length >= 3) {
            accounts.ADMIN.email = m[0].replace(/`/g, '');
            accounts.ADMIN.password = m[1].replace(/`/g, '');
            accounts.ADMIN.totpSecret = m[2].replace(/`/g, '');
          }
        } else if (line.includes('**ANALYST**')) {
          const m = line.match(/`([^`]+)`/g);
          if (m && m.length >= 3) {
            accounts.ANALYST.email = m[0].replace(/`/g, '');
            accounts.ANALYST.password = m[1].replace(/`/g, '');
            accounts.ANALYST.totpSecret = m[2].replace(/`/g, '');
          }
        } else if (line.includes('**PROVIDER**')) {
          const m = line.match(/`([^`]+)`/g);
          if (m && m.length >= 3) {
            accounts.PROVIDER.email = m[0].replace(/`/g, '');
            accounts.PROVIDER.password = m[1].replace(/`/g, '');
            accounts.PROVIDER.totpSecret = m[2].replace(/`/g, '');
          }
        } else if (line.includes('**SUBJECT**')) {
          const m = line.match(/`([^`]+)`/g);
          if (m && m.length >= 2) {
            accounts.SUBJECT.email = m[0].replace(/`/g, '');
            accounts.SUBJECT.password = m[1].replace(/`/g, '');
          }
        }
      }
    }
  } catch (err) {
    // Ignore, keep defaults
  }

  return accounts;
}

