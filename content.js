/**
 * content.js
 * GUIDELINE・CONTACT ページの文章をここで管理します。
 * portfolio.html と同じディレクトリに置いてください。
 */

/* ============================================================
   CONTACT
   ============================================================ */
const CONTACT_CONTENT = {
  rows: [
    { label: "E-mail", value: "akaneyomitan@gmail.com", email: "akaneyomitan@gmail.com" },
    { label: "Discord ID", value: "yomitanakane" },
    { label: "", value: "" },
    { label: "Profile", value: "読谷あかね / Yomitan Akane" },
    { label: "", value: "2021年から漫画描きとしての活動を開始。" },
    { label: "", value: "自主制作『泉』を機に映像制作業を開始し、2023年に株式会社一二三に所属。" },
    { label: "", value: "同年に『散り散り』を投稿、合成音声楽曲の制作を趣味で行う。" },
    { label: "", value: "2025年に作家のえいりな刃物と結婚、また株式会社一二三を退所。" },
    { label: "", value: "現在はフリーランスとして、映像制作・楽曲制作・イラスト制作・DJ出演などの活動をしています。" },
  ]
};

/* ============================================================
   GUIDELINE Q&A
   ============================================================ */
const QA_ITEMS = [
  {
    q: "即売会に読谷あかね作品がテーマのイラスト本やグッズを出しても良いですか？",
    a: "問題ございません。"
  },
  {
    q: "読谷あかねグッズのオンライン販売をしても良いですか？",
    a: "同人の範疇であれば基本的に問題ございませんが、大規模な営利になる場合はご相談ください。"
  },
  {
    q: "「歌ってみた」や、合成音声によるカバー動画を投稿したいです。",
    a: "問題ございません。概要欄にあるinst音源も必要であればご活用ください。"
  },
  {
    q: "手描き動画、二次創作映像、音MADなどに楽曲を使用したいです。",
    a: "問題ございません。第三者の権利物を使用する場合は別途そちらのガイドラインもご確認ください。"
  },
   {
    q: "読谷あかね楽曲のMVをトレスしてもよいですか。",
    a: "OKです。トレスであることを明記するか、出典を記載してください。"
  },
  {
    q: "個人が非商用の音楽ゲームに楽曲を登録しても良いですか？",
    a: "私的に利用する範疇であれば問題ありませんが、音源が再配布される形になる場合はご遠慮ください。また公認も出来かねますので公認が必要な場合はご遠慮ください。"
  },
  {
    q: "R-18、R-18G系の二次創作はしても良いですか？",
    a: "問題ありません。センシティブフラグを付ける、ハッシュタグを付けないなど、未成年等に配慮した形での公開をお願いします。"
  },
  {
    q: "二次創作作品をFANBOX等で限定販売しても良いですか？",
    a: "問題ありません。私は見たいのでよかったら個人的に送ってください。"
  },
  {
    q: "DJ出演で楽曲やMVを流したいです。",
    a: "問題ありません。出来れば音源購入していただけるとありがたいですが、強制ではありません。"
  },
  {
    q: "REMIX制作にあたり、stemのご提供をお願いしたいのですが可能ですか。",
    a: "忙しさによりますができる限り対応します。"
  },
  {
    q: "カバー動画、REMIXをサブスクリプションサービスで配信したいです。",
    a: "CONTACTページにある連絡先にて事前にご連絡ください。"
  },
   {
    q: "読谷あかねを描きたいのですが、独立したキャラクターなのか代理キャラなのか、どういう扱いなんですか？",
    a: "元々『読谷あかね』という漫画のキャラクターであり、覚えやすくするため作者名も「読谷あかね」にした経緯がややこしくなり、現在は代理キャラクター的な扱いの時もあります。私としては別人という認識ですが、私自身その辺曖昧になってしまっているのでお好きな判断で取り扱ってください。"
  },
];

/* ============================================================
   以下は自動反映ロジックです。通常は編集不要です。
   ============================================================ */
(function () {

  function injectGuideline() {
    const container = document.getElementById("guideline-content");
    if (!container) return;

    const qaHTML = QA_ITEMS.map((item, i) => `
      <div class="qa-item" id="qa-${i}">
        <button class="qa-question" onclick="toggleQA(${i})" aria-expanded="false">
          <span class="qa-q-label">Q</span>
          <span>${item.q}</span>
          <svg class="qa-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="qa-answer" aria-hidden="true">${item.a}</div>
      </div>
    `).join("");

    container.innerHTML = `
      <h2>GUIDELINE</h2>

      <div class="gl-section">
        <div class="gl-heading">二次創作ガイドライン</div>
        <p class="gl-body" style="font-size:20px; font-weight:700; margin-bottom:14px;">基本的に何でもOKです。大歓迎！</p>
        <p class="gl-body">非商用もしくは同人の範疇であれば連絡不要です。</p>
        <p class="gl-body">YouTube、ニコニコ動画内での収益化も問題ございません。</p>
        <p class="gl-body">連絡があると却って許可しづらくなる場合もあるので、是非お好きに取り扱ってください。</p>
        <p class="gl-body" style="font-size:12.5px; line-height:1.6; margin-bottom:2px;">なお、各楽曲の著作権につきましては別途JASRACにて管理しています。管理状況は下記よりご確認いただけます。</p>
        <p class="gl-body" style="font-size:12.5px; line-height:1.6; margin-bottom:6px;"><a href="https://www2.jasrac.or.jp/eJwid/main?trxID=F00100" target="_blank" rel="noopener">JASRAC作品データベース検索サービス</a></p>
        <p class="gl-body">映像担当作品など、私主導でない作品に関しては主導者方のガイドラインを別途ご参照ください。</p>
        <p class="gl-body">大規模な営利目的もしくは法人での取扱の場合、CONTACTページに記載の連絡先までご連絡ください。</p>
      </div>

      <div class="gl-section">
        <div class="gl-heading">禁止事項</div>
        <ul class="gl-forbidden">
          <li>そのままの形での転載、音源等各種データの再配布</li>
          <li>誹謗中傷など、特定個人や団体を毀損する内容</li>
          <li>政治利用、反社会的利用</li>
          <li>アイデアのご提案</li>
        </ul>
      </div>

      <div class="gl-section">
        <div class="gl-heading">ハッシュタグ &amp; コミュニティ</div>
        <p class="gl-body">Xのハッシュタグとして <strong>#Yomitart</strong> をご用意しています。是非ご利用ください。</p>
        <div class="gl-hashtag-row">
          <a class="gl-tag-chip" href="https://x.com/search?q=%23Yomitart&src=hashtag_click" target="_blank" rel="noopener">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            #Yomitart
          </a>
          <a class="gl-tag-chip" href="https://discord.gg/TK2nDRS3V6" target="_blank" rel="noopener">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
            Discordサーバー
          </a>
        </div>
        <p class="gl-body" style="margin-top:12px;">見かけたFAはDiscordサーバーで共有しています。こちらも是非ご利用ください。</p>
      </div>

      <div class="gl-section">
        <div class="gl-heading">Q&amp;A</div>
        <div class="qa-list">${qaHTML}</div>
      </div>
    `;
  }

  function injectContact() {
    const container = document.getElementById("contact-content");
    if (!container) return;
    const rows = CONTACT_CONTENT.rows
      .map(row => {
        const val = row.email
          ? `<a href="mailto:${row.email}">${row.value}</a>`
          : row.value;
        return `
          <div class="contact-row">
            <span class="contact-label">${row.label || ""}</span>
            <span class="contact-value">${val}</span>
          </div>`;
      })
      .join("");

    // URLsセクション（URLs.js の URL_ITEMS を使用）
    let urlsSection = "";
    if (typeof URL_ITEMS !== "undefined" && URL_ITEMS.length > 0) {
      const urlButtons = URL_ITEMS.map(item => `
        <a class="contact-url-btn" href="${item.url}" target="_blank" rel="noopener">${item.label}</a>
      `).join("");
      urlsSection = `
        <details class="contact-urls-details" open>
          <summary class="contact-urls-summary">URLs</summary>
          <div class="contact-urls-grid">${urlButtons}</div>
        </details>`;
    }

    // Logセクション（Log.js の LOG_ITEMS を使用）
    let logSection = "";
    if (typeof LOG_ITEMS !== "undefined" && LOG_ITEMS.length > 0) {
      const logRows = LOG_ITEMS.map(item => `
        <div class="contact-log-row">
          <span class="contact-log-date">${item.date}</span>
          <span class="contact-log-text">${item.text}</span>
        </div>
      `).join("");
      logSection = `
        <details class="contact-urls-details" open>
          <summary class="contact-urls-summary">Log</summary>
          <div class="contact-log-list">${logRows}</div>
        </details>`;
    }

    container.innerHTML = `<h2>CONTACT</h2>${rows}${urlsSection}${logSection}`;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      injectGuideline();
      injectContact();
    });
  } else {
    injectGuideline();
    injectContact();
  }
})();

/* Q&A トグル（グローバル関数として定義） */
function toggleQA(index) {
  const item = document.getElementById("qa-" + index);
  if (!item) return;
  const isOpen = item.classList.contains("open");
  // 全部閉じる
  document.querySelectorAll(".qa-item.open").forEach(el => {
    el.classList.remove("open");
    el.querySelector(".qa-question").setAttribute("aria-expanded", "false");
    el.querySelector(".qa-answer").setAttribute("aria-hidden", "true");
  });
  // クリックしたのが閉じてたなら開く
  if (!isOpen) {
    item.classList.add("open");
    item.querySelector(".qa-question").setAttribute("aria-expanded", "true");
    item.querySelector(".qa-answer").setAttribute("aria-hidden", "false");
  }
}
