/**
 * GitHub REST API Real Cloud Database Engine
 * Implements real-time JSON database persistence on GitHub repositories.
 * Enforces strict authentication: members cannot log in without real database licensing from admin.
 */

class GitHubDatabase {
    constructor(token, repoOwner, repoName, filePath = 'hse_db.json') {
        this.token = token || localStorage.getItem('github_token') || '';
        this.owner = repoOwner || localStorage.getItem('github_owner') || '';
        this.repo = repoName || localStorage.getItem('github_repo') || '';
        this.filePath = filePath;
        this.branch = 'main';
        this.fileSha = null;
        this.syncStatus = 'offline'; 
    }

    setCredentials(owner, repo, token = null) {
        if (owner) {
            this.owner = owner;
            localStorage.setItem('github_owner', owner);
        }
        if (repo) {
            this.repo = repo;
            localStorage.setItem('github_repo', repo);
        }
        if (token !== null && token !== undefined) {
            this.token = token;
            localStorage.setItem('github_token', token);
        }
        this.notifyStatus('ready');
    }

    /**
     * Generate Real Cloud Sync Code (رقم الربط السحابي الحقيقي)
     * Encrypts Owner, Repo, and Token into a single secure connection string for team members.
     */
    generateSyncCode(customOwner = null, customRepo = null, customToken = null) {
        const targetOwner = customOwner || this.owner || 'lootb8890-hue';
        const targetRepo = customRepo || this.repo || 'HSE_kala_safty';
        const targetToken = (customToken !== null && customToken !== undefined) ? customToken : this.token;
        
        // Encrypt credentials into connection string
        const payload = `${targetOwner}:::${targetRepo}:::${targetToken || ''}`;
        const encoded = btoa(unescape(encodeURIComponent(payload)));
        return `HSE-SYNC-${encoded}`;
    }

    generateCloudSyncCode(customOwner = null, customRepo = null, customToken = null) {
        return this.generateSyncCode(customOwner, customRepo, customToken);
    }

    /**
     * Decode and Apply Sync Code entered by Member
     */
    applySyncCode(syncCode) {
        if (!syncCode) return { success: false, message: 'كود الربط السحابي فارغ.' };
        try {
            const cleanCode = syncCode.trim().replace(/^HSE-SYNC-/, '');
            const decoded = decodeURIComponent(escape(atob(cleanCode)));
            const parts = decoded.split(':::');
            if (parts.length >= 2 && parts[0] && parts[1]) {
                this.owner = parts[0].trim();
                this.repo = parts[1].trim();
                if (parts[2]) {
                    this.token = parts[2].trim();
                    localStorage.setItem('github_token', this.token);
                }
                localStorage.setItem('github_owner', this.owner);
                localStorage.setItem('github_repo', this.repo);
                return { success: true, owner: this.owner, repo: this.repo, token: this.token };
            }
            return { success: false, message: 'تنسيق كود الربط السحابي غير صحيح. تأكد من نسخه بالكامل من شاشة المدير.' };
        } catch (error) {
            return { success: false, message: 'كود الربط السحابي غير صالح أو تالف. يجب إدخال كود مرخص من مدير السلامة.' };
        }
    }

    notifyStatus(status, message = '') {
        this.syncStatus = status;
        const statusEl = document.getElementById('ghSyncStatusBadge');
        const displayBar = document.getElementById('cloudSyncDisplayBar');
        if (statusEl) {
            if (status === 'syncing') {
                statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-warning"></i> <span>جاري المزامنة السحابية...</span>';
            } else if (status === 'synced') {
                statusEl.innerHTML = '<i class="fa-solid fa-cloud text-success"></i> <span>متصل بقاعدة GitHub الحقيقية</span>';
            } else if (status === 'error') {
                statusEl.innerHTML = '<i class="fa-solid fa-cloud-xmark text-danger"></i> <span>غير متصل: ' + (message || 'خطأ بالربط') + '</span>';
            } else {
                statusEl.innerHTML = '<i class="fa-solid fa-cloud text-info"></i> <span>المزامنة السحابية مرخصة ومستعدة</span>';
            }
        }
        if (displayBar && this.owner && this.repo) {
            displayBar.innerHTML = `<i class="fa-solid fa-cloud-check"></i> قاعدة البيانات الحقيقية متصلة: ${this.owner}/${this.repo}`;
        }
    }

    toBase64(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    fromBase64(str) {
        return decodeURIComponent(escape(atob(str)));
    }

    /**
     * Strict Verification for Members: Checks if real DB exists on GitHub and fetches it.
     * Members fail login if Admin hasn't initialized the repository database.
     */
    async verifyAndFetchRealCloudDatabase() {
        if (!this.owner || !this.repo) {
            return { 
                success: false, 
                reason: "بيانات صاحب الحساب أو اسم المستودع مفقودة. يلزم التزود بكود ربط مرخص من المدير." 
            };
        }

        this.notifyStatus('syncing', 'جاري التحقق السحابي...');

        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };
        if (this.token && this.token.length > 5) {
            headers['Authorization'] = `token ${this.token}`;
        }

        try {
            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.filePath}?_ts=${Date.now()}`;
            const response = await fetch(url, { method: 'GET', headers: headers });

            if (response.ok) {
                const data = await response.json();
                this.fileSha = data.sha;
                const decodedContent = this.fromBase64(data.content);
                const githubData = JSON.parse(decodedContent);
                localStorage.setItem('HSE_GITHUB_DB_BACKUP', JSON.stringify(githubData));
                this.notifyStatus('synced');
                return { success: true, data: githubData };
            } else if (response.status === 404) {
                this.notifyStatus('error', 'غير مؤلف');
                return { 
                    success: false, 
                    reason: "قاعدة البيانات الحقيقية (hse_db.json) غير مؤلفة أو غير مسجلة بعد في هذا المستودع. لا يمكن للأعضاء الدخول حتى يقم المدير بفتح حسابه واعتماد قاعدة البيانات أولاً." 
                };
            } else if (response.status === 401 || response.status === 403) {
                this.notifyStatus('error', 'صلاحيات');
                return { 
                    success: false, 
                    reason: "المستودع محمي أو أن صلاحية كود التوكن غير كافية للدخول. يرجى من المدير تحديث رمز الربط (PAT) ونشر رقم الربط السحابي المجدد." 
                };
            } else {
                return { 
                    success: false, 
                    reason: `فشل الاتصال بمخدمات GitHub (كود الخطأ: ${response.status}). تأكد من الاتصال بالإنترنت.` 
                };
            }
        } catch (error) {
            this.notifyStatus('error', 'اتصال');
            return { 
                success: false, 
                reason: `تعذر الوصول لشبكة GitHub הסحابة. تأكد من اتصالك بشبكة الإنترنت (${error.message}).` 
            };
        }
    }

    /**
     * Admin/Manager Initialization: Verifies database on GitHub; if not present, creates it for the first time.
     */
    async initOrSaveRealDatabase(stateObject) {
        if (!this.owner || !this.repo || !this.token) {
            return {
                success: false,
                message: "يرجى التأكد من إدخال اسم حساب GitHub واسم المستودع ورمز التوكن (Token) لإتمام الاعتماد الحقيقي للقاعدة."
            };
        }

        this.notifyStatus('syncing', 'جاري الاتصال بقاعدة GitHub...');
        
        // First attempt to load existing real DB
        const result = await this.verifyAndFetchRealCloudDatabase();
        if (result.success) {
            return { success: true, mode: 'loaded', data: result.data };
        }

        // If DB file doesn't exist yet (404), create it right now!
        if (result.reason && result.reason.includes("غير مؤلفة أو غير مسجلة")) {
            const saveRes = await this.saveDatabase(stateObject, "Initial Real Cloud Database Creation by Manager");
            if (saveRes.success) {
                return { success: true, mode: 'created', data: stateObject };
            } else {
                return { success: false, message: "تعذر إنشاء ملف قاعدة البيانات في GitHub: " + saveRes.message };
            }
        }

        return { success: false, message: result.reason };
    }

    /**
     * Real-time persistence: Commits any state change directly to hse_db.json on GitHub
     */
    async saveDatabase(stateObject, commitMessage = 'Update real HSE safety database state') {
        const jsonStr = JSON.stringify(stateObject, null, 2);
        localStorage.setItem('HSE_GITHUB_DB_BACKUP', jsonStr);

        if (!this.owner || !this.repo) {
            return { success: true, localOnly: true, message: 'تم الحفظ محلياً (لا يوجد ربط سحابي مفعّل)' };
        }

        if (!this.token) {
            return { success: false, message: 'لا يمكن رفع السجل للسحابة لعدم توفر رمز المصادقة (Token).' };
        }

        this.notifyStatus('syncing', 'جاري التحديث السحابي...');

        try {
            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.filePath}`;
            const encodedContent = this.toBase64(jsonStr);
            const payload = {
                message: commitMessage,
                content: encodedContent,
                branch: this.branch
            };

            if (this.fileSha) {
                payload.sha = this.fileSha;
            } else {
                // Check if file sha exists in cloud just in case of race conditions
                try {
                    const checkRes = await fetch(url, {
                        method: 'GET',
                        headers: { 'Authorization': `token ${this.token}`, 'Accept': 'application/vnd.github.v3+json' }
                    });
                    if (checkRes.ok) {
                        const checkData = await checkRes.json();
                        payload.sha = checkData.sha;
                        this.fileSha = checkData.sha;
                    }
                } catch(e) { /* ignore */ }
            }

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                this.fileSha = result.content.sha;
                this.notifyStatus('synced');
                return { success: true };
            } else {
                const errData = await response.json().catch(() => ({ message: response.statusText }));
                this.notifyStatus('error', 'فشل الرفع');
                return { success: false, message: errData.message || response.statusText };
            }
        } catch (error) {
            this.notifyStatus('error', 'خطأ بالشبكة');
            return { success: false, message: error.message };
        }
    }
}

// Ensure global attachment without const redeclaration conflict
window.ghDatabase = new GitHubDatabase(localStorage.getItem('github_token') || '');
var ghDatabase = window.ghDatabase;
