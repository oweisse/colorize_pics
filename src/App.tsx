
import { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { APIKeyInput } from './components/APIKeyInput';
import { FileUpload } from './components/FileUpload';
import { ImageGallery } from './components/ImageGallery';
import { Colorizer } from './components/Colorizer';
import { ResizableSidebar } from './components/ResizableSidebar';
import { createPortal } from 'react-dom';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Download, Loader2, Trash2, Wand2, Save, Upload } from 'lucide-react';
import { saveFile, saveResult, getFiles, getResults, deleteFile, clearAll, savePrompt, exportDatabase, importDatabase } from './lib/db';
import { processImageColorization } from './lib/processing';

export interface CostDetails {
  total: number;
  input: number;
  output: number;
  inputTokens: number;
  outputTokens: number;
  inputRate: number;
  outputRate: number;
}

export interface Version {
  resultData: string;
  cost?: number;
  costDetails?: CostDetails;
  prompt?: string;
  timestamp: number;
}

function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("gemini_api_key") || "");
  const [files, setFiles] = useState<{ id: string; file: File }[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  // Results is now a list of versions
  const [results, setResults] = useState<Record<string, Version[]>>({});

  const [costs, setCosts] = useState<Record<string, number>>({});
  const [prompts, setPrompts] = useState<Record<string, string>>({}); // Current 'draft' prompt or latest prompt
  const [objectUrls, setObjectUrls] = useState<Record<string, string>>({});
  const [isZipping, setIsZipping] = useState(false);

  useEffect(() => {
    if (apiKey) localStorage.setItem("gemini_api_key", apiKey);
  }, [apiKey]);

  // Load from DB on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedFiles = await getFiles();
        const savedResults = await getResults();

        if (savedFiles.length > 0) {
          savedFiles.sort((a, b) => a.timestamp - b.timestamp);

          const loadedFiles = savedFiles.map(item => ({ id: item.id, file: item.file }));
          const newUrls: Record<string, string> = {};

          loadedFiles.forEach(item => {
            newUrls[item.id] = URL.createObjectURL(item.file);
          });

          setFiles(loadedFiles);
          setObjectUrls(prev => ({ ...prev, ...newUrls }));

          if (savedResults.length > 0) {
            const resultsRecord: Record<string, Version[]> = {};
            const costRecord: Record<string, number> = {};
            const promptRecord: Record<string, string> = {};

            savedResults.forEach(r => {
              // Migration Logic
              let versions: Version[] = r.versions || [];
              if (versions.length === 0 && r.resultData) {
                versions = [{
                  resultData: r.resultData,
                  cost: r.cost, // legacy field
                  prompt: r.prompt, // legacy field
                  timestamp: r.timestamp
                }];
              }

              resultsRecord[r.id] = versions;

              // Cumulative cost
              if (r.cumulativeCost !== undefined) {
                costRecord[r.id] = r.cumulativeCost;
              } else {
                // Fallback to sum of versions if no cumulative stored yet
                costRecord[r.id] = versions.reduce((sum, v) => sum + (v.cost || 0), 0);
              }

              // Prompt: prefer top-level draft prompt if versions empty, else latest version prompt
              if (r.prompt) {
                promptRecord[r.id] = r.prompt;
              } else if (versions.length > 0) {
                promptRecord[r.id] = versions[versions.length - 1].prompt || "";
              }
            });
            setResults(resultsRecord);
            setCosts(costRecord);
            setPrompts(promptRecord);
          }

          if (loadedFiles.length > 0) {
            setSelectedFileId(loadedFiles[loadedFiles.length - 1].id);
          }
        }
      } catch (e) {
        console.error("Failed to load history", e);
      }
    };
    loadData();
  }, []);

  const handleUpload = (newFiles: File[]) => {
    const newEntries = newFiles.map(f => ({
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2),
      file: f
    }));

    setFiles(prev => [...prev, ...newEntries]);

    const newUrls: Record<string, string> = {};
    newEntries.forEach(entry => {
      saveFile(entry.id, entry.file).catch(e => console.error("DB Save failed", e));
      newUrls[entry.id] = URL.createObjectURL(entry.file);
    });
    setObjectUrls(prev => ({ ...prev, ...newUrls }));

    if (!selectedFileId && newEntries.length > 0) {
      setSelectedFileId(newEntries[0].id);
    }
  };

  const handleRemoveFile = (fileId: string) => {
    const entryToRemove = files.find(x => x.id === fileId);
    if (!entryToRemove) return;

    if (!confirm("Are you sure you want to delete this photo?")) return;

    deleteFile(fileId).catch(console.error);
    if (objectUrls[fileId]) URL.revokeObjectURL(objectUrls[fileId]);

    setFiles(prev => prev.filter(x => x.id !== fileId));
    setObjectUrls(prev => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
    setResults(prev => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
    setCosts(prev => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
    setPrompts(prev => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });

    if (selectedFileId === fileId) {
      setSelectedFileId(null);
    }
  };

  const handleFileUpdate = (fileId: string, newFile: File) => {
    // Update State
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, file: newFile } : f));

    // Update Object URL
    if (objectUrls[fileId]) URL.revokeObjectURL(objectUrls[fileId]);
    const newUrl = URL.createObjectURL(newFile);
    setObjectUrls(prev => ({ ...prev, [fileId]: newUrl }));

    // Update DB
    saveFile(fileId, newFile).catch(e => console.error("DB Update failed", e));
  };

  const handleForget = async () => {
    if (!confirm("Are you sure you want to delete all photos and results? This cannot be undone.")) return;

    try {
      await clearAll();
      Object.values(objectUrls).forEach(url => URL.revokeObjectURL(url));

      setFiles([]);
      setResults({});
      setCosts({});
      setPrompts({});
      setObjectUrls({});
      setSelectedFileId(null);
    } catch (e) {
      console.error("Failed to clear DB", e);
      alert("Failed to clear history.");
    }
  };

  const handleDownloadAll = async () => {
    if (Object.keys(results).length === 0) return;

    setIsZipping(true);
    const zip = new JSZip();

    try {
      const promises = Object.entries(results).map(async ([fileId, versions]) => {
        // If no versions, skip
        if (!versions || versions.length === 0) return;

        // Find original filename
        const entry = files.find(x => x.id === fileId);
        const originalName = entry ? entry.file.name.replace(/\.[^/.]+$/, "") : "image";

        // Iterate all versions
        const versionPromises = versions.map(async (v, index) => {
          const url = v.resultData;
          const suffix = versions.length > 1 ? `-v${index + 1}` : '';

          // Get serial number (1-based index)
          const globalIndex = files.findIndex(f => f.id === fileId);
          const serialNumber = globalIndex !== -1 ? globalIndex + 1 : 0;

          try {
            const response = await fetch(url);
            const blob = await response.blob();
            zip.file(`#${serialNumber}-colorized-${originalName}${suffix}.jpg`, blob);
          } catch (err) {
            console.error(`Failed to fetch version ${index + 1} for ${originalName}`, err);
          }
        });

        await Promise.all(versionPromises);
      });

      await Promise.all(promises);

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "colorized-photos-all-versions.zip");
    } catch (e) {
      console.error("Failed to zip files", e);
      alert("Failed to create zip file.");
    } finally {
      setIsZipping(false);
    }
  };

  const getObjectUrl = (id: string) => {
    return objectUrls[id];
  };

  const handleBackup = async () => {
    try {
      const zipBlob = await exportDatabase();
      saveAs(zipBlob, `colorizer_backup_${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (e) {
      console.error("Backup failed", e);
      alert("Backup failed. See console for details.");
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("Restoring will overwrite all current data. Are you sure?")) {
      e.target.value = ""; // reset
      return;
    }

    try {
      await importDatabase(file);
      alert("Restore complete. The page will reload.");
      window.location.reload();
    } catch (err) {
      console.error("Restore failed", err);
      alert("Restore failed. Ensure this is a valid backup file.");
    } finally {
      e.target.value = "";
    }
  };

  const handleResult = (fileId: string, resultUrl: string, cost?: number, prompt?: string, costDetails?: CostDetails) => {
    // Calculate new cumulative cost
    const currentCumulative = costs[fileId] || 0;
    const newCumulative = currentCumulative + (cost || 0);

    // Save
    saveResult(fileId, resultUrl, cost, newCumulative, prompt, costDetails).catch(console.error);

    // Update State
    // Append new version
    const newVersion: Version = {
      resultData: resultUrl,
      cost: cost,
      costDetails: costDetails,
      prompt: prompt,
      timestamp: Date.now()
    };

    setResults(prev => ({
      ...prev,
      [fileId]: [...(prev[fileId] || []), newVersion]
    }));

    setCosts(prev => ({ ...prev, [fileId]: newCumulative }));

    if (prompt) {
      setPrompts(prev => ({ ...prev, [fileId]: prompt }));
    }
  };

  const handlePromptChange = (val: string) => {
    if (!selectedFileId) return;
    setPrompts(prev => ({ ...prev, [selectedFileId]: val }));
    savePrompt(selectedFileId, val).catch(console.error);
  };

  const selectedWrapper = files.find(x => x.id === selectedFileId);
  const totalSpent = Object.values(costs).reduce((a, b) => a + b, 0);

  const [headerNode, setHeaderNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHeaderNode(document.getElementById('header-actions'));
  }, []);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (!files.length) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIndex = selectedFileId ? files.findIndex(f => f.id === selectedFileId) : -1;
        const nextIndex = currentIndex < files.length - 1 ? currentIndex + 1 : currentIndex;
        if (nextIndex !== currentIndex && nextIndex >= 0) {
          setSelectedFileId(files[nextIndex].id);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = selectedFileId ? files.findIndex(f => f.id === selectedFileId) : 0;
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        if (prevIndex !== currentIndex) {
          setSelectedFileId(files[prevIndex].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [files, selectedFileId]);

  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; currentGlobalIndices?: number[] }>({ current: 0, total: 0 });
  const stopBatchRef = useRef(false);

  const handleStopBatch = () => {
    stopBatchRef.current = true;
    setIsStopping(true);
  };

  const handleBatchColorize = async () => {
    if (!apiKey) {
      alert("Please enter your API Key first.");
      return;
    }

    // Filter for files that have NO results (empty array or undefined)
    const pendingFiles = files.filter(f => !results[f.id] || results[f.id].length === 0);

    if (pendingFiles.length === 0) {
      alert("No pending photos to colorize.");
      return;
    }

    if (!confirm(`This will colorize ${pendingFiles.length} photos. Are you sure?`)) return;

    setIsBatchProcessing(true);
    setIsStopping(false);
    // Initialize active global indices
    setBatchProgress({ current: 0, total: pendingFiles.length, currentGlobalIndices: [] });
    stopBatchRef.current = false;

    // Use default prompt if set for the file, or a generic default
    const defaultPrompt = "Colorize this black and white image realistically. Bring out the natural skin tones and environment colors.";

    let processedCount = 0;
    let activeWorkers = 0;
    let nextIndex = 0;
    const CONCURRENCY_LIMIT = 5;
    const activeIndicesSet = new Set<number>();

    // Helper to update progress UI
    const updateProgress = () => {
      const currentGlobalIndices = Array.from(activeIndicesSet).sort((a, b) => a - b);
      setBatchProgress({
        current: processedCount,
        total: pendingFiles.length,
        currentGlobalIndices
      });

      // Select the last added active index for visual feedback
      if (currentGlobalIndices.length > 0) {
        // Find the ID corresponding to the last added index is a bit tricky since we track global indices
        // but we just want to show *something* is happening.
        // Let's just pick the highest index currently being processed to follow along roughly
        const lastIndex = currentGlobalIndices[currentGlobalIndices.length - 1];
        if (lastIndex >= 0 && lastIndex < files.length) {
          setSelectedFileId(files[lastIndex].id);
        }
      }
    };

    const processNext = async () => {
      if (stopBatchRef.current || nextIndex >= pendingFiles.length) {
        return;
      }

      const currentIndex = nextIndex++;
      const fileEntry = pendingFiles[currentIndex];
      const globalIndex = files.findIndex(f => f.id === fileEntry.id);

      activeWorkers++;
      activeIndicesSet.add(globalIndex + 1); // 1-based index for display
      updateProgress();

      try {
        const result = await processImageColorization(
          fileEntry.file,
          apiKey,
          prompts[fileEntry.id] || defaultPrompt,
          "gemini-3.1-flash-image-preview",
          objectUrls[fileEntry.id]
        );

        // Save result
        handleResult(fileEntry.id, result.imageUrl, result.cost, result.prompt, result.costDetails);
      } catch (e) {
        console.error(`Failed to colorize ${fileEntry.file.name}`, e);
      } finally {
        activeWorkers--;
        activeIndicesSet.delete(globalIndex + 1);
        processedCount++;
        updateProgress();

        // If not stopped, trigger next
        if (!stopBatchRef.current) {
          await processNext();
        }
      }
    };

    // Start initial batch
    const initialWorkers = [];
    for (let i = 0; i < CONCURRENCY_LIMIT && i < pendingFiles.length; i++) {
      initialWorkers.push(processNext());
    }

    await Promise.all(initialWorkers);



    setIsBatchProcessing(false);
    setIsStopping(false);
  };

  return (
    <Layout>
      {headerNode && createPortal(
        <div className="flex items-center gap-2 md:gap-3">
          {isBatchProcessing ? (
            <div className="flex items-center gap-2 animate-in slide-in-from-left-2 mr-auto">
              <div className="flex items-center gap-3 bg-card border border-border px-3 py-1.5 rounded-lg shadow-sm">
                <div className="flex flex-col min-w-[300px]">
                  <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground mb-1">
                    <span className="truncate max-w-[250px]" title={`Processing ${batchProgress.currentGlobalIndices?.map(i => `#${i}`).join(', ')}`}>
                      Processing {batchProgress.currentGlobalIndices?.map(i => `#${i}`).join(', ') || '...'}
                    </span>
                    <span>{batchProgress.current} / {batchProgress.total}</span>
                  </div>
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300 ease-out"
                      style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={handleStopBatch}
                disabled={isStopping}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all disabled:opacity-70 disabled:cursor-wait"
              >
                {isStopping ? "STOPPING..." : "STOP"}
              </button>
            </div>
          ) : null}

          <div className="mr-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded-lg text-xs font-semibold flex flex-col items-end leading-none">
            <span className="text-[10px] opacity-70 uppercase tracking-widest">Total Spent</span>
            <span>${totalSpent.toFixed(4)}</span>
          </div>

          <APIKeyInput savedKey={apiKey} onKeySubmit={setApiKey} />

          {!isBatchProcessing && (
            <>
              <button
                onClick={handleBatchColorize}
                disabled={Object.keys(results).length === files.length}
                className="bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-all shadow-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                title="Colorize all pending photos"
              >
                <Wand2 className="w-3 h-3" />
                <span className="hidden sm:inline">Colorize Pending</span>
              </button>
            </>
          )}

          {Object.keys(results).length > 0 && !isBatchProcessing && (
            <button
              onClick={handleDownloadAll}
              disabled={isZipping}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-all shadow-sm whitespace-nowrap"
              title="Download all colorized results"
            >
              {isZipping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              <span className="hidden sm:inline">Save All Versions</span>
            </button>
          )}

          {files.length > 0 && (
            <button
              onClick={handleForget}
              className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-all shadow-sm whitespace-nowrap"
              title="Forget all photos"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}

          <div className="h-6 w-px bg-border mx-1" />

          <button
            onClick={handleBackup}
            disabled={files.length === 0}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-all shadow-sm whitespace-nowrap disabled:opacity-50"
            title="Backup Database"
          >
            <Save className="w-3 h-3" />
            <span className="hidden sm:inline">Backup</span>
          </button>

          <button
            onClick={() => document.getElementById('restore-db-input')?.click()}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-all shadow-sm whitespace-nowrap"
            title="Restore Database"
          >
            <Upload className="w-3 h-3" />
            <span className="hidden sm:inline">Restore</span>
          </button>
          <input
            type="file"
            id="restore-db-input"
            accept=".zip"
            className="hidden"
            onChange={handleRestore}
          />
        </div>,
        headerNode
      )}

      {files.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center p-6 gap-8 animate-in fade-in duration-500">
          <div className="text-center space-y-2">
            <h2 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-emerald-600">
              Restore your memories
            </h2>
            <p className="text-muted-foreground text-lg max-w-lg mx-auto">
              Upload your black and white photos and let AI bring them back to life.
            </p>
          </div>
          <div className="w-full max-w-2xl">
            <FileUpload onUpload={handleUpload} />
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-row min-h-0">
          {/* Left Sidebar Gallery */}
          <ResizableSidebar>
            <ImageGallery
              files={files}
              selectedFileId={selectedFileId}
              onSelect={setSelectedFileId}
              getObjectUrl={getObjectUrl}
              onRemove={handleRemoveFile}
              onAddMore={() => document.getElementById('hidden-file-input')?.click()}
              colorizedIds={new Set(Object.entries(results).filter(([_, v]) => v && v.length > 0).map(([k]) => k))}
              latestVersions={Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v && v.length > 0 ? v[v.length - 1].resultData : undefined]).filter(([_, v]) => v !== undefined) as [string, string][])}
            />
            <input
              id="hidden-file-input"
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleUpload(Array.from(e.target.files));
              }}
            />
          </ResizableSidebar>

          {/* Main Workspace Area (Colorizer) */}
          <div className="flex-1 min-w-0 p-4 md:p-6 overflow-hidden bg-background">
            {selectedWrapper ? (
              <Colorizer
                key={selectedFileId}
                id={selectedFileId!}
                file={selectedWrapper.file}
                serialNumber={files.findIndex(f => f.id === selectedFileId!) + 1}
                apiKey={apiKey}
                objectUrl={getObjectUrl(selectedFileId!)}
                history={results[selectedFileId!] || []}
                totalSpent={costs[selectedFileId!] || 0}
                initialPrompt={prompts[selectedFileId!]}
                onResult={handleResult}
                onPromptChange={handlePromptChange}
                onFileUpdate={handleFileUpdate}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Select an image
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
export default App;
