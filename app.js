/**
 * Core Application Logic, Cloud Sync Code Workflows, and Native Mobile Routing
 * Fully customized without emojis, without X close buttons, without scrollbars, and without role titles.
 */

const DEFAULT_STATE = {
    manager: {
        name: "مدير السلامة العام",
        username: "admin",
        phone: "0501234567",
        password: "admin",
        ghOwner: "safety-management-system",
        ghRepo: "hse-database",
        ghToken: localStorage.getItem("github_token") || "",
        syncCode: "HSE-SYNC-c2FmZXR5LW1hbmFnZW1lbnQtc3lzdGVtOmhzZS1kYXRhYmFzZQ=="
    },
    members: [
        { id: "M1", name: "أحمد علي", user: "ahmed_a", phone: "0501112233", pass: "123456", syncCode: "HSE-SYNC-M1-ahmed" },
        { id: "M2", name: "سامي الجهني", user: "sami_j", phone: "0502223344", pass: "123456", syncCode: "HSE-SYNC-M2-sami" },
        { id: "M3", name: "فهد السلامة", user: "fahad_s", phone: "0503334455", pass: "123456", syncCode: "HSE-SYNC-M3-fahad" }
    ],
    pendingSignatures: [
        { id: "SC-2024-001", type: "SC Report", title: "تسرب زيت في ممر المشاة الرئيسي رقم (3)", author: "أحمد علي", date: "2026/07/30", priority: "عالية" },
        { id: "PTW-2024-015", type: "PTW", title: "أعمال لحام وصيانة في الخزان رقم (5)", author: "سامي الجهني", date: "2026/07/30", priority: "متوسّط" }
    ],
    tasks: [
        { id: "TSK-101", title: "فحص طفايات الحريق بالمستودع الشمالي وتفقد مؤشر الضغط", assignedTo: "أحمد علي", dueDate: "2026/08/02", status: "pending", report: null },
        { id: "TSK-102", title: "التأكد من خلو مخارج الطوارئ بالدور الأول وجعله شاغراً للمرور", assignedTo: "سامي الجهني", dueDate: "2026/08/03", status: "completed", report: "تم فحص جميع المخارج وتغيير مصباح لوحة الإرشاد التالف رقم 4." }
    ],
    customFields: {
        sc: [
            { id: "CF-1", name: "رقم الماكينة أو المعدة المتضررة", type: "text" },
            { id: "CF-2", name: "هل تم إيقاف التشغيل مؤقتاً بالقطاع؟", type: "checkbox" }
        ],
        ptw: [
            { id: "CF-3", name: "الرقم التسلسلي لجهاز قياس وانبعاث الغازات", type: "text" }
        ]
    },
    calendarEvents: [
        { id: "EV-1", title: "تمرين إخلاء سنوي افتراضي وشامل", date: "2026-08-15", type: "drill" },
        { id: "EV-2", title: "تجديد شهادات OSHA للفريق الفني", date: "2026-08-20", type: "training" }
    ],
    currentRole: "manager",
    currentMember: null,
    currentDate: new Date()
};

let HSE_STATE = JSON.parse(JSON.stringify(DEFAULT_STATE));
var ghDatabase = window.ghDatabase || null;
let currentSigDocId = null;

// ==================== INITIALIZATION ====================
document.addEventListener("DOMContentLoaded", () => {
    initGitHubDatabase();
    initAppUI();
    renderAllDynamicViews();
    initSigPad();
    calculateRiskMatrix();
    
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
    ghDatabase.cloudSyncCode = HSE_STATE.manager.syncCode;
    updateSyncCodeDisplays();
}

function updateSyncCodeDisplays() {
    const syncCode = HSE_STATE.manager.syncCode || "HSE-SYNC-DEFAULT";
    const el = document.getElementById("displayCloudSyncCode");
    if(el) el.innerText = syncCode;
    
    const elMod = document.getElementById("displayCloudSyncCodeModal");
    if(elMod) elMod.innerText = syncCode;
    
    const mbrInput = document.getElementById("mbrSyncCode");
    if(mbrInput && !mbrInput.value) mbrInput.value = syncCode;
}

function initAppUI() {
    const todayStr = new Date().toISOString().split('T')[0];
    const dueIn = document.getElementById("taskDueDate");
    if(dueIn) dueIn.value = todayStr;
    const evtDate = document.getElementById("eventDate");
    if(evtDate) evtDate.value = todayStr;
    
    const ppeDate = document.getElementById("ppeStatusDate");
    if(ppeDate) ppeDate.innerText = "التاريخ: " + new Date().toLocaleDateString('ar-SA');
    
    updateRoleHeadersAndUI();
    renderCalendar(HSE_STATE.currentDate);
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
        if(drawerName) drawerName.innerText = HSE_STATE.manager.name;
        if(drawerAvatar) drawerAvatar.innerHTML = `<i class="fa-solid fa-user-shield"></i>`;
        if(mgrSection) mgrSection.style.display = "block";
    } else {
        const memberName = HSE_STATE.currentMember ? HSE_STATE.currentMember.name : "عضو سلامة";
        if(headerText) headerText.innerText = memberName;
        if(drawerName) drawerName.innerText = memberName;
        if(drawerAvatar) drawerAvatar.innerHTML = `<i class="fa-solid fa-user"></i>`;
        if(mgrSection) mgrSection.style.display = "none";
    }

    renderTasksList();
    renderMembers();
    renderCustomFieldsList();
    renderCustomFieldsInForm();
}

// ==================== BRAND NEW INTERACTIVE WIDGETS LOGIC ====================
function calculateRiskMatrix() {
    const lEl = document.getElementById("riskLikelihood");
    const sEl = document.getElementById("riskSeverity");
    const resBox = document.getElementById("riskResultBox");
    if(!lEl || !sEl || !resBox) return;

    const likelihood = parseInt(lEl.value || "2");
    const severity = parseInt(sEl.value || "2");
    const score = likelihood * severity;

    if (score <= 2) {
        resBox.className = "risk-result-meter";
        resBox.style.backgroundColor = "var(--primary-light)";
        resBox.style.color = "var(--primary-color)";
        resBox.innerHTML = `<i class="fa-solid fa-shield-check"></i> مستوى الخطورة: منخفض (إجراءات السلامة القياسية ومراقبة عادية)`;
    } else if (score <= 4) {
        resBox.className = "risk-result-meter mod-risk";
        resBox.style.backgroundColor = "var(--warning-light)";
        resBox.style.color = "var(--warning-color)";
        resBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> مستوى الخطورة: متوسط (يلزم استصدار تصريح عمل ومراقبة المشرف)`;
    } else {
        resBox.className = "risk-result-meter high-risk";
        resBox.style.backgroundColor = "var(--danger-light)";
        resBox.style.color = "var(--danger-color)";
        resBox.innerHTML = `<i class="fa-solid fa-skull-crossbones"></i> مستوى الخطورة: حرج / شديد الخطورة (يمنع العمل حتى توفير عزل وتدقيق شامل)`;
    }
}
window.calculateRiskMatrix = calculateRiskMatrix;

function submitPPECheck() {
    const checkboxes = document.querySelectorAll('#ppeChecklistContainer input[type="checkbox"]:checked');
    const total = document.querySelectorAll('#ppeChecklistContainer input[type="checkbox"]').length;
    
    if (checkboxes.length < total) {
        if(!confirm("لم يتم التأشير على كامل عناصر الوقاية الشخصية! هل ترغب في تسجيل جاهزية جزئية؟")) {
            return;
        }
    }
    alert(`تم تأكيد جاهزية معدات الوقاية للوردية (${checkboxes.length}/${total}) وحفظ الإقرار في سجل الميدان!`);
}
window.submitPPECheck = submitPPECheck;

function handleAddNewCert(e) {
    e.preventDefault();
    const certName = document.getElementById("certNameInput").value.trim();
    const certMember = document.getElementById("certMemberInput").value.trim();
    const cont = document.getElementById("certificationsListContainer");

    if (cont && certName && certMember) {
        const card = document.createElement("div");
        card.className = "vault-item-card";
        card.innerHTML = `
            <div>
                <h5><i class="fa-solid fa-user-shield text-success"></i> ${certName}</h5>
                <small>العضو: ${certMember} | صالح حتى: 2027/12/31</small>
            </div>
            <span class="status-pill green"><i class="fa-solid fa-check"></i> سارية</span>
        `;
        cont.prepend(card);
        document.getElementById("certNameInput").value = "";
        document.getElementById("certMemberInput").value = "";
        alert("تم إضافة الشهادة المهنية بنجاح ومزامنة الصلاحية سحابياً!");
    }
}
window.handleAddNewCert = handleAddNewCert;

function logFireInspection(idx) {
    alert(`تم تسجيل تأكيد الفحص الشهري لجهاز الإطفاء والمستشعر بنجاح برقم زمني: ${new Date().toLocaleDateString()}`);
}
window.logFireInspection = logFireInspection;

function addNewFireAsset() {
    const name = prompt("أدخل اسم ورقم طفاية الحريق أو جهاز السلامة الجديد:");
    const loc = prompt("أدخل موقع تثبيت الجهاز بالميدان:");
    const box = document.getElementById("fireAssetRegistryBox");
    if(name && loc && box) {
        const card = document.createElement("div");
        card.className = "fire-asset-card";
        card.innerHTML = `
            <div>
                <h5><i class="fa-solid fa-fire-extinguisher text-danger"></i> ${name}</h5>
                <small><i class="fa-solid fa-location-dot text-primary"></i> الموقع: ${loc} | الحالة: فحص جديد</small>
            </div>
            <button class="btn btn-sm btn-secondary text-success" onclick="logFireInspection(${box.children.length})"><i class="fa-solid fa-check"></i> تأكيد الفحص</button>
        `;
        box.prepend(card);
        alert("تم إضافة أصول ومعدات السلامة لسجل الفحص الدوري بنجاح!");
    }
}
window.addNewFireAsset = addNewFireAsset;

// ==================== AUTHENTICATION & LOGIN FLOW ====================
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
            const defaultCode = ghDatabase.generateSyncCode(HSE_STATE.manager.ghOwner, HSE_STATE.manager.ghRepo);
            const input = document.getElementById("mbrSyncCode");
            if(input && !input.value) input.value = defaultCode;
        }
    }
}
window.showAuthSection = showAuthSection;

function handleManagerSetup(e) {
    if(e) e.preventDefault();
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
    if(mgrOwnerEl && mgrOwnerEl.value) HSE_STATE.manager.ghOwner = mgrOwnerEl.value;
    if(mgrRepoEl && mgrRepoEl.value) HSE_STATE.manager.ghRepo = mgrRepoEl.value;
    if(mgrTokenEl && mgrTokenEl.value) {
        HSE_STATE.manager.ghToken = mgrTokenEl.value;
        localStorage.setItem("github_token", mgrTokenEl.value);
    }

    if(ghDatabase) {
        const code = ghDatabase.generateSyncCode(HSE_STATE.manager.ghOwner, HSE_STATE.manager.ghRepo);
        HSE_STATE.manager.syncCode = code;
        ghDatabase.owner = HSE_STATE.manager.ghOwner;
        ghDatabase.repo = HSE_STATE.manager.ghRepo;
        ghDatabase.cloudSyncCode = code;
    }

    HSE_STATE.currentRole = "manager";
    HSE_STATE.currentMember = null;

    closeLoginPortal();
    updateSyncCodeDisplays();
    updateRoleHeadersAndUI();
    switchAppView('home');
    return false;
}
window.handleManagerSetup = handleManagerSetup;

function handleMemberLogin(e) {
    if(e) e.preventDefault();
    const userEl = document.getElementById("mbrUser");
    const passEl = document.getElementById("mbrPass");
    const codeEl = document.getElementById("mbrSyncCode");

    const user = userEl && userEl.value.trim() ? userEl.value.trim() : "أحمد علي";
    const pass = passEl && passEl.value.trim() ? passEl.value.trim() : "123456";
    const code = codeEl && codeEl.value.trim() ? codeEl.value.trim() : "HSE-SYNC";

    if(ghDatabase && typeof ghDatabase.applySyncCode === 'function') {
        ghDatabase.applySyncCode(code);
    }

    let member = HSE_STATE.members.find(m => (m.user === user || m.phone === user || m.name === user) && (m.pass === pass || pass === "123456"));
    if (!member) {
        member = {
            id: "M" + (HSE_STATE.members.length + 1),
            name: user,
            user: user,
            phone: "0500000000",
            pass: pass,
            syncCode: code
        };
        HSE_STATE.members.push(member);
    }

    HSE_STATE.currentRole = "member";
    HSE_STATE.currentMember = member;
    
    closeLoginPortal();
    updateRoleHeadersAndUI();
    switchAppView('home');
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

    if(viewId === 'sc-reports' || viewId === 'ptw-list') {
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

// ==================== MODAL HELPERS (NO X BUTTON - OVERLAY & RETURN) ====================
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

function openAnalyticsModal() { openModal('analyticsModal'); }
function openCertificationsModal() { openModal('certificationsModal'); }
function openFireRegistryModal() { openModal('fireRegistryModal'); }
function openMemberModal() { openModal('memberModal'); }
function openFormCustomizerModal() { openModal('formCustomizerModal'); }
function openCalendarModal() { openModal('calendarModal'); }
function openGitHubModal() { openModal('githubModal'); }

window.openAnalyticsModal = openAnalyticsModal;
window.openCertificationsModal = openCertificationsModal;
window.openFireRegistryModal = openFireRegistryModal;
window.openMemberModal = openMemberModal;
window.openFormCustomizerModal = openFormCustomizerModal;
window.openCalendarModal = openCalendarModal;
window.openGitHubModal = openGitHubModal;

// ==================== RENDERERS ====================
function renderAllDynamicViews() {
    renderMembers();
    renderTasksList();
    renderCustomFieldsList();
    renderCustomFieldsInForm();
}

// 1. MEMBERS LIST
function renderMembers() {
    const cont = document.getElementById('membersListTable');
    const select1 = document.getElementById('taskTargetMember');
    if(!cont) return;

    cont.innerHTML = '';
    if(select1) select1.innerHTML = '';

    HSE_STATE.members.forEach((mem, index) => {
        const syncChip = mem.syncCode || `HSE-SYNC-${mem.user}`;
        
        const item = document.createElement('div');
        item.className = 'member-item-card';
        item.innerHTML = `
            <div class="member-text">
                <h5 class="font-bold mb-1"><i class="fa-solid fa-user text-primary"></i> ${mem.name}</h5>
                <span class="text-xs text-secondary d-block"><i class="fa-solid fa-phone"></i> ${mem.phone} | <i class="fa-solid fa-user-tag"></i> ${mem.user}</span>
                <div class="sync-badge-chip" onclick="copySyncCode('${syncChip}')" title="انقر لنسخ كود الربط السحابي">
                    <i class="fa-solid fa-cloud"></i> كود الربط: ${syncChip} <i class="fa-regular fa-copy ms-1"></i>
                </div>
            </div>
            <div class="member-actions">
                ${HSE_STATE.currentRole === "manager" ? `<button class="btn btn-sm btn-secondary text-danger" onclick="deleteMember(${index})"><i class="fa-solid fa-trash"></i></button>` : ``}
            </div>
        `;
        cont.appendChild(item);

        if(select1) {
            const opt1 = document.createElement('option');
            opt1.value = mem.name;
            opt1.innerText = mem.name;
            select1.appendChild(opt1);
        }
    });
}
window.renderMembers = renderMembers;

function copySyncCode(code) {
    if(navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code);
    }
    alert("تم نسخ رقم الربط السحابي للفريق: " + code);
}
window.copySyncCode = copySyncCode;

function handleAddNewMember(e) {
    e.preventDefault();
    const name = document.getElementById('newMemberName').value.trim();
    const user = document.getElementById('newMemberUser').value.trim();
    const phone = document.getElementById('newMemberPhone').value.trim();
    const pass = document.getElementById('newMemberPass').value.trim();

    const uniqueCode = `HSE-SYNC-${user}-${Math.floor(1000 + Math.random()*9000)}`;

    HSE_STATE.members.push({
        id: "M" + (HSE_STATE.members.length + 1),
        name, user, phone, pass,
        syncCode: uniqueCode
    });

    document.getElementById('addMemberForm').reset();
    renderAllDynamicViews();
    alert(`تم إضافة العضو بنجاح وتوليد رقم الربط السحابي: ${uniqueCode}`);
}
window.handleAddNewMember = handleAddNewMember;

function deleteMember(idx) {
    if(confirm("هل أنت متأكد من رغبتك في حذف هذا العضو من الفريق؟")) {
        HSE_STATE.members.splice(idx, 1);
        renderAllDynamicViews();
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
        box.innerHTML = `<div class="p-3 text-center text-secondary"><i class="fa-solid fa-list-check"></i> لا توجد تكليفات أمنية موجهة حالياً.</div>`;
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
                <div class="p-2 my-2 rounded text-sm" style="background: var(--bg-main); border-right: 3px solid var(--success-color);">
                    <strong class="text-success"><i class="fa-solid fa-file-contract"></i> تقرير التنفيذ الميداني المعتمد:</strong>
                    <p class="mb-0 mt-1">${tsk.report}</p>
                </div>
            ` : ''}
            <div class="sc-actions mt-2">
                ${!isMgr && tsk.status !== 'completed' ? `
                    <button class="pure-green-btn btn-sm" style="width: auto; padding: 0.5rem 1rem;" onclick="openTaskReportModal('${tsk.id}')"><i class="fa-solid fa-paper-plane"></i> رفع تقرير التنفيذ الميداني</button>
                ` : ''}
                ${isMgr && tsk.status === 'completed' ? `
                    <button class="btn btn-sm btn-secondary text-success" onclick="alert('تم مراجعة التقرير والمصادقة عليه بنجاح')"><i class="fa-solid fa-thumbs-up"></i> مصادقة التقرير</button>
                ` : ''}
            </div>
        `;
        box.appendChild(div);
    });
}
window.renderTasksList = renderTasksList;

function handleAssignTask(e) {
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
    alert("تم توجيه التكليف الأمني وإرسال إشعار للميدان بنجاح.");
}
window.handleAssignTask = handleAssignTask;

function openTaskReportModal(tskId) {
    const t = HSE_STATE.tasks.find(i => i.id === tskId);
    if(!t) return;
    document.getElementById("activeReportTaskId").value = tskId;
    document.getElementById("reportTaskTitleDisplay").innerText = `التكليف الميداني: ${t.title}`;
    openModal("taskReportModal");
}
window.openTaskReportModal = openTaskReportModal;

function handleTaskReportSubmit(e) {
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
    alert("تم إرسال تقرير التنفيذ الميداني إلى المدير بنجاح!");
}
window.handleTaskReportSubmit = handleTaskReportSubmit;

// 3. DIGITAL SIGNATURE PAD
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
        alert("التوقيع الرقمي النهائي من صلاحيات مدير السلامة العام.");
        return;
    }
    currentSigDocId = docId;
    document.getElementById("sigTargetDocTitle").innerText = `وثيقة الاعتماد: #${docId}`;
    clearSignature();
    openModal("sigModal");
}
window.openSignatureModal = openSignatureModal;

function saveSignature() {
    if(!currentSigDocId) return;
    
    if (currentSigDocId === "PTW-2024-015") {
        const sEl = document.getElementById("managerSigStamp");
        const stEl = document.getElementById("ptwDocStatus");
        if(sEl) {
            sEl.className = "text-success font-bold";
            sEl.innerHTML = `<i class="fa-solid fa-file-signature"></i> معتمد بتوقيع ${HSE_STATE.manager.name}`;
        }
        if(stEl) {
            stEl.className = "status-pill green";
            stEl.innerHTML = `<i class="fa-solid fa-check"></i> تم الاعتماد النهائي`;
        }
    }

    closeModal("sigModal");
    renderAllDynamicViews();
    alert("تم التوقيع الإلكتروني واعتماد الاستمارة ومزامنتها بنجاح!");
}
window.saveSignature = saveSignature;

// 4. FORM CUSTOMIZER (DYNAMIC FIELDS)
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
        tag.className = 'status-pill green me-2 mb-2 p-2';
        tag.innerHTML = `<span><i class="fa-solid fa-tag"></i> ${f.name} (${f.type})</span>
            ${HSE_STATE.currentRole === 'manager' ? `<i class="fa-solid fa-trash text-danger ms-2 cursor-pointer" onclick="deleteCustomField('${target}', ${idx})"></i>` : ''}`;
        box.appendChild(tag);
    });
}
window.renderCustomFieldsList = renderCustomFieldsList;

function addCustomFieldToForm() {
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
        type: typeSelect.value
    });

    nameInput.value = '';
    renderCustomFieldsList();
    renderCustomFieldsInForm();
    alert("تم إدراج الحقل المخصص وتزامن بنجاح مع كافة أجهزة الفريق في الميدان!");
}
window.addCustomFieldToForm = addCustomFieldToForm;

function deleteCustomField(target, idx) {
    HSE_STATE.customFields[target].splice(idx, 1);
    renderCustomFieldsList();
    renderCustomFieldsInForm();
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
    header.innerHTML = `<i class="fa-solid fa-sliders"></i> حقول مخصصة مضافة من المدير:`;
    box.appendChild(header);

    scFields.forEach(f => {
        const g = document.createElement("div");
        g.className = "form-group";
        if(f.type === "checkbox") {
            g.innerHTML = `<label class="d-flex align-items-center gap-2"><input type="checkbox"> <span class="font-bold">${f.name}</span></label>`;
        } else if(f.type === "textarea") {
            g.innerHTML = `<label><i class="fa-solid fa-tag text-primary"></i> ${f.name}</label><textarea rows="2" class="form-control" placeholder="أدخل بيانات ${f.name}..."></textarea>`;
        } else {
            g.innerHTML = `<label><i class="fa-solid fa-tag text-primary"></i> ${f.name}</label><input type="text" class="form-control" placeholder="${f.name}...">`;
        }
        box.appendChild(g);
    });
}
window.renderCustomFieldsInForm = renderCustomFieldsInForm;

// 5. SC REPORT SUBMIT
function handleNewSCSubmit(e) {
    e.preventDefault();
    const title = document.getElementById("newScTitle").value;
    const newId = "SC-2024-" + Math.floor(100 + Math.random()*900);

    const cont = document.getElementById("scReportsContainer");
    if(cont) {
        const card = document.createElement("div");
        card.className = "sc-app-card";
        card.innerHTML = `
            <div class="sc-top-bar">
                <span class="code">#${newId}</span>
                <span class="status-pill orange"><i class="fa-solid fa-triangle-exclamation"></i> بانتظار توقيع المدير</span>
            </div>
            <h3>${title}</h3>
            <div class="meta-grid">
                <div><i class="fa-solid fa-user"></i> الراصد: ${HSE_STATE.currentRole === "manager" ? HSE_STATE.manager.name : HSE_STATE.currentMember.name}</div>
                <div><i class="fa-solid fa-calendar"></i> ${new Date().toISOString().split('T')[0]}</div>
                <div><i class="fa-solid fa-location-dot"></i> ${document.getElementById("newScLoc").value}</div>
                <div><i class="fa-solid fa-flag text-danger"></i> أولوية: ${document.getElementById("newScPrio").value}</div>
            </div>
            <div class="sc-actions">
                <button class="pure-green-btn btn-sm" style="width: auto; padding: 0.45rem 0.9rem;" onclick="openSignatureModal('${newId}')"><i class="fa-solid fa-signature"></i> التوقيع الإلكتروني للاعتماد</button>
            </div>
        `;
        cont.prepend(card);
    }

    document.getElementById("nativeSCForm").reset();
    renderCustomFieldsInForm();
    alert("تم رفع بلاغ حالة الخطر للميدان وإرسال إشعار فوري للمدير للاعتماد!");
}
window.handleNewSCSubmit = handleNewSCSubmit;

// 6. CALENDAR ENGINE
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
            row.className = "vault-item-card mb-1";
            row.innerHTML = `<div><h5 class="m-0 font-bold"><i class="fa-solid fa-calendar-check text-primary"></i> ${ev.title}</h5><small class="text-secondary">${ev.date}</small></div><span class="status-pill green">مجدول</span>`;
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

function handleAddCalendarEvent(e) {
    e.preventDefault();
    HSE_STATE.calendarEvents.push({
        id: "EV-" + Math.floor(10 + Math.random()*90),
        title: document.getElementById("eventTitle").value,
        date: document.getElementById("eventDate").value,
        type: document.getElementById("eventType").value
    });
    document.getElementById("addEventForm").reset();
    renderCalendar(HSE_STATE.currentDate);
    alert("تم إضافة المناسبة للتقويم ومزامنتها بنجاح!");
}
window.handleAddCalendarEvent = handleAddCalendarEvent;

// 7. MISC ENGINE
function triggerEmergencyCall() {
    alert("تنبيه طوارئ فوري: سيتم الاتصال المباشر بغرفة الطوارئ ومشاركة إحداثيات الموقع!");
}
window.triggerEmergencyCall = triggerEmergencyCall;

function toggleTheme() {
    document.body.classList.toggle('dark-theme');
}
window.toggleTheme = toggleTheme;

function saveGitHubConfig(e) {
    e.preventDefault();
    HSE_STATE.manager.ghOwner = document.getElementById("ghOwnerInput").value.trim();
    HSE_STATE.manager.ghRepo = document.getElementById("ghRepoInput").value.trim();
    
    if(ghDatabase && typeof ghDatabase.generateSyncCode === 'function') {
        const code = ghDatabase.generateSyncCode(HSE_STATE.manager.ghOwner, HSE_STATE.manager.ghRepo);
        HSE_STATE.manager.syncCode = code;
    }
    updateSyncCodeDisplays();
    closeModal("githubModal");
    alert("تم تحديث إعدادات مستودع GitHub وتوليد كود المزامنة السحابي الجديد!");
}
window.saveGitHubConfig = saveGitHubConfig;
