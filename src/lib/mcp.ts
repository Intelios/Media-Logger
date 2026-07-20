import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { dbService } from './db';
import {
    ADULT_MEDIA_VISIBILITY_CHANGED_EVENT,
    isAdultMediaEnabled,
} from './settings';

export type McpRuntimeState = 'off' | 'starting' | 'running' | 'error';

export type McpCredential = {
    id: string;
    label: string;
    createdAt: string;
    lastUsedAt: string | null;
};

export type McpStatus = {
    enabled: boolean;
    runtimeState: McpRuntimeState;
    endpoint: string | null;
    port: number | null;
    adultOptIn: boolean;
    globalAdultEnabled: boolean;
    adultMediaIncluded: boolean;
    credentials: McpCredential[];
    lastActivity: string | null;
    error: string | null;
};

/**
 * A newly-created bearer token is returned exactly once. Only its hash is
 * retained by the native process, so callers must show/copy it immediately.
 */
export type McpCredentialSecret = {
    credential: McpCredential;
    token: string;
    endpoint: string;
};

export type McpAuditEvent = {
    timestamp: string;
    connectionLabel: string;
    toolName: string;
    outcome: string;
    returnedCount: number | null;
};

export const MCP_STATUS_CHANGED_EVENT = 'mcp-status-changed';
export const MCP_ACCESS_LOG_CHANGED_EVENT = 'mcp-access-log-changed';

let pendingRuntimeSync: Promise<McpStatus> | null = null;
let pendingDatabaseResync: Promise<McpStatus> | null = null;

function publishStatus(status: McpStatus): McpStatus {
    window.dispatchEvent(new CustomEvent<McpStatus>(MCP_STATUS_CHANGED_EVENT, { detail: status }));
    return status;
}

async function invokeStatus(
    command: string,
    args?: Record<string, unknown>,
): Promise<McpStatus> {
    return publishStatus(await invoke<McpStatus>(command, args));
}

export function getMcpStatus(): Promise<McpStatus> {
    return invokeStatus('mcp_get_status');
}

/**
 * Opens/migrates the app database first, then gives the native MCP runtime the
 * exact database path selected by the normal connection flow. The Rust side
 * normalizes plugin-sql's `sqlite:` prefix and opens its own read-only handle.
 *
 * Concurrent calls are coalesced so React Strict Mode's development remount
 * cannot race two initial server starts.
 */
export function syncMcpRuntime(): Promise<McpStatus> {
    if (pendingRuntimeSync) return pendingRuntimeSync;

    const sync = (async () => {
        const db = await dbService.connect();
        return invokeStatus('mcp_sync_runtime', {
            dbPath: db.path,
            globalAdultEnabled: isAdultMediaEnabled(),
        });
    })();

    pendingRuntimeSync = sync;
    void sync.then(
        () => {
            if (pendingRuntimeSync === sync) pendingRuntimeSync = null;
        },
        () => {
            if (pendingRuntimeSync === sync) pendingRuntimeSync = null;
        },
    );
    return sync;
}

/**
 * Re-runs the app's normal path-aware connection flow and then updates MCP.
 * If startup is still in flight, the path change is queued after it rather
 * than being swallowed by startup coalescing.
 */
export function resyncMcpDatabase(): Promise<McpStatus> {
    // The settings setter emits a process-wide path event and its UI also awaits
    // this helper for feedback. Coalesce those calls into one native resync.
    if (pendingDatabaseResync) return pendingDatabaseResync;

    const resync = (async () => {
        const activeSync = pendingRuntimeSync;
        if (activeSync) {
            try {
                await activeSync;
            } catch {
                // A path change may repair the failure that broke the initial sync.
            }
        }
        return syncMcpRuntime();
    })();

    pendingDatabaseResync = resync;
    void resync.then(
        () => {
            if (pendingDatabaseResync === resync) pendingDatabaseResync = null;
        },
        () => {
            if (pendingDatabaseResync === resync) pendingDatabaseResync = null;
        },
    );
    return resync;
}

export async function setMcpEnabled(enabled: boolean): Promise<McpStatus> {
    // Enabling needs a validated DB path. Disabling must remain immediate.
    if (enabled) await syncMcpRuntime();
    return invokeStatus('mcp_set_enabled', { enabled });
}

export function setMcpAdultOptIn(enabled: boolean): Promise<McpStatus> {
    return invokeStatus('mcp_set_adult_opt_in', { enabled });
}

/**
 * Updates the native half of the global adult-media gate. Callers disabling
 * the app-wide setting must await this before persisting/updating the UI.
 */
export function setMcpGlobalAdultEnabled(enabled: boolean): Promise<McpStatus> {
    return invokeStatus('mcp_set_global_adult_policy', { enabled });
}

export function createMcpCredential(label: string): Promise<McpCredentialSecret> {
    return invoke<McpCredentialSecret>('mcp_create_credential', { label });
}

export function revokeMcpCredential(credentialId: string): Promise<McpStatus> {
    return invokeStatus('mcp_revoke_credential', { credentialId });
}

export function getMcpAccessLog(): Promise<McpAuditEvent[]> {
    return invoke<McpAuditEvent[]>('mcp_get_access_log');
}

export async function clearMcpAccessLog(): Promise<void> {
    await invoke<void>('mcp_clear_access_log');
    window.dispatchEvent(new Event(MCP_ACCESS_LOG_CHANGED_EVENT));
}

export function chooseNewMcpEndpoint(): Promise<McpStatus> {
    return invokeStatus('mcp_choose_new_endpoint');
}

/**
 * Stops the listener and drops the current read-only database handle without
 * changing the persisted master toggle, endpoint, or credentials. Settings
 * calls this before mutating the data-directory preference so a failed move
 * can never leave MCP serving the previous library under a new UI path.
 */
export async function suspendMcpRuntime(): Promise<McpStatus> {
    // A bootstrap sync may still be resolving the old database path. Let it
    // finish before suspending so it cannot restart the old listener after the
    // suspension command returns.
    const activeSync = pendingRuntimeSync;
    if (activeSync) {
        try {
            await activeSync;
        } catch {
            // Suspending is still required after a failed bootstrap.
        }
    }
    return invokeStatus('mcp_suspend_runtime');
}

function escapeTomlBasicString(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

/** Copyable Codex `config.toml` fragment; this never edits Codex settings. */
export function buildCodexMcpConfig(secret: McpCredentialSecret): string {
    const endpoint = escapeTomlBasicString(secret.endpoint);
    const authorization = escapeTomlBasicString(`Bearer ${secret.token}`);
    return [
        '[mcp_servers.media_logger]',
        `url = "${endpoint}"`,
        `http_headers = { Authorization = "${authorization}" }`,
        'required = false',
    ].join('\n');
}

/** Copyable VS Code user `mcp.json`; this never edits VS Code settings. */
export function buildVsCodeMcpConfig(secret: McpCredentialSecret): string {
    return JSON.stringify({
        servers: {
            'media-logger': {
                type: 'http',
                url: secret.endpoint,
                headers: {
                    Authorization: 'Bearer ${input:mediaLoggerMcpToken}',
                },
            },
        },
        inputs: [{
            id: 'mediaLoggerMcpToken',
            type: 'promptString',
            description: 'Media Logger MCP bearer token',
            password: true,
        }],
    }, null, 2);
}

/**
 * Keeps the native MCP lifecycle aligned with the app database and privacy
 * policy. It intentionally has no React state: Settings consumes the typed
 * status helpers above, while this hook owns process-level synchronization.
 */
export function useMcpLifecycle(): void {
    useEffect(() => {
        // `npm run dev` is a browser-only preview with no native runtime.
        if (!isTauri()) return;

        let mounted = true;

        const reportFailure = (action: string, error: unknown) => {
            if (mounted) console.error(`[MCP] Failed to ${action}:`, error);
        };

        void syncMcpRuntime().catch((error) => reportFailure('synchronize runtime', error));

        const handleAdultPolicyChange = () => {
            void setMcpGlobalAdultEnabled(isAdultMediaEnabled())
                .catch((error) => reportFailure('update adult-media policy', error));
        };
        window.addEventListener(ADULT_MEDIA_VISIBILITY_CHANGED_EVENT, handleAdultPolicyChange);

        return () => {
            mounted = false;
            window.removeEventListener(ADULT_MEDIA_VISIBILITY_CHANGED_EVENT, handleAdultPolicyChange);
        };
    }, []);
}
