/**
 * 妙傳寺サポート AI チャットボット - Cloudflare Worker
 *
 * このファイルは Cloudflare Workers にデプロイするためのコードです。
 * リポジトリには配置していますが、自動でデプロイはされません。
 *
 * デプロイ手順:
 * 1. https://dash.cloudflare.com/ にログイン
 * 2. 左メニュー Workers & Pages → Create → Worker
 * 3. 名前: myodenji-chatbot 等で作成
 * 4. Quick edit でこのファイルの内容を貼り付け → Deploy
 * 5. Settings → Variables and Secrets → Add → Type: Secret
 *    Name: GEMINI_API_KEY
 *    Value: (Google AI Studio で取得した API キー)
 * 6. デプロイされた Worker の URL を chatbot.js の WORKER_ENDPOINT に設定
 */

const ALLOWED_ORIGINS = [
  'https://myodenji7676.online',
  'https://www.myodenji7676.online',
  'https://yuuuuuusama.github.io'  // GitHub Pages デフォルトURLでもアクセス可
];

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
- 毎月8日: 祈祷会(鬼子母神様のご縁日)
- 毎月13日: 題目講(日蓮聖人ご命日の法要)
- 毎月25日: 月例施餓鬼会(永代供養者・水子・ペットの施餓鬼供養)

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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': allowed,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const body = await request.json();
      const message = (body.message || '').toString().slice(0, 1000); // 入力長制限
      const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

      if (!message.trim()) {
        return jsonResp({ error: 'message required' }, 400, allowed);
      }

      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return jsonResp({ error: 'API key not configured' }, 500, allowed);
      }

      // Gemini 形式に変換
      const contents = history.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));
      contents.push({ role: 'user', parts: [{ text: message }] });

      const geminiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            generationConfig: {
              temperature: 0.6,
              maxOutputTokens: 600,
              topP: 0.9,
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

      if (!geminiResp.ok) {
        const errText = await geminiResp.text();
        return jsonResp({ error: 'Gemini API error', detail: errText.slice(0, 200) }, 500, allowed);
      }

      const data = await geminiResp.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text
        || 'すみません、お答えを生成できませんでした。お電話 0143-22-4284 までお気軽にお問い合わせください。';

      return jsonResp({ reply }, 200, allowed);
    } catch (e) {
      return jsonResp({ error: 'Internal error', detail: String(e).slice(0, 200) }, 500, allowed);
    }
  }
};

function jsonResp(payload, status, origin) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
    }
  });
}
