// =========================================================================
// 感応山 妙傳寺のホームページを Cloudflare から配る(2026-09-30)
//
//   中身(HTML・CSS・写真)はこのリポジトリのものをそのまま配る(dist/ に写したもの。scripts/build-dist.mjs)。
//   配る途中で、法輪(myodenji-kanri)で直した文面と写真だけを差し替える:
//     ・文面:data-edit の目印の所(scripts/mark-editable.mjs が付けた)の中身を、法輪の直しに置き換える
//     ・写真:法輪で差し替えた道筋の写真を、法輪から出す
//   フォームの送信(/__form/:名前)は法輪に渡し、投函箱に入れる(ロボット判定は法輪で確かめる)。
//   節分・塔婆の申込(/api/auth・/api/me)と受付期間(/api/public)は、法輪の檀家向けの API にそのまま渡す。
//   お知らせのページ(news.html)の先頭には、法輪の「お知らせ」で「ホームページにも載せる」を付けたものを新しい順に足す。
//   法輪とはサービスバインディング(KANRI)でつなぐ。法輪は KANRI_HOST のホスト名で、妙傳寺のホームページとして扱う。
// =========================================================================
const EMPTY = { texts: {}, images: {} };
const TTL_MS = 15_000;
let memo = { at: 0, data: null };

async function loadEdits(env) {
  if (memo.data && Date.now() - memo.at < TTL_MS) return memo.data;
  try {
    const r = await env.KANRI.fetch(new Request(`https://${env.KANRI_HOST}/__site/edits.json`));
    const data = r.ok ? await r.json() : EMPTY;
    memo = { at: Date.now(), data };
    return data;
  } catch {
    return memo.data ?? EMPTY;   // 法輪に届かないときは、元のまま配る
  }
}

let newsMemo = { at: 0, data: null };
async function loadNews(env) {
  if (newsMemo.data && Date.now() - newsMemo.at < TTL_MS) return newsMemo.data;
  try {
    const r = await env.KANRI.fetch(new Request(`https://${env.KANRI_HOST}/__site/news.json`));
    const data = r.ok ? await r.json() : { items: [] };
    newsMemo = { at: Date.now(), data };
    return data;
  } catch {
    return newsMemo.data ?? { items: [] };
  }
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 法輪のお知らせを、今のお知らせのページと同じ形の記事にする(本文は法輪が HTML に直して渡す) */
function newsArticles(items) {
  return (items || []).map(n => `
    <article class="news-item" data-horin-news="${Number(n.id) || 0}">
        <div class="news-meta">
            <span class="news-date">${esc(n.date)}</span>${n.category ? `
            <span class="news-tag">${esc(n.category)}</span>` : ''}
        </div>
        <h3>${esc(n.title)}</h3>
        <p>${n.html || ''}</p>
    </article>`).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // フォーム → 法輪
    const form = /^\/__form\/([a-z0-9_-]{1,40})$/.exec(url.pathname);
    if (form) {
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
      return env.KANRI.fetch(new Request(`https://${env.KANRI_HOST}/__site/form/${form[1]}`, {
        method: 'POST', headers: request.headers, body: request.body, redirect: 'manual',
      }));
    }
    if (url.pathname.startsWith('/__site/')) return new Response('Not Found', { status: 404 });

    // 節分・塔婆の申込(檀家のログインと申込)と受付期間 → 法輪の檀家向けの API(寺務のホスト名で渡す)
    if (/^\/api\/(auth|me|public)\//.test(url.pathname)) {
      return env.KANRI.fetch(new Request(`https://${env.KANRI_ADMIN_HOST}${url.pathname}${url.search}`, {
        method: request.method, headers: request.headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body, redirect: 'manual',
      }));
    }

    const edits = await loadEdits(env);

    // 差し替えた写真
    if (request.method === 'GET' || request.method === 'HEAD') {
      let p = url.pathname.replace(/^\//, '');
      try { p = decodeURIComponent(p); } catch { /* そのまま */ }
      // ?orig=1 は元の写真(法輪で差し替えるとき、元の縦横の比を見るため)
      const id = url.searchParams.has('orig') ? 0 : edits.images?.[p];
      if (id) {
        const r = await env.KANRI.fetch(new Request(`https://${env.KANRI_HOST}/img/site/${id}`));
        if (r.ok) return new Response(r.body, { headers: { 'Content-Type': r.headers.get('Content-Type') || 'image/jpeg', 'Cache-Control': 'public, max-age=300' } });
      }
    }

    // 「/」「/newsletter/」などは、その中の index.html を出す(GitHub Pages と同じ)
    const assetReq = url.pathname.endsWith('/')
      ? new Request(new URL(url.pathname + 'index.html', url), request)
      : request;
    const res = await env.ASSETS.fetch(assetReq);
    const type = res.headers.get('Content-Type') || '';
    const robots = url.hostname.endsWith('.workers.dev') ? { 'X-Robots-Tag': 'noindex' } : {};
    if (!type.includes('text/html')) {
      if (!Object.keys(robots).length) return res;
      const out = new Response(res.body, res);
      out.headers.set('X-Robots-Tag', 'noindex');
      return out;
    }

    const texts = edits.texts || {};
    const isNews = /^\/news(\.html)?$/.test(url.pathname);
    const news = isNews ? newsArticles((await loadNews(env)).items) : '';
    const out = new HTMLRewriter()
      .on('main.news-wrapper', {
        element(el) { if (news) el.prepend(news, { html: true }); },
      })
      .on('[data-edit]', {
        element(el) {
          const v = texts[el.getAttribute('data-edit')];
          if (typeof v === 'string') el.setInnerContent(v, { html: true });   // 法輪が字を HTML に直して渡す(改行だけ <br>)
        },
      })
      .on('form[action]', {
        // 自分で配っているときは、フォームの送り先を自分の道筋にする(どのホスト名で開いても同じ所へ)
        element(el) {
          const a = el.getAttribute('action') || '';
          const m = /^https:\/\/[^/]+(\/__form\/[a-z0-9_-]+)$/.exec(a);
          if (m) el.setAttribute('action', m[1]);
        },
      })
      .transform(res);
    const final = new Response(out.body, out);
    final.headers.set('Cache-Control', 'no-cache');
    for (const [k, v] of Object.entries(robots)) final.headers.set(k, v);
    return final;
  },
};
