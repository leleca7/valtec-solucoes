import {
  env,
  selectRows,
  insertRow,
  updateRows,
  sendWhatsAppTemplate,
  saveOutbound,
  verifyAdminRequest,
  json
} from '../server/whatsapp-lib.mjs';

const TEMPLATE_ENV = {
  followup_1d: 'WHATSAPP_TEMPLATE_FOLLOWUP_1D',
  followup_3d: 'WHATSAPP_TEMPLATE_FOLLOWUP_3D',
  review_request: 'WHATSAPP_TEMPLATE_REVIEW'
};

async function authorized(req) {
  const bearer = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const cronSecret = env('CRON_SECRET');
  if (cronSecret && bearer && bearer === cronSecret) return { cron: true };
  return verifyAdminRequest(req);
}

async function cancel(job, reason) {
  await updateRows('whatsapp_automation_jobs', `id=eq.${encodeURIComponent(job.id)}`, {
    status: 'cancelled',
    last_error: reason || null,
    updated_at: new Date().toISOString()
  });
}

async function fail(job, error) {
  const attempts = Number(job.attempts || 0) + 1;
  const terminal = attempts >= 3;
  const patch = {
    attempts,
    status: terminal ? 'failed' : 'pending',
    last_error: String(error?.message || error).slice(0, 1000),
    updated_at: new Date().toISOString()
  };
  if (!terminal) patch.due_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await updateRows('whatsapp_automation_jobs', `id=eq.${encodeURIComponent(job.id)}`, patch);
}

async function processJob(job) {
  const threads = await selectRows('whatsapp_threads', `select=*&id=eq.${encodeURIComponent(job.thread_id)}&limit=1`);
  const thread = threads?.[0];
  if (!thread || thread.status === 'closed') return cancel(job, 'Conversa encerrada ou inexistente.');

  if (job.kind.startsWith('followup_') && thread.last_inbound_at && new Date(thread.last_inbound_at) > new Date(job.created_at)) {
    return cancel(job, 'Cliente respondeu depois que o follow-up foi agendado.');
  }

  if (job.kind === 'review_request' && !thread.positive_signal) {
    return cancel(job, 'Avaliação não enviada porque não há sinal positivo confirmado.');
  }

  const templateName = env(TEMPLATE_ENV[job.kind]);
  if (!templateName) throw new Error(`Configure ${TEMPLATE_ENV[job.kind]} com um template aprovado no WhatsApp.`);

  await updateRows('whatsapp_automation_jobs', `id=eq.${encodeURIComponent(job.id)}`, {
    status: 'processing',
    updated_at: new Date().toISOString()
  });

  const providerMessageId = await sendWhatsAppTemplate(thread.phone, templateName);
  await saveOutbound({
    threadId: thread.id,
    providerMessageId,
    body: `[Template: ${templateName}]`,
    messageType: 'system',
    rawPayload: { automation_job_id: job.id, template_name: templateName }
  });

  const now = new Date().toISOString();
  await updateRows('whatsapp_automation_jobs', `id=eq.${encodeURIComponent(job.id)}`, {
    status: 'sent',
    attempts: Number(job.attempts || 0) + 1,
    sent_at: now,
    last_error: null,
    updated_at: now
  });
  await updateRows('whatsapp_threads', `id=eq.${encodeURIComponent(thread.id)}`, {
    last_message_preview: `Automação enviada: ${job.kind}`,
    last_message_at: now,
    last_outbound_at: now,
    updated_at: now
  });

  if (job.kind === 'followup_1d') {
    try {
      await insertRow('whatsapp_automation_jobs', {
        thread_id: thread.id,
        lead_id: job.lead_id || thread.lead_id || null,
        kind: 'followup_3d',
        due_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        payload: { created_from: job.id }
      });
    } catch (error) {
      if (error.status !== 409) throw error;
    }
  }

  if (job.kind === 'review_request' && (job.lead_id || thread.lead_id)) {
    await updateRows('leads', `id=eq.${encodeURIComponent(job.lead_id || thread.lead_id)}`, {
      status: 'avaliacao_solicitada',
      next_action: null,
      next_action_at: null,
      updated_at: now
    });
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Método não permitido.' });
  try {
    const auth = await authorized(req);
    if (!auth) return json(res, 401, { error: 'Não autorizado.' });

    const jobs = await selectRows(
      'whatsapp_automation_jobs',
      `select=*&status=eq.pending&due_at=lte.${encodeURIComponent(new Date().toISOString())}&order=due_at.asc&limit=20`
    );
    const result = { found: jobs.length, sent: 0, cancelled: 0, failed: 0 };

    for (const job of jobs) {
      try {
        const before = await selectRows('whatsapp_automation_jobs', `select=status&id=eq.${encodeURIComponent(job.id)}&limit=1`);
        if (before?.[0]?.status !== 'pending') continue;
        await processJob(job);
        const after = await selectRows('whatsapp_automation_jobs', `select=status&id=eq.${encodeURIComponent(job.id)}&limit=1`);
        const status = after?.[0]?.status;
        if (status === 'sent') result.sent += 1;
        else if (status === 'cancelled') result.cancelled += 1;
      } catch (error) {
        console.error('Valtec WhatsApp automation job:', job.id, error);
        await fail(job, error);
        result.failed += 1;
      }
    }

    return json(res, 200, result);
  } catch (error) {
    console.error('Valtec WhatsApp automations:', error);
    return json(res, 500, { error: 'Falha ao executar automações.', detail: error?.message || String(error) });
  }
}
