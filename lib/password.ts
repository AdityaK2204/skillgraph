import bcrypt from 'bcryptjs';

// bcrypt with cost 12: slow by design, salted per password. Plain text is never stored or logged.
const BCRYPT_ROUNDS = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
