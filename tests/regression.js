// Tests de non-régression de l'appli Flip 7.
// Lance un vrai navigateur (Playwright/Chromium), clique sur les boutons comme un joueur
// et vérifie les scores affichés pour les variantes Classique, Vengeance et Vengeance brutal.
// Usage : node tests/regression.js
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
const results = [];
function check(name, actual, expected) {
  // les objets {joueur: score} sont comparés sans tenir compte de l'ordre (le classement trie déjà)
  const norm = v => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().map(k => [k, v[k]]) : v;
  const ok = JSON.stringify(norm(actual)) === JSON.stringify(norm(expected));
  ok ? passed++ : failed++;
  results.push({ ok, name, actual, expected });
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → obtenu ${JSON.stringify(actual)}, attendu ${JSON.stringify(expected)}`}`);
}

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
    fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); return res.end(); } res.end(data); });
  }).listen(0);
  const URL = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => { errors.push('Boîte de dialogue inattendue : ' + d.message()); d.dismiss(); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());

  // ---------- helpers ----------
  const card = name => page.locator('#app > .card:not(.rank):not(.win):not(.tbl)', {
    has: page.locator('.pname', { hasText: new RegExp(`^${name}$`) }),
  });
  const tapNum = (name, n) => card(name).locator('.nums button').nth(n).click();
  const tapMod = (name, label) => card(name).locator('.mods button', { hasText: new RegExp(`^${label.replace(/[÷×+]/g, '\\$&')}$`) }).click();
  const bust = name => card(name).locator('button', { hasText: /^(Sauté|Sauté \(0 point\)|Annuler « sauté »)$/ }).click();
  const roundScore = async name => Number((await card(name).locator('.pts').textContent()).trim());
  const pills = async name => (await card(name).locator('.pill').allTextContents()).map(s => s.trim());
  const totals = async () => {
    const rows = await page.locator('.rank .r').evaluateAll(rs => rs.map(r => [r.querySelector('.pname').textContent, Number(r.querySelector('.pts').textContent)]));
    return Object.fromEntries(rows);
  };
  const validate = () => page.getByRole('button', { name: /^(Valider la manche|Enregistrer la correction)$/ }).click();
  const fresh = async () => { await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.goto(URL); };
  const addPlayers = async (...names) => { for (const n of names) { await page.fill('#newName', n); await page.click('button[aria-label="Ajouter"]'); } };
  const selected = async name => (await card(name).locator('.nums button.on').allTextContents()).map(s => s.trim());
  const newGame = async () => { await page.getByRole('button', { name: 'Nouvelle partie' }).click(); await page.getByRole('button', { name: 'Oui, nouvelle partie' }).click(); };

  // =====================================================================
  console.log('\n— Accueil et joueurs —');
  await fresh();
  check('Aucun joueur par défaut', await page.locator('#app input[id^="n-"]').count(), 0);
  check('Version Classique sélectionnée par défaut', await page.locator('#v-classic').getAttribute('aria-pressed'), 'true');
  await addPlayers('Anna');
  await page.getByRole('button', { name: 'Lancer la partie' }).click({ force: true });
  check('Impossible de lancer avec 1 seul joueur', await page.locator('.rank').count(), 0);
  await addPlayers('Bob', 'Chloé', 'Temp');
  await page.click('button[aria-label="Supprimer"] >> nth=3');
  check('Ajout et suppression de joueurs', await page.locator('#app input[id^="n-"]').evaluateAll(i => i.map(x => x.value)), ['Anna', 'Bob', 'Chloé']);
  await page.fill('#app input[id^="n-"] >> nth=1', 'Bruno');
  await page.locator('#app input[id^="n-"] >> nth=1').dispatchEvent('change');
  check('Renommer un joueur', await page.locator('#app input[id^="n-"]').evaluateAll(i => i.map(x => x.value)), ['Anna', 'Bruno', 'Chloé']);

  // =====================================================================
  console.log('\n— Classique —');
  await page.getByRole('button', { name: 'Lancer la partie' }).click();
  check('Bandeau de version : Classique', (await page.locator('.tagv').textContent()).trim(), 'Classique');
  check('Numéros 0 à 12 (13 boutons)', await card('Anna').locator('.nums button').count(), 13);
  check('Modificateurs ×2 et +2…+10', (await card('Anna').locator('.mods button').allTextContents()), ['×2', '+2', '+4', '+6', '+8', '+10']);

  await tapNum('Anna', 5); await tapNum('Anna', 10); await tapMod('Anna', '×2'); await tapMod('Anna', '+4');
  check('(5+10)×2+4 = 34', await roundScore('Anna'), 34);
  await tapNum('Bruno', 12); await tapNum('Bruno', 11); await tapNum('Bruno', 9);
  check('12+11+9 = 32', await roundScore('Bruno'), 32);
  await tapNum('Bruno', 9);
  check('Retaper un numéro le retire', await roundScore('Bruno'), 23);
  await tapNum('Bruno', 9);
  await tapNum('Chloé', 8); await tapMod('Chloé', '+10');
  await bust('Chloé');
  check('Sauté = 0 même avec cartes', await roundScore('Chloé'), 0);
  check('Sauté verrouille les numéros', await card('Chloé').locator('.nums.locked').count(), 1);
  await validate();
  check('Totaux après manche 1', await totals(), { Anna: 34, Bruno: 32, Chloé: 0 });

  for (const n of [0, 1, 2, 3, 4, 5, 6, 7]) await tapNum('Anna', n);
  check('Plafond de 7 numéros', (await selected('Anna')).length, 7);
  check('Flip 7 : 0..6 = 21 + 15 = 36', await roundScore('Anna'), 36);
  check('Étiquette Flip 7', await pills('Anna'), ['Flip 7 +15']);
  await tapMod('Anna', '×2');
  check('Flip 7 + ×2 : 21×2+15 = 57', await roundScore('Anna'), 57);
  await tapMod('Anna', '×2');
  await validate();
  check('Totaux après manche 2', await totals(), { Anna: 70, Bruno: 32, Chloé: 0 });
  check('Étoile Flip 7 dans l’historique', (await page.locator('table tr').nth(2).locator('td').nth(1).textContent()).trim(), '36 ★');

  // correction d'une manche
  await page.click('button[aria-label="Corriger la manche 1"]');
  check('Titre en mode correction', (await page.locator('h2').first().textContent()).trim(), 'Correction de la manche 1');
  check('La correction recharge les cartes', await roundScore('Anna'), 34);
  await bust('Chloé'); await tapNum('Chloé', 4);
  await validate();
  check('Correction de la manche 1 (Chloé 8+4+10)', await totals(), { Anna: 70, Bruno: 32, Chloé: 22 });
  check('Nombre de manches inchangé après correction', await page.locator('table tr').count(), 4);

  // persistance
  await page.reload();
  check('Partie conservée après rechargement', await totals(), { Anna: 70, Bruno: 32, Chloé: 22 });

  // fin de partie : Bruno passe 200, mais Anna peut le dépasser dans la même manche
  for (const n of [12, 11, 10, 9, 8]) await tapNum('Bruno', n);
  await tapMod('Bruno', '×2'); await tapMod('Bruno', '+10');
  check('Bruno : 50×2+10 = 110', await roundScore('Bruno'), 110);
  await validate();
  check('Pas de gagnant sous 200 (Bruno 142)', await page.locator('.win').count(), 0);
  // manche finale : Bruno franchit 200 (202) mais Anna le dépasse (221) dans la même manche
  for (const n of [12, 11, 10, 9, 8, 7, 6]) await tapNum('Anna', n);
  await tapMod('Anna', '×2'); await tapMod('Anna', '+10');
  for (const n of [12, 11, 10, 9, 8]) await tapNum('Bruno', n);
  await tapMod('Bruno', '+10');
  check('Score Anna : 63×2+10+15 = 151', await roundScore('Anna'), 151);
  await validate();
  check('Totaux finaux', await totals(), { Anna: 221, Bruno: 202, Chloé: 22 });
  check('Gagnant = meilleur score, pas le premier à 200', (await page.locator('.win b').textContent()).trim(), 'Anna gagne');
  check('Saisie masquée une fois la partie finie', await page.getByRole('button', { name: 'Valider la manche' }).count(), 0);

  // nouvelle partie
  await page.getByRole('button', { name: 'Nouvelle partie' }).click();
  check('Confirmation intégrée (pas de boîte système)', await page.getByRole('button', { name: 'Oui, nouvelle partie' }).count(), 1);
  await page.getByRole('button', { name: 'Annuler' }).click();
  check('Annuler garde la partie', await totals(), { Anna: 221, Bruno: 202, Chloé: 22 });
  await newGame();
  check('Nouvelle partie → retour à l’accueil, mêmes joueurs', await page.locator('#app input[id^="n-"]').evaluateAll(i => i.map(x => x.value)), ['Anna', 'Bruno', 'Chloé']);

  // =====================================================================
  console.log('\n— Vengeance —');
  await page.click('#v-vengeance');
  check('Toggle Vengeance actif', await page.locator('#v-vengeance').getAttribute('aria-pressed'), 'true');
  check('Bouton mode brutal visible', await page.locator('#brutal').count(), 1);
  await page.getByRole('button', { name: 'Lancer la partie' }).click();
  check('Bandeau de version : Vengeance', (await page.locator('.tagv').textContent()).trim(), 'Vengeance');
  check('Scores remis à zéro', await totals(), { Anna: 0, Bruno: 0, Chloé: 0 });
  check('Numéros 0 à 13 (14 boutons)', await card('Anna').locator('.nums button').count(), 14);
  check('Modificateurs ÷2 et −2…−10', await card('Anna').locator('.mods button').allTextContents(), ['÷2', '−2', '−4', '−6', '−8', '−10']);

  for (const n of [13, 12, 11, 6, 3, 2, 1]) await tapNum('Anna', n);
  await tapMod('Anna', '÷2'); await tapMod('Anna', '−4');
  check('Exemple du livret : 48 ÷2 −4 +15 = 35', await roundScore('Anna'), 35);

  for (const n of [0, 12, 11]) await tapNum('Bruno', n);
  check('Le Zéro sans Flip 7 → 0', await roundScore('Bruno'), 0);
  check('Étiquette Zéro', await pills('Bruno'), ['Zéro']);

  await tapNum('Chloé', 13); await tapNum('Chloé', 13); await tapNum('Chloé', 5);
  check('13 chanceux : libellé 13×2', (await card('Chloé').locator('.nums button').nth(13).textContent()).trim(), '13×2');
  check('13+13+5 = 31', await roundScore('Chloé'), 31);
  await validate();
  check('Totaux Vengeance manche 1', await totals(), { Anna: 35, Bruno: 0, Chloé: 31 });

  await tapNum('Chloé', 13); await tapNum('Chloé', 13); await tapNum('Chloé', 13);
  check('3e tap sur 13 retire les deux 13', await roundScore('Chloé'), 0);
  for (const n of [0, 1, 2, 3, 4, 5, 6]) await tapNum('Bruno', n);
  check('Le Zéro avec Flip 7 : 21 + 15 = 36', await roundScore('Bruno'), 36);
  check('Pas d’étiquette Zéro si Flip 7', await pills('Bruno'), ['Flip 7 +15']);
  await tapNum('Anna', 3); await tapMod('Anna', '−10');
  check('Plancher à 0 : 3 − 10 = 0', await roundScore('Anna'), 0);
  await tapMod('Anna', '−10'); await tapNum('Anna', 7); await tapMod('Anna', '÷2');
  check('÷2 arrondi en dessous : (3+7)/2 = 5', await roundScore('Anna'), 5);
  await tapNum('Anna', 4);
  check('÷2 arrondi en dessous : 14/2 = 7 ; 15/2 = 7', [await roundScore('Anna')], [7]);
  await bust('Anna');
  check('Sauté verrouille les malus hors brutal', await card('Anna').locator('.mods.locked').count(), 1);
  check('Sauté = 0', await roundScore('Anna'), 0);
  await validate();
  check('Totaux Vengeance manche 2', await totals(), { Anna: 35, Bruno: 36, Chloé: 31 });

  await page.reload();
  check('Variante conservée après rechargement', (await page.locator('.tagv').textContent()).trim(), 'Vengeance');
  check('Scores Vengeance conservés après rechargement', await totals(), { Anna: 35, Bruno: 36, Chloé: 31 });

  // =====================================================================
  console.log('\n— Vengeance, mode brutal —');
  await newGame();
  check('Variante gardée après nouvelle partie', await page.locator('#v-vengeance').getAttribute('aria-pressed'), 'true');
  await page.click('#brutal');
  check('Mode brutal activé', (await page.locator('#brutal').textContent()).trim(), 'Mode brutal : activé');
  await page.getByRole('button', { name: 'Lancer la partie' }).click();
  check('Bandeau : Vengeance · brutal', (await page.locator('.tagv').textContent()).trim(), 'Vengeance · brutal');

  await tapNum('Anna', 3); await tapMod('Anna', '−10');
  check('Score négatif autorisé : 3 − 10 = −7', await roundScore('Anna'), -7);
  await tapNum('Bruno', 5); await bust('Bruno');
  check('Malus déverrouillés sur un joueur sauté', await card('Bruno').locator('.mods.locked').count(), 0);
  await tapMod('Bruno', '−4');
  check('Sauté + malus −4 = −4', await roundScore('Bruno'), -4);
  for (const n of [1, 2, 3, 4, 5, 6, 7]) await tapNum('Chloé', n);
  check('Flip 7 brutal : choix du bonus proposé', await card('Chloé').locator('.chips button').allTextContents(), ['+15 pour moi', '−15 à Anna', '−15 à Bruno']);
  check('Par défaut +15 pour moi : 28 + 15 = 43', await roundScore('Chloé'), 43);
  await card('Chloé').locator('.chips button', { hasText: '−15 à Anna' }).click();
  check('Chloé sans bonus : 28', await roundScore('Chloé'), 28);
  check('Anna reçoit −15 : −7 − 15 = −22', await roundScore('Anna'), -22);
  check('Étiquette « −15 à Anna »', await pills('Chloé'), ['Flip 7 · −15 à Anna']);
  await tapNum('Chloé', 7);
  check('Plus de Flip 7 → cible effacée, Anna revient à −7', await roundScore('Anna'), -7);
  await tapNum('Chloé', 7);
  await card('Chloé').locator('.chips button', { hasText: '−15 à Anna' }).click();
  await validate();
  check('Totaux brutal manche 1', await totals(), { Anna: -22, Bruno: -4, Chloé: 28 });
  check('Classement trié, négatifs en bas', await page.locator('.rank .pname').allTextContents(), ['Chloé', 'Bruno', 'Anna']);
  check('Barre de progression jamais négative', await page.locator('.rank .bar i').evaluateAll(b => b.every(x => parseFloat(x.style.width) >= 0)), true);

  await page.reload();
  check('Brutal conservé après rechargement (−15 compris)', await totals(), { Anna: -22, Bruno: -4, Chloé: 28 });

  // =====================================================================
  console.log('\n— Retour en Classique et réinitialisation —');
  await newGame();
  await page.click('#v-classic');
  check('Mode brutal masqué en Classique', await page.locator('#brutal').count(), 0);
  await page.getByRole('button', { name: 'Lancer la partie' }).click();
  await tapNum('Anna', 3); await tapMod('Anna', '+10');
  check('Classique après brutal : 3 + 10 = 13 (pas de malus)', await roundScore('Anna'), 13);
  await bust('Anna');
  check('Classique : malus/bonus verrouillés si sauté', await card('Anna').locator('.mods.locked').count(), 1);
  await page.getByRole('button', { name: 'Réinitialiser' }).click();
  await page.getByRole('button', { name: 'Oui, tout effacer' }).click();
  check('Réinitialiser efface les joueurs', await page.locator('#app input[id^="n-"]').count(), 0);
  check('Réinitialiser remet Classique', await page.locator('#v-classic').getAttribute('aria-pressed'), 'true');

  // ancienne sauvegarde (avant la variante Vengeance) : doit s'ouvrir en Classique
  await page.evaluate(() => localStorage.setItem('flip7-v1', JSON.stringify({
    players: [{ id: 'a', name: 'Ancien' }, { id: 'b', name: 'Save' }], phase: 'game', edit: null, draft: null,
    rounds: [{ a: { nums: [5, 10], x2: true, mods: [4], bust: false }, b: { nums: [1], x2: false, mods: [], bust: true } }],
  })));
  await page.reload();
  check('Ancienne sauvegarde lue en Classique', await totals(), { Ancien: 34, Save: 0 });

  // affichage mobile
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('Pas de défilement horizontal sur mobile (390 px)', overflow, false);
  check('Aucune erreur JavaScript', errors, []);

  await browser.close(); server.close();
  console.log(`\n${passed} réussis, ${failed} échoués`);
  fs.writeFileSync(path.join(__dirname, 'last-run.json'), JSON.stringify(results, null, 2));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
