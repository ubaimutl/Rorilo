import { NextResponse } from 'next/server';
import { ensureAISettingsColumns } from '@/lib/ai/settings-store';
import { importPortableBackup, parsePortableBackup } from '@/lib/data/portable-backup';
import { publicSettingsError } from '@/lib/security/redact';

export async function POST(req: Request) {
  try {
    await ensureAISettingsColumns();
    const formData = await req.formData();
    const file = formData.get('backup');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Choose a Rorilo backup file first.' }, { status: 400 });
    }

    const text = await file.text();
    const backup = parsePortableBackup(JSON.parse(text));
    const counts = await importPortableBackup(backup);
    const totalRows = Object.values(counts).reduce((total, count) => total + count, 0);

    return NextResponse.json({
      success: true,
      importedRows: totalRows,
      counts,
      exportedAt: backup.exportedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicSettingsError(error) || 'Could not import backup' },
      { status: 500 }
    );
  }
}
