export default class Profil {
    constructor(data = {}) {
        this.username     = data.username     || '';
        this.email        = data.email        || '';
        this.display_name = data.display_name || '';
        this.avatar       = data.avatar       || null;
        this.created_at   = data.created_at   || null;
        this.plan         = data.plan         || 'basis';
    }

    get initials() {
        const name = this.display_name || this.email;
        return name
            .split(/[\s@]/)
            .filter(Boolean)
            .slice(0, 2)
            .map(p => p[0].toUpperCase())
            .join('');
    }

    get planLabel() {
        const labels = { free: 'Free', pro: 'Pro ⭐' };
        return labels[this.plan] || this.plan;
    }

    get memberSince() {
        if (!this.created_at) return '—';
        return new Date(this.created_at).toLocaleDateString('de-DE', {
            day: '2-digit', month: 'long', year: 'numeric'
        });
    }

    toJSON() {
        return {
            username:     this.username,
            email:        this.email,
            display_name: this.display_name,
            avatar:       this.avatar,
            plan:         this.plan,
        };
    }

    static fromServer(data) {
        return new Profil(data);
    }
}