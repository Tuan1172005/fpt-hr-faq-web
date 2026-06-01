let FAQ = [];
let SYN = {};

async function loadData() {
  FAQ = await fetch('./faq.json').then(r => r.json());
  SYN = await fetch('./synonyms.json').then(r => r.json());
}

function normalize(s) {
  return (s || '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaroWinkler(s1, s2) {
  s1 = normalize(s1); s2 = normalize(s2);
  if (!s1 || !s2) return 0;
  const m = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);
  let matches = 0;

  for (let i=0;i<s1.length;i++){
    const start = Math.max(0, i-m), end = Math.min(i+m+1, s2.length);
    for (let j=start;j<end;j++){
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i]=true; s2Matches[j]=true; matches++; break;
    }
  }
  if (!matches) return 0;

  let t=0, k=0;
  for (let i=0;i<s1.length;i++){
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  t/=2;

  const jaro = (matches/s1.length + matches/s2.length + (matches-t)/matches)/3;
  let l=0; for (; l<Math.min(4,s1.length,s2.length); l++) if (s1[l]!==s2[l]) break;
  return jaro + l*0.1*(1-jaro);
}

function expandQuery(q) {
  const nq = normalize(q);
  const extra = [];
  for (const [tag, arr] of Object.entries(SYN)) {
    for (const term of arr) {
      if (nq.includes(normalize(term))) extra.push(tag);
    }
  }
  return nq + ' ' + extra.join(' ');
}

function scoreItem(query, item) {
  const q = expandQuery(query);
  const base = jaroWinkler(q, item.question);
  const qn = normalize(q);
  let boost = 0;
  for (const t of (item.tags || [])) if (qn.includes(normalize(t))) boost += 0.04;
  return Math.min(1, base + boost);
}

function topMatches(query, k=5) {
  return FAQ.map(it => ({it, score: scoreItem(query, it)}))
    .sort((a,b)=>b.score-a.score).slice(0,k);
}

function setText(id, text){ document.getElementById(id).textContent = text || ''; }

function renderAlts(alts) {
  const div = document.getElementById('alts');
  div.innerHTML = '';
  alts.forEach(x => {
    const row = document.createElement('div');
    row.className = 'alt';
    row.innerHTML = `<span class="pill">${x.score.toFixed(2)}</span> ${x.it.question}`;
    div.appendChild(row);
  });
}

async function logUnanswered(question, best) {
  const url = `${LOG_ENDPOINT}?key=${encodeURIComponent(LOG_KEY)}`;
  const payload = {
    question,
    bestScore: best?.score ?? '',
    bestId: best?.it?.id ?? '',
    bestQuestion: best?.it?.question ?? '',
    source: LOG_SOURCE,
    userAgent: navigator.userAgent
  };
  try {
    await fetch(url, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(payload) });
  } catch(e){}
}

async function main() {
  await loadData();
  const askBtn = document.getElementById('askBtn');
  const qEl = document.getElementById('q');

  askBtn.onclick = async () => {
    const q = qEl.value.trim();
    if (!q) return;

    setText('st','Đang tra cứu...');
    setText('a',''); setText('meta','');

    const top = topMatches(q, 5);
    renderAlts(top);

    const best = top[0];
    const matched = best && best.score >= MATCH_THRESHOLD;

    if (!matched) {
      setText('st','Chưa có trong FAQ (đã tự ghi nhận).');
      setText('a','Chưa tìm thấy thông tin phù hợp. Admin sẽ bổ sung sau.');
      setText('meta',`Best score: ${best ? best.score.toFixed(2) : 'n/a'}`);
      await logUnanswered(q, best);
      return;
    }

    setText('st','OK');
    setText('meta',`Matched: ${best.it.id} | score=${best.score.toFixed(2)} | tags=${(best.it.tags||[]).join(', ')}`);
    setText('a', best.it.answer);
  };

  setText('st','Sẵn sàng.');
}
main();
