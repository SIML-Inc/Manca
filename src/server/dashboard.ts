// A tiny zero-dependency live dashboard. Polls /state and renders the network's
// P&L, accounts, reputation, and trades so you can *watch* the clearinghouse work.
export function dashboardHtml(name: string, networkId: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Manca — ${name}</title>
<style>
  :root{--bg:#0d1117;--fg:#e6edf3;--dim:#8b98a5;--line:#232b36;--accent:#58a6ff;--good:#3fb950;--warn:#f85149;--gold:#e3b341;--purp:#bc8cff}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  header{padding:20px 28px;border-bottom:1px solid var(--line);display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
  h1{margin:0;font-size:22px;letter-spacing:.5px}
  .tag{color:var(--dim);font-size:12px;font-family:ui-monospace,Menlo,monospace}
  .live{margin-left:auto;color:var(--good);font-size:12px}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--good);margin-right:6px;animation:p 1.4s infinite}
  @keyframes p{0%,100%{opacity:1}50%{opacity:.3}}
  main{padding:24px 28px;max-width:1100px;margin:0 auto}
  .rev{display:flex;align-items:baseline;gap:16px;margin-bottom:8px}
  .rev .big{font-size:48px;font-weight:700;color:var(--good)}
  .rev .lbl{color:var(--dim);text-transform:uppercase;letter-spacing:1px;font-size:12px}
  .chips{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 28px}
  .chip{background:#131a23;border:1px solid var(--line);border-radius:9px;padding:10px 14px}
  .chip .k{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  .chip .v{font-size:18px;font-weight:600}
  h2{font-size:13px;color:var(--dim);text-transform:uppercase;letter-spacing:1px;margin:26px 0 10px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:var(--dim);font-weight:500;padding:8px 10px;border-bottom:1px solid var(--line)}
  td{padding:9px 10px;border-bottom:1px solid #171e27}
  .mono{font-family:ui-monospace,Menlo,monospace}
  .pill{padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
  .settled{background:rgba(63,185,80,.15);color:var(--good)}
  .failed{background:rgba(248,81,73,.15);color:var(--warn)}
  .matched{background:rgba(88,166,255,.15);color:var(--accent)}
  .bar{height:6px;border-radius:3px;background:#1b2530;overflow:hidden;min-width:80px}
  .bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--purp),var(--accent))}
  .g{color:var(--good)} .w{color:var(--warn)} .gold{color:var(--gold)}
</style></head><body>
<header>
  <h1>Manca</h1><span class="tag">${name} · ${networkId}</span>
  <span class="live"><span class="dot"></span>live · updates every 2s</span>
</header>
<main>
  <div class="rev"><div class="big" id="rev">$0.00</div><div class="lbl">total network revenue</div></div>
  <div class="chips" id="chips"></div>
  <h2>Revenue breakdown</h2><table id="breakdown"><tbody></tbody></table>
  <h2>Accounts · reputation graph (the moat)</h2><table id="accts"><thead><tr><th>agent</th><th>balance</th><th>escrow</th><th>reputation</th><th></th><th>ok/fail</th><th>autonomy</th></tr></thead><tbody></tbody></table>
  <h2>Trades</h2><table id="trades"><thead><tr><th>id</th><th>category</th><th>buyer → seller</th><th>price</th><th>insured</th><th>status</th></tr></thead><tbody></tbody></table>
</main>
<script>
const usd=n=>'$'+Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4});
async function tick(){
  try{
    const s=await (await fetch('/state')).json();
    document.getElementById('rev').textContent=usd(s.revenue.total);
    document.getElementById('chips').innerHTML=[
      ['settled',s.revenue.settled],['failed',s.revenue.failed],
      ['insurance pool',usd(s.revenue.insurancePool)],['accounts',s.accounts.length]
    ].map(([k,v])=>'<div class="chip"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>').join('');
    document.querySelector('#breakdown tbody').innerHTML=Object.entries(s.revenue.breakdown)
      .map(([k,v])=>'<tr><td>'+k.replace(/_/g,' ')+'</td><td class="mono '+(v>=0?'g':'w')+'">'+usd(v)+'</td></tr>').join('');
    document.querySelector('#accts tbody').innerHTML=s.accounts.map(a=>{
      const pct=Math.round(a.reputation/1000*100);
      return '<tr><td>'+a.label+'</td><td class="mono">'+usd(a.balance)+'</td><td class="mono">'+usd(a.escrowLocked)+'</td>'+
        '<td class="mono gold">'+a.reputation+'</td><td><div class="bar"><i style="width:'+pct+'%"></i></div></td>'+
        '<td class="mono"><span class="g">'+a.successfulTrades+'</span>/<span class="w">'+a.failedTrades+'</span></td>'+
        '<td class="mono">'+usd(a.autonomousSpendLimit)+'</td></tr>';
    }).join('');
    document.querySelector('#trades tbody').innerHTML=s.trades.map(t=>
      '<tr><td class="mono">'+t.id+'</td><td>'+t.category+'</td><td>'+t.buyer+' → '+t.seller+'</td>'+
      '<td class="mono">'+usd(t.price)+'</td><td>'+(t.insured?'🛡️':'')+'</td>'+
      '<td><span class="pill '+t.status+'">'+t.status+'</span></td></tr>').join('')||'<tr><td colspan=6 style="color:var(--dim)">no trades yet — post a mandate via the API or MCP</td></tr>';
  }catch(e){}
}
tick();setInterval(tick,2000);
</script></body></html>`;
}
