/* =====================================================
   妙傳寺サポート AIチャットボット (Gemini 経由)
   ===================================================== */
(function () {
  'use strict';

  // ========== 設定 ==========
  // ⚠️ Cloudflare Worker をデプロイ後、このURLを更新してください
  const WORKER_ENDPOINT = 'https://myodenji-chatbot.myodenji7676.workers.dev';

  const WELCOME_MSG = '南無妙法蓮華経。妙傳寺へようこそ。\nご質問にお答えいたします。何でもお気軽にどうぞ。';
  const SUGGESTIONS = [
    'お布施の相場は?',
    '法事の流れを教えて',
    '駐車場はありますか?',
    '水子供養について',
    'アクセス方法'
  ];
  const STORAGE_KEY = 'myodenji_chat_history';
  const MAX_HISTORY = 10; // Gemini に送る直近件数

  // ========== 起動ボタン ==========
  function createLauncher() {
    const btn = document.createElement('button');
    btn.className = 'chatbot-launcher';
    btn.setAttribute('aria-label', 'AIサポートチャットを開く');
    btn.innerHTML = `
      <span class="pulse"></span>
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.04 2 11c0 2.34 1 4.46 2.65 6.06L3 22l5.27-1.46C9.42 21.06 10.69 21.3 12 21.3c5.52 0 10-4.04 10-9s-4.48-9.3-10-9.3zm-2 9c0-.55.45-1 1-1s1 .45 1 1-.45 1-1 1-1-.45-1-1zm-4 0c0-.55.45-1 1-1s1 .45 1 1-.45 1-1 1-1-.45-1-1zm8 0c0-.55.45-1 1-1s1 .45 1 1-.45 1-1 1-1-.45-1-1z"/></svg>
    `;
    document.body.appendChild(btn);
    return btn;
  }

  // ========== チャットウィンドウ ==========
  function createWindow() {
    const win = document.createElement('div');
    win.className = 'chatbot-window';
    win.innerHTML = `
      <div class="chatbot-header">
        <div class="chatbot-header-info">
          <div class="chatbot-header-icon">妙</div>
          <div>
            <h3>妙傳寺サポート</h3>
            <p>AIがご質問にお答えします</p>
          </div>
        </div>
        <button class="chatbot-close" aria-label="閉じる">×</button>
      </div>
      <div class="chatbot-messages" role="log" aria-live="polite"></div>
      <div class="chatbot-input-area">
        <textarea class="chatbot-input" placeholder="ご質問をどうぞ..." rows="1"></textarea>
        <button class="chatbot-send" aria-label="送信">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
      <div class="chatbot-footer-note">
        AIによる回答は参考情報です。正確な情報は <a href="tel:0143-22-4284">☎ 0143-22-4284</a> までご連絡ください。
      </div>
    `;
    document.body.appendChild(win);
    return win;
  }

  // ========== メッセージ追加 ==========
  function addMessage(messagesEl, role, text) {
    const msg = document.createElement('div');
    msg.className = 'chat-msg ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble';
    bubble.textContent = text;
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
  }

  function addTyping(messagesEl) {
    const msg = document.createElement('div');
    msg.className = 'chat-msg bot typing-msg';
    const bubble = document.createElement('div');
    bubble.className = 'chat-msg-bubble';
    bubble.innerHTML = '<span class="chat-typing"><span></span><span></span><span></span></span>';
    msg.appendChild(bubble);
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return msg;
  }

  function addSuggestions(messagesEl, onSelect) {
    const wrap = document.createElement('div');
    wrap.className = 'chat-suggestions';
    SUGGESTIONS.forEach(text => {
      const chip = document.createElement('button');
      chip.className = 'chat-chip';
      chip.textContent = text;
      chip.onclick = () => {
        wrap.remove();
        onSelect(text);
      };
      wrap.appendChild(chip);
    });
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return wrap;
  }

  // ========== 履歴管理 ==========
  function loadHistory() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveHistory(history) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-20)));
    } catch (e) {}
  }

  // ========== Gemini 呼び出し(Cloudflare Worker経由) ==========
  async function sendToBot(message, history) {
    if (WORKER_ENDPOINT.includes('YOUR-CF-SUBDOMAIN')) {
      // Worker未設定: フォールバック
      return {
        reply: 'チャットボットの設定がまだ完了していません。\n\nお問い合わせは ☎ 0143-22-4284 までどうぞ。\nまたは https://myodenji7676.online/faq.html もご参照ください。'
      };
    }

    try {
      const response = await fetch(WORKER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          history: history.slice(-MAX_HISTORY)
        })
      });
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      const data = await response.json();
      return { reply: data.reply || 'すみません、お答えできませんでした。' };
    } catch (e) {
      return {
        reply: '通信が混み合っているようです。少し時間を置いて再度お試しください。\n\n急ぎの場合は ☎ 0143-22-4284 へ直接ご連絡くださいませ。'
      };
    }
  }

  // ========== 初期化 ==========
  function init() {
    const launcher = createLauncher();
    const chatWindow = createWindow();
    const messagesEl = chatWindow.querySelector('.chatbot-messages');
    const inputEl = chatWindow.querySelector('.chatbot-input');
    const sendBtn = chatWindow.querySelector('.chatbot-send');
    const closeBtn = chatWindow.querySelector('.chatbot-close');

    let history = loadHistory();
    let isFirstOpen = history.length === 0;
    let isSending = false;

    // 既存履歴を表示
    history.forEach(m => addMessage(messagesEl, m.role, m.text));

    function openChat() {
      chatWindow.classList.add('is-open');
      launcher.classList.add('is-hidden');
      if (isFirstOpen) {
        addMessage(messagesEl, 'bot', WELCOME_MSG);
        addSuggestions(messagesEl, (text) => sendMessage(text));
        isFirstOpen = false;
      }
      setTimeout(() => inputEl.focus(), 100);
    }
    function closeChat() {
      chatWindow.classList.remove('is-open');
      launcher.classList.remove('is-hidden');
    }

    launcher.addEventListener('click', openChat);
    closeBtn.addEventListener('click', closeChat);

    // 自動高さ調整
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = inputEl.value.trim();
        if (text) sendMessage(text);
      }
    });

    sendBtn.addEventListener('click', () => {
      const text = inputEl.value.trim();
      if (text) sendMessage(text);
    });

    async function sendMessage(text) {
      if (isSending) return;
      isSending = true;
      sendBtn.disabled = true;

      addMessage(messagesEl, 'user', text);
      history.push({ role: 'user', text });
      inputEl.value = '';
      inputEl.style.height = 'auto';

      const typing = addTyping(messagesEl);
      const result = await sendToBot(text, history);
      typing.remove();

      addMessage(messagesEl, 'bot', result.reply);
      history.push({ role: 'bot', text: result.reply });
      saveHistory(history);

      isSending = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
