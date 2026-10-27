import { env, selectRows, insertRow, updateRows, sendWhatsAppText, saveOutbound } from './whatsapp-lib.mjs';
import { isMetaClickToWhatsAppAd } from './whatsapp-ad-referral.mjs';
import { formatMetaOpening, isMetaInitialEligible, isMetaContinuationEligible } from './whatsapp-meta-conversation.mjs';

export async function dispatchMetaTriage({ value, initialThread, thread, inbound, created, message, decision, isSafetyText, isPriceText }) {
  const enabled = env('VALTEC_META_FIRST_REPLY_ENABLED') === 'true';
  if (!enabled || !thread?.id || !inbound?.row?.id || !decision?.reply) return false;
  const phoneId = value?.metadata?.phone_number_id;
  const commercialPhoneId = env('WHATSAPP_PHONE_NUMBER_ID');
  const first = isMetaInitialEligible({
    enabled, created, referral:isMetaClickToWhatsAppAd(inbound?.row?.raw_payload?.referral),
    phoneId, commercialPhoneId, contactType:initialThread?.contact_type,
    replyMode:initialThread?.auto_reply_mode,
    humanRequiredBefore:initialThread?.human_required || initialThread?.status==='human',
    lastOutboundBefore:initialThread?.last_outbound_at, messageType:message?.type
  });
  let subsequent = false;
  if (!first && !created && initialThread?.classification_source === 'meta_ads_referral') {
    const [last, firstReceipt, followups] = await Promise.all([
      selectRows('whatsapp_messages', 'select=provider_message_id&thread_id=eq.'+encodeURIComponent(thread.id)+'&direction=eq.outbound&order=created_at.desc&limit=1'),
      selectRows('whatsapp_meta_first_replies','select=provider_message_id,status&thread_id=eq.'+encodeURIComponent(thread.id)+'&limit=1'),
      selectRows('whatsapp_meta_triage_replies','select=provider_message_id,status,created_at&thread_id=eq.'+encodeURIComponent(thread.id)+'&order=created_at.desc&limit=10')
    ]);
    const sent = (followups||[]).filter(x=>x.status==='sent');
    const previousBot = sent[0]?.provider_message_id || (firstReceipt?.[0]?.status==='sent' ? firstReceipt[0]?.provider_message_id:'');
    subsequent = isMetaContinuationEligible({
      enabled,thread:initialThread,phoneId,commercialPhoneId,
      previousOutboundId:last?.[0]?.provider_message_id,lastAutomaticOutboundId:previousBot,replyCount:sent.length
    });
  }
  if (!first && !subsequent) return false;
  const table=first?'whatsapp_meta_first_replies':'whatsapp_meta_triage_replies';
  const messageId=String(message?.id||inbound.row.id);
  const filter=(first?'thread_id':'inbound_message_id')+'=eq.'+encodeURIComponent(first?thread.id:messageId);
  try {
    await insertRow(table,{thread_id:thread.id,inbound_message_id:messageId,status:'pending'});
  } catch {
    // Unique ID prevents duplicated sends; backend failure must fail closed.
    return true;
  }
  const body=first ? formatMetaOpening(decision.reply,{
    isSafety:isSafetyText(inbound?.extracted?.body||''),
    isPrice:isPriceText(inbound?.extracted?.body||'')
  }):String(decision.reply).trim();
  try {
    if (!body || body.length>3900) throw Error('invalid response');
    const providerMessageId=await sendWhatsAppText(thread.phone,body);
    await saveOutbound({threadId:thread.id,providerMessageId,body});
    const at=new Date().toISOString();
    await updateRows(table,filter,{status:'sent',provider_message_id:providerMessageId,sent_at:at,updated_at:at});
    await updateRows('whatsapp_threads','id=eq.'+encodeURIComponent(thread.id),{
      last_outbound_at:at,last_message_at:at,last_message_preview:body.slice(0,180),updated_at:at
    });
  } catch {
    // Do not retry blind: Meta may have delivered before acknowledgement was lost.
    await updateRows(table,filter,{status:'failed',updated_at:new Date().toISOString()}).catch(()=>{});
  }
  return true;
}
