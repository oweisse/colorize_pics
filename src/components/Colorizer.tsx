
import React, { useState, useEffect } from 'react';
import { processImageColorization } from '../lib/processing';
import { ComparisonView } from './ComparisonView';
import { Wand2, Download, RefreshCw, ChevronLeft, ChevronRight, History, Pencil, Film } from 'lucide-react';
import GIF from 'gif.js';
import { motion, AnimatePresence } from 'framer-motion';
import type { Version, CostDetails } from '../App';
import { ImageEditor } from './ImageEditor';

interface ColorizerProps {
    id: string;
    file: File;
    serialNumber: number;
    apiKey: string;
    objectUrl: string;
    history: Version[];
    totalSpent?: number;
    initialPrompt?: string;
    onResult: (fileId: string, resultUrl: string, cost?: number, prompt?: string, costDetails?: CostDetails) => void;
    onPromptChange?: (prompt: string) => void;
    onFileUpdate?: (id: string, newFile: File) => void;
}

export const Colorizer: React.FC<ColorizerProps> = ({ id, file, serialNumber, apiKey, objectUrl, history, totalSpent, initialPrompt, onResult, onPromptChange, onFileUpdate }) => {
    // Current Draft Prompt (for new generations)
    const [draftPrompt, setDraftPrompt] = useState(initialPrompt || "Colorize this black and white image realistically. Bring out the natural skin tones and environment colors.");

    // View State
    const [viewIndex, setViewIndex] = useState<number>(-1); // -1 means viewing "Latest" or "Draft" (if no history), else index in history array
    const [isEditing, setIsEditing] = useState(false);

    // Derived state for what we are showing
    const showingVersion = (viewIndex >= 0 && viewIndex < history.length) ? history[viewIndex] : null;

    useEffect(() => {
        if (history.length > 0) {
            setViewIndex(history.length - 1);
        } else {
            setViewIndex(-1);
        }
    }, [history.length, id]); // Reset when file changes (id)

    // Sync draft prompt when new file loaded
    useEffect(() => {
        if (initialPrompt !== undefined) {
            setDraftPrompt(initialPrompt);
        } else {
            setDraftPrompt("Colorize this black and white image realistically. Bring out the natural skin tones and environment colors.");
        }
    }, [id, initialPrompt]);

    const [modelId, setModelId] = useState("gemini-3.1-flash-image-preview");
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cost, setCost] = useState<CostDetails | null>(null);

    // Determine what cost details to show
    // If viewing history: use version's costDetails
    // If viewing active/latest and we have a current run 'cost' state: use that
    // Fallback: if history has no costDetails (legacy), we use displayedCost (number) and show fallback UI
    const showingCostDetails = showingVersion ? showingVersion.costDetails : cost;
    const displayedCost = showingVersion ? showingVersion.cost : cost?.total;

    const handleColorize = async () => {
        if (!apiKey) {
            setError("Please enter your API Key first.");
            return;
        }

        setIsProcessing(true);
        setError(null);
        setCost(null);

        try {
            const result = await processImageColorization(
                file,
                apiKey,
                draftPrompt,
                modelId,
                objectUrl
            );

            setCost(result.costDetails || null);
            onResult(id, result.imageUrl, result.cost, result.prompt, result.costDetails);

        } catch (err: any) {
            setError(err.message || "Failed to colorize");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownload = () => {
        if (showingVersion) {
            const a = document.createElement('a');
            a.href = showingVersion.resultData;
            a.download = `#${serialNumber}-colorized-${file.name.replace(/\.[^/.]+$/, "")}-v${viewIndex + 1}.jpg`;
            a.click();
        }
    };

    const [isGeneratingGif, setIsGeneratingGif] = useState(false);
    const [gifHoldTime, setGifHoldTime] = useState(2.0);
    const [gifTransitionTime, setGifTransitionTime] = useState(1.5);

    const handleSaveGif = async () => {
        if (!showingVersion) return;
        setIsGeneratingGif(true);

        try {
            const width = 400; // Reasonable width for GIF file size

            // Load images
            const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            });

            const [imgOriginal, imgColorized] = await Promise.all([
                loadImage(objectUrl),
                loadImage(showingVersion.resultData)
            ]);

            // Calculate dimensions maintaining aspect ratio
            const scale = width / imgOriginal.width;
            const height = imgOriginal.height * scale;

            const gif = new GIF({
                workers: 2,
                quality: 10,
                width,
                height,
                workerScript: '/gif.worker.js'
            });

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) throw new Error("No canvas context");

            // Helper to draw frame
            const drawWipe = (progress: number, direction: 'reveal-bw' | 'reveal-color') => {
                // Linear Easing (Equal gaps)
                const ease = progress;
                const splitX = width * ease;

                if (direction === 'reveal-bw') {
                    // Start full Color, reveal BW from left
                    // Draw Colorized (Base)
                    ctx.drawImage(imgColorized, 0, 0, width, height);

                    // Draw Original (Clipped Left)
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(0, 0, splitX, height);
                    ctx.clip();
                    ctx.drawImage(imgOriginal, 0, 0, width, height);
                    ctx.restore();

                    // Draw Line
                    ctx.beginPath();
                    ctx.moveTo(splitX, 0);
                    ctx.lineTo(splitX, height);
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                } else {
                    // Start full BW, reveal Color from Left
                    // Draw Original (Base)
                    ctx.drawImage(imgOriginal, 0, 0, width, height);

                    // Draw Colorized (Clipped Left)
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(0, 0, splitX, height);
                    ctx.clip();
                    ctx.drawImage(imgColorized, 0, 0, width, height);
                    ctx.restore();

                    // Draw Line
                    ctx.beginPath();
                    ctx.moveTo(splitX, 0);
                    ctx.lineTo(splitX, height);
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            };

            // 1. Hold Colorized
            ctx.drawImage(imgColorized, 0, 0, width, height);
            gif.addFrame(ctx, { copy: true, delay: gifHoldTime * 1000 });

            const transitionFrames = 10;
            const frameDelay = (gifTransitionTime * 1000) / transitionFrames;

            // 2. Transition 1: Color -> BW (Wipe to reveal BW)
            for (let i = 0; i <= transitionFrames; i++) {
                drawWipe(i / transitionFrames, 'reveal-bw');
                gif.addFrame(ctx, { copy: true, delay: frameDelay });
            }

            // 3. Transition 2: BW -> Color (Wipe to reveal Color)
            for (let i = 0; i <= transitionFrames; i++) {
                drawWipe(i / transitionFrames, 'reveal-color');
                gif.addFrame(ctx, { copy: true, delay: frameDelay });
            }

            // End: Ensure final Clean Colorized frame for loop smoothness? 
            // The last frame of Transition 2 is technically full color with line at end.
            // Let's draw clean colorized one last time for a minimal moment so loop feels right back to start Hold.
            ctx.drawImage(imgColorized, 0, 0, width, height);
            gif.addFrame(ctx, { copy: true, delay: 100 }); // short pause before loop

            gif.on('finished', (blob) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `#${serialNumber}-transition-${file.name.replace(/\.[^/.]+$/, "")}-v${viewIndex + 1}.gif`;
                a.click();
                setIsGeneratingGif(false);
            });

            gif.render();

        } catch (e: any) {
            console.error(e);
            setError("Failed to generate GIF: " + (e.message || "Unknown error"));
            setIsGeneratingGif(false);
        }
    };

    const handleSaveEdit = (newImageBlob: Blob) => {
        const newFile = new File([newImageBlob], file.name, { type: file.type, lastModified: Date.now() });
        onFileUpdate?.(id, newFile);
        setIsEditing(false);
        // Reset view to draft to show new image
        setViewIndex(-1);
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 items-stretch h-full">
            {isEditing && (
                <ImageEditor
                    imageSrc={objectUrl}
                    onCancel={() => setIsEditing(false)}
                    onSave={handleSaveEdit}
                    apiKey={apiKey}
                />
            )}

            {/* Main Content Area */}
            <div className="flex-1 min-w-0 relative rounded-xl overflow-hidden border border-border shadow-sm bg-muted/5 flex flex-col justify-center group">
                <AnimatePresence mode="wait">
                    {showingVersion ? (
                        <motion.div
                            key={viewIndex}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="relative w-full h-full flex flex-col"
                        >
                            {/* Version Navigation & Actions Overlay */}
                            <div className="absolute top-4 left-4 right-4 z-10 flex justifying-between items-start pointer-events-none">
                                <div className="bg-black/50 backdrop-blur text-white/90 px-3 py-1.5 rounded-full text-xs font-mono border border-white/10 pointer-events-auto flex items-center gap-2">
                                    <History className="w-3 h-3" />
                                    <span>V{viewIndex + 1} / {history.length}</span>
                                </div>
                                <div className="flex-1"></div>
                                <div className="flex gap-2 pointer-events-auto">
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="bg-background/80 backdrop-blur text-sm flex items-center gap-2 text-foreground hover:text-primary px-3 py-1.5 rounded-md border border-border shadow-sm transition-all hover:scale-105"
                                        title="Edit Original"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <div className="flex items-center gap-1.5 bg-background/50 border border-border rounded-md px-2 py-1 mr-2 backdrop-blur">
                                        <div className="flex items-center gap-1">
                                            <span className="text-[10px] uppercase text-muted-foreground font-bold">Hold</span>
                                            <input
                                                type="number"
                                                min="0.5"
                                                max="10"
                                                step="0.5"
                                                value={gifHoldTime}
                                                onChange={e => setGifHoldTime(Number(e.target.value))}
                                                className="w-8 h-4 bg-transparent text-xs text-center border-b border-white/20 focus:border-primary outline-none"
                                            />
                                            <span className="text-[10px] text-muted-foreground">s</span>
                                        </div>
                                        <div className="w-px h-3 bg-white/10 mx-1"></div>
                                        <div className="flex items-center gap-1">
                                            <span className="text-[10px] uppercase text-muted-foreground font-bold">Trans</span>
                                            <input
                                                type="number"
                                                min="0.5"
                                                max="10"
                                                step="0.5"
                                                value={gifTransitionTime}
                                                onChange={e => setGifTransitionTime(Number(e.target.value))}
                                                className="w-8 h-4 bg-transparent text-xs text-center border-b border-white/20 focus:border-primary outline-none"
                                            />
                                            <span className="text-[10px] text-muted-foreground">s</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleSaveGif}
                                        disabled={isGeneratingGif}
                                        className="bg-background/80 backdrop-blur text-sm flex items-center gap-2 text-primary hover:text-primary/80 px-3 py-1.5 rounded-md border border-border shadow-sm transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isGeneratingGif ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                                        {isGeneratingGif ? "Generating..." : "GIF"}
                                    </button>
                                    <button onClick={handleDownload} className="bg-background/80 backdrop-blur text-sm flex items-center gap-2 text-primary hover:text-primary/80 px-3 py-1.5 rounded-md border border-border shadow-sm transition-all hover:scale-105">
                                        <Download className="w-4 h-4" /> Save
                                    </button>
                                </div>
                            </div>

                            {/* Nav Buttons */}
                            {history.length > 1 && (
                                <>
                                    <button
                                        disabled={viewIndex <= 0}
                                        onClick={() => setViewIndex(v => v - 1)}
                                        className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-background/50 hover:bg-background/80 backdrop-blur border border-border shadow-lg transition-all disabled:opacity-0 pointer-events-auto"
                                    >
                                        <ChevronLeft className="w-6 h-6" />
                                    </button>
                                    <button
                                        disabled={viewIndex >= history.length - 1}
                                        onClick={() => setViewIndex(v => v + 1)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-background/50 hover:bg-background/80 backdrop-blur border border-border shadow-lg transition-all disabled:opacity-0 pointer-events-auto"
                                    >
                                        <ChevronRight className="w-6 h-6" />
                                    </button>
                                </>
                            )}

                            <ComparisonView originalUrl={objectUrl} processedUrl={showingVersion.resultData} />
                        </motion.div>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-8 relative">
                            <div className="absolute top-4 right-4 z-10">
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="bg-background/80 backdrop-blur text-sm flex items-center gap-2 text-foreground hover:text-primary px-3 py-1.5 rounded-md border border-border shadow-sm transition-all hover:scale-105"
                                >
                                    <Pencil className="w-4 h-4" /> Edit Image
                                </button>
                            </div>
                            <div className="mb-6 relative">
                                <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
                                <img src={objectUrl} className="relative max-h-[60vh] object-contain opacity-80 grayscale rounded-lg shadow-xl" alt="Preview" />
                            </div>
                            <p className="text-lg font-medium">Ready to colorize</p>
                            <p className="text-sm opacity-60">Configure settings and click "Colorize"</p>
                        </div>
                    )}
                </AnimatePresence>
                <div className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-[2px] text-white/90 text-2xl font-mono px-3 py-1.5 rounded-md pointer-events-none z-20 shadow-sm">
                    #{serialNumber}
                </div>
            </div>
            {/* Sidebar Controls */}
            <div className="w-full lg:w-80 shrink-0 flex flex-col h-full min-h-0 overflow-y-auto">
                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-5">

                    {/* Instructions - Shows Draft OR History Prompt */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {showingVersion && viewIndex !== history.length - 1 ? `Prompt (V${viewIndex + 1})` : "Prompt (Draft)"}
                            </label>
                            {showingVersion && viewIndex !== history.length - 1 && (
                                <button
                                    onClick={() => {
                                        if (showingVersion.prompt) {
                                            setDraftPrompt(showingVersion.prompt);
                                            onPromptChange?.(showingVersion.prompt);
                                            // Jump to latest so user can regenerate
                                            setViewIndex(history.length - 1);
                                        }
                                    }}
                                    className="text-[10px] text-primary hover:underline cursor-pointer"
                                >
                                    Restore
                                </button>
                            )}
                        </div>
                        <textarea
                            value={(showingVersion && viewIndex !== history.length - 1) ? (showingVersion.prompt || "") : draftPrompt}
                            onChange={(e) => {
                                if (showingVersion && viewIndex !== history.length - 1) return; // Read only for old versions
                                const newPrompt = e.target.value;
                                setDraftPrompt(newPrompt);
                                onPromptChange?.(newPrompt);
                            }}
                            readOnly={!!(showingVersion && viewIndex !== history.length - 1)}
                            className={`w-full bg-background border border-input rounded-lg p-3 text-sm focus:ring-1 focus:ring-primary focus:border-primary transition-all resize-none h-24 ${showingVersion && viewIndex !== history.length - 1 ? 'opacity-70 bg-muted/20' : ''}`}
                            placeholder="Describe how to colorize..."
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground">Model</label>
                        <input
                            type="text"
                            value={modelId}
                            onChange={(e) => setModelId(e.target.value)}
                            className="w-full bg-background border border-input rounded-lg p-2 text-sm"
                            placeholder="e.g. gemini-3-pro-image-preview"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                            Using "gemini-3.1-flash-image-preview" is recommended for best results.
                        </p>
                    </div>

                    <button
                        onClick={handleColorize}
                        disabled={isProcessing}
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
                    >
                        {isProcessing ? <RefreshCw className="animate-spin w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
                        {isProcessing ? "Generating..." : "Colorize Photo"}
                    </button>

                    {totalSpent !== undefined && totalSpent > 0 && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-xs flex justify-between items-center text-emerald-700">
                            <span className="font-semibold uppercase tracking-wider opacity-80 pb-0">History Total</span>
                            <span className="font-bold text-sm">${totalSpent.toFixed(4)}</span>
                        </div>
                    )}

                    {/* Show Cost of Viewed Item */}
                    {/* Show Cost of Viewed Item */}
                    {(showingCostDetails || displayedCost !== undefined) && (
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs space-y-2 animate-in fade-in slide-in-from-top-2">
                            <div className="flex justify-between font-medium items-center border-b border-primary/10 pb-2">
                                <span>{showingVersion ? `Cost (V${viewIndex + 1})` : "Estimated Cost"}</span>
                                <span className="text-primary text-sm">${(showingCostDetails?.total ?? displayedCost)?.toFixed(4)}</span>
                            </div>

                            {showingCostDetails ? (
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground p-1">
                                    <div className="col-span-2 font-medium text-foreground/80 mb-0.5 mt-1">Input (Prompt)</div>
                                    <div className="truncate">Tokens: <span className="font-mono">{showingCostDetails.inputTokens}</span></div>
                                    <div className="truncate">Rate: <span className="font-mono">${showingCostDetails.inputRate}/1M</span></div>
                                    <div className="col-span-2 text-right text-primary/70 border-b border-dashed border-border/50 pb-1 mb-1 justify-end flex">
                                        =${showingCostDetails.input.toFixed(5)}
                                    </div>

                                    <div className="col-span-2 font-medium text-foreground/80 mb-0.5">Output (Generation)</div>
                                    <div className="truncate">Tokens: <span className="font-mono">{showingCostDetails.outputTokens}</span></div>
                                    <div className="truncate">Rate: <span className="font-mono">${showingCostDetails.outputRate}/1M</span></div>
                                    <div className="col-span-2 text-right text-primary/70 justify-end flex">
                                        =${showingCostDetails.output.toFixed(5)}
                                    </div>
                                </div>
                            ) : (
                                /* Fallback if history lacks details */
                                <div className="text-[10px] text-muted-foreground italic text-center py-1">
                                    Detailed breakdown not available for this version.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {error && (
                    <div className="mt-4 bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-xl text-xs leading-relaxed shrink-0">
                        <strong>Error:</strong> {error}
                    </div>
                )}
            </div>
        </div>
    );
};
