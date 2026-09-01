import {
  selectRows,
  updateRows,
  sendWhatsAppText,
  saveOutbound,
  verifyAdminRequest,
  readBody,
  json
} from '../server/whatsapp-lib.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  try {
    const admin = await verifyAdminRequest(req);
    if (!admin) return json(res, 401, { error: 'Acesso administrativo inválido.' });

    const body = await readBody(req);
    const threadId = String(body?.threadId || '').trim();
    const message = String(body?.message || '').trim();
    if (!threadId || !message) return json(res, 400, { error: 'Conversa e mensagem são obrigatórias.' });
    if (message.length > 4000) return json(res, 400, { error: 'Mensagem muito longa.' });

    const threads = await selectRows('whatsapp_threads', `select=*&id=eq.${encodeURIComponent(threadId)}&limit=1`);
    const thread = threads?.[0];
    if (!thread) return json(res, 404, { error: 'Conversa não encontrada.' });
    if (thread.status === 'closed') return json(res, 409, { error: 'Conversa encerrada. Reabra o atendimento antes de responder.' });

    const providerMessageId = await sendWhatsAppText(thread.phone, message);
    const row = await saveOutbound({
      threadId: thread.id,
      providerMessageId,
      body: message,
      rawPayload: { sent_by_admin: admin.user.id }
    });
    const now = new Date().toISOString();
    await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, {
      status: 'human',
      human_required: false,
      human_reason: null,
      unread_count: 0,
      last_message_preview: message.slice(0, 180),
      last_message_at: now,
      last_outbound_at: now,
      updated_at: now
    });
    return json(res, 200, { ok: true, message: row });
  } catch (error) {
    console.error('Valtec WhatsApp send:', error);
    return json(res, error?.status >= 400 && error?.status < 500 ? error.status : 502, {
      error: 'Não foi possível enviar a mensagem pelo WhatsApp.',
      detail: error?.message || String(error)
    });
  }
}
