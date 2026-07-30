/**
 * Core Application Logic, Real-Time GitHub Database Workflows, and Native Routing
 * Enforces strict member login rules against real cloud database records.
 */

const DEFAULT_STATE = {
    manager: {
        name: "مدير السلامة العام",
        username: "admin",
        phone: "0501234567",
        password: "admin",
        ghOwner: "lootb8890-hue",
        ghRepo: "HSE_kala_safty",
        ghToken: localStorage.getItem("github_token") || "",
        syncCode: "HSE-SYNC-" + btoa("lootb8890-hue:::HSE_kala_safty:::" + (localStorage.getItem("github_token") || ""))
    },
    members: [
        { id: "M1", name: "أحمد علي", user: "ahmed_a", phone: "0501112233", pass: "123456", syncCode: "" },
        { id: "M2", name: "سامي الجهني", user: "sami_j", phone: "0502223344", pass: "123456", syncCode: "" },
        { id: "M3", name: "فهد السلامة", user: "fahad_s", phone: "0503334455", pass: "123456", syncCode: "" }
    ],
    pendingSignatures: [
        { id: "SC-2024-0001", type: "SC Report", title: "تسرب زيت في خط الإنتاج رقم (3)", author: "أحمد علي", date: "2024/05/21", priority: "عالية" },
        { id: "PTW-2024-015", type: "PTW", title: "أعمال لحام في خزان الوقود رقم (5)", author: "سامي الجهني", date: "2024/05/22", priority: "متوسّط" }
    ],
    tasks: [
        { id: "TSK-101", title: "فحص طفايات الحريق بالمستودع الشمالي", assignedTo: "أحمد علي", dueDate: "2024/05/25", status: "pending", report: null },
        { id: "TSK-102", title: "التأكد من سلامة مخارج الطوارئ بالدور الأول", assignedTo: "سامي الجهني", dueDate: "2024/05/26", status: "completed", report: "تم فحص جميع المخارج وتغيير مصباح الطوارئ التالف رقم 4." }
    ],
    customFields: {
        sc: [
            { id: "CF-1", name: "رقم الماكينة المتضررة", type: "text" },
            { id: "CF-2", name: "هل تم إيقاف التشغيل مؤقتاً؟", type: "checkbox" }
        ],
        ptw: [
            { id: "CF-3", name: "رقم جهاز قياس الغازات", type: "text" }
        ]
    },
    calendarEvents: [
        { id: "EV-1", title: "تمرين إخلاء سنوي", date: "2026-08-15", type: "drill" },
        { id: "EV-2", title: "تجديد شهادات OSHA للفريق", date: "2026-08-20", type: "training" }
    ],
    schedule: {
        frequency: "daily",
        assignMode: "free",
        targetMember: null
    },
    currentRole: "manager",
    currentMember: null,
    currentDate: new Date()
};

let HSE_STATE = JSON.parse(JSON.stringify(DEFAULT_STATE));
var ghDatabase = window.ghDatabase || null;
let currentSigDocId = null;

// ==================== INITIALIZATION & HELPER ====================
document.addEventListener("DOMContentLoaded", async () => {
    initGitHubDatabase();
    initAppUI();
    renderAllDynamicViews();
    initSigPad();
    
    // Check if there's an existing cloud connection to restore
    if (ghDatabase && ghDatabase.owner && ghDatabase.repo) {
        const res = await ghDatabase.verifyAndFetchRealCloudDatabase();
        if (res.success && res.data) {
            HSE_STATE = res.data;
            renderAllDynamicViews();
        }
    }

    // Default open on login selection screen
    showAuthSection('initial');
});

function initGitHubDatabase() {
    if (!ghDatabase) {
        ghDatabase = new GitHubDatabase(
            HSE_STATE.manager.ghToken,
            HSE_STATE.manager.ghOwner,
            HSE_STATE.manager.ghRepo,
            "hse_db.json"
        );
        window.ghDatabase = ghDatabase;
    }
    const generatedCode = ghDatabase.generateSyncCode(HSE_STATE.manager.ghOwner, HSE_STATE.manager.ghRepo, HSE_STATE.manager.ghToken);
    HSE_STATE.manager.syncCode = generatedCode;
    updateSyncCodeDisplays();
}

function updateSyncCodeDisplays() {
    const syncCode = HSE_STATE.manager.syncCode || ghDatabase.generateSyncCode();
    const el = document.getElementById("displayCloudSyncCode");
    if(el) el.innerText = syncCode;
    
    const mbrInput = document.getElementById("mbrSyncCode");
    if(mbrInput && !mbrInput.value) mbrInput.value = syncCode;
    
    const statusPill = document.getElementById("cloudSyncDisplayBar");
    if(statusPill) statusPill.innerHTML = `<i class="fa-solid fa-cloud-check"></i> قاعدة البيانات الحقيقية: متصلة ونشطة`;
}

async function commitStateToCloud(actionName = "تحديث بيانات النظام") {
    localStorage.setItem("HSE_GITHUB_DB_BACKUP", JSON.stringify(HSE_STATE));
    if (ghDatabase && ghDatabase.owner && ghDatabase.repo && ghDatabase.token) {
        await ghDatabase.saveDatabase(HSE_STATE, actionName);
    }
}

function initAppUI() {
    const todayStr = new Date().toISOString().split('T')[0];
    const dueIn = document.getElementById("taskDueDate");
    if(dueIn) dueIn.value = todayStr;
    const evtDate = document.getElementById("eventDate");
    if(evtDate) evtDate.value = todayStr;
    
    updateRoleHeadersAndUI();
    renderCalendar(new Date());
}

function updateRoleHeadersAndUI() {
    const isMgr = HSE_STATE.currentRole === "manager";
    const headerText = document.getElementById("headerRoleText");
    const headerRoleBadge = document.getElementById("headerRoleBadge");
    const mgrSection = document.getElementById("managerOnlySection");
    const drawerName = document.getElementById("drawerUserName");
    const drawerAvatar = document.getElementById("drawerUserAvatar");

    if (isMgr) {
        if(headerText) headerText.innerText = HSE_STATE.manager.name;
        if(headerRoleBadge) headerRoleBadge.className = "user-role-badge";
        if(drawerName) drawerName.innerText = HSE_STATE.manager.name;
        if(drawerAvatar) drawerAvatar.innerHTML = `<i class="fa-solid fa-user-shield"></i>`;
        if(mgrSection) mgrSection.style.display = "block";
    } else {
        const memberName = HSE_STATE.currentMember ? HSE_STATE.currentMember.name : "عضو سلامة";
        if(headerText) headerText.innerText = memberName;
        if(headerRoleBadge) headerRoleBadge.className = "user-role-badge";
        if(drawerName) drawerName.innerText = memberName;
        if(drawerAvatar) drawerAvatar.innerHTML = `<i class="fa-solid fa-user"></i>`;
        if(mgrSection) mgrSection.style.display = "none";
    }

    renderTasksList();
    renderPendingSignatures();
    renderMembers();
    updateStatsCounters();
    renderCustomFieldsList();
    renderCustomFieldsInForm();
}

// ==================== AUTHENTICATION & STRICT REAL CLOUD LOGIN ====================
function showAuthSection(section) {
    document.querySelectorAll('.auth-section').forEach(sec => sec.classList.remove('active'));
    
    if(section === 'initial') {
        const el = document.getElementById('loginInitialSelection');
        if(el) el.classList.add('active');
    } else if(section === 'manager') {
        const el = document.getElementById('managerAuthSection');
        if(el) el.classList.add('active');
    } else if(section === 'member') {
        const el = document.getElementById('memberAuthSection');
        if(el) el.classList.add('active');
        if(ghDatabase && typeof ghDatabase.generateSyncCode === 'function') {
            const defaultCode = ghDatabase.generateSyncCode(HSE_STATE.manager.ghOwner, HSE_STATE.manager.ghRepo, HSE_STATE.manager.ghToken);
            const input = document.getElementById("mbrSyncCode");
            if(input) input.value = defaultCode;
        }
    }
}
window.showAuthSection = showAuthSection;

async function handleManagerSetup(e) {
    if(e) e.preventDefault();
    const btn = e && e.target ? e.target.querySelector('button[type="submit"]') : null;
    const origBtnText = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري الاتصال وإنشاء القاعدة الحقيقية...`;

    const mgrNameEl = document.getElementById("mgrName");
    const mgrPhoneEl = document.getElementById("mgrPhone");
    const mgrUserEl = document.getElementById("mgrUser");
    const mgrPassEl = document.getElementById("mgrPass");
    const mgrOwnerEl = document.getElementById("mgrGhOwner");
    const mgrRepoEl = document.getElementById("mgrGhRepo");
    const mgrTokenEl = document.getElementById("mgrGhToken");

    if(mgrNameEl) HSE_STATE.manager.name = mgrNameEl.value;
    if(mgrPhoneEl) HSE_STATE.manager.phone = mgrPhoneEl.value;
    if(mgrUserEl) HSE_STATE.manager.username = mgrUserEl.value;
    if(mgrPassEl) HSE_STATE.manager.password = mgrPassEl.value;
    if(mgrOwnerEl) HSE_STATE.manager.ghOwner = mgrOwnerEl.value;
    if(mgrRepoEl) HSE_STATE.manager.ghRepo = mgrRepoEl.value;
    if(mgrTokenEl && mgrTokenEl.value) HSE_STATE.manager.ghToken = mgrTokenEl.value;

    if(ghDatabase) {
        ghDatabase.setCredentials(HSE_STATE.manager.ghOwner, HSE_STATE.manager.ghRepo, HSE_STATE.manager.ghToken);
        const code = ghDatabase.generateSyncCode(HSE_STATE.manager.ghOwner, HSE_STATE.manager.ghRepo, HSE_STATE.manager.ghToken);
        HSE_STATE.manager.syncCode = code;
    }

    HSE_STATE.currentRole = "manager";
    HSE_STATE.currentMember = null;

    // Real-Time Initialization on GitHub Cloud
    let notifyText = "";
    if (HSE_STATE.manager.ghToken && HSE_STATE.manager.ghOwner && HSE_STATE.manager.ghRepo) {
        const initRes = await ghDatabase.initOrSaveRealDatabase(HSE_STATE);
        if (initRes.success) {
            if (initRes.mode === 'loaded' && initRes.data) {
                HSE_STATE = initRes.data;
                HSE_STATE.currentRole = "manager";
                notifyText = "✅ تم الاتصال وتحميل قاعدة البيانات الحقيقية من مستودع GitHub بنجاح!\nكود الربط المعتمد أصبح جاهزاً للأعضاء.";
            } else {
                notifyText = "🎉 تم إنشاء واعتماد قاعدة البيانات السحابية الحقيقية (hse_db.json) على مستودع GitHub بنجاح!\nيمكن لفريقك الآن تسجيل الدخول برمز الربط.";
            }
        } else {
            notifyText = "⚠️ تم الدخول الإداري مع التنبيه:\n" + initRes.message + "\n\nيمكنك التحقق من الـ Token عبر القائمة الجانبية -> إعدادات GitHub Sync.";
        }
    } else {
        notifyText = "⚠️ تم التوجيه للوحة الإدارية. لتمكين الدخول السحابي الحقيقي للأعضاء، احرص على تدوين رمز الـ PAT Token في إعدادات GitHub من القائمة الجانبية.";
    }

    if (btn) btn.innerHTML = origBtnText;
    closeLoginPortal();
    updateSyncCodeDisplays();
    updateRoleHeadersAndUI();
    switchAppView('home');
    alert(notifyText);
    return false;
}
window.handleManagerSetup = handleManagerSetup;

/**
 * STRICT MEMBER LOGIN: Enforces real cloud DB verification and existing member credentials
 */
async function handleMemberLogin(e) {
    if(e) e.preventDefault();
    const userEl = document.getElementById("mbrUser");
    const passEl = document.getElementById("mbrPass");
    const codeEl = document.getElementById("mbrSyncCode");

    const user = userEl ? userEl.value.trim() : "";
    const pass = passEl ? passEl.value.trim() : "";
    const code = codeEl ? codeEl.value.trim() : "";

    if (!user || !pass || !code) {
        alert("❌ رفض الدخول: يرجى إدخال اسم المستخدم وكلمة المرور ورقم الربط السحابي بالكامل.");
        return false;
    }

    const btn = e && e.target ? e.target.querySelector('button[type="submit"]') : null;
    const origText = btn ? btn.innerHTML : '';
    if(btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري التحقق السحابي من قاعدة بيانات المدير...`;

    // 1. Decode & verify Sync Code format
    const applyRes = ghDatabase.applySyncCode(code);
    if (!applyRes.success) {
        if(btn) btn.innerHTML = origText;
        alert("❌ كود ربط غير صالح:\n" + applyRes.message + "\n\nيجب التزود برقم الربط السحابي المرخص من قبل مدير السلامة.");
        return false;
    }

    // 2. Fetch Real Database directly from GitHub API
    const verifyRes = await ghDatabase.verifyAndFetchRealCloudDatabase();
    if (!verifyRes.success) {
        if(btn) btn.innerHTML = origText;
        alert("❌ تم رفض تسجيل الدخول السحابي!\n\nالسبب: " + verifyRes.reason + "\n\n⚠️ تذكير: لا يمكن للأعضاء الدخول إذا لم يقم مدير السلامة باعتماد وإنشاء قاعدة البيانات الحقيقية في المستودع أولاً!");
        return false;
    }

    // 3. Update application state to the real cloud database records
    HSE_STATE = verifyRes.data;

    // 4. Strict Credential Verification in Real Database
    const member = HSE_STATE.members.find(m => (m.user === user || m.phone === user) && m.pass === pass);
    if (!member) {
        if(btn) btn.innerHTML = origText;
        alert("❌ تم رفض الدخول: بياناتك (اسم المستخدم أو كلمة المرور) غير مسجلة في قاعدة بيانات المدير السحابية الحقيقية.\n\nلا يُسمح بالدخول التلقائي! يرجى التنسيق مع مدير السلامة العام لإنشاء حسابك وإدراج اسمك أولاً عبر لوحته الإدارية.");
        return false;
    }

    // 5. Successful Authorization
    if(btn) btn.innerHTML = origText;
    HSE_STATE.currentRole = "member";
    HSE_STATE.currentMember = member;
    
    closeLoginPortal();
    updateRoleHeadersAndUI();
    switchAppView('home');
    alert(`✅ تم الدخول والاتصال بنجاح!\nأهلاً بك يا ${member.name} في قاعدة بيانات السلامة الحقيقية المجمّعة.`);
    return false;
}
window.handleMemberLogin = handleMemberLogin;

function closeLoginPortal() {
    const portal = document.getElementById("loginPortal");
    if(portal) portal.classList.add("hidden");
}
window.closeLoginPortal = closeLoginPortal;

function switchRolePortal() {
    const portal = document.getElementById("loginPortal");
    if(portal) {
        portal.classList.remove("hidden");
        showAuthSection('initial');
    }
    toggleSideDrawer(false);
}
window.switchRolePortal = switchRolePortal;

// ==================== NATIVE APP VIEW ROUTER ====================
function switchAppView(viewId) {
    document.querySelectorAll('.app-screen-view').forEach(view => {
        view.classList.remove('active');
    });
    
    const target = document.getElementById('view-' + viewId);
    if (target) {
        target.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.querySelectorAll('.app-bottom-nav .nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-view') === viewId) {
            btn.classList.add('active');
        }
    });

    if(viewId === 'new-sc' || viewId === 'ptw-list') {
        renderCustomFieldsInForm();
    }
}
window.switchAppView = switchAppView;

function toggleSideDrawer(open) {
    const drawer = document.getElementById('sideDrawer');
    const overlay = document.getElementById('drawerOverlay');
    if (open) {
        if(drawer) drawer.classList.add('open');
        if(overlay) overlay.classList.add('open');
    } else {
        if(drawer) drawer.classList.remove('open');
        if(overlay) overlay.classList.remove('open');
    }
}
window.toggleSideDrawer = toggleSideDrawer;

// ==================== MODAL HELPERS ====================
function openModal(modalId) {
    const m = document.getElementById(modalId);
    if(m) {
        m.classList.add('open');
        renderAllDynamicViews();
    }
}
window.openModal = openModal;

function closeModal(modalId) {
    const m = document.getElementById(modalId);
    if(m) m.classList.remove('open');
}
window.closeModal = closeModal;

function closeModalOnOverlay(e, modalId) {
    if (e.target && e.target.id === modalId) {
        closeModal(modalId);
    }
}
window.closeModalOnOverlay = closeModalOnOverlay;

function openMemberModal() { openModal('memberModal'); }
function openPendingSigModal() { openModal('pendingSigModal'); }
function openTasksModal() { openModal('tasksModal'); }
function openFormCustomizerModal() { openModal('formCustomizerModal'); }
function openScheduleModal() { openModal('scheduleModal'); }
function openCalendarModal() { openModal('calendarModal'); }
function openGitHubModal() { openModal('githubModal'); }

window.openMemberModal = openMemberModal;
window.openPendingSigModal = openPendingSigModal;
window.openTasksModal = openTasksModal;
window.openFormCustomizerModal = openFormCustomizerModal;
window.openScheduleModal = openScheduleModal;
window.openCalendarModal = openCalendarModal;
window.openGitHubModal = openGitHubModal;

// ==================== RENDERERS & BUSINESS LOGIC WITH REAL-TIME CLOUD COMMIT ====================
function renderAllDynamicViews() {
    renderMembers();
    renderTasksList();
    renderPendingSignatures();
    renderCustomFieldsList();
    renderCustomFieldsInForm();
    updateStatsCounters();
}

function updateStatsCounters() {
    const pendCount = HSE_STATE.pendingSignatures.length;
    const memCount = HSE_STATE.members.length;

    const sp = document.getElementById('statPendingCount');
    if(sp) sp.innerText = pendCount;
    const st = document.getElementById('statTasksCount');
    if(st) st.innerText = HSE_STATE.tasks.length;
    const sm = document.getElementById('statMembersCount');
    if(sm) sm.innerText = memCount + 1;

    const pBadge = document.getElementById('pendingSigCount');
    if(pBadge) pBadge.innerText = pendCount;
    const mBadge = document.getElementById('memberCountBadge');
    if(mBadge) mBadge.innerText = memCount;
}

// 1. MEMBERS LIST & ENCRYPTED SYNC CODES
function renderMembers() {
    const cont = document.getElementById('membersListTable');
    const select1 = document.getElementById('taskTargetMember');
    const select2 = document.getElementById('scheduleTargetMember');
    if(!cont) return;

    cont.innerHTML = '';
    if(select1) select1.innerHTML = '';
    if(select2) select2.innerHTML = '';

    const adminSyncCode = HSE_STATE.manager.syncCode || ghDatabase.generateSyncCode();

    HSE_STATE.members.forEach((mem, index) => {
        const syncChip = adminSyncCode;
        
        const item = document.createElement('div');
        item.className = 'member-item-card';
        item.innerHTML = `
            <div class="member-text">
                <h5><i class="fa-solid fa-user text-primary"></i> ${mem.name}</h5>
                <span class="text-xs text-secondary d-block"><i class="fa-solid fa-phone"></i> ${mem.phone} | <i class="fa-solid fa-user-tag"></i> ${mem.user} | كلمة المرور: <strong>${mem.pass}</strong></span>
                <div class="sync-badge-chip" onclick="copySyncCode('${syncChip}')" title="انقر لنسخ كود الربط المشترك">
                    <i class="fa-solid fa-cloud"></i> كود الربط المعتمد: ${syncChip.substring(0, 26)}... <i class="fa-regular fa-copy ms-1"></i>
                </div>
            </div>
            <div class="member-actions">
                ${HSE_STATE.currentRole === "manager" ? `<button type="button" class="btn btn-sm btn-secondary text-danger" onclick="deleteMember(${index})"><i class="fa-solid fa-trash"></i></button>` : ``}
            </div>
        `;
        cont.appendChild(item);

        if(select1) {
            const opt1 = document.createElement('option');
            opt1.value = mem.name;
            opt1.innerText = mem.name;
            select1.appendChild(opt1);
        }
        if(select2) {
            const opt2 = document.createElement('option');
            opt2.value = mem.name;
            opt2.innerText = mem.name;
            select2.appendChild(opt2);
        }
    });
}
window.renderMembers = renderMembers;

function copySyncCode(code) {
    if(navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code);
    }
    alert("تم نسخ رقم الربط السحابي بالكامل:\n" + code + "\n\nأرسله لأعضاء فريقك ليتمكنوا من دخول قاعدة بيانات السلامة الخاصة بك!");
}
window.copySyncCode = copySyncCode;

async function handleAddNewMember(e) {
    e.preventDefault();
    const name = document.getElementById('newMemberName').value.trim();
    const user = document.getElementById('newMemberUser').value.trim();
    const phone = document.getElementById('newMemberPhone').value.trim();
    const pass = document.getElementById('newMemberPass').value.trim();

    const sharedCode = HSE_STATE.manager.syncCode || ghDatabase.generateSyncCode();

    HSE_STATE.members.push({
        id: "M" + (HSE_STATE.members.length + 1),
        name, user, phone, pass,
        syncCode: sharedCode
    });

    document.getElementById('addMemberForm').reset();
    renderAllDynamicViews();
    await commitStateToCloud("إضافة العضو الميداني: " + name);
    alert(`✅ تم إنشاء حساب العضو (${name}) ورفعه مباشرة لقاعدة البيانات السحابية الحقيقية في GitHub!`);
}
window.handleAddNewMember = handleAddNewMember;

async function deleteMember(idx) {
    const memName = HSE_STATE.members[idx] ? HSE_STATE.members[idx].name : "";
    if(confirm("هل أنت متأكد من رغبتك في حذف هذا العضو وسحب صلاحية دخوله من السحابة؟")) {
        HSE_STATE.members.splice(idx, 1);
        renderAllDynamicViews();
        await commitStateToCloud("حذف العضو الميداني: " + memName);
        alert("تم الحذف وتحديث قاعدة البيانات السحابية بنجاح.");
    }
}
window.deleteMember = deleteMember;

// 2. TASKS WORKFLOW
function renderTasksList() {
    const box = document.getElementById('tasksMonitoringList');
    if(!box) return;
    box.innerHTML = '';

    const isMgr = HSE_STATE.currentRole === "manager";
    const memName = HSE_STATE.currentMember ? HSE_STATE.currentMember.name : "";

    const tasksToShow = isMgr ? HSE_STATE.tasks : HSE_STATE.tasks.filter(t => t.assignedTo === memName || t.assignedTo === "الكل");

    if(tasksToShow.length === 0) {
        box.innerHTML = `<div class="p-3 text-center text-secondary"><i class="fa-solid fa-list-check"></i> لا توجد مهام موجهة حالياً.</div>`;
        return;
    }

    tasksToShow.forEach(tsk => {
        const div = document.createElement('div');
        div.className = 'sc-app-card mb-2';
        div.innerHTML = `
            <div class="sc-top-bar">
                <span class="code">#${tsk.id}</span>
                <span class="status-pill ${tsk.status === 'completed' ? 'green' : 'orange'}">
                    <i class="fa-solid ${tsk.status === 'completed' ? 'fa-check' : 'fa-clock'}"></i> ${tsk.status === 'completed' ? 'تم الإنجاز' : 'بانتظار التنفيذ'}
                </span>
            </div>
            <h3 class="font-bold my-1">${tsk.title}</h3>
            <div class="meta-grid text-sm text-secondary">
                <div><i class="fa-solid fa-user-check text-primary"></i> الموجه إليه: <strong>${tsk.assignedTo}</strong></div>
                <div><i class="fa-solid fa-calendar"></i> الموعد: ${tsk.dueDate}</div>
            </div>
            ${tsk.report ? `
                <div class="report-box p-2 my-2 rounded text-sm" style="background: var(--bg-main); border-right: 3px solid var(--success-color);">
                    <strong class="text-success"><i class="fa-solid fa-file-contract"></i> تقرير إنجاز المهمة العائد من الميدان:</strong>
                    <p class="mb-0 mt-1">${tsk.report}</p>
                </div>
            ` : ''}
            <div class="sc-actions mt-2">
                ${!isMgr && tsk.status !== 'completed' ? `
                    <button type="button" class="pure-green-btn btn-sm" onclick="openTaskReportModal('${tsk.id}')"><i class="fa-solid fa-paper-plane"></i> رفع تقرير إنجاز المهمة</button>
                ` : ''}
                ${isMgr && tsk.status === 'completed' ? `
                    <button type="button" class="btn btn-sm btn-secondary" onclick="alert('تم مراجعة التقرير والمصادقة عليه بنجاح')"><i class="fa-solid fa-thumbs-up"></i> اعتماد التقرير</button>
                ` : ''}
            </div>
        `;
        box.appendChild(div);
    });
}

async function handleAssignTask(e) {
    e.preventDefault();
    const title = document.getElementById("taskDescInput").value.trim();
    const assignedTo = document.getElementById("taskTargetMember").value;
    const dueDate = document.getElementById("taskDueDate").value;

    HSE_STATE.tasks.unshift({
        id: "TSK-" + Math.floor(100 + Math.random() * 900),
        title, assignedTo, dueDate,
        status: "pending",
        report: null
    });

    document.getElementById("assignTaskForm").reset();
    renderAllDynamicViews();
    await commitStateToCloud("توجيه مهمة جديدة: " + title);
    alert("تم توجيه المهمة ورفعها فوراً لقاعدة بيانات GitHub السحابية.");
}
window.handleAssignTask = handleAssignTask;

function openTaskReportModal(tskId) {
    const t = HSE_STATE.tasks.find(i => i.id === tskId);
    if(!t) return;
    document.getElementById("activeReportTaskId").value = tskId;
    document.getElementById("reportTaskTitleDisplay").innerText = `المهمة المستهدفة: ${t.title}`;
    openModal("taskReportModal");
}
window.openTaskReportModal = openTaskReportModal;

async function handleTaskReportSubmit(e) {
    e.preventDefault();
    const tId = document.getElementById("activeReportTaskId").value;
    const notes = document.getElementById("taskReportNotes").value.trim();
    
    const target = HSE_STATE.tasks.find(i => i.id === tId);
    if(target) {
        target.status = "completed";
        target.report = notes;
    }
    closeModal("taskReportModal");
    renderAllDynamicViews();
    await commitStateToCloud("إنجاز المهمة الميدانية: " + tId);
    alert("✅ تم إرسال وتوثيق تقرير الإنجاز في قاعدة البيانات السحابية الحقيقية بنجاح!");
}
window.handleTaskReportSubmit = handleTaskReportSubmit;

// 3. PENDING SIGNATURES QUEUE
function renderPendingSignatures() {
    const list = document.getElementById('pendingSigQueueList');
    if(!list) return;
    list.innerHTML = '';

    if(HSE_STATE.pendingSignatures.length === 0) {
        list.innerHTML = `<div class="p-4 text-center text-secondary"><i class="fa-solid fa-circle-check"></i> لا توجد استمارات معلقة بانتظار التوقيع حالياً.</div>`;
        return;
    }

    HSE_STATE.pendingSignatures.forEach(item => {
        const card = document.createElement('div');
        card.className = 'sc-app-card mb-2';
        card.innerHTML = `
            <div class="sc-top-bar">
                <span class="code">#${item.id} (${item.type})</span>
                <span class="status-pill orange"><i class="fa-solid fa-clock"></i> يتطلب توقيع المدير</span>
            </div>
            <h3 class="font-bold my-1">${item.title}</h3>
            <div class="meta-grid text-sm text-secondary">
                <div><i class="fa-solid fa-user"></i> المنشئ: ${item.author}</div>
                <div><i class="fa-solid fa-calendar-day"></i> التاريخ: ${item.date}</div>
            </div>
            <div class="sc-actions mt-2">
                ${HSE_STATE.currentRole === "manager" ? `
                    <button type="button" class="pure-green-btn btn-sm" onclick="openSignatureModal('${item.id}')"><i class="fa-solid fa-signature"></i> التوقيع الإلكتروني للاعتماد</button>
                ` : `
                    <span class="text-xs text-warning font-bold"><i class="fa-solid fa-hourglass-half"></i> تم الرفع للسحابة الحقيقية، بانتظار التوقيع</span>
                `}
            </div>
        `;
        list.appendChild(card);
    });
}
window.renderPendingSignatures = renderPendingSignatures;

// 4. DIGITAL SIGNATURE PAD
function initSigPad() {
    const canvas = document.getElementById("sigCanvas");
    if(!canvas) return;
    const ctx = canvas.getContext("2d");
    let isDrawing = false;

    const startDraw = (x, y) => { isDrawing = true; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineWidth = 3; ctx.strokeStyle = "#059669"; };
    const doDraw = (x, y) => { if(!isDrawing) return; ctx.lineTo(x, y); ctx.stroke(); };
    const endDraw = () => { isDrawing = false; };

    canvas.addEventListener("mousedown", (e) => startDraw(e.offsetX, e.offsetY));
    canvas.addEventListener("mousemove", (e) => doDraw(e.offsetX, e.offsetY));
    canvas.addEventListener("mouseup", endDraw);
    canvas.addEventListener("mouseleave", endDraw);

    canvas.addEventListener("touchstart", (e) => {
        const rect = canvas.getBoundingClientRect();
        startDraw(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
        e.preventDefault();
    }, {passive: false});
    canvas.addEventListener("touchmove", (e) => {
        const rect = canvas.getBoundingClientRect();
        doDraw(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
        e.preventDefault();
    }, {passive: false});
    canvas.addEventListener("touchend", endDraw);
}

function clearSignature() {
    const canvas = document.getElementById("sigCanvas");
    if(canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}
window.clearSignature = clearSignature;

function openSignatureModal(docId) {
    if (HSE_STATE.currentRole !== "manager") {
        alert("التوقيع الرقمي النهائي والاعتماد من صلاحيات مدير السلامة العام فقط.");
        return;
    }
    currentSigDocId = docId;
    document.getElementById("sigTargetDocTitle").innerText = `وثيقة الاعتماد: #${docId}`;
    clearSignature();
    closeModal("pendingSigModal");
    openModal("sigModal");
}
window.openSignatureModal = openSignatureModal;

async function saveSignature() {
    if(!currentSigDocId) return;
    
    HSE_STATE.pendingSignatures = HSE_STATE.pendingSignatures.filter(i => i.id !== currentSigDocId);
    
    if (currentSigDocId === "PTW-2024-015") {
        const sEl = document.getElementById("managerSigStamp");
        const nEl = document.getElementById("managerSigName");
        const stEl = document.getElementById("ptwDocStatus");
        if(nEl) nEl.innerText = HSE_STATE.manager.name;
        if(sEl) {
            sEl.className = "sig-stamp green-font";
            sEl.innerHTML = `Approved (${new Date().toLocaleDateString()})`;
        }
        if(stEl) {
            stEl.className = "status-pill green";
            stEl.innerHTML = `<i class="fa-solid fa-check"></i> تم الاعتماد السحابي النهائي`;
        }
    }

    closeModal("sigModal");
    renderAllDynamicViews();
    await commitStateToCloud("التوقيع الإلكتروني واعتماد الوثيقة: " + currentSigDocId);
    alert("✅ تم التوقيع الإلكتروني وحفظ الاعتماد مباشرة في قاعدة بيانات GitHub الحقيقية!");
}
window.saveSignature = saveSignature;

// 5. FORM CUSTOMIZER (DYNAMIC FIELDS)
function renderCustomFieldsList() {
    const target = document.getElementById("customFormTarget") ? document.getElementById("customFormTarget").value : "sc";
    const box = document.getElementById("customFieldsListContainer");
    if(!box) return;

    box.innerHTML = '';
    const fields = HSE_STATE.customFields[target] || [];

    if(fields.length === 0) {
        box.innerHTML = `<span class="text-secondary text-sm"><i class="fa-solid fa-tag"></i> لم يقم المدير بإضافة حقول مخصصة لهذه الاستمارة بعد.</span>`;
        return;
    }

    fields.forEach((f, idx) => {
        const tag = document.createElement('div');
        tag.className = 'tab-item me-2 mb-2 active';
        tag.style.padding = '6px 10px';
        tag.style.borderRadius = '20px';
        tag.style.background = 'var(--primary-light)';
        tag.style.border = '1px solid var(--primary-border)';
        tag.style.display = 'inline-flex';
        tag.style.alignItems = 'center';
        tag.innerHTML = `<span><i class="fa-solid fa-tag"></i> ${f.name} (${f.type})</span>
            ${HSE_STATE.currentRole === 'manager' ? `<i class="fa-solid fa-trash text-danger ms-2 cursor-pointer" onclick="deleteCustomField('${target}', ${idx})"></i>` : ''}`;
        box.appendChild(tag);
    });
}
window.renderCustomFieldsList = renderCustomFieldsList;

async function addCustomFieldToForm() {
    const nameInput = document.getElementById("customFieldName");
    const typeSelect = document.getElementById("customFieldType");
    const target = document.getElementById("customFormTarget").value;

    if(!nameInput || !nameInput.value.trim()) {
        alert("يرجى كتابة اسم الحقل أو الكلمة المطلوب إدراجها.");
        return;
    }

    HSE_STATE.customFields[target].push({
        id: "CF-" + Math.floor(10 + Math.random()*90),
        name: nameInput.value.trim(),
        type: typeSelect ? typeSelect.value : "text"
    });

    nameInput.value = '';
    renderCustomFieldsList();
    renderCustomFieldsInForm();
    await commitStateToCloud("إضافة حقل مخصص للاستمارة: " + target);
    alert("✅ تم إدراج الحقل ورفعه لقاعدة البيانات الحقيقية؛ سيظهر الآن لدى جميع أعضاء الفريق!");
}
window.addCustomFieldToForm = addCustomFieldToForm;

async function deleteCustomField(target, idx) {
    HSE_STATE.customFields[target].splice(idx, 1);
    renderCustomFieldsList();
    renderCustomFieldsInForm();
    await commitStateToCloud("حذف حقل مخصص من الاستمارة");
}
window.deleteCustomField = deleteCustomField;

function renderCustomFieldsInForm() {
    const box = document.getElementById("nativeCustomFieldsBox");
    if(!box) return;
    box.innerHTML = '';

    const scFields = HSE_STATE.customFields.sc || [];
    if(scFields.length === 0) return;

    const header = document.createElement("h5");
    header.className = "text-primary my-2 text-sm font-bold";
    header.innerHTML = `<i class="fa-solid fa-sliders"></i> حقول إضافية مخصصة من المدير:`;
    box.appendChild(header);

    scFields.forEach(f => {
        const g = document.createElement("div");
        g.className = "form-group";
        if(f.type === "checkbox") {
            g.innerHTML = `<label style="display:flex; align-items:center; gap:8px; font-weight:700;"><input type="checkbox" style="width:20px; height:20px; min-height:0;"> <span>${f.name}</span></label>`;
        } else if(f.type === "textarea") {
            g.innerHTML = `<label><i class="fa-solid fa-tag text-primary"></i> ${f.name}</label><textarea rows="2" class="form-control" placeholder="أدخل بيانات ${f.name}..."></textarea>`;
        } else {
            g.innerHTML = `<label><i class="fa-solid fa-tag text-primary"></i> ${f.name}</label><input type="text" class="form-control" placeholder="${f.name}...">`;
        }
        box.appendChild(g);
    });
}
window.renderCustomFieldsInForm = renderCustomFieldsInForm;

// 6. SCHEDULER & SETTINGS
function toggleAssigneeSelect(show) {
    const g = document.getElementById("targetAssigneeGroup");
    if(g) g.style.display = show ? "block" : "none";
}
window.toggleAssigneeSelect = toggleAssigneeSelect;

async function saveScheduleSettings(e) {
    e.preventDefault();
    const freqEl = document.querySelector('input[name="checkinFrequency"]:checked');
    const modeEl = document.querySelector('input[name="assignMode"]:checked');
    const mem = document.getElementById("scheduleTargetMember") ? document.getElementById("scheduleTargetMember").value : null;

    if(freqEl) {
        HSE_STATE.schedule = { frequency: freqEl.value, assignMode: modeEl ? modeEl.value : "free", targetMember: mem };
    }
    closeModal("scheduleModal");
    await commitStateToCloud("ضبط إعدادات جدولة السلامة");
    alert("✅ تم حفظ وضبط إعدادات الجدولة في قاعدة البيانات السحابية بنجاح!");
}
window.saveScheduleSettings = saveScheduleSettings;

async function handleNewSCSubmit(e) {
    e.preventDefault();
    const title = document.getElementById("newScTitle").value;
    const newId = "SC-2024-" + Math.floor(1000 + Math.random()*9000);

    HSE_STATE.pendingSignatures.unshift({
        id: newId, type: "SC Report", title,
        author: HSE_STATE.currentRole === "manager" ? HSE_STATE.manager.name : (HSE_STATE.currentMember ? HSE_STATE.currentMember.name : "عضو"),
        date: new Date().toISOString().split('T')[0],
        priority: document.getElementById("newScPrio").value
    });

    const cont = document.getElementById("scReportsContainer");
    if(cont) {
        const card = document.createElement("div");
        card.className = "sc-app-card";
        card.innerHTML = `
            <div class="sc-top-bar">
                <span class="code">#${newId}</span>
                <span class="status-pill orange"><i class="fa-solid fa-clock"></i> بانتظار اعتماد المدير</span>
            </div>
            <h3>${title}</h3>
            <div class="meta-grid">
                <div><i class="fa-regular fa-clock"></i> ${new Date().toLocaleDateString()}</div>
                <div><i class="fa-regular fa-user"></i> المنشئ: ${HSE_STATE.currentRole === "manager" ? HSE_STATE.manager.name : (HSE_STATE.currentMember ? HSE_STATE.currentMember.name : "عضو")}</div>
                <div><i class="fa-solid fa-location-dot"></i> الموقع: ${document.getElementById("newScLoc").value}</div>
            </div>
            <div class="sc-actions">
                <button type="button" class="pure-green-btn btn-sm" onclick="openSignatureModal('${newId}')"><i class="fa-solid fa-signature"></i> التوقيع الإلكتروني للاعتماد</button>
            </div>
        `;
        cont.prepend(card);
    }

    document.getElementById("nativeSCForm").reset();
    renderAllDynamicViews();
    switchAppView("sc-reports");
    await commitStateToCloud("تقديم بلاغ السلامة الميداني: " + newId);
    alert("✅ تم تقديم البلاغ وتخزينه فوراً في قاعدة بيانات GitHub الحقيقية ليطلع عليه المدير!");
}
window.handleNewSCSubmit = handleNewSCSubmit;

// 7. CALENDAR ENGINE
function renderCalendar(dateObj) {
    const cont = document.getElementById("daysGridContainer");
    const label = document.getElementById("calendarMonthYearDisplay");
    const evList = document.getElementById("monthEventsList");
    if(!cont) return;

    cont.innerHTML = '';
    if(evList) evList.innerHTML = '';

    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    if(label) label.innerText = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for(let i=0; i<firstDay; i++) {
        cont.appendChild(document.createElement("div"));
    }

    for(let day=1; day<=daysInMonth; day++) {
        const cell = document.createElement("div");
        cell.className = "day-cell";
        cell.innerHTML = `<span>${day}</span>`;
        if(day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear()) {
            cell.classList.add("today");
        }
        cont.appendChild(cell);
    }

    HSE_STATE.calendarEvents.forEach(ev => {
        if(evList) {
            const row = document.createElement("div");
            row.className = "tab-item d-block mb-1 w-100 p-2";
            row.innerHTML = `<i class="fa-solid fa-calendar-check text-primary me-2"></i> <strong>${ev.title}</strong> - <small>${ev.date}</small>`;
            evList.appendChild(row);
        }
    });
}
window.renderCalendar = renderCalendar;

function navigateMonth(diff) {
    HSE_STATE.currentDate.setMonth(HSE_STATE.currentDate.getMonth() + diff);
    renderCalendar(HSE_STATE.currentDate);
}
window.navigateMonth = navigateMonth;

async function handleAddCalendarEvent(e) {
    e.preventDefault();
    HSE_STATE.calendarEvents.push({
        id: "EV-" + Math.floor(10 + Math.random()*90),
        title: document.getElementById("eventTitle").value,
        date: document.getElementById("eventDate").value,
        type: document.getElementById("eventType") ? document.getElementById("eventType").value : "general"
    });
    document.getElementById("addEventForm").reset();
    renderCalendar(HSE_STATE.currentDate);
    await commitStateToCloud("إضافة مناسبة بالتقويم");
    alert("✅ تم إدراج الموعد وحفظه في قاعدة البيانات السحابية الحقيقية بنجاح!");
}
window.handleAddCalendarEvent = handleAddCalendarEvent;

// 8. CHAT ENGINE & MISC
async function handleSendChatMessage(e) {
    e.preventDefault();
    const input = document.getElementById("chatInputText");
    const box = document.getElementById("chatMessagesBox");
    if(!input || !input.value.trim() || !box) return;

    const msgDiv = document.createElement("div");
    msgDiv.className = "message sent";
    const senderName = HSE_STATE.currentRole === "manager" ? HSE_STATE.manager.name : (HSE_STATE.currentMember ? HSE_STATE.currentMember.name : "عضو");
    
    msgDiv.innerHTML = `
        <span class="sender" style="display:block; font-weight:800; font-size:11px;">${senderName}:</span>
        <p style="margin:2px 0;">${input.value.trim()}</p>
        <span class="time" style="font-size:10px; opacity:0.8; display:block; text-align:left;"><i class="fa-solid fa-check-double"></i> ${new Date().toLocaleTimeString('ar-SA', {hour: '2-digit', minute:'2-digit'})}</span>
    `;
    box.appendChild(msgDiv);
    const textStr = input.value.trim();
    input.value = '';
    box.scrollTop = box.scrollHeight;
    
    // Auto sync message
    await commitStateToCloud("إرسال رسالة بغرفة العمليات من: " + senderName);
}
window.handleSendChatMessage = handleSendChatMessage;

function triggerEmergencyCall() {
    alert("🚨 تنبيه طوارئ فوري: سيتم الاتصال المباشر بإدارة الطوارئ ومشاركة الموقع!");
}
window.triggerEmergencyCall = triggerEmergencyCall;

function toggleTheme() {
    document.body.classList.toggle('dark-theme');
}
window.toggleTheme = toggleTheme;

async function saveGitHubConfig(e) {
    e.preventDefault();
    HSE_STATE.manager.ghOwner = document.getElementById("ghOwnerInput").value.trim();
    HSE_STATE.manager.ghRepo = document.getElementById("ghRepoInput").value.trim();
    const tkn = document.getElementById("ghTokenInput").value.trim();
    if(tkn) HSE_STATE.manager.ghToken = tkn;

    if(ghDatabase) {
        ghDatabase.setCredentials(HSE_STATE.manager.ghOwner, HSE_STATE.manager.ghRepo, HSE_STATE.manager.ghToken);
        const code = ghDatabase.generateSyncCode(HSE_STATE.manager.ghOwner, HSE_STATE.manager.ghRepo, HSE_STATE.manager.ghToken);
        HSE_STATE.manager.syncCode = code;
    }
    
    updateSyncCodeDisplays();
    closeModal("githubModal");
    
    // Perform real database initialization and check
    const initRes = await ghDatabase.initOrSaveRealDatabase(HSE_STATE);
    if(initRes.success) {
        alert("✅ تم التوثيق وإنشاء/تحميل قاعدة البيانات الحقيقية (hse_db.json) على GitHub بنجاح!\nكود الربط السحابي المحدث أصبح فعالاً لجميع الأعضاء.");
    } else {
        alert("⚠️ تم حفظ البيانات محلياً، ولكن تعذر إنشاء القاعدة على GitHub:\n" + initRes.message);
    }
}
window.saveGitHubConfig = saveGitHubConfig;
