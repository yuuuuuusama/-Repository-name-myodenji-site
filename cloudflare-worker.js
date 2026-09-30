/**
 * 妙傳寺サポート AI チャットボット - Cloudflare Worker
 *
 * 2つのエンドポイントを提供:
 *   POST /              … Webチャットウィジェット (chatbot.js から呼ばれる)
 *   POST /line/webhook  … LINE Messaging API Webhook
 *
 * デプロイ手順(2026-09-30 から。ダッシュボードへの貼り付けはやめた):
 * 1. リポジトリの一番上で  npx wrangler deploy -c chatbot/wrangler.toml
 *    (設定は chatbot/wrangler.toml。回数の上限の仕組みもそこで結ぶ)
 * 2. Secret は Worker に登録済み(値はここにもリポジトリにも書かない):
 *    - GEMINI_API_KEY              (Google AI Studio で取得)
 *    - LINE_CHANNEL_ACCESS_TOKEN  (LINE Developers → Messaging API設定)
 *    - LINE_CHANNEL_SECRET         (LINE Developers → チャネル基本設定)
 *    変えるときは  npx wrangler secret put <名前> -c chatbot/wrangler.toml
 * 3. 守り:
 *    - Web チャット(POST /)は妙傳寺のホームページ(myodenji7676.online・www)からの呼び出しだけを受ける。
 *      それ以外の Origin(Origin なしを含む)は 403。
 *    - 一人(IP。IPv6 は /64 ごと・LINE は利用者ごと)あたり 10 分に 20 回、全体で 10 分に 200 回まで(Durable Object で数える)。超えたら 429 と案内文。
 *    - LINE の Webhook は Origin を持たないので、署名(HMAC)で確かめる。
 * 4. LINE Developers Console:
 *    - 該当チャネル → Messaging API設定 → Webhook URL に
 *      https://<your-worker>.workers.dev/line/webhook を設定
 *    - 「Webhookの利用」を ON
 *    - 「応答メッセージ」を OFF (Webhookと競合するため)
 *    - 「あいさつメッセージ」は ON のまま
 *    - 「Webhook URL検証」ボタンで疎通確認
 */

import { DurableObject } from 'cloudflare:workers';

const ALLOWED_ORIGINS = [
  'https://myodenji7676.online',
  'https://www.myodenji7676.online'
];

const RATE_LIMIT_MSG = 'ただいまご質問が続いているため、少しお時間を置いてから(10分ほど)もう一度お試しください。\n\nお急ぎの場合は ☎ 0143-22-4284 までお電話くださいませ。';

const SYSTEM_PROMPT = `あなたは北海道室蘭市にある日蓮宗寺院「感応山 妙傳寺(かんのうざん みょうでんじ)」のサポートアシスタントです。
参拝者・檀信徒からのご質問に、丁寧で温かい言葉遣い(ですます調)でお答えしてください。

【寺院の基本情報】
- 寺院名: 感応山 妙傳寺
- 住所: 〒051-0021 北海道室蘭市常盤町5-7
- 電話: 0143-22-4284
- 受付時間: 9:00-17:00(急ぎのご葬儀は24時間対応)
- 宗派: 日蓮宗
- 公式サイト: https://myodenji7676.online/

【提供サービス】
- 月参り(毎月の命日のご供養、ご自宅へ訪問)
- 法事・先祖供養(四十九日・百ヶ日・一周忌・三回忌・七回忌〜五十回忌)
- お葬式(24時間対応)
- 納骨堂(屋内型・天候に左右されない): 1級100万円/2級70万円/3級40万円
- 永代供養墓「久遠」: 個別法号供養(1人30万・2人45万・3人60万)/先祖代々供養(何人でも50万)/共同埋葬供養(何人でも5万)
- 水子供養(慈母観音菩薩のもとで供養)
- ペット供養墓「安穏」: 永代合祀供養 3万円、個別納骨壇 +年間5千円
- お焚き上げ供養(掛け軸・位牌・お守り・お札・過去帳・人形などをご供養)
- ご祈祷(木剣修法による伝統的なご祈祷)

【年中行事】
- 2月3日: 節分会・特別祈祷会(水行・節分会・豆まき)
- 3月: 春季彼岸会
- 4月8日: 釈尊降誕会(花まつり、午後2時より)
- 6月8日: 鬼子母神祭(午後2時より)
- 8月15日: 新盆供養法要(午後2時)、16日: 施餓鬼法要・精霊送り(午後5時)
- 9月: 秋季彼岸会
- 10月12日午後5時 高座説教/午後6時 御逮夜法要、13日午前8時 正当法要(御会式)

【月例行事】
- 毎月8日: 祈祷会(鬼子母神様のご縁日)※8月はお休み
- 毎月13日: 題目講(日蓮聖人ご命日の法要)※3・4・6・8月はお休み
- 毎月25日: 月例施餓鬼会(永代供養者・水子・ペットの施餓鬼供養)※3・8・9月はお休み
- お休みの月をお尋ねの方には、上記のとおりご案内してください

【オンラインでのお申込み・お問い合わせ】
- 各種お申込みのページ: https://myodenji7676.online/apply.html
- 法事(四十九日・百ヶ日・一周忌・三回忌などの年回法要)、ご祈祷、水子供養は、どなたでも上記ページのお申込みフォームからお申込みいただけます。送信後、お寺から確認のご連絡をいたします
- 節分(星守り 1個500円・願意祈祷 1件5,000円)のお申込み: 檀家の方が檀家アカウントでログインしてお申込みいただけます。受付期間は毎年1月1日〜2月3日
- お盆の塔婆・提灯(提灯 1本3,000円・特別塔婆 1本10,000円・新盆供養 1組12,000円)のお申込み: 檀家の方が檀家アカウントでログインしてお申込みいただけます。受付期間は毎年7月1日〜8月16日
- 檀家アカウントのID・パスワードをお持ちでない方は、お寺へお問い合わせいただくようご案内してください
- 受付期間の外はフォームが閉じていますので、次の受付開始日をご案内してください
- 納骨堂・永代供養・ペット供養・お焚き上げは、お電話またはお問い合わせフォームからのご相談です
- お問い合わせフォーム: 公式サイトのトップページ下部「お問い合わせ・相談」(https://myodenji7676.online/#contact)
- ご葬儀のご依頼・お急ぎの場合は、フォームではなくお電話(0143-22-4284、24時間)でご案内してください
- 個人情報の取扱い: https://myodenji7676.online/privacy.html (フォームでお預かりする個人情報の扱いはこのページでご確認いただけます)

【御守護神】
鬼子母神(子宝・安産・子育て)、大黒天(商売繁盛)、八大龍王(水の守護神・諸願成就)、慈母観音菩薩(慈愛)、妙蘭弁才天(才能・芸事)、三宝荒神(火の神・台所)

【お守り】
- 星守り: 当年の厄から守護
- 厄除け守り: 厄年・八方塞がりの方
- 鬼子母神守り: 身体健全・闘病平癒・息災延命・子宝・発育・試験合格・学業
- 日蓮聖人守り: 家内安全・良縁・豊作・海上/航空/作業安全
- 大黒守り: 商売繁盛・事業繁栄・社運隆昌
- 交通安全守り: 交通安全

【ご祈祷の種類】
家内安全/身体健全/闘病平癒/息災延命/除厄開運/除災得幸/良縁成就/子宝成就/安産成就/発育成就/試験合格/学業増進/商売繁昌/事業繁栄/社運隆昌/豊作祈願/交通安全/海上安全/航空安全/作業安全

【返答の方針】
- 丁寧で温かい言葉遣い、ですます調
- 仏教用語は分かりやすく補足
- お布施の金額は「決まった金額はなく、お気持ちでございます」と答える
- 急を要する話(ご葬儀など)は「お電話 0143-22-4284 へ直接ご連絡を」と案内
- 不明な点・複雑な相談は「お寺へお電話または公式サイトのお問い合わせフォームからお気軽にどうぞ」と案内
- 個人情報は聞かない・収集しない
- 200〜400字程度で簡潔に
- 宗派や教義を否定しない、批判的内容は扱わない
- 寺院に関係ない話題(ニュース・芸能・政治など)は丁寧にお断りし、お寺に関する話題に戻す`;

// ============================================================
// エントリポイント (パスベースのルーティング)
// ============================================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/line/webhook') {
      return handleLineWebhook(request, env, ctx);
    }

    return handleWebChat(request, env);
  }
};

// ============================================================
// Web チャット (既存のチャットウィジェット用)
// ============================================================
async function handleWebChat(request, env) {
  const origin = request.headers.get('Origin') || '';

  // 妙傳寺のホームページ以外(Origin なし=curl などを含む)からは受けない
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return new Response('Forbidden', { status: 403, headers: { 'Vary': 'Origin' } });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      }
    });
  }

  if (request.method !== 'POST') {
    return jsonResp({ error: 'Method not allowed' }, 405, origin);
  }

  // 回数の上限(一人あたり・全体)
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await withinLimit(env, ipKey(ip)))) {
    return jsonResp({ error: 'rate_limited', reply: RATE_LIMIT_MSG }, 429, origin, { 'Retry-After': '600' });
  }

  try {
    const body = await request.json();
    const message = (body.message || '').toString().slice(0, 1000);
    const history = Array.isArray(body.history)
      ? body.history.slice(-10)
          .filter(m => m && typeof m.text === 'string' && m.text.trim())
          .map(m => ({ role: m.role === 'user' ? 'user' : 'bot', text: m.text.slice(0, 1000) }))
      : [];

    if (!message.trim()) {
      return jsonResp({ error: 'message required' }, 400, origin);
    }

    const reply = await callGemini(message, history, env.GEMINI_API_KEY);
    return jsonResp({ reply }, 200, origin);
  } catch (e) {
    // 中身(Gemini の返答など)は外へ出さず、ログにだけ残す
    console.error('web chat error', String(e).slice(0, 300));
    return jsonResp({ error: 'Internal error' }, 500, origin);
  }
}

// ============================================================
// 回数の上限 (Durable Object で数える)
//   一人(IP。IPv6 は /64 でひとまとめ・LINE は利用者ごと): 10 分に 20 回
//   全体: 10 分に 200 回(多くの IP から一斉に叩かれたときの歯止め)
//   数える仕組みが壊れているときは、お寺の案内を止めないよう通す
// ============================================================
const WINDOW_MS = 10 * 60 * 1000;
const PER_USER_LIMIT = 20;
const GLOBAL_LIMIT = 200;

function ipKey(ip) {
  if (ip.includes(':')) {
    // IPv6 は一台で番号を次々変えられるので、先頭 4 区切り(/64)で数える
    const full = ip.split('::')[0].split(':').slice(0, 4).join(':');
    return 'ip6:' + full;
  }
  return 'ip:' + ip;
}

async function withinLimit(env, key) {
  if (!env.RATE_COUNTER) return true;
  try {
    const user = env.RATE_COUNTER.get(env.RATE_COUNTER.idFromName(key));
    if (!(await user.hit(PER_USER_LIMIT, WINDOW_MS))) return false;
    const all = env.RATE_COUNTER.get(env.RATE_COUNTER.idFromName('global'));
    if (!(await all.hit(GLOBAL_LIMIT, WINDOW_MS))) return false;
  } catch (e) {
    console.error('rate counter error', String(e).slice(0, 200));
  }
  return true;
}

// 一つの鍵(IP・LINE 利用者・全体)ごとの回数を数える。直近 10 分の時刻だけを持つ
export class RateCounter extends DurableObject {
  async hit(limit, windowMs) {
    const now = Date.now();
    const times = ((await this.ctx.storage.get('t')) || []).filter(t => now - t < windowMs);
    if (times.length >= limit) {
      await this.ctx.storage.put('t', times);
      return false;
    }
    times.push(now);
    await this.ctx.storage.put('t', times);
    // 使われなくなったら片付ける
    await this.ctx.storage.setAlarm(now + windowMs + 1000);
    return true;
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

// ============================================================
// LINE Messaging API Webhook
// ============================================================
async function handleLineWebhook(request, env, ctx) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // 署名検証は raw body 必須なので先にテキストで読む
  const bodyText = await request.text();
  const signature = request.headers.get('x-line-signature') || '';

  const valid = await verifyLineSignature(bodyText, signature, env.LINE_CHANNEL_SECRET);
  if (!valid) {
    return new Response('Invalid signature', { status: 403 });
  }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const events = Array.isArray(body.events) ? body.events : [];

  // LINEは10秒以内のレスポンスを期待。重い処理は waitUntil で非同期化
  for (const event of events) {
    ctx.waitUntil(handleLineEvent(event, env));
  }

  return new Response('OK', { status: 200 });
}

async function handleLineEvent(event, env) {
  const replyToken = event.replyToken;
  if (!replyToken) return;

  // テキストメッセージのみAIで応答
  if (event.type === 'message' && event.message?.type === 'text') {
    const userText = (event.message.text || '').slice(0, 1000);
    if (!userText.trim()) return;

    const userKey = 'line:' + (event.source?.userId || 'unknown');
    if (!(await withinLimit(env, userKey))) {
      await lineReply(replyToken, RATE_LIMIT_MSG, env.LINE_CHANNEL_ACCESS_TOKEN).catch(() => {});
      return;
    }

    try {
      const reply = await callGemini(userText, [], env.GEMINI_API_KEY);
      await lineReply(replyToken, reply, env.LINE_CHANNEL_ACCESS_TOKEN);
    } catch {
      await lineReply(
        replyToken,
        'すみません、ただいまお答えできませんでした。\nお電話 0143-22-4284 までお気軽にお問い合わせください。',
        env.LINE_CHANNEL_ACCESS_TOKEN
      ).catch(() => {});
    }
    return;
  }

  // スタンプ・画像など非テキストメッセージへの定型応答
  if (event.type === 'message') {
    await lineReply(
      replyToken,
      'お問い合わせありがとうございます。\n恐れ入りますが、文字でメッセージをお送りいただけますとご対応しやすくなります。\n\nお急ぎのご相談は ☎ 0143-22-4284 までどうぞ。',
      env.LINE_CHANNEL_ACCESS_TOKEN
    ).catch(() => {});
  }
  // follow / unfollow / postback などはLINE側のあいさつメッセージ等で対応するため何もしない
}

// ============================================================
// Gemini API 呼び出し (Web/LINE共通)
// ============================================================
async function callGemini(message, history, apiKey) {
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const contents = history.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }]
  }));
  contents.push({ role: 'user', parts: [{ text: message }] });

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 2048,
          topP: 0.9,
          // 2.5-flash は既定で「考える」分も出力の枠を使い、返答が途中で切れるため止める
          thinkingConfig: { thinkingBudget: 0 },
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
      })
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error('Gemini API error: ' + errText.slice(0, 200));
  }

  const data = await resp.json();
  const cand = data.candidates?.[0];
  if (cand?.finishReason && cand.finishReason !== 'STOP') {
    // 途中で切れたときの手がかり(返答の中身は残さない)
    console.warn('gemini finish', cand.finishReason, JSON.stringify(data.usageMetadata || {}), data.modelVersion || '');
  }
  const parts = cand?.content?.parts || [];
  const text = parts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('').trim();
  return text
    ||'すみません、お答えを生成できませんでした。お電話 0143-22-4284 までお気軽にお問い合わせください。';
}

// ============================================================
// LINE 署名検証 (HMAC-SHA256)
// ============================================================
async function verifyLineSignature(bodyText, signature, secret) {
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(bodyText));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
  return timingSafeEqual(computed, signature);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ============================================================
// LINE Reply API
// ============================================================
async function lineReply(replyToken, text, accessToken) {
  if (!accessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN not configured');
  const resp = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text: text.slice(0, 4900) }]
    })
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error('LINE Reply API error: ' + errText.slice(0, 200));
  }
}

// ============================================================
// レスポンスヘルパ
// ============================================================
function jsonResp(payload, status, origin, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      ...extraHeaders,
    }
  });
}
