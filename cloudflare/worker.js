/**
 * Le Risque Tout – collection commune de thèmes (Cloudflare Worker + KV)
 *
 * - GET  /themes       : les thèmes validés (pour tous les téléphones)
 * - POST /themes       : envoyer des thèmes { key, themes:[{ id, name, author, q:[[question, réponse] × 7] }] }
 *                        (refusé sans clé d'accès valable ; même id renvoyé = mise à jour)
 * - GET  /admin        : page d'administration (mot de passe ADMIN_PASSWORD)
 *
 * Réglages (Settings → Variables and Secrets du Worker) :
 * - ADMIN_PASSWORD (secret, obligatoire) : mot de passe de la page /admin
 * - AUTO_VALIDATE  (texte, facultatif)   : "false" pour valider les thèmes à la main (par défaut : visibles tout de suite)
 * Liaison KV : un espace de noms KV relié sous le nom de variable THEMES.
 */

// Empreintes des clés d'accès (mêmes que KEY_HASHES dans le jeu). Les clés elles-mêmes ne sont pas ici.
const KEY_SALT = "le-risque-tout/2026";
const KEY_HASHES = [
  "6e15144c93c5f57f1b7784e00782d7caa007b453378c4eeb44caf894b70f5e8f", // clé du Risque Tout
  "d60fc99e960f62e94ca008aed677171bfcb9a163114c6d21198c985997670cec", // clé 1
  "dbab62dfec1f5aaa36eb21377398bb494fbf9adbcd33b936d38276b9c1a38210", // clé 2
  "91fb0bde8ef658cb5b2515bc5914321163a7fc12834a2da4a29e9bd516b5f532", // clé 3
  "b377c18313c57637df3b56e59e907be16fbb71bb538edfff650ec4632da8b8a9", // clé 4
  "1f1ce4ddaa27f206cc8fb3ecf0d15f2ab61e06b72329d5e96f9b0b1436ae1b9c", // clé 5
  "ad08bdd4aff1c37ada069b13640e0db69bbc1905380a6a77c3fb37679cd908ee", // code de secours 1
  "33244883e77dcc4ef9d0205447b819d60c1d2471e3c7dfac1ed7d5ad46621323", // code de secours 2
];

const STORE_KEY = "themes"; // toute la collection tient dans une seule entrée KV (lecture en un coup)
const MAX_THEMES = 2000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      if (url.pathname === "/themes" && request.method === "GET") return await listPublic(env);
      if (url.pathname === "/themes" && request.method === "POST") return await addThemes(request, env);
      if (url.pathname === "/admin" && request.method === "GET") return new Response(ADMIN_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      if (url.pathname.startsWith("/admin/api/")) return await admin(request, env, url.pathname.slice(11));
      if (url.pathname === "/") return json({ ok: true, service: "Le Risque Tout – thèmes partagés", stockage: env.THEMES ? "relié" : "NON RELIÉ (binding KV THEMES manquant)", admin: env.ADMIN_PASSWORD ? "mot de passe défini" : "ADMIN_PASSWORD manquant" });
      return json({ ok: false, error: "introuvable" }, 404);
    } catch (e) {
      return json({ ok: false, error: env.THEMES ? "erreur du serveur : " + (e && e.message) : "stockage non relié (binding KV THEMES manquant)" }, 500);
    }
  },
};

// ---- Public -------------------------------------------------------------------

async function listPublic(env) {
  const themes = (await load(env)).filter(t => t.status === "validé")
    .map(({ id, name, author, q, updated }) => ({ id, name, author, q, updated }));
  return json({ ok: true, themes });
}

// Un thème complet : un nom, 6 questions avec réponse (x1 à x5 et Risque Tout), Mega Risque Tout facultatif
function clean(t, fallbackAuthor) {
  const id = String(t.id || "").replace(/[^\w-]/g, "").slice(0, 60);
  const name = String(t.name || "").replace(/[<>"&]/g, "").trim().slice(0, 30);
  const raw = Array.isArray(t.q) ? t.q : [];
  const q = [0, 1, 2, 3, 4, 5, 6].map(k => [String((raw[k] || [])[0] || "").trim().slice(0, 200), String((raw[k] || [])[1] || "").trim().slice(0, 60)]);
  if (!id || !name || q.slice(0, 6).some(([a, b]) => !a || !b) || !q[6][0] !== !q[6][1]) return null;
  const author = String(t.author || fallbackAuthor || "").trim().slice(0, 40);
  return { id, name, author, q };
}

async function addThemes(request, env) {
  let body;
  try { body = JSON.parse(await request.text()); } catch (e) { return json({ ok: false, error: "requête illisible" }, 400); }
  if (!(await keyOk(body.key))) return json({ ok: false, error: "clé d'accès non valable" }, 403);

  // Tout arrive en un seul envoi (une seule écriture KV).
  const list = Array.isArray(body.themes) ? body.themes.slice(0, 500) : [body.theme || {}];
  const auto = String(env.AUTO_VALIDATE ?? "true").toLowerCase() !== "false";
  const themes = await load(env);
  const now = new Date().toISOString();
  let added = 0, updated = 0, bad = 0, full = 0;
  for (const raw of list) {
    const t = clean(raw || {}, body.author);
    if (!t) { bad++; continue; }
    const at = themes.findIndex(x => x.id === t.id);
    if (at >= 0) {
      // Même thème renvoyé (modifié) : mise à jour, statut conservé.
      themes[at] = { ...themes[at], name: t.name, q: t.q, author: t.author || themes[at].author, updated: now };
      updated++;
    } else if (themes.length >= MAX_THEMES) {
      full++;
    } else {
      themes.push({ ...t, status: auto ? "validé" : "en attente", created: now, updated: now });
      added++;
    }
  }
  if (added || updated) await save(env, themes);
  if (!added && !updated) return json({ ok: false, error: full ? "collection pleine" : "thème incomplet (un nom et 6 questions avec réponse)", bad, full }, full ? 507 : 400);
  return json({ ok: true, added, updated, bad, full, status: auto ? "validé" : "en attente" });
}

// ---- Administration -----------------------------------------------------------

async function admin(request, env, action) {
  const auth = request.headers.get("Authorization") || "";
  if (!env.ADMIN_PASSWORD || auth !== "Bearer " + env.ADMIN_PASSWORD) return json({ ok: false, error: "mot de passe incorrect" }, 401);
  const themes = await load(env);
  if (action === "themes" && request.method === "GET") return json({ ok: true, themes });
  if (request.method !== "POST") return json({ ok: false, error: "méthode non prise en charge" }, 405);
  const { id, status } = JSON.parse(await request.text());
  const at = themes.findIndex(t => t.id === id);
  if (at < 0) return json({ ok: false, error: "thème introuvable" }, 404);
  if (action === "status" && ["validé", "en attente", "refusé"].includes(status)) {
    themes[at].status = status;
  } else if (action === "delete") {
    themes.splice(at, 1);
  } else {
    return json({ ok: false, error: "action inconnue" }, 400);
  }
  await save(env, themes);
  return json({ ok: true });
}

// ---- Outils -------------------------------------------------------------------

async function load(env) {
  const raw = await env.THEMES.get(STORE_KEY);
  try { return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}
async function save(env, themes) { await env.THEMES.put(STORE_KEY, JSON.stringify(themes)); }

async function keyOk(key) {
  const norm = String(key || "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ\s-]/g, "");
  if (!norm) return false;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(KEY_SALT + norm));
  const hex = [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
  return KEY_HASHES.includes(hex);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } });
}

const ADMIN_PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Thèmes partagés – Le Risque Tout</title>
<style>
:root{--bg:#0e0d0d;--paper:#1a1717;--ink:#fff;--soft:#b9b4b2;--red:#e2232e;--ok:#2fbf71;--wait:#e9a400;--line:#3a3535}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 system-ui,-apple-system,sans-serif;padding:16px}
main{max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
h1{margin:0;font-size:1.5rem;text-transform:uppercase;letter-spacing:.03em}h1 span{color:var(--red)}
.box{background:var(--paper);border:2px solid var(--line);border-radius:14px;padding:12px}
input,button,select{font:inherit}input,select{width:100%;padding:.55em .8em;border:2px solid var(--line);border-radius:10px;background:#000;color:var(--ink)}
button{padding:.4em .8em;border:2px solid var(--red);border-radius:999px;background:#000;color:var(--ink);font-weight:700;cursor:pointer}
button.on{background:var(--red)}button.danger{border-color:var(--line);color:#ff8a8a}
.row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.muted{color:var(--soft);font-size:.9rem}
.pill{font-size:.72rem;font-weight:800;padding:.15em .55em;border-radius:99px;color:#000;white-space:nowrap}
.s-validé{background:var(--ok)}.s-refusé{background:var(--red);color:#fff}.s-attente{background:var(--wait)}
.folder{padding:0;overflow:hidden}.folder>summary{list-style:none;cursor:pointer;padding:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.folder>summary::-webkit-details-marker{display:none}.folder>summary .ico{font-size:1.3rem}.folder[open]>summary .ico.c{display:none}.folder:not([open])>summary .ico.o{display:none}
.folder>summary b{font-size:1.05rem}.folder[open]>summary{border-bottom:2px dashed var(--line)}
.inner{padding:10px 12px;display:flex;flex-direction:column;gap:10px}
.theme{border:2px solid var(--line);border-radius:12px;padding:10px;background:#000}
details.qs summary{cursor:pointer;font-weight:700}ol{margin:.4em 0;padding-left:1.6em}ol li{margin:.25em 0}ol li i{color:var(--soft)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}@media(max-width:480px){.grid{grid-template-columns:1fr}}
</style></head><body><main>
<h1>Thèmes partagés · <span>Le Risque Tout</span></h1>
<div class="box" id="login"><p>Mot de passe d’administration</p><div class="row"><input id="pw" type="password" autocomplete="current-password" style="flex:1"><button id="go">Ouvrir</button></div><p class="muted" id="msg"></p></div>
<div class="box" id="tools" hidden>
 <div class="row" id="stchips"></div>
 <div class="grid" style="margin-top:8px"><input id="q" type="search" placeholder="Rechercher un thème ou un créateur…"><select id="sort"><option value="recent">Plus récents d’abord</option><option value="az">Ordre alphabétique</option></select></div>
 <div class="row" style="margin-top:8px;justify-content:space-between"><span class="muted" id="count"></span><span class="row"><button id="openall">Tout ouvrir</button><button id="closeall">Tout fermer</button></span></div>
</div>
<div id="list" style="display:flex;flex-direction:column;gap:12px"></div>
</main><script>
var PW=sessionStorage.getItem("pw")||"",ITEMS=[],ST="",OPEN=JSON.parse(sessionStorage.getItem("open")||"[]");
var NONE="(sans nom)",LV=["x1","x2","x3","x4","x5","Risque Tout","Mega Risque Tout"];
function api(p,o){o=o||{};return fetch("/admin/api/"+p,{method:o.method||"GET",body:o.body,headers:{Authorization:"Bearer "+PW,"Content-Type":"text/plain"}}).then(function(r){return r.json()})}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function norm(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"")}
function who(t){return (t.author||"").trim()||NONE}
function pill(s){return '<span class="pill s-'+(s==="en attente"?"attente":s)+'">'+s+'</span>'}
function saveOpen(){sessionStorage.setItem("open",JSON.stringify(OPEN))}
async function refresh(){var r=await api("themes");if(!r.ok){document.getElementById("msg").textContent=r.error;return}
 sessionStorage.setItem("pw",PW);document.getElementById("login").hidden=true;document.getElementById("tools").hidden=false;ITEMS=r.themes;draw()}
function draw(){
 var q=norm(document.getElementById("q").value),sort=document.getElementById("sort").value;
 var n={"":ITEMS.length,"en attente":0,"validé":0,"refusé":0};ITEMS.forEach(function(t){n[t.status]=(n[t.status]||0)+1});
 document.getElementById("stchips").innerHTML=[["","Tous"],["en attente","En attente"],["validé","Validés"],["refusé","Refusés"]].map(function(x){return '<button class="'+(ST===x[0]?"on":"")+'" data-st="'+x[0]+'">'+x[1]+' ('+(n[x[0]]||0)+')</button>'}).join("");
 var list=ITEMS.filter(function(t){return (!ST||t.status===ST)&&(!q||norm(t.name).indexOf(q)>=0||norm(who(t)).indexOf(q)>=0)});
 var cmp={recent:function(a,b){return String(b.updated).localeCompare(String(a.updated))},az:function(a,b){return a.name.localeCompare(b.name,"fr",{sensitivity:"base"})}}[sort];
 var groups={};list.forEach(function(t){(groups[who(t)]=groups[who(t)]||[]).push(t)});
 var names=Object.keys(groups).sort(function(a,b){return a===NONE?1:b===NONE?-1:a.localeCompare(b,"fr",{sensitivity:"base"})});
 document.getElementById("count").textContent=list.length+" thème"+(list.length>1?"s":"")+" · "+names.length+" créateur"+(names.length>1?"s":"");
 if(!ITEMS.length){document.getElementById("list").innerHTML='<div class="box">Aucun thème partagé pour l’instant.</div>';return}
 if(!list.length){document.getElementById("list").innerHTML='<div class="box">Aucun thème ne correspond.</div>';return}
 document.getElementById("list").innerHTML=names.map(function(a){var ts=groups[a].sort(cmp),w=ts.filter(function(t){return t.status==="en attente"}).length;
  return '<details class="box folder" data-folder="'+esc(a)+'"'+(OPEN.indexOf(a)>=0||q?" open":"")+'><summary><span class="ico c">📁</span><span class="ico o">📂</span><b>'+esc(a)+'</b><span class="muted">'+ts.length+' thème'+(ts.length>1?"s":"")+'</span>'+(w?pill("en attente").replace("en attente",w+" en attente"):"")+'</summary><div class="inner">'
  +'<div class="row"><span class="muted" style="flex:1">Tout le dossier :</span>'+(w?'<button data-all="validé" data-who="'+esc(a)+'">Tout valider</button>':"")+'<button class="danger" data-alldel="'+esc(a)+'">Tout supprimer</button></div>'
  +ts.map(function(t){return '<div class="theme"><div class="row" style="justify-content:space-between"><b>'+esc(t.name)+'</b>'+pill(t.status)+'</div>'
   +'<p class="muted" style="margin:.2em 0">'+new Date(t.updated).toLocaleString("fr-FR")+'</p>'
   +'<details class="qs"><summary>Les questions</summary><ol>'+t.q.map(function(x,k){return x[0]?'<li><b>'+LV[k]+'</b> · '+esc(x[0])+' <i>→ '+esc(x[1])+'</i></li>':""}).join("")+'</ol></details>'
   +'<div class="row" style="margin-top:8px">'+(t.status!=="validé"?'<button data-s="validé" data-id="'+t.id+'">Valider</button>':"")+(t.status!=="refusé"?'<button data-s="refusé" data-id="'+t.id+'">Refuser</button>':"")+'<button class="danger" data-del="'+t.id+'">Supprimer</button></div></div>'}).join("")
  +'</div></details>'}).join("")}
document.getElementById("go").onclick=function(){PW=document.getElementById("pw").value;refresh()};
document.getElementById("pw").onkeydown=function(e){if(e.key==="Enter")document.getElementById("go").click()};
document.getElementById("q").oninput=draw;document.getElementById("sort").onchange=draw;
document.getElementById("stchips").onclick=function(e){var b=e.target.closest("button");if(b){ST=b.dataset.st;draw()}};
document.getElementById("openall").onclick=function(){OPEN=Object.keys(ITEMS.reduce(function(o,t){o[who(t)]=1;return o},{}));saveOpen();draw()};
document.getElementById("closeall").onclick=function(){OPEN=[];saveOpen();draw()};
document.getElementById("list").addEventListener("toggle",function(e){var f=e.target.closest&&e.target.closest("[data-folder]");if(!f||e.target!==f)return;var a=f.dataset.folder;OPEN=OPEN.filter(function(x){return x!==a});if(f.open)OPEN.push(a);saveOpen()},true);
document.getElementById("list").onclick=async function(e){var b=e.target.closest("button");if(!b)return;
 if(b.dataset.s)await api("status",{method:"POST",body:JSON.stringify({id:b.dataset.id,status:b.dataset.s})});
 if(b.dataset.del&&confirm("Supprimer ce thème du partage ?"))await api("delete",{method:"POST",body:JSON.stringify({id:b.dataset.del})});
 if(b.dataset.all){var ts=ITEMS.filter(function(t){return who(t)===b.dataset.who&&t.status==="en attente"});for(var i=0;i<ts.length;i++)await api("status",{method:"POST",body:JSON.stringify({id:ts[i].id,status:"validé"})})}
 if(b.dataset.alldel){var ds=ITEMS.filter(function(t){return who(t)===b.dataset.alldel});if(confirm("Supprimer les "+ds.length+" thèmes de « "+b.dataset.alldel+" » du partage ?"))for(var j=0;j<ds.length;j++)await api("delete",{method:"POST",body:JSON.stringify({id:ds[j].id})})}
 refresh()};
if(PW)refresh();
</script></body></html>`;
