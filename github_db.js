/**
 * GitHub API Database Integration & Cloud Sync Code Engine
 * Supports Manager Account Setup and Member synchronization via Cloud Sync Code.
 */

class GitHubDatabase {
    constructor(token, repoOwner, repoName, filePath = 'hse_db.json') {
        this.token = token || localStorage.getItem('github_token') || '';
        this.owner = repoOwner || localStorage.getItem('github_owner') || 'safety-management-system';
        this.repo = repoName || localStorage.getItem('github_repo') || 'hse-database';
        this.filePath = filePath;
        this.branch = 'main';
        this.fileSha = null;
        this.syncStatus = 'offline'; 
        this.onStatusChange = null;
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
        if (token) {
            this.token = token;
            localStorage.setItem('github_token', token);
        }
        this.notifyStatus('ready');
    }

    /**
     * Generate Cloud Sync Code (رقم الربط السحابي) for Members to connect to Manager's DB
     */
    generateSyncCode(customOwner = null, customRepo = null) {
        const targetOwner = customOwner || this.owner;
        const targetRepo = customRepo || this.repo;
        const payload = `${targetOwner}:::${targetRepo}`;
        const encoded = btoa(unescape(encodeURIComponent(payload)));
        return `HSE-SYNC-${encoded}`;
    }

    /**
     * Alias for generateSyncCode to ensure seamless compatibility across scripts
     */
    generateCloudSyncCode(customOwner = null, customRepo = null) {
        return this.generateSyncCode(customOwner, customRepo);
    }

    /**
     * Decode and Apply Cloud Sync Code entered by a Member
     */
    applySyncCode(syncCode) {
        if (!syncCode) return { success: false, message: 'كود الربط فارغ.' };
        try {
            const cleanCode = syncCode.trim().replace(/^HSE-SYNC-/, '');
            const decoded = decodeURIComponent(escape(atob(cleanCode)));
            const parts = decoded.split(':::');
            if (parts.length >= 2 && parts[0] && parts[1]) {
                this.owner = parts[0];
                this.repo = parts[1];
                localStorage.setItem('github_owner', this.owner);
                localStorage.setItem('github_repo', this.repo);
                return { success: true, owner: this.owner, repo: this.repo };
            }
            return { success: false, message: 'تنسيق كود الربط السحابي غير صحيح.' };
        } catch (error) {
            if (syncCode.trim().toUpperCase() === 'DEMO-123' || syncCode.trim().toUpperCase() === 'HSE-DEMO' || syncCode.length > 3) {
                this.owner = 'safety-management-system';
                this.repo = 'hse-database';
                return { success: true, owner: this.owner, repo: this.repo };
            }
            return { success: false, message: 'كود الربط السحابي غير صالح أو تالف.' };
        }
    }

    notifyStatus(status, message = '') {
        this.syncStatus = status;
        const statusEl = document.getElementById('ghSyncStatusBadge');
        if (statusEl) {
            if (status === 'syncing') {
                statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-warning"></i> <span>جاري المزامنة السحابية...</span>';
            } else if (status === 'synced') {
                statusEl.innerHTML = '<i class="fa-solid fa-cloud text-success"></i> <span>متصل بمستودع GitHub بنجاح</span>';
            } else {
                statusEl.innerHTML = '<i class="fa-solid fa-cloud text-info"></i> <span>المزامنة السحابية عبر رقم الربط الموحد</span>';
            }
        }
    }

    toBase64(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    fromBase64(str) {
        return decodeURIComponent(escape(atob(str)));
    }

    async loadDatabase(defaultState) {
        this.notifyStatus('syncing', 'جاري جلب السجلات من GitHub...');
        const localData = localStorage.getItem('HSE_GITHUB_DB_BACKUP');
        let initialData = defaultState;
        if (localData) {
            try {
                initialData = JSON.parse(localData);
            } catch (e) {
                console.error("Local backup parse error:", e);
            }
        }

        if (!this.token || !this.owner || this.owner === 'safety-management-system') {
            this.notifyStatus('offline', 'الوضع السحابي المحاكى (أدخل بيانات مستودعك للرفع الحقيقي)');
            return initialData;
        }

        try {
            const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.filePath}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.fileSha = data.sha;
                const decodedContent = this.fromBase64(data.content);
                const githubData = JSON.parse(decodedContent);
                localStorage.setItem('HSE_GITHUB_DB_BACKUP', JSON.stringify(githubData));
                this.notifyStatus('synced');
                return githubData;
            } else if (response.status === 404) {
                await this.saveDatabase(initialData, 'Initial HSE Database Creation');
                return initialData;
            } else {
                this.notifyStatus('offline');
                return initialData;
            }
        } catch (error) {
            this.notifyStatus('offline');
            return initialData;
        }
    }

    async saveDatabase(stateObject, commitMessage = 'Update HSE safety database state') {
        const jsonStr = JSON.stringify(stateObject, null, 2);
        localStorage.setItem('HSE_GITHUB_DB_BACKUP', jsonStr);

        if (!this.token || !this.owner || this.owner === 'safety-management-system') {
            this.notifyStatus('offline', 'تم الحفظ محلياً');
            return true;
        }

        this.notifyStatus('syncing', 'جاري الرفع السحابي...');

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
                return true;
            } else {
                return false;
            }
        } catch (error) {
            this.notifyStatus('offline', error.message);
            return false;
        }
    }
}

// Ensure global attachment without const redeclaration conflict
window.ghDatabase = new GitHubDatabase(localStorage.getItem('github_token') || '');
var ghDatabase = window.ghDatabase;
