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
    chatMessages: [
        { id: "MSG-1", sender: "مدير السلامة العام", text: "يرجى من جميع الأعضاء الميدانيين التأكد من فحص طفايات الحريق بالمستودع الرئيسي وتأكيد التجاوب عبر النظام.", time: "08:15 ص", role: "manager" },
        { id: "MSG-2", sender: "أحمد علي", text: "علم، تم التوجه إلى المستودع وسيتم رفع التقرير فور الانتهاء من الفحص.", time: "08:18 ص", role: "member" }
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
function rehydrateLocalCredentials(loadedData) {
    if (loadedData && loadedData.manager) {
        loadedData.manager.ghToken = localStorage.getItem("github_token") || ghDatabase.token || "";
        loadedData.manager.ghOwner = localStorage.getItem("github_owner") || ghDatabase.owner || loadedData.manager.ghOwner;
        loadedData.manager.ghRepo = localStorage.getItem("github_repo") || ghDatabase.repo || loadedData.manager.ghRepo;
        if (ghDatabase && typeof ghDatabase.generateSyncCode === 'function') {
            loadedData.manager.syncCode = ghDatabase.generateSyncCode(loadedData.manager.ghOwner, loadedData.manager.ghRepo, loadedData.manager.ghToken);
        }
    }
    // PRESERVE CURRENT LOGIN SESSION: Prevent cloud JSON from overriding active user's local role
    if (typeof HSE_STATE !== 'undefined' && HSE_STATE && HSE_STATE.currentRole) {
        loadedData.currentRole = HSE_STATE.currentRole;
        loadedData.currentMember = HSE_STATE.currentMember;
    }
    return loadedData || DEFAULT_STATE;
}

document.addEventListener("DOMContentLoaded", async () => {
    initGitHubDatabase();
    initAppUI();
    renderAllDynamicViews();
    initSigPad();
    
    // 1. Check for saved login session so user doesn't get logged out on page refresh!
    const savedSessionStr = localStorage.getItem('HSE_LOGGED_IN_SESSION');
    let hasSession = false;
    if (savedSessionStr) {
        try {
            const session = JSON.parse(savedSessionStr);
            if (session && session.role) {
                hasSession = true;
                HSE_STATE.currentRole = session.role;
                if (session.role === 'member' && session.member) {
                    HSE_STATE.currentMember = session.member;
                    if (session.syncCode && ghDatabase) {
                        ghDatabase.applySyncCode(session.syncCode);
                    }
                } else {
                    HSE_STATE.currentMember = null;
                }
                // Instantly hide login portal and open home screen
                closeLoginPortal();
                updateSyncCodeDisplays();
                updateRoleHeadersAndUI();
                switchAppView('home');
            }
        } catch(e) { console.error("Session restore error:", e); }
    }

    // 2. Check if there's an existing cloud connection to sync latest data
    if (ghDatabase && ghDatabase.owner && ghDatabase.repo) {
        const res = await ghDatabase.verifyAndFetchRealCloudDatabase();
        if (res.success && res.data) {
            HSE_STATE = rehydrateLocalCredentials(res.data);
            if (hasSession && HSE_STATE.currentRole === 'member' && HSE_STATE.currentMember) {
                const refreshedMbr = HSE_STATE.members.find(m => m.id === HSE_STATE.currentMember.id || m.user === HSE_STATE.currentMember.user);
                if (refreshedMbr) HSE_STATE.currentMember = refreshedMbr;
            }
            renderAllDynamicViews();
            updateRoleHeadersAndUI();
        }
    }

    // Default open on login selection screen if NO session existed
    if (!hasSession) {
        showAuthSection('initial');
    }
    startLiveChatSyncEngine();
});

let liveChatSyncTimer = null;
function startLiveChatSyncEngine() {
    if (liveChatSyncTimer) clearInterval(liveChatSyncTimer);
    liveChatSyncTimer = setInterval(async () => {
        const chatView = document.getElementById("view-team-chat");
        if (chatView && chatView.classList.contains("active") && ghDatabase && ghDatabase.owner && ghDatabase.repo) {
            await fetchLatestCloudData(false, true);
        }
    }, 2500);
}
window.startLiveChatSyncEngine = startLiveChatSyncEngine;

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
    if (!ghDatabase || !ghDatabase.owner || !ghDatabase.repo) {
        return { success: false, message: "لم يتم تعيين الحساب والمستودع في إعدادات GitHub." };
    }
    if (!ghDatabase.token) {
        return { success: false, message: "رمز التوكن (PAT Token) مفقود في إعدادات المدير، لذلك تعذر الرفع السحابي لـ GitHub." };
    }
    const res = await ghDatabase.saveDatabase(HSE_STATE, actionName);
    return res;
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
        const tokenEl = document.getElementById("mgrGhToken");
        if(tokenEl && !tokenEl.value) tokenEl.value = localStorage.getItem("github_token") || ghDatabase.token || "";
        const ownerEl = document.getElementById("mgrGhOwner");
        if(ownerEl && !ownerEl.value) ownerEl.value = localStorage.getItem("github_owner") || ghDatabase.owner || "lootb8890-hue";
        const repoEl = document.getElementById("mgrGhRepo");
        if(repoEl && !repoEl.value) repoEl.value = localStorage.getItem("github_repo") || ghDatabase.repo || "HSE_kala_safty";
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
                HSE_STATE = rehydrateLocalCredentials(initRes.data);
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
    localStorage.setItem('HSE_LOGGED_IN_SESSION', JSON.stringify({ role: 'manager', timestamp: Date.now() }));
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
    HSE_STATE = rehydrateLocalCredentials(verifyRes.data);

    // 4. Strict Credential Verification in Real Database
    const member = HSE_STATE.members.find(m => (m.user === user || m.phone === user || m.name === user) && m.pass === pass);
    if (!member) {
        if(btn) btn.innerHTML = origText;
        alert("❌ تم رفض الدخول السحابي!\n\nتم الاتصال وسحب قاعدة بيانات GitHub الحقيقية من السحابة، ولكن لم يتم العثور على حسابك (أو أن كلمة المرور غير مطابقة)!\n\n⚠️ السبب الأرجح:\nحينما قام المدير بإنشاء حسابك، كان رمز التوكن (PAT Token) لديه مفقوداً أو غير فعال، فتم حفظ حسابك على هاتف المدير محلياً فقط ولم يرتفع لمخدمات GitHub السحابية!\n\n💡 الحل: يطلب المدير الدخول على حسابه وإضافة رمز الـ Token الفعال في إعدادات GitHub باللوحة الجانبية ثم الموافقة ليتم رفع الحساب مباشرة!");
        return false;
    }

    // 5. Successful Authorization
    if(btn) btn.innerHTML = origText;
    HSE_STATE.currentRole = "member";
    HSE_STATE.currentMember = member;
    
    localStorage.setItem('HSE_LOGGED_IN_SESSION', JSON.stringify({ role: 'member', member: member, syncCode: code, timestamp: Date.now() }));

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
    localStorage.removeItem('HSE_LOGGED_IN_SESSION');
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
    if(viewId === 'team-chat') {
        renderChatMessages();
        fetchLatestCloudData(false);
    }
}
window.switchAppView = switchAppView;

async function fetchLatestCloudData(showNotify = false, isSilent = false) {
    if (ghDatabase && ghDatabase.owner && ghDatabase.repo) {
        if(showNotify && !isSilent) {
            const btn = document.querySelector('button[onclick="fetchLatestCloudData(true)"]');
            if(btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-warning"></i> جاري السحب...`;
        }
        const res = await ghDatabase.verifyAndFetchRealCloudDatabase();
        if (res.success && res.data) {
            const oldMsgCount = (HSE_STATE.chatMessages || []).length;
            const newMsgCount = (res.data.chatMessages || []).length;
            
            HSE_STATE = rehydrateLocalCredentials(res.data);
            
            renderMembers();
            renderTasksList();
            renderPendingSignatures();
            updateStatsCounters();
            
            if (!isSilent || oldMsgCount !== newMsgCount) {
                if(typeof renderChatMessages === 'function') renderChatMessages();
            }

            if(showNotify && !isSilent) alert("✅ تم سحب أحدث المراسلات والبيانات من قاعدة بيانات GitHub السحابية بنجاح!");
        } else if(showNotify && !isSilent) {
            alert("⚠️ تعذر الجلب السحابي: " + res.reason);
        }
        if(showNotify && !isSilent) {
            const btn = document.querySelector('button[onclick="fetchLatestCloudData(true)"]');
            if(btn) btn.innerHTML = `<i class="fa-solid fa-arrows-rotate text-success"></i> سحب أحدث المراسلات من السحابة`;
        }
    } else if(showNotify && !isSilent) {
        alert("⚠️ لم يتم تعيين حساب ومستودع GitHub في الإعدادات بعد.");
    }
}
window.fetchLatestCloudData = fetchLatestCloudData;

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
async function openTasksModal() { 
    openModal('tasksModal');
    if (ghDatabase && ghDatabase.owner && ghDatabase.repo) {
        const statusEl = document.getElementById('tasksSyncStatusText');
        if(statusEl) statusEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-info"></i> جاري مزامنة المهام والتقارير من خادم GitHub السحابي...`;
        const res = await ghDatabase.verifyAndFetchRealCloudDatabase();
        if (res.success && res.data) {
            HSE_STATE = rehydrateLocalCredentials(res.data);
            renderAllDynamicViews();
            if(statusEl) statusEl.innerHTML = `<span style="color:#16a34a;"><i class="fa-solid fa-check-circle"></i> تم تحديث سجل المهام من السحابة بنجاح</span>`;
            setTimeout(() => { if(statusEl) statusEl.innerHTML = ''; }, 3500);
        } else if(statusEl) {
            statusEl.innerHTML = `<span style="color:#64748b;"><i class="fa-solid fa-clock"></i> آخر نسخة محمّلة حالياً</span>`;
        }
    }
}
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
    if(typeof renderChatMessages === 'function') renderChatMessages();
    updateStatsCounters();
}

function isTaskAssignedToMember(tsk, currentMem) {
    if (!tsk || !tsk.assignedTo) return false;
    const assigned = tsk.assignedTo.trim().toLowerCase();
    if (assigned === "الكل" || assigned === "all" || assigned === "جميع الأعضاء" || assigned === "الكل (جميع الأعضاء)") return true;
    if (!currentMem) return false;
    const name = (currentMem.name || "").trim().toLowerCase();
    const user = (currentMem.user || "").trim().toLowerCase();
    const id = (currentMem.id || "").trim().toLowerCase();
    return assigned === name || assigned === user || assigned === id;
}

function updateStatsCounters() {
    const pendCount = HSE_STATE.pendingSignatures.length;
    const memCount = HSE_STATE.members.length;

    const isMgr = HSE_STATE.currentRole === "manager";
    const tasksCount = isMgr ? HSE_STATE.tasks.length : HSE_STATE.tasks.filter(t => isTaskAssignedToMember(t, HSE_STATE.currentMember)).length;

    const sp = document.getElementById('statPendingCount');
    if(sp) sp.innerText = pendCount;
    const st = document.getElementById('statTasksCount');
    if(st) st.innerText = tasksCount;
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
    if(select1) select1.innerHTML = '<option value="الكل (جميع الأعضاء)">الكل (جميع الأعضاء - إشعار للكل)</option>';
    if(select2) select2.innerHTML = '<option value="الكل">الكل (جميع الأعضاء)</option>';

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
            opt1.innerText = mem.name + " (" + (mem.user || "عضو") + ")";
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
    const cloudRes = await commitStateToCloud("إضافة العضو الميداني: " + name);
    if (cloudRes && cloudRes.success) {
        alert(`✅ تم إنشاء حساب العضو (${name}) ورفعه مباشرة لقاعدة البيانات السحابية الحقيقية في GitHub بنجاح!\n\nيمكنه الآن الدخول من أي هاتف باستخدام:\nالاسم/الهاتف: ${user || phone}\nكلمة المرور: ${pass}`);
    } else {
        alert(`⚠️ تنبيه إداري حاسم:\nتم إنشاء العضو (${name}) على جهازك الحالي فقط، *ولكن لم ينجح الرفع إلى GitHub السحابي* بسبب:\n(${cloudRes ? cloudRes.message : "تعذر الاتصال"})\n\n❗ لن يتمكن العضو من الدخول من هاتفه حتى تضع التوكن (PAT Token) الصحيح من خلال القائمة الجانبية -> إعدادات GitHub Sync ثم تحفظ الأزرار هناك ليتم الرفع الفعلي!`);
    }
}
window.handleAddNewMember = handleAddNewMember;

async function deleteMember(idx) {
    const memName = HSE_STATE.members[idx] ? HSE_STATE.members[idx].name : "";
    if(confirm("هل أنت متأكد من رغبتك في حذف هذا العضو وسحب صلاحية دخوله من السحابة؟")) {
        HSE_STATE.members.splice(idx, 1);
        renderAllDynamicViews();
        const cloudRes = await commitStateToCloud("حذف العضو الميداني: " + memName);
        if(cloudRes && cloudRes.success) {
            alert("تم الحذف وتحديث قاعدة البيانات السحابية الحقيقية بنجاح.");
        } else {
            alert("تم الحذف محلياً فقط. تعذر الرفع للسحابة لعدم توفر التوكن الفعال.");
        }
    }
}
window.deleteMember = deleteMember;

// 2. TASKS WORKFLOW
let activeTasksFilter = 'all';
function filterTasksList(type, el) {
    activeTasksFilter = type;
    if (el && el.parentElement) {
        el.parentElement.querySelectorAll('button').forEach(b => {
            b.style.opacity = '0.75';
            b.style.boxShadow = 'none';
        });
        el.style.opacity = '1';
        el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)';
    }
    renderTasksList();
}
window.filterTasksList = filterTasksList;

function renderTasksList() {
    const box = document.getElementById('tasksMonitoringList');
    const assignWrapper = document.getElementById('assignTaskFormWrapper');
    const sectionTitle = document.getElementById('tasksSectionTitle');
    if(!box) return;
    box.innerHTML = '';

    const isMgr = HSE_STATE.currentRole === "manager";

    // Show professional Assignment box only to Managers
    if (assignWrapper) assignWrapper.style.display = isMgr ? 'block' : 'none';
    if (sectionTitle) {
        sectionTitle.innerHTML = isMgr ? 
            `<i class="fa-solid fa-clipboard-list text-primary"></i> إدارة ومتابعة جميع المهام والإنجازات الميدانية` : 
            `<i class="fa-solid fa-list-check text-success"></i> قائمة المهام الميدانية الموجهة إليك`;
    }

    const tasksToShow = isMgr ? HSE_STATE.tasks : HSE_STATE.tasks.filter(t => isTaskAssignedToMember(t, HSE_STATE.currentMember));

    // Update filter bar counters
    const cAll = document.getElementById('countAllTasks');
    const cNot = document.getElementById('countNotCompleted');
    const cPend = document.getElementById('countPendingTasks');
    const cComp = document.getElementById('countCompletedTasks');
    if(cAll) cAll.innerText = tasksToShow.length;
    if(cNot) cNot.innerText = tasksToShow.filter(t => t.status === 'not_completed').length;
    if(cPend) cPend.innerText = tasksToShow.filter(t => t.status === 'pending').length;
    if(cComp) cComp.innerText = tasksToShow.filter(t => t.status === 'completed').length;

    const filteredTasks = activeTasksFilter === 'all' ? tasksToShow : tasksToShow.filter(t => t.status === activeTasksFilter);

    if(filteredTasks.length === 0) {
        box.innerHTML = `
            <div style="background:#f8fafc; border:2px dashed #cbd5e1; border-radius:12px; padding:30px; text-align:center; color:#64748b;">
                <i class="fa-solid fa-folder-open mb-2" style="font-size:32px; opacity:0.5;"></i>
                <p class="m-0 font-bold" style="font-size:14px;">لا توجد مهام مطابقة في هذا التصنيف حالياً.</p>
            </div>
        `;
        return;
    }

    filteredTasks.forEach(tsk => {
        const div = document.createElement('div');
        div.style.cssText = `background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:14px; position:relative; box-shadow:0 2px 6px rgba(0,0,0,0.04); transition:all 0.2s ease;`;

        if (tsk.status === 'not_completed') {
            div.style.borderRight = '5px solid #dc2626';
            div.style.backgroundColor = '#fffafa';
        } else if (tsk.status === 'completed') {
            div.style.borderRight = '5px solid #16a34a';
            div.style.backgroundColor = '#fbfefb';
        } else {
            div.style.borderRight = '5px solid #ea580c';
        }

        let statusBadge = `<span style="background:#fff7ed; color:#c2410c; border:1px solid #fdba74; font-size:11px; font-weight:800; padding:4px 10px; border-radius:16px; display:inline-flex; align-items:center; gap:5px;"><i class="fa-solid fa-clock"></i> بانتظار التنفيذ</span>`;
        if (tsk.status === 'completed') {
            statusBadge = `<span style="background:#f0fdf4; color:#15803d; border:1px solid #86efac; font-size:11px; font-weight:800; padding:4px 10px; border-radius:16px; display:inline-flex; align-items:center; gap:5px;"><i class="fa-solid fa-check-circle"></i> تم الإنجاز وموثق</span>`;
        } else if (tsk.status === 'not_completed') {
            statusBadge = `<span style="background:#fef2f2; color:#b91c1c; border:1px solid #fca5a5; font-size:11px; font-weight:800; padding:4px 10px; border-radius:16px; display:inline-flex; align-items:center; gap:5px;"><i class="fa-solid fa-circle-exclamation"></i> لم يتم الإنجاز (إفادة مرتدة)</span>`;
        }

        let reportBoxHtml = '';
        if (tsk.status === 'completed') {
            reportBoxHtml = `
                <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-right:4px solid #16a34a; border-radius:6px; padding:8px 12px; margin:10px 0 4px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px;">
                    <span style="color:#15803d; font-size:12px; font-weight:800;"><i class="fa-solid fa-circle-check me-1"></i> تم إنجاز هذه المهمة وتوثيقها</span>
                    ${tsk.reportTime ? `<span style="font-size:11px; color:#166534; font-weight:700;"><i class="fa-solid fa-clock me-1"></i> ${tsk.reportTime}</span>` : ''}
                </div>
            `;
        } else if (tsk.status === 'not_completed' && tsk.report) {
            reportBoxHtml = `
                <div style="background:#fef2f2; border:1px solid #fecaca; border-right:4px solid #dc2626; border-radius:6px; padding:10px 12px; margin:10px 0 4px;">
                    <div style="color:#991b1b; font-weight:800; font-size:12px; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                        <i class="fa-solid fa-triangle-exclamation text-danger"></i> <span>سبب وملاحظات عدم الإنجاز (من العضو الميداني):</span>
                    </div>
                    <p style="margin:0; color:#7f1d1d; font-size:13px; line-height:1.5; font-weight:700;">${tsk.report}</p>
                    ${tsk.reportTime ? `<span style="display:block; font-size:11px; color:#b91c1c; margin-top:5px; font-weight:600;"><i class="fa-solid fa-clock me-1"></i> ${tsk.reportTime}</span>` : ''}
                </div>
            `;
        }

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="background:#f1f5f9; color:#475569; font-size:11px; font-weight:800; padding:3px 8px; border-radius:6px; border:1px solid #e2e8f0;">#${tsk.id}</span>
                    <span style="background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; font-size:12px; font-weight:800; padding:3px 10px; border-radius:14px;"><i class="fa-solid fa-user me-1"></i> الموجه إليه: <strong>${tsk.assignedTo}</strong></span>
                </div>
                ${statusBadge}
            </div>
            <h3 style="font-size:15px; font-weight:800; color:#0f172a; line-height:1.5; margin:0 0 8px;">
                <i class="fa-solid fa-circle-dot me-2" style="font-size:11px; color:var(--primary-color);"></i>${tsk.title}
            </h3>
            <div style="display:flex; align-items:center; gap:6px; color:#64748b; font-size:12px; font-weight:700; margin-bottom:4px;">
                <i class="fa-solid fa-calendar-day text-info"></i> <span>التاريخ المستهدف للإنجاز: <strong style="color:#0f172a;">${tsk.dueDate || 'فوري ومستعجل'}</strong></span>
            </div>
            ${reportBoxHtml}
            <div style="border-top:1px dashed #e2e8f0; margin-top:10px; padding-top:10px;">
                ${!isMgr ? `
                    <div style="display:flex; align-items:center; justify-content:flex-end; gap:8px;">
                        <button type="button" onclick="markTaskCompletedImmediately('${tsk.id}')" style="background:#16a34a; color:#ffffff; border:none; border-radius:6px; padding:6px 14px; font-size:11px; font-weight:800; display:inline-flex; align-items:center; gap:5px; cursor:pointer; transition:all 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.15);">
                            <i class="fa-solid fa-check"></i> <span>تم الإنجاز</span>
                        </button>
                        <button type="button" onclick="openTaskReportModal('${tsk.id}', 'not_completed')" style="background:#dc2626; color:#ffffff; border:none; border-radius:6px; padding:6px 14px; font-size:11px; font-weight:800; display:inline-flex; align-items:center; gap:5px; cursor:pointer; transition:all 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.15);">
                            <i class="fa-solid fa-xmark"></i> <span>لم يتم الإنجاز</span>
                        </button>
                    </div>
                ` : ''}
                ${isMgr && tsk.status === 'completed' ? `
                    <div style="display:flex; justify-content:flex-end;">
                        <button type="button" onclick="alert('✅ تم الاطلاع على إنجاز العضو والمصادقة عليه بنجاح.')" style="background:#f8fafc; color:#1e293b; border:1px solid #cbd5e1; border-radius:6px; padding:6px 12px; font-size:11px; font-weight:800; display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
                            <i class="fa-solid fa-thumbs-up text-success"></i> اعتماد الإنجاز
                        </button>
                    </div>
                ` : ''}
                ${isMgr && tsk.status === 'not_completed' ? `
                    <div style="display:flex; justify-content:flex-end;">
                        <button type="button" onclick="reassignTask('${tsk.id}')" style="background:#2563eb; color:#fff; border:none; border-radius:6px; padding:6px 14px; font-size:11px; font-weight:800; display:inline-flex; align-items:center; gap:6px; cursor:pointer; box-shadow:0 2px 4px rgba(37,99,235,0.2);">
                            <i class="fa-solid fa-rotate-left"></i> إرجاع وإعادة توجيه للميدان
                        </button>
                    </div>
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
    alert("✅ تم إسناد المهمة وإرسالها فوراً لقاعدة بيانات GitHub السحابية ليراها العضو المستهدف.");
}
window.handleAssignTask = handleAssignTask;

async function markTaskCompletedImmediately(tskId) {
    const target = HSE_STATE.tasks.find(i => i.id === tskId);
    if (target) {
        target.status = "completed";
        target.report = "تم الإنجاز وتأكيده مباشرة من العضو.";
        target.reportTime = new Date().toLocaleDateString('ar-SA') + ' - ' + new Date().toLocaleTimeString('ar-SA', {hour: '2-digit', minute:'2-digit'});
    }
    renderAllDynamicViews();
    await commitStateToCloud("إنجاز المهمة الميدانية: " + tskId);
    alert("✅ تم تسجيل إنجاز المهمة ورفعه فوراً لقاعدة البيانات السحابية الحقيقية!");
}
window.markTaskCompletedImmediately = markTaskCompletedImmediately;

function openTaskReportModal(tskId, mode) {
    const t = HSE_STATE.tasks.find(i => i.id === tskId);
    if(!t) return;
    const isSuccess = mode === 'completed';
    document.getElementById("activeReportTaskId").value = tskId;
    document.getElementById("activeReportTaskMode").value = mode || 'not_completed';
    
    const titleEl = document.getElementById("reportTaskTitleDisplay");
    const headerEl = document.getElementById("taskReportHeaderTitle");
    const notesLabelEl = document.getElementById("taskReportNotesLabel");
    const notesInput = document.getElementById("taskReportNotes");
    const submitBtn = document.getElementById("taskReportSubmitBtn");

    if (titleEl) titleEl.innerText = `المهمة المستهدفة: ${t.title}`;
    
    if (!isSuccess) {
        if (headerEl) headerEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-danger"></i> إفادة بعدم إنجاز المهمة`;
        if (notesLabelEl) notesLabelEl.innerText = `أسباب وملاحظات عدم إنجاز المهمة (سترتد للمدير في الإنجازات الغير مكتملة) *`;
        if (notesInput) notesInput.placeholder = `اكتب المعوقات أو الأسباب التي منعت إنجاز المهمة في الميدان...`;
        if (submitBtn) {
            submitBtn.className = `btn btn-sm mt-2`;
            submitBtn.style.cssText = `background-color: #dc2626; color: white; width: 100%; justify-content: center; padding: 10px; border-radius: var(--radius-sm); font-weight: 800; font-size: 14px; display: flex; align-items: center; gap: 6px; border: none; cursor: pointer;`;
            submitBtn.innerHTML = `<i class="fa-solid fa-share-from-square"></i> إرسال (لم يتم الإنجاز) مع الملاحظة للمدير`;
        }
    }

    if(notesInput) notesInput.value = t.report || '';

    openModal("taskReportModal");
}
window.openTaskReportModal = openTaskReportModal;

async function handleTaskReportSubmit(e) {
    e.preventDefault();
    const tId = document.getElementById("activeReportTaskId").value;
    const mode = document.getElementById("activeReportTaskMode").value || "not_completed";
    const notes = document.getElementById("taskReportNotes").value.trim();
    
    const target = HSE_STATE.tasks.find(i => i.id === tId);
    if(target) {
        target.status = mode;
        target.report = notes;
        target.reportTime = new Date().toLocaleDateString('ar-SA') + ' - ' + new Date().toLocaleTimeString('ar-SA', {hour: '2-digit', minute:'2-digit'});
    }
    closeModal("taskReportModal");
    renderAllDynamicViews();
    await commitStateToCloud("تسجيل عدم إنجاز المهمة: " + tId);
    alert("⚠️ تم إرسال إفادة (لم يتم الإنجاز) مع الملاحظة لمدير السلامة في خانة الإنجازات الغير مكتملة بنجاح!");
}
window.handleTaskReportSubmit = handleTaskReportSubmit;
window.handleTaskReportSubmit = handleTaskReportSubmit;

async function reassignTask(tskId) {
    const target = HSE_STATE.tasks.find(i => i.id === tskId);
    if (!target) return;
    target.status = "pending";
    target.report = null;
    target.reportTime = null;
    renderAllDynamicViews();
    await commitStateToCloud("إعادة توجيه المهمة: " + tskId);
    alert("🔄 تم إعادة توجيه المهمة إلى العضو الميداني لتنفيذها من جديد.");
}
window.reassignTask = reassignTask;

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
let currentChatAttachment = null;

function handleChatAttachmentChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    
    // Check file size (max 2.5 MB)
    if (file.size > 2.5 * 1024 * 1024) {
        alert("❌ عذراً، حجم الملف أكبر من 2.5 ميجابايت! يرجى إرفاق صور أو ملفات أخف لضمان سرعة أداء المراسلات السحابية.");
        removeChatAttachment();
        return;
    }

    const previewEl = document.getElementById("chatAttachmentPreview");
    const nameEl = document.getElementById("chatAttachmentName");

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(evt) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 800;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.72);
                currentChatAttachment = {
                    name: file.name,
                    type: 'image/jpeg',
                    dataUrl: compressedDataUrl
                };
                if (nameEl) nameEl.textContent = file.name;
                if (previewEl) previewEl.style.display = 'flex';
            };
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    } else {
        const reader = new FileReader();
        reader.onload = function(evt) {
            currentChatAttachment = {
                name: file.name,
                type: file.type || 'application/octet-stream',
                dataUrl: evt.target.result
            };
            if (nameEl) nameEl.textContent = file.name;
            if (previewEl) previewEl.style.display = 'flex';
        };
        reader.readAsDataURL(file);
    }
}
window.handleChatAttachmentChange = handleChatAttachmentChange;

function removeChatAttachment() {
    currentChatAttachment = null;
    const fileEl = document.getElementById("chatFileInput");
    if (fileEl) fileEl.value = "";
    const previewEl = document.getElementById("chatAttachmentPreview");
    if (previewEl) previewEl.style.display = 'none';
}
window.removeChatAttachment = removeChatAttachment;

function renderChatMessages() {
    const box = document.getElementById("chatMessagesBox");
    if (!box) return;
    box.innerHTML = '';
    const messages = HSE_STATE.chatMessages || [];
    if (messages.length === 0) {
        box.innerHTML = `<div style="text-align:center; color:var(--text-light); font-size:12px; padding:20px;">لا توجد رسائل مسجلة حتى الآن. ابدأ المحادثة أو أرفق التقرير الميداني.</div>`;
        return;
    }
    const isManager = HSE_STATE.currentRole === "manager";
    const currentUserName = isManager ? HSE_STATE.manager.name : (HSE_STATE.currentMember ? HSE_STATE.currentMember.name : "عضو");
    
    messages.forEach(msg => {
        const msgDiv = document.createElement("div");
        const isMe = (isManager && msg.role === "manager") || 
                     (!isManager && HSE_STATE.currentMember && msg.sender === HSE_STATE.currentMember.name) || 
                     (msg.sender === currentUserName && currentUserName !== "عضو");
                     
        msgDiv.className = `message ${isMe ? 'sent' : 'received'}`;
        
        let attachmentHtml = '';
        if (msg.attachment && msg.attachment.dataUrl) {
            if (msg.attachment.type && msg.attachment.type.startsWith('image/')) {
                attachmentHtml = `
                    <div style="margin: 6px 0;">
                        <a href="${msg.attachment.dataUrl}" target="_blank" download="${msg.attachment.name || 'image.jpg'}" title="انقر للفتح أو التحميل">
                            <img src="${msg.attachment.dataUrl}" alt="مرفق صورة" style="max-width: 100%; border-radius: 8px; border: 1px solid rgba(0,0,0,0.15); max-height: 240px; object-fit: contain; display: block; background:rgba(0,0,0,0.05);">
                        </a>
                    </div>
                `;
            } else {
                attachmentHtml = `
                    <div style="margin: 6px 0;">
                        <a href="${msg.attachment.dataUrl}" download="${msg.attachment.name || 'document'}" style="display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.06); padding: 8px 12px; border-radius: 8px; text-decoration: none; color: inherit; border: 1px solid rgba(0,0,0,0.12); font-size: 12px; font-weight: 700;" title="تحميل الملف">
                            <i class="fa-solid fa-file-arrow-down text-primary" style="font-size: 18px;"></i>
                            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${msg.attachment.name || 'ملف مرفق'}</span>
                            <small style="opacity: 0.85; font-weight: 800; text-decoration: underline;">تحميل</small>
                        </a>
                    </div>
                `;
            }
        }

        msgDiv.innerHTML = `
            <strong style="color:${isMe ? '#113615' : 'var(--primary-color)'}; display:block; font-size:11px; font-weight:800; margin-bottom:2px;">${msg.sender} (${msg.role === 'manager' ? 'مدير السلامة' : 'عضو ميداني'}):</strong>
            ${msg.text ? `<span style="display:block; margin:3px 0; font-size:13px;">${msg.text}</span>` : ''}
            ${attachmentHtml}
            <span style="font-size:10px; opacity:0.75; display:block; text-align:${isMe ? 'right' : 'left'}; margin-top:3px;"><i class="fa-solid fa-check-double text-success"></i> ${msg.time}</span>
        `;
        box.appendChild(msgDiv);
    });
    box.scrollTop = box.scrollHeight;
}
window.renderChatMessages = renderChatMessages;

async function handleSendChatMessage(e) {
    e.preventDefault();
    const input = document.getElementById("chatInputText");
    const box = document.getElementById("chatMessagesBox");
    if(!input || !box) return;

    const textStr = input.value.trim();
    if (!textStr && !currentChatAttachment) return;

    input.value = '';

    if (!HSE_STATE.chatMessages) HSE_STATE.chatMessages = [];

    const isManager = HSE_STATE.currentRole === "manager";
    const senderName = isManager ? HSE_STATE.manager.name : (HSE_STATE.currentMember ? HSE_STATE.currentMember.name : "عضو");
    
    const newMsg = {
        id: "MSG-" + Date.now(),
        sender: senderName,
        text: textStr || (currentChatAttachment ? (currentChatAttachment.type.startsWith('image/') ? '📷 [صورة مرفقة]' : '📎 [ملف مرفق]') : ''),
        time: new Date().toLocaleTimeString('ar-SA', {hour: '2-digit', minute:'2-digit'}),
        role: HSE_STATE.currentRole,
        attachment: currentChatAttachment ? JSON.parse(JSON.stringify(currentChatAttachment)) : null
    };
    HSE_STATE.chatMessages.push(newMsg);
    
    removeChatAttachment();

    renderChatMessages();
    
    // Instant cloud commit without pre-pull delay
    const cloudRes = await commitStateToCloud("إرسال رسالة بغرفة العمليات من: " + senderName);
    if (!cloudRes || !cloudRes.success) {
        alert("⚠️ تم إظهار الرسالة بغرفتك المحلية، ولكن لم ينجح إرسالها لمخدمات GitHub السحابية لأن رمز التوكن (PAT Token) مفقود أو غير صالح.");
    } else {
        const bar = document.getElementById("cloudSyncDisplayBar");
        if(bar) bar.innerHTML = `<i class="fa-solid fa-check-circle text-success"></i> تم رفع الرسالة للسحابة بنجاح`;
    }
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
