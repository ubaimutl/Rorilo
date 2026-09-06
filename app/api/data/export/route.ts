import { NextResponse } from 'next/server';
import { exportPortableBackup } from '@/lib/data/portable-backup';
import { ensureAISettingsColumns } from '@/lib/ai/settings-store';
import { publicSettingsError } from '@/lib/security/redact';

export async function GET() {
  try {
    await ensureAISettingsColumns();
    const backup = await exportPortableBackup();
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="rorilo-backup-${date}.json"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicSettingsError(error) || 'Could not export backup' },
      { status: 500 }
    );
  }
}
