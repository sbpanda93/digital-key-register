(() => {
  'use strict';
  const $ = (s,root=document) => root.querySelector(s), $$ = (s,root=document) => [...root.querySelectorAll(s)];
  const state = {token:localStorage.getItem('dkr_token')||'', user:JSON.parse(localStorage.getItem('dkr_user')||'null'), tab:'dashboard', data:null, history:[], handovers:[], issueMode:'REGISTERED', historyFilters:{}, toastTimer:null};
  const app=$('#app');
  const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const apiUrl=()=>window.DKR_CONFIG&&window.DKR_CONFIG.apiUrl;
  async function api(action,payload={}) {
    if(!apiUrl()||apiUrl().includes('PASTE_YOUR')) throw new Error('Apps Script URL is missing. Add the deployed /exec URL in config.js.');
    let res; try {res=await fetch(apiUrl(),{method:'POST',mode:'cors',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,token:state.token,...payload})});}
    catch(e){throw new Error('Could not reach Apps Script. Check deployment access, URL, and browser network connection.');}
    let json;try{json=await res.json();}catch(e){throw new Error('Apps Script returned an unreadable response. Confirm the deployed /exec URL and access setting.');}
    if(!json.ok){if(/Session expired|Please log in|Account is disabled/i.test(json.error||'')){logout(false);renderLogin(json.error);}throw new Error(json.error||'Request failed.');}
    return json.data;
  }
  function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.classList.remove('show'),3000);}
  function istShift(){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const t=Number(p.find(x=>x.type==='hour').value)*60+Number(p.find(x=>x.type==='minute').value);return t>=360&&t<840?'A':t>=840&&t<1320?'B':'C';}
  function istDateTime(value){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?esc(value):new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d)+' IST';}
  function renderLogin(error='', notice='', username=''){
    app.innerHTML=`<main class="login-wrap"><section class="login-card"><div class="brand"><div class="brand-mark">🗝</div><div>Digital Key Register<small>Green Anode Plant · Control Room</small></div></div><h1>Sign in</h1><div class="subtle">Use your assigned register account.</div>${error?`<div class="notice error">${esc(error)}</div>`:''}<form class="form-grid" id="login-form"><div class="field"><label for="username">Username</label><input id="username" name="username" autocomplete="username" value="${esc(username)}" required></div><div class="field"><label for="password">Password / PIN</label><input id="password" name="password" type="password" autocomplete="current-password" required></div><button class="btn" type="submit">Sign in</button></form><div class="server-note">IST · Asia/Kolkata</div></section></main>`;
    const loginForm = $('#login-form');
    if (notice) {
      const message = document.createElement('div');
      message.className = 'notice';
      message.textContent = notice;
      loginForm.before(message);
    }
    loginForm.insertAdjacentHTML('afterend','<div class="actions"><button class="btn outline" type="button" id="request-access">Request access</button></div>');
    $('#request-access').onclick = renderRequestAccess;
    loginForm.addEventListener('submit',async e=>{e.preventDefault();const button=$('button',e.currentTarget);button.disabled=true;button.textContent='Signing in…';try{const x=await api('login',{username:$('#username').value,password:$('#password').value});state.token=x.token;state.user=x.user;localStorage.setItem('dkr_token',x.token);localStorage.setItem('dkr_user',JSON.stringify(x.user));await refresh();}catch(err){renderLogin(err.message);} });
  }
  function accessPage(content) {
    app.innerHTML = `<main class="login-wrap"><section class="login-card">${content}
      <div class="actions"><button class="btn outline" type="button" id="back-sign-in">Back to sign in</button></div>
    </section></main>`;
    $('#back-sign-in').onclick = () => renderLogin();
  }

  function renderRequestAccess() {
    accessPage(`<h1>Request access</h1><p class="subtle">Submit your details for admin review.</p>
      <form class="form-grid" id="access-form">
        <div class="field"><label for="request-name">Full name</label><input id="request-name" name="name" autocomplete="name" maxlength="80" required></div>
        <div class="field"><label for="request-badge">Employee or gate pass number</label><input id="request-badge" name="badge" maxlength="32" required></div>
        <div class="field"><label for="request-dept">Department / agency</label><input id="request-dept" name="department" maxlength="80" required></div>
        <div class="field"><label for="request-contact">Mobile number</label><input id="request-contact" name="contact" inputmode="numeric" autocomplete="tel-national" pattern="[1-9][0-9]{9}" maxlength="10" required></div>
        <div class="field"><label for="request-role">Requested role</label>${accessRoles('request-role')}</div>
        <div hidden><label for="request-website">Leave blank</label><input id="request-website" name="website" tabindex="-1" autocomplete="off"></div>
        <p class="subtle">Your details are visible to the register admin for access review.</p>
        <div data-access-feedback role="status"></div><button class="btn">Submit request</button>
      </form>`);
    bindAccessForm($('#access-form'), async values => {
      await api('submitAccessRequest', values);
      accessPage('<h1>Request received</h1><p>The register admin will review your request and share a setup link if approved.</p>');
    });
  }

  function accessRoles(id) {
    return `<select name="role" id="${id}"><option value="USER">User</option><option value="OPERATOR">Operator</option></select>`;
  }

  function bindAccessForm(form, submit) {
    form.onsubmit = async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const buttons = $$('button', form);
      const feedback = $('[data-access-feedback]', form);
      feedback.className = '';
      feedback.textContent = '';
      buttons.forEach(button => { button.disabled = true; });
      try {
        await submit(values, event.submitter?.value);
      } catch (error) {
        feedback.className = 'notice error';
        feedback.textContent = error.message;
        buttons.forEach(button => { button.disabled = false; });
      }
    };
  }

  function renderAccountSetup(setup) {
    accessPage(`<h1>Set up your account</h1><p class="subtle">Choose your username and a password of at least 12 characters.</p>
      <form class="form-grid" id="account-setup-form">
        <div class="field"><label for="setup-username">Username</label><input id="setup-username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="32" required></div>
        <div class="field"><label for="setup-password">New password</label><input id="setup-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></div>
        <div class="field"><label for="setup-repeat">Confirm password</label><input id="setup-repeat" name="repeat" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></div>
        <div data-access-feedback role="status"></div><button class="btn">Activate account</button>
      </form>`);
    bindAccessForm($('#account-setup-form'), async ({username, password, repeat}) => {
      if (password !== repeat) throw new Error('The passwords do not match.');
      const result = await api('activateAccessRequest', {...setup, username, password});
      renderLogin('', 'Account activated. Sign in with your username and password.', result.username);
    });
  }

  function renderAccessRequests() {
    const requests = state.data.accessRequests || [];
    return `<section class="panel"><div class="section-head"><h2>Access Requests</h2>
      <span class="chip">${requests.filter(item => item.status === 'PENDING').length} pending</span></div>
      ${requests.length ? `<div class="cards">${requests.map(item => `<article class="key-card">
        <div class="key-title">${esc(item.name)}</div>
        <div class="key-meta">${esc(item.department)} · ID ${esc(item.badge)} · ${esc(item.contact)}<br>
          ${item.status === 'PENDING' ? `Requested ${esc(item.requestedRole)} · ${istDateTime(item.submittedAt)}`
            : `${esc(item.role)} · Awaiting account setup<br>Link expires ${istDateTime(item.expiresAt)}`}</div>
        <div class="actions"><button class="btn outline small" data-review-access="${esc(item.id)}">
          ${item.status === 'PENDING' ? 'Review request' : 'Replace setup link'}
        </button></div></article>`).join('')}</div>` : '<div class="empty">No requests awaiting review or setup.</div>'}
    </section>`;
  }

  function openAccessReview(id) {
    const item = (state.data.accessRequests || []).find(request => request.id === id);
    if (!item) return;
    const pending = item.status === 'PENDING';
    const modal = openModal(`<div class="dialog-head"><h2>${pending ? 'Review access request' : 'Replace setup link'}</h2>
      <button class="close" aria-label="Close">×</button></div>
      <form class="form-grid" id="review-access-form">
        <p><strong>${esc(item.name)}</strong> · ${esc(item.department)}<br>ID ${esc(item.badge)} · ${esc(item.contact)}</p>
        ${pending ? `<p class="subtle">Requested role is ${esc(item.requestedRole)}. Verify the employee or gate pass number before approving.</p>
          <div class="field"><label for="approved-role">Approve as</label>${accessRoles('approved-role')}</div>`
          : '<p class="subtle">The previous setup link will stop working.</p>'}
        <div data-access-feedback role="status"></div>
        <div class="actions"><button class="btn" value="${pending ? 'approve' : 'renew'}">${pending ? 'Approve request' : 'Generate new link'}</button>
        ${pending ? '<button class="btn outline" value="reject" formnovalidate>Reject request</button>' : ''}</div>
      </form>`);
    bindAccessForm($('#review-access-form', modal), async (values, decision) => {
      const result = await api('reviewAccessRequest', {...values, id, decision:decision || (pending ? 'approve' : 'renew')});
      modal.remove();
      if (result.token) showSetupLink(result, item.name);
      else toast('Request rejected.');
      await refresh();
    });
  }

  function showSetupLink({id, token, expiresAt}, name) {
    const setupUrl = new URL(location.pathname, location.origin);
    setupUrl.hash = new URLSearchParams({request:id, setup:token}).toString();
    const modal = openModal(`<div class="dialog-head"><h2>Account setup link</h2><button class="close" aria-label="Close">×</button></div>
      <div class="form-grid"><p>Share this one-time link privately with <strong>${esc(name)}</strong>. They will choose their username and password. It expires ${istDateTime(expiresAt)}.</p>
      <div class="field"><label for="approved-setup-link">Setup link</label><input id="approved-setup-link" readonly></div>
      <button type="button" class="btn" id="copy-setup-link">Copy link</button></div>`);
    const input = $('#approved-setup-link', modal);
    input.value = setupUrl.href;
    $('#copy-setup-link', modal).onclick = async () => {
      try {
        await navigator.clipboard.writeText(input.value);
        toast('Setup link copied.');
      } catch {
        input.focus();
        input.select();
        toast('Copy the selected setup link.');
      }
    };
  }


  async function refresh(){try{state.data=await api('dashboard');render();}catch(e){toast(e.message);if(!state.user)renderLogin(e.message);}}
  function tabs(){const all=[['dashboard','▦','Dashboard'],['issue','＋','Issue'],['handovers','⇄','Handovers'],['history','≡','History'],['admin','⚙','Admin']];return all.filter(([id])=>id!=='issue'||['ADMIN','OPERATOR'].includes(state.user.Role)).filter(([id])=>id!=='history'||['ADMIN','OPERATOR'].includes(state.user.Role)).filter(([id])=>id!=='admin'||state.user.Role==='ADMIN');}
  function header(){return `<header class="topbar"><div class="brand"><div class="brand-mark">🗝</div><div>Digital Key Register<small>GAP · Control Room</small></div></div><div class="top-actions"><div class="user-chip"><strong>${esc(state.user.Full_Name)}</strong>${esc(state.user.Role)}</div><button class="icon-btn" id="logout" aria-label="Sign out">↪</button></div></header>`;}
  function nav(){const t=tabs();return `<nav class="bottom-nav">${t.map(([id,ico,label])=>`<button class="nav-item ${state.tab===id?'active':''}" data-tab="${id}"><span class="ico">${ico}</span>${label}</button>`).join('')}</nav>`;}
  function tabBar(){return `<nav class="tabs">${tabs().map(([id,ico,label])=>`<button class="tab ${state.tab===id?'active':''}" data-tab="${id}">${ico} &nbsp;${label}</button>`).join('')}</nav>`;}
  function render(){if(!state.user||!state.data){renderLogin();return;}const title={dashboard:'Live key status',issue:'Issue keys',handovers:'Key handovers',history:'Transaction history',admin:'Administration'}[state.tab]||'Live key status';app.innerHTML=`${header()}<main class="page"><div class="welcome"><div><h1>${title}</h1><div class="subtle">${new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date())} · IST</div></div><button class="btn secondary small" id="refresh">↻ Refresh</button></div>${tabBar()}<section id="view">${renderTab()}</section></main>${nav()}`;bindCommon();}
  function renderTab(){switch(state.tab){case'issue':return renderIssue();case'handovers':return renderHandovers();case'history':return renderHistory();case'admin':return renderAdmin();default:return renderDashboard();}}
  function renderDashboard(){const d=state.data;const summary=[['Total keys',d.summary.total,''],['Available',d.summary.available,''],['Currently out',d.summary.out,''],['Pending handover',d.summary.pending,''],['Overdue',d.summary.overdue,d.summary.overdue?'alert':'']];const available=d.keys.filter(k=>k.Status==='AVAILABLE');const out=d.out||[];return `<div class="summary">${summary.map(([l,v,c])=>`<article class="stat ${c}"><div class="label">${l}</div><div class="value">${v}</div></article>`).join('')}</div><section class="panel"><div class="section-head"><h2>${state.user.Role==='USER'?'Keys I hold':'Currently out / pending'}</h2><div class="actions">${['ADMIN','OPERATOR'].includes(state.user.Role)?'<button class="btn secondary small" id="bulk-return">Bulk return selected</button>':''}<span class="chip">${state.user.Role==='USER'?d.mine.length:out.length} active</span></div></div>${state.user.Role==='USER'?renderKeyCards(d.mine,true):renderKeyCards(out,false)}</section><section class="panel"><div class="section-head"><h2>Available keys</h2><span class="chip">${available.length} ready</span></div>${available.length?`<div class="cards">${available.map(k=>`<article class="key-card"><div class="key-top"><div><div class="key-title">${esc(k.Key_Name)}</div><div class="key-meta">${esc(k.Location_Area)} · ${esc(k.Key_ID)}</div></div><span class="badge green">AVAILABLE</span></div>${['ADMIN','OPERATOR'].includes(state.user.Role)?'<button class="btn small" data-jump="issue">Issue this key</button>':''}</article>`).join('')}</div>`:'<div class="empty">No keys are currently available.</div>'}</section>`;}
  function renderKeyCards(rows,own){if(!rows.length)return `<div class="empty">${own?'You are not currently holding any keys.':'No active key issues.'}</div>`;return `<div class="cards">${rows.map(t=>{const overdue=!!t.Is_Overdue;return `<article class="key-card ${overdue?'overdue':''}"><div class="key-top"><div><div class="key-title">${esc(t.Key_Name)}</div><div class="key-meta">Holder: ${esc(t.Current_Holder_Name||t.Taken_By_Name)}${t.Current_Holder_Contact?' · '+esc(t.Current_Holder_Contact):''}<br>Shift ${esc(t.Current_Shift||t.Shift)} · Since ${istDateTime(t.Current_Holder_Since||t.Issued_At)}<br>Issued by ${esc(t.Issued_By_Operator||'—')}</div></div><span class="badge ${overdue?'red':t.Status==='PENDING_HANDOVER'?'amber':'green'}">${overdue?'OVERDUE':esc(t.Status)}</span></div>${overdue?`<div class="key-meta"><strong>${esc(t.Elapsed)} out</strong></div>`:''}<div class="actions">${['ADMIN','OPERATOR'].includes(state.user.Role)&&t.Status==='OUT'?`<label class="toggle-row"><input type="checkbox" data-bulk-tx="${esc(t.Tx_ID)}" aria-label="Select ${esc(t.Key_Name)} for bulk return">Select return</label><button class="btn small" data-return="${esc(t.Tx_ID)}">Return</button>`:''}${t.Status==='OUT'&&t.Holder_Type!=='GUEST'&&(own||['ADMIN','OPERATOR'].includes(state.user.Role))?`<button class="btn outline small" data-handover="${esc(t.Tx_ID)}">Handover</button>`:''}</div></article>`;}).join('')}</div>`;}
  function renderIssue(){if(!['ADMIN','OPERATOR'].includes(state.user.Role))return '<div class="panel empty">Issue access is limited to operators.</div>';const available=state.data.keys.filter(k=>k.Status==='AVAILABLE');return `<form id="issue-form"><div class="split"><section class="panel"><div class="section-head"><h2>1 · Select key(s)</h2><span class="chip">${available.length} available</span></div>${available.length?`<div class="key-select">${available.map(k=>`<label class="select-key"><input type="checkbox" name="keyIds" value="${esc(k.Key_ID)}"><span><strong>${esc(k.Key_Name)}</strong><small>${esc(k.Location_Area)} · ${esc(k.Key_ID)}</small></span></label>`).join('')}</div>`:'<div class="empty">No available keys to issue.</div>'}</section><section class="panel"><h2>2 · Holder details</h2><div class="field"><label for="holder-type">Holder type</label><select id="holder-type"><option value="REGISTERED">Registered employee</option><option value="GUEST">Guest / contractor</option></select></div><div id="registered-fields" class="form-grid"><div class="field"><label for="registered-search">Search registered users</label><input id="registered-search" list="registered-users" placeholder="Type name, department, or username" autocomplete="off"><datalist id="registered-users">${state.data.users.map(x=>`<option value="${esc(x.Full_Name+' · '+x.Department+' (@'+x.Username+')')}"></option>`).join('')}</datalist><input type="hidden" id="registered-user"><div class="hint" id="registered-details">Choose a matching registered user to fill their details.</div></div></div><div id="guest-fields" class="form-grid two hidden"><div class="field"><label>Full name</label><input name="guestName" maxlength="80"></div><div class="field"><label>Contact number</label><input name="guestContact" inputmode="numeric" pattern="[0-9]{10}" maxlength="10" placeholder="10 digits"></div><div class="field"><label>Department / Agency</label><input name="guestDepartment" maxlength="80"></div></div><div class="form-grid two" style="margin-top:12px"><div class="field"><label for="issue-shift">Shift</label><select id="issue-shift"><option value="A">A Shift</option><option value="B">B Shift</option><option value="C">C Shift</option><option value="General">General</option></select></div><div class="field"><label>Issued by</label><input value="${esc(state.user.Full_Name)}" disabled></div></div><div class="field" style="margin-top:12px"><label for="purpose">Purpose / remarks (optional)</label><textarea id="purpose" maxlength="300" placeholder="Reason for taking the key"></textarea></div><div class="notice">The issue is recorded under your operator account. One submission creates an individual transaction for each selected key.</div><button class="btn" type="submit" ${available.length?'':'disabled'}>Issue selected keys</button></section></div></form>`;}
  function pendingCard(h){return `<article class="key-card"><div class="key-top"><div><div class="key-title">${esc(h.Key_Name)}</div><div class="key-meta">From ${esc(h.From_Holder_Name)} · Shift ${esc(h.From_Shift)}<br>To you · Shift ${esc(h.To_Shift)}<br>Requested ${istDateTime(h.Initiated_At)}${h.Remarks?'<br>'+esc(h.Remarks):''}</div></div><span class="badge amber">CONFIRMATION</span></div><div class="actions"><button class="btn small" data-confirm="${esc(h.Handover_ID)}">Confirm receipt</button><button class="btn danger small" data-reject="${esc(h.Handover_ID)}">Reject</button></div></article>`;}
  function renderHandovers(){const pending=state.data.pending||[], my=state.data.mine||[], allowed=state.user.Role!=='USER'||true;return `<section class="panel"><div class="section-head"><h2>Pending handovers for me</h2><span class="chip">${pending.length} awaiting</span></div>${pending.length?`<div class="cards">${pending.map(pendingCard).join('')}</div>`:'<div class="empty">No incoming handovers need your confirmation.</div>'}</section><section class="panel"><div class="section-head"><h2>Keys I can hand over</h2></div>${my.filter(t=>t.Status==='OUT'&&t.Holder_Type!=='GUEST').length?`<div class="cards">${my.filter(t=>t.Status==='OUT'&&t.Holder_Type!=='GUEST').map(t=>`<article class="key-card"><div class="key-top"><div><div class="key-title">${esc(t.Key_Name)}</div><div class="key-meta">Currently with ${esc(t.Current_Holder_Name)} · Shift ${esc(t.Current_Shift||t.Shift)}</div></div><span class="badge green">OUT</span></div><button class="btn outline small" data-handover="${esc(t.Tx_ID)}">Start handover</button></article>`).join('')}</div>`:'<div class="empty">No registered-user keys are eligible for handover. Guest-issued keys cannot be transferred.</div>'}</section>`;}
  function renderHistory(){return `<section class="panel"><div class="section-head"><h2>Issue and return ledger</h2><button class="btn secondary small" id="export-csv">Export CSV</button></div><div class="filters"><div class="filter"><label>From date</label><input type="date" id="filter-from" value="${esc(state.historyFilters.from||'')}"></div><div class="filter"><label>To date</label><input type="date" id="filter-to" value="${esc(state.historyFilters.to||'')}"></div><div class="filter"><label>Shift</label><select id="filter-shift"><option value="">All shifts</option>${['A','B','C','General'].map(s=>`<option ${state.historyFilters.shift===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="filter"><label>Status</label><select id="filter-status"><option value="">All statuses</option>${['OUT','PENDING_HANDOVER','RETURNED'].map(s=>`<option ${state.historyFilters.status===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="filter"><label>Key / person</label><input id="filter-query" value="${esc(state.historyFilters.query||'')}" placeholder="Search"></div></div><button class="btn small" id="apply-history">Apply filters</button><div id="history-results" class="empty">Use filters to load records.</div></section>`;}
  function renderAdmin(){
    if(state.user.Role!=='ADMIN')return '<section class="panel empty">Admin access required.</section>';
    return `${renderAccessRequests()}<div class="split">
      <section class="panel"><h2>Key master</h2><form id="key-form" class="form-grid"><div class="field"><label>Key name</label><input name="name" required maxlength="80"></div><div class="field"><label>Location / area</label><input name="area" required maxlength="80"></div><button class="btn">Add key</button></form><div class="key-select" style="margin-top:14px">${state.data.keys.map(k=>`<div class="select-key"><span><strong>${esc(k.Key_Name)}</strong><small>${esc(k.Location_Area)} · ${esc(k.Status)}</small></span><button class="btn outline small" data-edit-key="${esc(k.Key_ID)}">Edit</button></div>`).join('')}</div></section>
      <section class="panel"><h2>Add registered user</h2><form id="user-form" class="form-grid two"><div class="field"><label>Full name</label><input name="name" required></div><div class="field"><label>Username</label><input name="username" required pattern="[a-zA-Z0-9._-]{3,32}"></div><div class="field"><label>Contact number</label><input name="contact" required inputmode="numeric" pattern="[0-9]{10}" maxlength="10"></div><div class="field"><label>Department</label><input name="department" required></div><div class="field"><label>Role</label><select name="role"><option>USER</option><option>OPERATOR</option><option>ADMIN</option></select></div><div class="field"><label>Initial password (8+ chars)</label><input name="password" type="password" required minlength="8"></div><button class="btn">Create user</button></form>
      <h3 style="margin-top:22px">User accounts</h3><div class="key-select">${state.data.userAdmin.map(u=>`<div class="select-key"><span><strong>${esc(u.Full_Name)} <small>(${esc(u.Role)} · ${u.Awaiting_Setup?'Awaiting setup':u.Active==='TRUE'?'Active':'Disabled'})</small></strong><small>${esc(u.Username || 'Username pending')} · ${esc(u.Department)} · ${esc(u.Contact_No)}</small></span>${u.User_ID!==state.user.User_ID&&!u.Awaiting_Setup?`<button class="btn ${u.Active==='TRUE'?'secondary':'outline'} small" data-active-user="${esc(u.User_ID)}" data-active="${u.Active==='TRUE'?'false':'true'}">${u.Active==='TRUE'?'Disable':'Enable'}</button>`:''}</div>`).join('')}</div></section></div>
      <section class="panel"><h2>Register settings</h2><form id="settings-form" class="form-grid two"><div class="field"><label>Overdue threshold (hours)</label><input type="number" name="overdueHours" min="1" max="168" value="${esc(state.data.settings.overdueHours)}" required></div><button class="btn">Save setting</button></form></section>
      <section class="panel"><h2>Change my password</h2><form id="password-form" class="form-grid two"><div class="field"><label>Current password</label><input name="currentPassword" type="password" required></div><div class="field"><label>New password (8+ characters)</label><input name="newPassword" type="password" minlength="8" required></div><button class="btn">Update password</button></form><div class="notice">Keep each user account individual. Share setup links privately with the approved account holder.</div></section>`;
  }
  function bindCommon(){ $('#logout').onclick=()=>logout(true);$('#refresh').onclick=refresh;$$('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render();if(state.tab==='history')loadHistory();});$$('[data-jump]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.jump;render();});$$('[data-return]').forEach(b=>b.onclick=()=>openReturn([b.dataset.return]));if($('#bulk-return'))$('#bulk-return').onclick=()=>{const ids=$$('[data-bulk-tx]:checked').map(x=>x.dataset.bulkTx);if(!ids.length){toast('Select one or more keys to return.');return;}const chosen=ids.map(id=>(state.data.out||[]).find(t=>t.Tx_ID===id));if(chosen.some(t=>t.Current_Holder_UserID!==chosen[0].Current_Holder_UserID||t.Current_Holder_Name!==chosen[0].Current_Holder_Name||t.Current_Holder_Contact!==chosen[0].Current_Holder_Contact)){toast('Bulk return is limited to keys held by the same person.');return;}openReturn(ids);};$$('[data-handover]').forEach(b=>b.onclick=()=>openHandover(b.dataset.handover));$$('[data-confirm]').forEach(b=>b.onclick=()=>doAction('handoverConfirm',{handoverId:b.dataset.confirm},'Handover confirmed.'));$$('[data-reject]').forEach(b=>b.onclick=()=>doAction('handoverReject',{handoverId:b.dataset.reject},'Handover rejected.'));$$('[data-active-user]').forEach(b=>b.onclick=()=>doAction('setUserActive',{userId:b.dataset.activeUser,active:b.dataset.active==='true'},b.dataset.active==='true'?'User enabled.':'User disabled.'));$$('[data-edit-key]').forEach(b=>b.onclick=()=>openEditKey(b.dataset.editKey));
    if($('#holder-type')){$('#holder-type').onchange=()=>{$('#registered-fields').classList.toggle('hidden',$('#holder-type').value!=='REGISTERED');$('#guest-fields').classList.toggle('hidden',$('#holder-type').value!=='GUEST');};$('#issue-shift').value=istShift();$('#registered-search').oninput=e=>{const found=state.data.users.find(x=>`${x.Full_Name} · ${x.Department} (@${x.Username})`===e.target.value);$('#registered-user').value=found?found.User_ID:'';$('#registered-details').textContent=found?`${found.Full_Name} · ${found.Contact_No} · ${found.Department}`:'Choose an exact match from the registered user list.';};$('#issue-form').onsubmit=submitIssue;}
    $$('[data-review-access]').forEach(button => { button.onclick = () => openAccessReview(button.dataset.reviewAccess); });
    if($('#key-form'))$('#key-form').onsubmit=async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(e.currentTarget));await doAction('saveKey',{name:x.name,area:x.area},'Key added.');};
    if($('#user-form'))$('#user-form').onsubmit=async e=>{e.preventDefault();await doAction('saveUser',Object.fromEntries(new FormData(e.currentTarget)),'User created.');};
    if($('#settings-form'))$('#settings-form').onsubmit=async e=>{e.preventDefault();await doAction('settings',{overdueHours:$('#settings-form [name=overdueHours]').value},'Setting saved.');};
    if($('#password-form'))$('#password-form').onsubmit=async e=>{e.preventDefault();await doAction('changePassword',Object.fromEntries(new FormData(e.currentTarget)),'Password updated.');};
    if($('#apply-history'))$('#apply-history').onclick=()=>{state.historyFilters={from:$('#filter-from').value,to:$('#filter-to').value,shift:$('#filter-shift').value,status:$('#filter-status').value,query:$('#filter-query').value.trim()};loadHistory();};if($('#export-csv'))$('#export-csv').onclick=exportCsv;
  }
  async function submitIssue(e){e.preventDefault();const f=e.currentTarget,ids=$$('input[name=keyIds]:checked',f).map(x=>x.value);if(!ids.length){toast('Select at least one key.');return;}const guest=$('#holder-type').value==='GUEST', payload={keyIds:ids,holderType:guest?'GUEST':'REGISTERED',shift:$('#issue-shift').value,purpose:$('#purpose').value};if(guest){payload.name=f.elements.guestName.value;payload.contact=f.elements.guestContact.value;payload.department=f.elements.guestDepartment.value;}else payload.userId=$('#registered-user').value;await doAction('issue',payload,`${ids.length} key(s) issued.`);}
  async function doAction(action,payload,message){try{await api(action,payload);toast(message);await refresh();}catch(e){toast(e.message);}}
  async function loadHistory(){const slot=$('#history-results');if(!slot)return;slot.innerHTML='<div class="empty"><span class="spinner"></span><br>Loading records…</div>';try{const x=await api('history',state.historyFilters);state.history=x.transactions||[];state.handovers=x.handovers||[];const txHtml=state.history.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Issued</th><th>Key</th><th>Holder at issue</th><th>Shift</th><th>Issue operator</th><th>Return details</th><th>Status</th></tr></thead><tbody>${state.history.map(t=>`<tr><td>${esc(t.Issue_Date)}<br>${esc(t.Issue_Time)}</td><td>${esc(t.Key_Name)}<br><small>${esc(t.Key_ID)}</small></td><td>${esc(t.Taken_By_Name)}<br>${esc(t.Taken_By_Contact)}<br><small>${esc(t.Taken_By_Dept)}</small></td><td>${esc(t.Shift)}</td><td>${esc(t.Issued_By_Operator)}</td><td>${t.Return_Date?`${esc(t.Return_Date)} ${esc(t.Return_Time)}<br>${esc(t.Returned_By_Name)}<br>Received: ${esc(t.Received_By_Operator)}${t.Is_Third_Party_Return==='TRUE'?`<br>Reason: ${esc(t.Third_Party_Reason)}`:''}`:'—'}</td><td><span class="badge ${t.Status==='RETURNED'?'green':t.Status==='PENDING_HANDOVER'?'amber':''}">${esc(t.Status)}</span></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No matching transactions.</div>';const handoverRows=state.handovers.filter(h=>state.history.some(t=>t.Tx_ID===h.Tx_ID));const hHtml=`<h3 style="margin:20px 0 10px">Handover audit trail</h3>${handoverRows.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Initiated</th><th>Key</th><th>From</th><th>To</th><th>Shift</th><th>Status</th><th>Confirmed by</th></tr></thead><tbody>${handoverRows.map(h=>`<tr><td>${esc(istDateTime(h.Initiated_At))}</td><td>${esc(h.Key_Name)}</td><td>${esc(h.From_Holder_Name)}</td><td>${esc(h.To_Holder_Name)}</td><td>${esc(h.From_Shift)} → ${esc(h.To_Shift)}</td><td>${esc(h.Status)}</td><td>${esc(h.Confirmed_By||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No handovers for these transactions.</div>'}`;slot.innerHTML=txHtml+hHtml;}catch(e){slot.innerHTML=`<div class="notice error">${esc(e.message)}</div>`;}}
  function exportCsv(){if(!state.history.length){toast('Load history records first.');return;}const headers=['Tx_ID','Batch_ID','Shift','Issue_Date','Issue_Time','Key_ID','Key_Name','Holder_Type','Taken_By_Name','Taken_By_Contact','Taken_By_Dept','Purpose_Remarks','Issued_By_Operator','Status','Return_Date','Return_Time','Returned_By_Name','Returned_By_Contact','Third_Party_Reason','Received_By_Operator'];const csv=[headers,...state.history.map(t=>headers.map(h=>t[h]||''))].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download=`key-register-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);}
  function openModal(content){const wrap=document.createElement('div');wrap.className='drawer-backdrop';wrap.innerHTML=`<section class="dialog">${content}</section>`;document.body.append(wrap);wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};$('.close',wrap).onclick=()=>wrap.remove();return wrap;}
  function openEditKey(id){const key=state.data.keys.find(k=>k.Key_ID===id);if(!key)return;const modal=openModal(`<div class="dialog-head"><div><h2 style="margin:0">Edit key details</h2><div class="subtle">${esc(key.Key_ID)} · ${esc(key.Status)}</div></div><button class="close" aria-label="Close">×</button></div><form id="edit-key-form" class="form-grid"><div class="field"><label>Key name</label><input name="name" value="${esc(key.Key_Name)}" required maxlength="80"></div><div class="field"><label>Location / area</label><input name="area" value="${esc(key.Location_Area)}" required maxlength="80"></div><button class="btn">Save key details</button></form>`);$('#edit-key-form',modal).onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));try{await api('saveKey',{keyId:id,name:f.name,area:f.area});modal.remove();toast('Key details updated.');await refresh();}catch(err){toast(err.message);}};}
  function openReturn(ids){const tx=(state.data.out||[]).find(t=>t.Tx_ID===ids[0]);if(!tx)return;const modal=openModal(`<div class="dialog-head"><div><h2 style="margin:0">Return ${ids.length>1?'keys':'key'}</h2><div class="subtle">${esc(tx.Key_Name)} · held by ${esc(tx.Current_Holder_Name)}</div></div><button class="close" aria-label="Close">×</button></div><form id="return-form" class="form-grid"><label class="toggle-row"><input type="checkbox" id="third-party"> Returned by a different person?</label><div id="third-fields" class="form-grid hidden"><div class="field"><label>Returned by name</label><input name="returnedByName"></div><div class="field"><label>Returned by contact number</label><input name="returnedByContact" inputmode="numeric" maxlength="10" pattern="[0-9]{10}"></div><div class="field"><label>Reason for third-party return <b>*</b></label><textarea name="reason"></textarea></div></div><div class="notice">Receipt will be logged under ${esc(state.user.Full_Name)}.</div><button class="btn" type="submit">Confirm return</button></form>`);$('#third-party',modal).onchange=e=>$('#third-fields',modal).classList.toggle('hidden',!e.target.checked);$('#return-form',modal).onsubmit=async e=>{e.preventDefault();const third=$('#third-party',modal).checked,fd=new FormData(e.currentTarget),payload={txIds:ids,thirdParty:third};if(third){payload.returnedByName=fd.get('returnedByName');payload.returnedByContact=fd.get('returnedByContact');payload.reason=fd.get('reason');}try{await api('return',payload);modal.remove();toast(`${ids.length} key(s) returned.`);await refresh();}catch(err){toast(err.message);}};}
  function openHandover(txId){const tx=(state.data.out||[]).find(t=>t.Tx_ID===txId)||state.data.mine.find(t=>t.Tx_ID===txId);if(!tx||tx.Holder_Type==='GUEST'){toast('Guest-issued keys cannot be transferred.');return;}const modal=openModal(`<div class="dialog-head"><div><h2 style="margin:0">Handover key</h2><div class="subtle">${esc(tx.Key_Name)} · ${esc(tx.Current_Holder_Name)}</div></div><button class="close" aria-label="Close">×</button></div><form id="handover-form" class="form-grid"><div class="field"><label>Receiving registered user</label><select name="toUserId" required><option value="">Choose a person…</option>${state.data.users.filter(x=>x.User_ID!==tx.Current_Holder_UserID).map(x=>`<option value="${esc(x.User_ID)}">${esc(x.Full_Name)} · ${esc(x.Department)}</option>`).join('')}</select></div><div class="field"><label>Target shift</label><select name="toShift"><option>A</option><option>B</option><option>C</option><option>General</option></select></div><div class="field"><label>Remarks (optional)</label><textarea name="remarks" maxlength="200"></textarea></div><div class="notice">The key will be marked pending until the receiving user signs in and confirms receipt. Only registered users can receive a handover.</div><button class="btn">Send confirmation request</button></form>`);$('#handover-form',modal).onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));try{await api('handoverInitiate',{txId,toUserId:f.toUserId,toShift:f.toShift,remarks:f.remarks});modal.remove();toast('Handover request sent.');await refresh();}catch(err){toast(err.message);}};}
  function logout(show=true){if(state.token)api('logout').catch(()=>{});state.token='';state.user=null;state.data=null;localStorage.removeItem('dkr_token');localStorage.removeItem('dkr_user');if(show)renderLogin();}
  const setupParams = new URLSearchParams(location.hash.slice(1));
  if (setupParams.has('setup')) {
    const setup = {id:setupParams.get('request'), setupToken:setupParams.get('setup')};
    history.replaceState(null, '', location.pathname + location.search);
    renderAccountSetup(setup);
  } else if (state.token && state.user) {
    refresh();
  } else {
    renderLogin();
  }
})();
