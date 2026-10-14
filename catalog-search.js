(() => {
  "use strict";
  // この7ファイルを検索対象にしています。ファイル名を変更した場合は、ここも変更してください。
  const SOURCES = [
    {file:"dai1.html", label:"第一次"},
    {file:"dai2.html", label:"第二期"},
    {file:"dai3.html", label:"第三期"},
    {file:"dai4.html", label:"第四期"},
    {file:"dai501.html", label:"第五期（前半）"},
    {file:"dai502.html", label:"第五期（後半）"},
    {file:"ryu.html", label:"劉寒吉追悼号"}
  ];
  const form = document.getElementById("search-form");
  const input = document.getElementById("keyword");
  const status = document.getElementById("status");
  const results = document.getElementById("results");
  let catalog = [];
  let loadError = [];

  function clean(value) {
    return (value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }
  function normalize(value) {
    return clean(value).normalize("NFKC").toLocaleLowerCase("ja");
  }
  function textOf(node) {
    return clean(node ? node.textContent : "");
  }
  function getCell(row, selectors, index) {
    const node = row.querySelector(selectors);
    if (node) return textOf(node);
    const cells = row.querySelectorAll("td,th");
    return cells[index] ? textOf(cells[index]) : "";
  }
  function addRowsFromTable(table, issue, source, out) {
    table.querySelectorAll("tr").forEach(row => {
      if (row.matches(".sub-header-row")) return;
      let genre = getCell(row, ".col-genre,.b", 0);
      let title = getCell(row, ".col-title,.t", 1);
      let author = getCell(row, ".col-author,.n", 2);
      let page = getCell(row, ".col-page,.p", 3);
      // 発行情報行・空行など、作品データでない行は除外
      if (!title && !author && !page) return;
      if (!genre && !title && !author && !page) return;
      out.push({
        source: source.label, file: source.file, issue: issue || source.label,
        genre, title, author, page,
        searchable: normalize([source.label, source.file, issue, genre, title, author, page].join(" "))
      });
    });
  }
  async function loadCatalog() {
    const loaded = await Promise.all(SOURCES.map(async source => {
      const items = [];
      try {
        const response = await fetch(source.file, {cache:"no-cache"});
        if (!response.ok) throw new Error("HTTP " + response.status);
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        if (source.file === "dai2.html") {
          doc.querySelectorAll("table.soto").forEach(table => {
            let issue = source.label;
            table.querySelectorAll("tr").forEach(row => {
              const header = row.querySelector("td.k");
              if (header) issue = textOf(header);
              else {
                // dai2は各冊が1つの表のため、行単位で現在の発行情報を保持
                const genre = getCell(row, ".b", 0);
                const title = getCell(row, ".t", 1);
                const author = getCell(row, ".n", 2);
                const page = getCell(row, ".p", 3);
                if (!title && !author && !page) return;
                items.push({
                  source:source.label,file:source.file,issue,
                  genre,title,author,page,
                  searchable:normalize([source.label,source.file,issue,genre,title,author,page].join(" "))
                });
              }
            });
          });
        } else {
          const blocks = doc.querySelectorAll(".issue-block");
          if (blocks.length) {
            blocks.forEach(block => {
              const issue = textOf(block.querySelector(".issue-header")) || source.label;
              const table = block.querySelector("table.catalog-table");
              if (table) addRowsFromTable(table, issue, source, items);
            });
          } else {
            doc.querySelectorAll("table.catalog-table").forEach(table => addRowsFromTable(table, source.label, source, items));
          }
        }
      } catch (error) {
        loadError.push(source.file + "（" + error.message + "）");
      }
      return items;
    }));
    // 読み込みの完了順ではなく、SOURCES に書いた順（古い号が先）で並べる
    catalog = loaded.flat();
    return catalog.length;
  }
  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }
  function highlight(value, words) {
    let safe = escapeHtml(value);
    const sorted = words.filter(Boolean).sort((a,b)=>b.length-a.length);
    // 作品名等のテキストを安全に表示し、入力語だけを強調
    sorted.forEach(word => {
      const escaped = escapeHtml(word);
      try {
        safe = safe.replace(new RegExp(escaped.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), match => "\u0001"+match+"\u0002");
      } catch (_) {}
    });
    return safe.replace(/\u0001/g,"<mark>").replace(/\u0002/g,"</mark>");
  }
  function render(items, words) {
    results.replaceChildren();
    if (!items.length) {
      results.innerHTML = '<div class="empty">該当する項目は見つかりませんでした。別のキーワードでも試してみてください。</div>';
      return;
    }
    // 同じファイル・同じ号の項目を1つにまとめる（出現順＝古い号が先）
    const groups = new Map();
    items.forEach(item => {
      const key = item.file + "\n" + item.issue;
      if (!groups.has(key)) groups.set(key, {issue:item.issue, source:item.source, rows:[]});
      groups.get(key).rows.push(item);
    });
    const fragment = document.createDocumentFragment();
    groups.forEach(g => {
      const rowsHtml = g.rows.map(item => `
              <tr>
                <td class="col-genre">${highlight(item.genre,words)}</td>
                <td class="col-title">${highlight(item.title,words)}</td>
                <td class="col-author">${highlight(item.author,words)}</td>
                <td class="col-page">${highlight(item.page,words)}</td>
              </tr>`).join("");
      const section = document.createElement("section");
      section.className = "result-group";
      section.innerHTML = `
        <div class="issue-header">${escapeHtml(g.issue.startsWith(g.source) ? g.issue : g.source + "　" + g.issue)}</div>
        <div class="table-wrap">
          <table class="catalog-table">
            <tbody>${rowsHtml}
            </tbody>
          </table>
        </div>`;
      fragment.appendChild(section);
    });
    results.appendChild(fragment);
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!catalog.length) {
      status.textContent = "目録データを読み込み中です。少し待ってから、もう一度検索してください。";
      return;
    }
    const raw = clean(input.value);
    if (!raw) {
      status.textContent = "検索キーワードを入力してください。";
      results.replaceChildren();
      input.focus();
      return;
    }
    const words = normalize(raw).split(/\s+/).filter(Boolean);
    const matches = catalog.filter(item => words.every(word => item.searchable.includes(word)));
    status.innerHTML = `<span class="result-count">${matches.length.toLocaleString("ja-JP")}件</span> 見つかりました（検索対象：7ファイル）。`;
    render(matches, words);
  });
  loadCatalog().then(count => {
    if (loadError.length) {
      status.textContent = "一部のファイルを読み込めませんでした：" + loadError.join("、") + "。検索ページと7つのHTMLファイルを同じフォルダに置いてください。";
    } else {
      status.textContent = "";
    }
  }).catch(() => {
    status.textContent = "目録データを読み込めませんでした。検索ページと7つのHTMLファイルを同じフォルダに置き、Webサーバー上で開いてください。";
  });
})();