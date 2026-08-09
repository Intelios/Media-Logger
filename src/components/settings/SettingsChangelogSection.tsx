import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import changelogData from '../../data/changelog.json';
import tauriConfig from '../../../src-tauri/tauri.conf.json';

type ChangelogRelease = {
    version: string;
    title: string;
    date: string;
    body: string;
    prerelease: boolean;
    url?: string;
};

type ChangelogData = {
    generatedAt: string | null;
    source: string;
    repository: string | null;
    releases: ChangelogRelease[];
};

const changelog = changelogData as ChangelogData;
const markdownPlugins = [remarkGfm];

function formatReleaseDate(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return value || 'Unknown date';

    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    }).format(new Date(year, month - 1, day));
}

function formatGeneratedAt(value: string | null): string {
    if (!value) return 'Not synced yet';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(date);
}

export default function SettingsChangelogSection() {
    const [expandedReleaseVersion, setExpandedReleaseVersion] = useState<string | null>(
        () => changelog.releases[0]?.version ?? null,
    );
    const latestRelease = changelog.releases[0];

    return (
        <div className="settings-section-enter" key="changelog">
            <section className="settings-card changelog-summary">
                <div className="settings-row changelog-summary-row">
                    <div className="changelog-summary-header">
                        <div className="changelog-summary-icon"><ScrollText size={24} /></div>
                        <div>
                            <div className="settings-row-label">Published GitHub Releases</div>
                            <div className="settings-row-description">
                                Release notes are synced during development and bundled into the app for offline viewing.
                            </div>
                        </div>
                    </div>

                    <div className="changelog-summary-grid">
                        <div className="changelog-summary-card">
                            <span className="changelog-summary-value">{tauriConfig.version}</span>
                            <span className="changelog-summary-label">Current Version</span>
                        </div>
                        <div className="changelog-summary-card">
                            <span className="changelog-summary-value">{changelog.releases.length}</span>
                            <span className="changelog-summary-label">Releases</span>
                        </div>
                        <div className="changelog-summary-card">
                            <span className="changelog-summary-value">{latestRelease?.version ?? 'None'}</span>
                            <span className="changelog-summary-label">Latest Synced</span>
                        </div>
                        <div className="changelog-summary-card">
                            <span className="changelog-summary-value changelog-summary-date">{formatGeneratedAt(changelog.generatedAt)}</span>
                            <span className="changelog-summary-label">Last Updated</span>
                        </div>
                    </div>
                </div>
            </section>

            {changelog.releases.length > 0 ? changelog.releases.map((release) => {
                const isExpanded = expandedReleaseVersion === release.version;
                return (
                    <section className="settings-card changelog-release" key={release.version}>
                        <button
                            type="button"
                            className="changelog-release-header"
                            onClick={() => setExpandedReleaseVersion(isExpanded ? null : release.version)}
                            aria-expanded={isExpanded}
                        >
                            <div className="changelog-release-heading">
                                <div className="changelog-release-meta">
                                    <span className="changelog-version-badge">{release.version}</span>
                                    {release.prerelease && <span className="changelog-prerelease-badge">Prerelease</span>}
                                </div>
                                <div className="changelog-release-title">{release.title}</div>
                                <div className="settings-row-description">{formatReleaseDate(release.date)}</div>
                            </div>
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>

                        {isExpanded && (
                            <div className="changelog-release-body">
                                {release.body ? (
                                    <div className="changelog-markdown">
                                        <ReactMarkdown remarkPlugins={markdownPlugins}>{release.body}</ReactMarkdown>
                                    </div>
                                ) : (
                                    <p className="changelog-empty-note">No release notes were provided for this release.</p>
                                )}
                            </div>
                        )}
                    </section>
                );
            }) : (
                <section className="settings-card">
                    <div className="settings-row">
                        <div>
                            <div className="settings-row-label">No releases synced</div>
                            <div className="settings-row-description">
                                Run the changelog sync command during development to refresh this bundled view.
                            </div>
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}
