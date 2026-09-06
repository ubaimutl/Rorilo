import { prisma } from '@/lib/prisma';

type LogoSettingsRow = {
  apiToken?: string | null;
};

/**
 * Reads the logo.dev token from the database with env fallback.
 * Tolerates Prisma clients generated before the LogoSettings model existed
 * (e.g. a dev server started before migration) by falling back to env.
 */
export async function getLogoToken(): Promise<string | null> {
  try {
    const delegate = (
      prisma as unknown as {
        logoSettings?: {
          findFirst: (args: object) => Promise<LogoSettingsRow | null>;
        };
      }
    ).logoSettings;
    const saved = await delegate?.findFirst({ where: { id: 'default' } });
    return saved?.apiToken || process.env.LOGO_DEV_TOKEN || null;
  } catch {
    return process.env.LOGO_DEV_TOKEN || null;
  }
}
