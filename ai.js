const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You help a brand community platform surface the single most relevant brand message during a live anonymous chat between two members. You'll be given a list of the brand's available messages and the recent conversation. Pick the id of the ONE message that is a clear, strong match to what they are actually discussing right now. If nothing is a strong match, return null for broadcastId. Do not force a match just because a broadcast is loosely related — only pick when the conversation content is genuinely about that topic.`;

async function pickBroadcastForConversation(transcript, broadcasts) {
  if (!ANTHROPIC_API_KEY || !broadcasts.length || transcript.length < 2) return null;

  const broadcastList = broadcasts.map(b => `id: ${b.id}\ntype: ${b.type}\ntitle: ${b.title}\nbody: ${b.body}`).join('\n\n');
  const convo = transcript.map(m => `${m.from}: ${m.text}`).join('\n');
  const userContent = `Brand messages:\n${broadcastList}\n\nRecent conversation:\n${convo}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
        tools: [{
          name: 'pick_broadcast',
          description: 'Report which brand message (if any) matches the conversation.',
          input_schema: {
            type: 'object',
            properties: {
              broadcastId: { type: ['string', 'null'], description: 'The id of the best-matching broadcast, or null if none clearly match.' },
            },
            required: ['broadcastId'],
          },
        }],
        tool_choice: { type: 'tool', name: 'pick_broadcast' },
      }),
    });

    if (!res.ok) {
      console.error('[ai] match request failed:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const toolUse = data.content?.find(c => c.type === 'tool_use');
    const broadcastId = toolUse?.input?.broadcastId;
    return broadcastId && broadcasts.some(b => b.id === broadcastId) ? broadcastId : null;
  } catch (err) {
    console.error('[ai] match error:', err.message);
    return null;
  }
}

module.exports = {
  pickBroadcastForConversation,
  isEnabled: () => !!ANTHROPIC_API_KEY,
};
