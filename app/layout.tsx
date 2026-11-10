import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SkillGraph',
  description: 'Personal career intelligence: what to learn next, why it matters, and how to prove it.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
