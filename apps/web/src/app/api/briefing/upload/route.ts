import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, getAuthContext } from '@/lib/supabase/server';
import { ORG_DOCUMENTS_BUCKET } from '@/lib/proof-library/extract';

// Demo-mode guard: when NEXT_PUBLIC_DEMO_MODE=true, skip Storage upload
// and return a synthetic success. Matches the pattern in middleware.ts.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

// Maps document category -> memory_entries categories (for response metadata).
// Actual memory write happens in the extraction pipeline, not here.
const CATEGORY_MAP: Record<string, string[]> = {
  strategic_plan: ['mission'],
  grant_proposal: ['prior_grants'],
  donor_list: ['donors'],
  financial_statement: ['outcomes'],
  program_description: ['outcomes'],
  marketing_materials: ['voice_samples'],
  event_plan: ['general'],
  staff_roster: ['contacts'],
  board_documents: ['general'],
  other: ['general'],
};

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  const { user, orgId, memberId } = await getAuthContext();
  if (!user || !orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const category = (formData.get('category') as string) || 'other';

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: 'File exceeds 10MB limit' },
        { status: 413 }
      );
    }

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowedExts = ['pdf', 'doc', 'docx', 'txt', 'csv', 'xls', 'xlsx'];
    const typeOk = allowedTypes.includes(file.type) || (ext && allowedExts.includes(ext));

    if (!typeOk) {
      return NextResponse.json(
        { success: false, error: 'File type not supported' },
        { status: 415 }
      );
    }

    const memoryCategories = CATEGORY_MAP[category] ?? ['general'];

    // Demo-mode guard: skip all Storage/DB work and return a synthetic response.
    // This lets the briefing form work in demo mode without a real Supabase bucket.
    if (DEMO_MODE) {
      return NextResponse.json({
        success: true,
        docId: `demo_doc_${Date.now()}`,
        fileName: file.name,
        category,
        memoryCategories,
        message: `Your team now has access to "${file.name}"`,
        demo: true,
      });
    }

    const serviceClient = createServiceRoleClient();
    if (!serviceClient) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Insert documents row first so the Storage path can embed the docId.
    const { data: doc, error: docError } = await serviceClient
      .from('documents')
      .insert({
        org_id: orgId,
        uploaded_by: memberId,
        file_name: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || `application/${ext}`,
        category,
        processing_status: 'pending',
        storage_path: null, // Updated below after Storage upload succeeds
      })
      .select('id')
      .single();

    if (docError || !doc) {
      console.error('[briefing/upload] Document insert error:', docError);
      // Fail loud: if we can't create the DB row, abort rather than producing
      // an orphaned Storage object with no documents record. (OQ-5 resolved.)
      return NextResponse.json(
        { success: false, error: 'Failed to create document record' },
        { status: 500 }
      );
    }

    const docId = doc.id;

    // Upload to Storage at <orgId>/<docId>/<filename> — mirrors persistRenderedPng pattern.
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `${orgId}/${docId}/${file.name}`;

    const { error: storageError } = await serviceClient.storage
      .from(ORG_DOCUMENTS_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type || `application/${ext}` || 'application/octet-stream',
        upsert: false,
      });

    if (storageError) {
      console.error('[briefing/upload] Storage upload error:', storageError);
      // Fail loud on Storage errors (OQ-5 resolved: no silent failures in production).
      // Clean up the orphaned documents row so the user can retry cleanly.
      await serviceClient.from('documents').delete().eq('id', docId);
      return NextResponse.json(
        { success: false, error: `Storage upload failed: ${storageError.message}` },
        { status: 500 }
      );
    }

    // Update documents row with the confirmed storage_path.
    const { error: updateError } = await serviceClient
      .from('documents')
      .update({ storage_path: storagePath })
      .eq('id', docId);

    if (updateError) {
      // Storage upload succeeded but path update failed. Log for ops but don't
      // fail the user — the document is in Storage, the sweeper can recover by
      // reconstructing the path from (org_id, id, file_name).
      console.error('[briefing/upload] storage_path update error:', updateError);
    }

    return NextResponse.json({
      success: true,
      docId,
      fileName: file.name,
      category,
      memoryCategories,
      message: `Your team now has access to "${file.name}"`,
    });
  } catch (error) {
    console.error('[POST /api/briefing/upload]', error);
    return NextResponse.json(
      { success: false, error: 'Upload failed' },
      { status: 500 }
    );
  }
}
