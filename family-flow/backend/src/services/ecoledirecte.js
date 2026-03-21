const https = require('https');

const BASE_URL = 'https://api.ecoledirecte.com/v3';
const API_VERSION = '4.75.0';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// In-memory session store (per username)
const sessions = {};
// Store GTK token and all cookies
let gtkToken = null;
let gtkCookies = null; // full cookie string to send back

function makeRequest(url, method, headers, body, returnHeaders = false) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyBuffer = body ? Buffer.from(body, 'utf-8') : null;
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Origin': 'https://www.ecoledirecte.com',
        'Referer': 'https://www.ecoledirecte.com/',
        ...(bodyBuffer ? { 'Content-Length': bodyBuffer.length } : {}),
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (returnHeaders) {
            resolve({ body: parsed, headers: res.headers });
          } else {
            resolve(parsed);
          }
        } catch (e) {
          console.error('EcoleDirecte non-JSON response (status ' + res.statusCode + '):', data.slice(0, 300));
          const result = { code: res.statusCode, message: 'Reponse inattendue du serveur EcoleDirecte' };
          if (returnHeaders) {
            resolve({ body: result, headers: res.headers });
          } else {
            resolve(result);
          }
        }
      });
    });

    req.on('error', (err) => {
      console.error('EcoleDirecte network error:', err.message);
      reject(err);
    });
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

// Step 1: Get GTK cookie (required since March 2025)
async function fetchGtk() {
  try {
    const response = await makeRequest(
      `${BASE_URL}/login.awp?gtk=1&v=${API_VERSION}`,
      'GET',
      {},
      null,
      true // return headers to extract cookie
    );

    // Extract ALL cookies from set-cookie headers
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];

      // Build full cookie string: extract name=value from each set-cookie
      const cookieParts = [];
      for (const cookie of cookies) {
        // Extract name=value (everything before first ";")
        const nameValue = cookie.split(';')[0].trim();
        if (nameValue) {
          cookieParts.push(nameValue);
          // Also extract GTK value specifically for X-Gtk header
          const gtkMatch = nameValue.match(/^GTK=(.+)/i);
          if (gtkMatch) {
            gtkToken = gtkMatch[1];
          }
        }
      }

      gtkCookies = cookieParts.join('; ');
      console.log('GTK cookies obtained:', cookieParts.length, 'cookies, GTK length:', gtkToken?.length || 0);
      return gtkToken;
    }

    console.warn('No cookies found in GTK response');
    return null;
  } catch (err) {
    console.error('Failed to fetch GTK:', err.message);
    return null;
  }
}

// Step 2: Login
async function login(username, password, faData = null) {
  // Always fetch fresh GTK before login
  await fetchGtk();

  const loginData = {
    identifiant: username,
    motdepasse: password,
    isRelogin: false,
    uuid: '',
  };

  // If we have double-auth cn/cv data, include it
  if (faData) {
    loginData.fa = [faData];
  } else {
    // Check if we have stored cn/cv for this user
    const stored = getStoredAuth(username);
    if (stored) {
      loginData.fa = [stored];
    }
  }

  const body = `data=${JSON.stringify(loginData)}`;

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (gtkToken) {
    headers['X-Gtk'] = gtkToken;
  }
  if (gtkCookies) {
    headers['Cookie'] = gtkCookies;
  }

  const result = await makeRequest(
    `${BASE_URL}/login.awp?v=${API_VERSION}`,
    'POST',
    headers,
    body
  );

  console.log('ED login response code:', result.code, 'hasToken:', !!result.token, 'message:', result.message || '');

  // If login fails with stored cn/cv, clear them and retry without
  if (result.code === 500 && !faData && getStoredAuth(username)) {
    console.log('Login failed with stored cn/cv, clearing and retrying...');
    db.prepare('DELETE FROM ed_double_auth WHERE username = ?').run(username);
    return await login(username, password, null);
  }

  if (result.code === 200 && result.token) {
    return handleLoginSuccess(result, username);
  }

  // Code 250: Double authentication required (QCM)
  if (result.code === 250) {
    // Store temporary token for QCM flow
    sessions[`_pending_${username}`] = {
      token: result.token,
      loginTime: Date.now(),
    };

    return {
      success: false,
      needDoubleAuth: true,
      token: result.token,
      message: 'Verification de securite requise (question secrete)',
    };
  }

  if (result.code === 505) {
    return { success: false, error: 'Identifiant ou mot de passe incorrect' };
  }

  if (result.code === 500) {
    return { success: false, error: 'Le serveur EcoleDirecte a un probleme temporaire. Reessayez dans 2-3 minutes.' };
  }

  console.error('EcoleDirecte login unexpected code:', result.code, result.message);
  return { success: false, error: result.message || 'Erreur de connexion', code: result.code };
}

// Step 3a: Get QCM question for double auth
async function getDoubleAuthQuestion(username) {
  const pending = sessions[`_pending_${username}`];
  if (!pending) {
    return { success: false, error: 'Pas de session en attente de double auth' };
  }

  console.log('Fetching QCM question with token:', pending.token?.slice(0, 20) + '...');

  // Use both X-Token and 2FA-Token (confirmed working combination)
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Token': pending.token,
    '2FA-Token': pending.token,
  };
  if (gtkCookies) headers['Cookie'] = gtkCookies;

  const result = await makeRequest(
    `${BASE_URL}/connexion/doubleauth.awp?verbe=get&v=${API_VERSION}`,
    'POST',
    headers,
    'data={}'
  );

  console.log('QCM question response code:', result.code);

  if (result.code === 200 && result.data) {
    // Decode base64 question and propositions
    const question = decodeContent(result.data.question || '');
    const propositions = (result.data.propositions || []).map(p => decodeContent(p));

    return {
      success: true,
      question,
      propositions,
      // Keep raw values for submitting back
      rawPropositions: result.data.propositions || [],
    };
  }

  return { success: false, error: result.message || 'Impossible de recuperer la question' };
}

// Step 3b: Submit QCM answer
async function submitDoubleAuthAnswer(username, password, rawAnswer) {
  const pending = sessions[`_pending_${username}`];
  if (!pending) {
    return { success: false, error: 'Pas de session en attente de double auth' };
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Token': pending.token,
    '2FA-Token': pending.token,
  };
  if (gtkCookies) headers['Cookie'] = gtkCookies;

  console.log('Submitting QCM answer...');

  let result = await makeRequest(
    `${BASE_URL}/connexion/doubleauth.awp?verbe=post&v=${API_VERSION}`,
    'POST',
    headers,
    `data=${JSON.stringify({ choix: rawAnswer })}`
  );

  console.log('QCM answer response code:', result.code, 'hasCn:', !!result.data?.cn);

  // Retry without verbe param if failed
  if (result.code !== 200) {
    result = await makeRequest(
      `${BASE_URL}/connexion/doubleauth.awp?v=${API_VERSION}`,
      'POST',
      headers,
      `data=${JSON.stringify({ choix: rawAnswer })}`
    );
    console.log('QCM answer retry code:', result.code, 'hasCn:', !!result.data?.cn);
  }

  if (result.code === 200 && result.data?.cn && result.data?.cv) {
    const faData = { cn: result.data.cn, cv: result.data.cv };

    // Store cn/cv for reuse (they don't expire)
    storeAuth(username, faData);

    // Clean up pending session
    delete sessions[`_pending_${username}`];

    // Wait a moment then re-login with fresh GTK + cn/cv
    await new Promise(r => setTimeout(r, 1000));
    // Force fresh GTK for the re-login
    gtkToken = null;
    gtkCookies = null;
    return await login(username, password, faData);
  }

  return { success: false, error: result.message || 'Mauvaise reponse au QCM' };
}

function handleLoginSuccess(result, username) {
  const accounts = result.data?.accounts || [];

  console.log('Login success - accounts:', JSON.stringify(accounts.map(a => ({
    id: a.id, type: a.typeCompte, nom: a.nom, prenom: a.prenom,
    hasEleves: !!(a.profile?.eleves?.length),
    elevesCount: a.profile?.eleves?.length || 0,
    eleves: (a.profile?.eleves || []).map(e => ({ id: e.id, nom: e.nom, prenom: e.prenom, classe: e.classe })),
  }))));

  // Check if any account has children (eleves) in profile - that means it's a parent account
  // regardless of typeCompte value (can be '1', 'P', '2', etc.)
  let childAccounts = [];
  for (const account of accounts) {
    const eleves = account.profile?.eleves || [];
    if (eleves.length > 0) {
      console.log('Account', account.id, 'has', eleves.length, 'children - treating as parent');
      for (const e of eleves) {
        childAccounts.push({
          id: e.id,
          typeCompte: 'E',
          nom: e.nom || account.nom,
          prenom: e.prenom,
          classe: e.classe?.libelle || e.classe?.code || null,
          photo: e.photo || null,
        });
        console.log('  Child:', e.id, e.prenom, e.nom, 'classe:', e.classe?.libelle);
      }
    }
  }

  // If we found children, use them. Otherwise treat accounts as student accounts directly.
  const allStudents = childAccounts.length > 0 ? childAccounts :
    accounts.map(a => ({
      id: a.id,
      typeCompte: a.typeCompte,
      nom: a.nom,
      prenom: a.prenom,
      classe: a.profile?.classe?.libelle || a.classe?.libelle || null,
    }));

  const isParent = childAccounts.length > 0;
  console.log('Final student list:', allStudents.map(s => ({ id: s.id, prenom: s.prenom, classe: s.classe })));

  const session = {
    token: result.token,
    accounts,
    studentAccounts: allStudents,
    isParent,
    username,
    loginTime: Date.now(),
  };

  sessions[username] = session;

  return {
    success: true,
    isParent: session.isParent,
    accounts: allStudents.map(a => ({
      id: a.id,
      type: a.typeCompte,
      nom: a.nom,
      prenom: a.prenom,
      classe: a.profile?.classe?.libelle || a.classe?.libelle || a.classe || null,
    })),
  };
}

// Store/retrieve cn/cv for reusable auth (in-memory + db)
const db = require('../db/init');

// Ensure table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS ed_double_auth (
    username TEXT PRIMARY KEY,
    cn TEXT NOT NULL,
    cv TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

function storeAuth(username, faData) {
  db.prepare(
    'INSERT OR REPLACE INTO ed_double_auth (username, cn, cv) VALUES (?, ?, ?)'
  ).run(username, faData.cn, faData.cv);
}

function getStoredAuth(username) {
  const row = db.prepare('SELECT cn, cv FROM ed_double_auth WHERE username = ?').get(username);
  if (row) return { cn: row.cn, cv: row.cv };
  return null;
}

function getSession(username) {
  const session = sessions[username];
  if (!session) return null;
  // Token expiry check (refresh after 2 hours)
  if (Date.now() - session.loginTime > 2 * 60 * 60 * 1000) {
    delete sessions[username];
    return null;
  }
  return session;
}

async function authenticatedRequest(username, path, postData = {}) {
  const session = getSession(username);
  if (!session) {
    throw new Error('SESSION_EXPIRED');
  }

  const body = `data=${JSON.stringify(postData)}`;

  console.log('ED API call:', path);

  const result = await makeRequest(
    `${BASE_URL}${path}`,
    'POST',
    {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Token': session.token,
    },
    body
  );

  // Update token if new one provided
  if (result.token) {
    session.token = result.token;
  }

  if (result.code === 520 || result.code === 525) {
    delete sessions[username];
    throw new Error('SESSION_EXPIRED');
  }

  return result;
}

// Decode base64 content from EcoleDirecte
function decodeContent(base64Str) {
  if (!base64Str) return '';
  try {
    return Buffer.from(base64Str, 'base64').toString('utf-8');
  } catch {
    return base64Str;
  }
}

// Strip HTML tags for clean text
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

async function getHomework(username, studentId, date) {
  const result = await authenticatedRequest(
    username,
    `/Eleves/${studentId}/cahierdetexte/${date}.awp?verbe=get`
  );

  if (result.code !== 200) {
    return { success: false, error: result.message };
  }

  const homework = [];
  const data = result.data;

  if (data && data.matieres) {
    for (const matiere of data.matieres) {
      const entry = {
        subject: matiere.matiere || matiere.libelleMatiere || 'Inconnu',
        teacher: matiere.nomProf || '',
        done: matiere.effectue || false,
        aFaire: null,
        contenuDeCours: null,
      };

      if (matiere.aFaire) {
        entry.aFaire = {
          description: stripHtml(decodeContent(matiere.aFaire.contenu || '')),
          date: matiere.aFaire.donneLe || date,
          documents: (matiere.aFaire.documents || []).map(d => ({
            name: d.libelle,
            type: d.type,
          })),
        };
      }

      if (matiere.contenuDeSeance) {
        entry.contenuDeCours = {
          description: stripHtml(decodeContent(matiere.contenuDeSeance.contenu || '')),
          documents: (matiere.contenuDeSeance.documents || []).map(d => ({
            name: d.libelle,
            type: d.type,
          })),
        };
      }

      homework.push(entry);
    }
  }

  return { success: true, date, homework };
}

async function getHomeworkRange(username, studentId) {
  const result = await authenticatedRequest(
    username,
    `/Eleves/${studentId}/cahierdetexte.awp?verbe=get`
  );

  if (result.code !== 200) {
    return { success: false, error: result.message };
  }

  const homeworkByDate = {};

  if (result.data) {
    for (const [date, items] of Object.entries(result.data)) {
      if (!Array.isArray(items)) continue;
      homeworkByDate[date] = items.map(item => ({
        subject: item.matiere || 'Inconnu',
        codeMatiere: item.codeMatiere,
        done: item.effectue || false,
        // contenu is base64-encoded HTML
        description: stripHtml(decodeContent(item.contenu || item.aFaire?.contenu || '')),
        documents: (item.documents || []).map(d => ({ name: d.libelle, type: d.type })),
      }));
    }
  }

  // If descriptions are empty, try fetching each date individually for full details
  const emptyCount = Object.values(homeworkByDate).flat().filter(h => !h.description).length;
  const totalCount = Object.values(homeworkByDate).flat().length;

  if (emptyCount > 0 && totalCount > 0 && totalCount <= 20) {
    console.log(`Homework: ${emptyCount}/${totalCount} empty, fetching individual dates...`);
    for (const date of Object.keys(homeworkByDate)) {
      try {
        const detail = await getHomework(username, studentId, date);
        if (detail.success && detail.homework) {
          homeworkByDate[date] = detail.homework.map(h => ({
            subject: h.subject,
            done: h.done,
            description: h.aFaire?.description || h.contenuDeCours?.description || '',
            documents: h.aFaire?.documents || h.contenuDeCours?.documents || [],
          }));
        }
      } catch {}
    }
  }

  return { success: true, homework: homeworkByDate };
}

async function getGrades(username, studentId) {
  const result = await authenticatedRequest(
    username,
    `/Eleves/${studentId}/notes.awp?verbe=get`,
    { anneeScolaire: '' }
  );

  if (result.code !== 200) {
    return { success: false, error: result.message };
  }

  const data = result.data;
  const notes = (data?.notes || []).map(note => ({
    date: note.date || note.dateSaisie,
    subject: note.libelleMatiere || note.codeMatiere || '',
    title: note.devoir || note.depistevoir || '',
    type: note.typeDevoir || '',
    grade: note.valeur,
    outOf: note.noteSur || '20',
    coefficient: note.coef || '1',
    classAvg: note.moyenneClasse,
    classMin: note.minClasse,
    classMax: note.maxClasse,
    period: note.codePeriode,
    comment: note.commentaire || '',
    nonSignificatif: note.nonSignificatif || false,
  }));

  // Filter out "Relevé" and "Année" pseudo-periods, keep real trimestres
  const periods = (data?.periodes || [])
    .filter(p => {
      const label = (p.periode || '').toLowerCase();
      return !label.includes('relev') && !label.includes('année') && !label.includes('annee');
    })
    .map(p => ({
      code: p.codePeriode,
      label: p.periode,
      closed: p.cloture,
      council: p.dateConseil,
      averages: (p.ensembleMatieres?.disciplines || [])
        .filter(d => d.discipline && d.moyenne) // filter out empty rows
        .map(d => ({
          subject: d.discipline,
          studentAvg: d.moyenne,
          classAvg: d.moyenneClasse,
          classMin: d.moyenneMin,
          classMax: d.moyenneMax,
          coefficient: d.coef,
        })),
      generalAvg: p.ensembleMatieres?.moyenneGenerale,
      classGeneralAvg: p.ensembleMatieres?.moyenneClasse,
    }));

  return { success: true, notes, periods };
}

async function getTimetable(username, studentId, startDate, endDate) {
  console.log('Timetable request:', studentId, 'dates:', startDate, 'to', endDate);

  // Try /E/{id} endpoint (the format used by the official app)
  let result = await authenticatedRequest(
    username,
    `/E/${studentId}/emploidutemps.awp?verbe=get&v=${API_VERSION}`,
    { dateDebut: startDate, dateFin: endDate }
  );

  console.log('Timetable /E/ response code:', result.code, 'data length:', Array.isArray(result.data) ? result.data.length : typeof result.data);

  // If /E/ fails or empty, try /Eleves/ endpoint
  if (!result.data || (Array.isArray(result.data) && result.data.length === 0) || result.code !== 200) {
    console.log('Trying /Eleves/ endpoint...');
    result = await authenticatedRequest(
      username,
      `/Eleves/${studentId}/emploidutemps.awp?verbe=get&v=${API_VERSION}`,
      { dateDebut: startDate, dateFin: endDate }
    );
    console.log('Timetable /Eleves/ response code:', result.code, 'data length:', Array.isArray(result.data) ? result.data.length : typeof result.data);
  }

  if (result.code !== 200) {
    return { success: false, error: result.message };
  }

  // Handle both array and object response formats
  let rawEvents = [];
  if (Array.isArray(result.data)) {
    rawEvents = result.data;
  } else if (result.data && typeof result.data === 'object') {
    // Some versions return { date: [...events] } grouped by date
    for (const [key, val] of Object.entries(result.data)) {
      if (Array.isArray(val)) {
        rawEvents.push(...val);
      }
    }
  }

  // Log first event to understand the data structure
  if (rawEvents.length > 0) {
    console.log('Timetable first event keys:', Object.keys(rawEvents[0]));
    console.log('Timetable first event:', JSON.stringify(rawEvents[0]).slice(0, 300));
  } else {
    console.log('Timetable: no events found for', startDate, '-', endDate);
  }

  const events = rawEvents.map(event => ({
    id: event.id,
    subject: event.matiere || event.text || '',
    teacher: event.prof || '',
    room: event.salle || '',
    start: event.start_date || event.startDate || event.debut,
    end: event.end_date || event.endDate || event.fin,
    color: event.color || '#7C9082',
    cancelled: event.isAnnule || false,
    modified: event.isModifie || false,
    text: event.text || event.matiere || '',
  }));

  return { success: true, timetable: events };
}

function logout(username) {
  delete sessions[username];
}

module.exports = {
  login,
  logout,
  getSession,
  getHomework,
  getHomeworkRange,
  getGrades,
  getTimetable,
  getDoubleAuthQuestion,
  submitDoubleAuthAnswer,
};
