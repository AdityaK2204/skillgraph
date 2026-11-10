// Loads .env for command-line scripts (Next.js loads it automatically for the web app).
import { existsSync } from 'node:fs';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
} else if (!process.env.DATABASE_URL) {
  console.error('No .env file found. Copy .env.example to .env and set the passwords first.');
  process.exit(1);
}
