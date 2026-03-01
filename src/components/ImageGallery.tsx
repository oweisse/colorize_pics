import React from 'react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { Plus, X } from 'lucide-react';

interface ImageGalleryProps {
    files: { id: string; file: File }[];
    selectedFileId: string | null;
    onSelect: (fileId: string) => void;
    getObjectUrl: (id: string) => string;
    onRemove?: (fileId: string) => void;
    onAddMore?: () => void;
    colorizedIds?: Set<string>;
    latestVersions?: Record<string, string>;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({ files, selectedFileId, onSelect, getObjectUrl, onRemove, onAddMore, colorizedIds, latestVersions }) => {
    // If empty loop? Usually handled by parent checking length, but let's render empty state if passed.

    return (
        <div className="h-full overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {/* Grid Layout: 3 columns specifically requested "Say, 3 photos per row", but responsive is better. 
                 Using minmax to ensure they don't get too tiny. 
                 If sidebar is ~280px, 3 cols = ~90px minus gaps. 
                 gap-2 = 8px. 3 cols * x + 2 * 8 = 280-padding.
             */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pb-10">
                {files.map((item, index) => {
                    const { id } = item;
                    const isSelected = selectedFileId === id;
                    const isColorized = colorizedIds?.has(id);
                    // Use latest colorized version if available, otherwise original
                    const url = (latestVersions && latestVersions[id]) ? latestVersions[id] : getObjectUrl(id);

                    return (
                        <motion.div
                            key={id}
                            layout
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={clsx(
                                "relative aspect-square rounded-md overflow-hidden cursor-pointer group transition-all shadow-sm",
                                // Selection overrides everything with a clear primary ring
                                isSelected ? "ring-2 ring-primary ring-offset-1 z-10" : "hover:ring-2 hover:ring-primary/50 hover:ring-offset-1",
                                // Rainbow frame for colorized items (if not selected? or add to it?)
                                // Let's use a gradient border via a pseudo-element or container if easier.
                                // Or simpler: ring with gradient color? Tailwind verify.
                                // Simplest robust way: wrapper div with padding and background gradient.
                                isColorized && !isSelected ? "p-1 bg-gradient-to-br from-red-500 via-yellow-500 via-green-500 via-blue-500 to-purple-500" : "border-2 border-transparent"
                            )}
                            onClick={() => onSelect(id)}
                        >
                            <div className={clsx("w-full h-full rounded-[4px] overflow-hidden bg-background", isColorized && !isSelected ? "" : "")}>
                                <img
                                    src={url}
                                    alt="Thumbnail"
                                    className={clsx(
                                        "w-full h-full object-cover transition-all duration-300",
                                        isSelected || isColorized ? "" : "grayscale group-hover:grayscale-0",
                                        "scale-100 group-hover:scale-110"
                                    )}
                                />
                                <div className="absolute bottom-1 right-1 bg-black/40 backdrop-blur-[2px] text-white/90 text-lg font-mono px-2 py-1 rounded-sm pointer-events-none">
                                    #{index + 1}
                                </div>
                            </div>
                            {onRemove && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemove(id);
                                    }}
                                    className="absolute top-1 right-1 bg-black/60 hover:bg-destructive text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Remove"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </motion.div>
                    );
                })}

                {onAddMore && (
                    <button
                        onClick={onAddMore}
                        className="aspect-square rounded-md border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5 flex flex-col items-center justify-center text-muted-foreground/50 hover:text-primary transition-all gap-1"
                        title="Add more photos"
                    >
                        <Plus className="w-5 h-5" />
                        <span className="text-[10px] font-medium uppercase tracking-wider">Add</span>
                    </button>
                )}
            </div>
        </div>
    );
};
