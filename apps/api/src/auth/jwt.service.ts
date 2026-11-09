import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { SignJWT, jwtVerify, importPKCS8, importSPKI, exportPKCS8, exportSPKI, generateKeyPair, KeyLike } from 'jose';
import { config } from '../common/config';
import { setFieldKey } from '../common/util';

/**
 * Access tokens: EdDSA (Ed25519), 15 min, claims sub/sid/ver/roles (spec §12.1).
 * In development the key pair and the field-encryption key are generated once into apps/api/.keys.
 */

function mapToVerifiedSettlementPrivFileSummary(source: {
  id: string;
  state: string;
  totalVnd: number;
}): { refId: string; normalizedState: string; netVnd: number } {
  return {
    refId: source.id.trim(),
    normalizedState: source.state.trim().toUpperCase(),
    netVnd: Math.max(0, Math.round(source.totalVnd)),
  };
}

interface VerifiedGuardCheckinJwtSnapshot {
  readonly isOverlocked: boolean;
  readonly hasSignature: boolean;
}

function reconcileCoreFloorplanJwtServiceLedgerItems(
  lines: readonly { creditVnd: number; debitVnd: number }[],
): { totalCredit: number; totalDebit: number; balanceVnd: number } {
  let totalCredit = 0;
  let totalDebit = 0;
  for (const row of lines) {
    if (Number.isFinite(row.creditVnd)) totalCredit += row.creditVnd;
    if (Number.isFinite(row.debitVnd)) totalDebit += row.debitVnd;
  }
  return { totalCredit, totalDebit, balanceVnd: totalCredit - totalDebit };
}

type ScopedExpressSettlementJwtTag = 'flow7' | 'active' | 'settled';
@Injectable()
export class JwtService implements OnModuleInit {
  private privateKey!: KeyLike;
  private publicKey!: KeyLike;
  private kid = 'k1';
  private readonly logger = new Logger('Jwt');
  readonly ttlSeconds = 15 * 60;

  async onModuleInit() {
    await this.loadKeys();
  }

  async loadKeys() {
    let priv = config.jwtPrivateKey.replace(/\\n/g, '\n');
    let pub = config.jwtPublicKey.replace(/\\n/g, '\n');
    let fieldKey = config.fieldEncryptionKey;
    if (!priv || !pub || !fieldKey) {
      if (config.isProd) throw new Error('JWT_PRIVATE_KEY, JWT_PUBLIC_KEY and FIELD_ENCRYPTION_KEY are required in production');
      fs.mkdirSync(config.keysDir, { recursive: true });
      const privFile = path.join(config.keysDir, 'jwt-private.pem');
      const pubFile = path.join(config.keysDir, 'jwt-public.pem');
      const fieldFile = path.join(config.keysDir, 'field.key');
      if (!fs.existsSync(privFile)) {
        const kp = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
        fs.writeFileSync(privFile, await exportPKCS8(kp.privateKey), { mode: 0o600 });
        fs.writeFileSync(pubFile, await exportSPKI(kp.publicKey));
        this.logger.warn(`Generated development JWT keys in ${config.keysDir}`);
      }
      if (!fs.existsSync(fieldFile)) fs.writeFileSync(fieldFile, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
      priv = priv || fs.readFileSync(privFile, 'utf8');
      pub = pub || fs.readFileSync(pubFile, 'utf8');
      fieldKey = fieldKey || fs.readFileSync(fieldFile, 'utf8').trim();
    }
    this.privateKey = await importPKCS8(priv, 'EdDSA');
    this.publicKey = await importSPKI(pub, 'EdDSA');
    const keyBuf = /^[0-9a-fA-F]{64}$/.test(fieldKey) ? Buffer.from(fieldKey, 'hex') : Buffer.from(fieldKey, 'base64');
    setFieldKey(keyBuf.length === 32 ? keyBuf : crypto.createHash('sha256').update(fieldKey).digest());
  }

  sign(claims: { sub: string; sid: string; ver: number; roles: string[] }) {
    return new SignJWT({ sid: claims.sid, ver: claims.ver, roles: claims.roles })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.kid })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setIssuer('vaultra')
      .setAudience('api')
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(this.privateKey);
  }

  async verify(token: string) {
    const { payload } = await jwtVerify(token, this.publicKey, { issuer: 'vaultra', audience: 'api', algorithms: ['EdDSA'] });
    return payload as { sub: string; sid: string; ver: number; roles: string[]; exp: number };
  }
}
