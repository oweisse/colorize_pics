import { openDB, type DBSchema } from 'idb';

interface ColorizeDB extends DBSchema {
    files: {
        key: string;
        value: {
            id: string;
            file: File;
            timestamp: number;
        };
    };
    results: {
        key: string;
        value: {
            id: string; // correlates to file id
            timestamp: number;
            // Legacy fields (for migration)
            resultData?: string;
            cost?: number;
            cumulativeCost?: number;
            prompt?: string;
            // New field
            versions?: Array<{
                resultData: string;
                cost?: number;
                costDetails?: any;
                prompt?: string;
                timestamp: number;
            }>;
        };
    };
}

const DB_NAME = 'colorizer-db';
const DB_VERSION = 1;

export const initDB = async () => {
    return openDB<ColorizeDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains('files')) {
                db.createObjectStore('files', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('results')) {
                db.createObjectStore('results', { keyPath: 'id' });
            }
        },
    });
};

export const saveFile = async (id: string, file: File) => {
    const db = await initDB();
    await db.put('files', { id, file, timestamp: Date.now() });
};

export const saveResult = async (id: string, resultData: string, runCost?: number, cumulativeCost?: number, prompt?: string, costDetails?: any) => {
    const db = await initDB();
    const existing = await db.get('results', id);

    let versions = existing?.versions || [];

    // Migration check: if existing has legacy data but no versions, create version 0
    if (!existing?.versions && existing?.resultData) {
        versions.push({
            resultData: existing.resultData,
            cost: existing.cost,
            prompt: existing.prompt,
            timestamp: existing.timestamp,
            // Legacy usually implies no detailed breakdown stored yet
        });
    }

    // Add new version
    versions.push({
        resultData,
        cost: runCost,
        costDetails, // Store full details
        prompt,
        timestamp: Date.now()
    });

    await db.put('results', {
        id,
        timestamp: Date.now(),
        cumulativeCost, // Cumulative stays at root level for easy access
        versions
    });
};

export const savePrompt = async (id: string, prompt: string) => {
    const db = await initDB();
    const existing = await db.get('results', id);

    // We update the prompt of the *latest* version if it exists, 
    // OR if we are in "draft mode", strictly speaking we might want to save a draft.
    // But per user request "save changes to the prompt", we'll update the latest version prompt
    // OR create a placeholder if none exists.

    if (existing) {
        if (existing.versions && existing.versions.length > 0) {
            // Update latest version's prompt
            const latest = existing.versions[existing.versions.length - 1];
            latest.prompt = prompt;
            await db.put('results', existing);
        } else if (existing.resultData) {
            // Legacy fallback update
            existing.prompt = prompt;
            await db.put('results', existing);
        } else {
            // Structure exists but no versions/result? (Edge case)
            // Maybe we should store a top-level 'draftPrompt'?
            // For now let's just create a shell version or top level prompt field persistence 
            // isn't strictly defined by schema for 'drafts'.
            // Let's stick to the previous behavior: update root prompt if versions empty.
            existing.prompt = prompt;
            await db.put('results', existing);
        }
    } else {
        // Create new entry
        await db.put('results', {
            id,
            timestamp: Date.now(),
            prompt // No versions yet, just a draft prompt
        });
    }
};

export const getFiles = async () => {
    const db = await initDB();
    return db.getAll('files');
};

export const getResults = async () => {
    const db = await initDB();
    return db.getAll('results');
};

export const deleteFile = async (id: string) => {
    const db = await initDB();
    await db.delete('files', id);
    await db.delete('results', id); // Cascade delete result
};

export const clearAll = async () => {
    const db = await initDB();
    await db.clear('files');
    await db.clear('results');
};

export const exportDatabase = async () => {
    const db = await initDB();
    const files = await db.getAll('files');
    const results = await db.getAll('results');

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    // Add Results JSON
    zip.file("results.json", JSON.stringify(results, null, 2));

    // Add Metadata for Files 
    // We can't easily recreate File objects from just ID in export unless we store metadata.
    // The 'files' store contains { id, file, timestamp }. 'file' is a File object (Blob-like).
    // We will save the file content in a folder 'files/' and a metadata JSON for reconstruction.

    const filesMetadata = files.map(f => ({
        id: f.id,
        name: f.file.name,
        type: f.file.type,
        lastModified: f.file.lastModified,
        timestamp: f.timestamp
    }));
    zip.file("files.json", JSON.stringify(filesMetadata, null, 2));

    const filesFolder = zip.folder("files");
    if (filesFolder) {
        files.forEach(f => {
            filesFolder.file(f.id, f.file);
        });
    }

    const blob = await zip.generateAsync({ type: "blob" });
    return blob;
};

export const importDatabase = async (zipFile: File) => {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(zipFile);

    const resultsFile = zip.file("results.json");
    const filesMetaFile = zip.file("files.json");

    if (!resultsFile || !filesMetaFile) {
        throw new Error("Invalid backup format: Missing metadata files.");
    }

    const results = JSON.parse(await resultsFile.async("string"));
    const filesMetadata = JSON.parse(await filesMetaFile.async("string"));

    const filesFolder = zip.folder("files");

    const reconstructedFiles: any[] = [];

    for (const meta of filesMetadata) {
        if (filesFolder) {
            const fileData = await filesFolder.file(meta.id)?.async("blob");
            if (fileData) {
                const newFile = new File([fileData], meta.name, { type: meta.type, lastModified: meta.lastModified });
                reconstructedFiles.push({
                    id: meta.id,
                    file: newFile,
                    timestamp: meta.timestamp
                });
            }
        }
    }

    // Clear existing and restore
    await clearAll();

    const db = await initDB();
    const tx = db.transaction(['files', 'results'], 'readwrite');

    const fileStore = tx.objectStore('files');
    for (const f of reconstructedFiles) {
        await fileStore.put(f);
    }

    const resultStore = tx.objectStore('results');
    for (const r of results) {
        await resultStore.put(r);
    }

    await tx.done;
};
