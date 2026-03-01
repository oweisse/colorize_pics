import React, { useState, useRef, useEffect } from 'react';
import ReactCrop, {
    centerCrop,
    makeAspectCrop,
    type Crop,
    type PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { rotateSize } from '../lib/imageUtils';
import { X, Check, RotateCw, Ratio, Sparkles, Loader2 } from 'lucide-react';
import { analyzeImageForEdit } from '../lib/gemini';

interface ImageEditorProps {
    imageSrc: string;
    onCancel: () => void;
    onSave: (newImageBlob: Blob) => void;
    apiKey: string;
}

// Helper for initial aspect crop
function centerAspectCrop(
    mediaWidth: number,
    mediaHeight: number,
    aspect: number,
) {
    return centerCrop(
        makeAspectCrop(
            {
                unit: '%',
                width: 90,
            },
            aspect,
            mediaWidth,
            mediaHeight,
        ),
        mediaWidth,
        mediaHeight,
    )
}

function getRadianAngle(degreeValue: number) {
    return (degreeValue * Math.PI) / 180
}

export const ImageEditor: React.FC<ImageEditorProps> = ({ imageSrc, onCancel, onSave, apiKey }) => {
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const [rotation, setRotation] = useState(0);
    const [aspect, setAspect] = useState<number | undefined>(undefined);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);

    // Load image object once
    useEffect(() => {
        const img = new Image();
        img.src = imageSrc;
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            setImage(img);
        };
    }, [imageSrc]);

    // Draw rotated image to canvas whenever rotation or image changes
    useEffect(() => {
        if (!image || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Calculate bounding box of rotated image
        const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.naturalWidth, image.naturalHeight, rotation);

        // Set canvas size to match full res bbox
        canvas.width = bBoxWidth;
        canvas.height = bBoxHeight;

        // Clear and draw
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
        ctx.rotate(getRadianAngle(rotation));
        ctx.translate(-image.naturalWidth / 2, -image.naturalHeight / 2);
        ctx.drawImage(image, 0, 0);
        ctx.restore();

        // If we just loaded/rotated and have no crop or active aspect, initialize center crop
        if (!crop && !isAnalyzing) { // Don't reset if analyzing
            const initialCrop = centerAspectCrop(bBoxWidth, bBoxHeight, aspect || (bBoxWidth / bBoxHeight));
            // If free aspect, just 90%
            if (!aspect) {
                setCrop({
                    unit: '%',
                    width: 90,
                    height: 90,
                    x: 5,
                    y: 5
                });
            } else {
                setCrop(initialCrop);
            }
        }

    }, [image, rotation]);


    const handleSave = async () => {
        try {
            if (image && completedCrop && canvasRef.current) {
                if (crop?.unit !== '%') {
                    // handled by logic below relying on canvas scaling
                }

                // const bBox = rotateSize(image.naturalWidth, image.naturalHeight, rotation);

                // We can use the canvasRef.current.width (which IS the bBox width)
                const canvas = canvasRef.current;

                // Calculate scale of visual vs intrinsic
                const scaleX = canvas.width / canvas.offsetWidth;
                const scaleY = canvas.height / canvas.offsetHeight;

                const pixelCrop = {
                    x: completedCrop.x * scaleX,
                    y: completedCrop.y * scaleY,
                    width: completedCrop.width * scaleX,
                    height: completedCrop.height * scaleY
                };

                const destCanvas = document.createElement('canvas');
                destCanvas.width = pixelCrop.width;
                destCanvas.height = pixelCrop.height;
                const destCtx = destCanvas.getContext('2d');
                if (!destCtx) return;

                destCtx.drawImage(
                    canvas,
                    pixelCrop.x,
                    pixelCrop.y,
                    pixelCrop.width,
                    pixelCrop.height,
                    0,
                    0,
                    pixelCrop.width,
                    pixelCrop.height
                );

                destCanvas.toBlob((blob) => {
                    if (blob) onSave(blob);
                }, 'image/jpeg', 0.95);

            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleAutoFix = async () => {
        console.log("Auto Fix initiated"); // Log start
        if (!apiKey) {
            console.warn("Auto Fix aborted: No API Key");
            alert("No API Key found. Please add your Gemini API Key in the settings.");
            return;
        }
        if (isAnalyzing) {
            console.log("Auto Fix aborted: Already analyzing");
            return;
        }

        setIsAnalyzing(true);
        try {
            console.log("Fetching image blob...");
            // Get base64
            const response = await fetch(imageSrc);
            const blob = await response.blob();
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
            console.log("Image converted to base64. Calling Gemini...");

            const result = await analyzeImageForEdit(apiKey, base64);
            console.log("Gemini response:", result);

            if (result.rotation !== undefined) {
                // Ensure rotation is normalized to 0-360
                const r = result.rotation % 360;
                setRotation(r);
                console.log("Rotation set to:", r);
            }

            if (result.crop) {
                // Convert ymin/xmin/ymax/xmax (0-100 probably, need to check prompt) to x,y,w,h %
                // Prompt asked for 0-100 percentage.
                // Depending on response, it might be 0-1 (normalized) or 0-100. Assume prompt followed (0-100 percentage).
                // But Gemini sometimes returns 0-1000 for bounding boxes.
                // Let's protect check.
                let { ymin, xmin, ymax, xmax } = result.crop;
                console.log("Raw crop from Gemini:", { ymin, xmin, ymax, xmax });

                // Heuristic: if any value > 100, assume 1000 scale. If all <= 1, assume 0-1 scale.
                const values = [ymin, xmin, ymax, xmax];
                const maxVal = Math.max(...values);

                if (maxVal <= 1) {
                    // 0-1 scale
                    ymin *= 100; xmin *= 100; ymax *= 100; xmax *= 100;
                } else if (maxVal > 100) {
                    // 1000 scale
                    ymin /= 10; xmin /= 10; ymax /= 10; xmax /= 10;
                }

                console.log("Applying crop:", { ymin, xmin, ymax, xmax });

                setCrop({
                    unit: '%',
                    x: xmin,
                    y: ymin,
                    width: xmax - xmin,
                    height: ymax - ymin
                });
            }

        } catch (e: any) {
            console.error("Auto fix failed", e);
            alert("Auto Fix Failed: " + (e.message || "Unknown error"));
        } finally {
            setIsAnalyzing(false);
        }
    };

    // When aspect changes, update crop
    const handleAspectChange = (newAspect: number | undefined) => {
        setAspect(newAspect);

        if (canvasRef.current) {
            const { width, height } = canvasRef.current; // Intrinsic size (BBox)
            if (newAspect) {
                setCrop(centerAspectCrop(width, height, newAspect));
            } else {
                // Keep current crop but unlock aspect
                // No need to update crop state, aspect prop handles it
            }
        }
    }


    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 z-10 bg-black/50 backdrop-blur-md">
                <h2 className="font-semibold text-lg">Edit Image</h2>
                <div className="flex gap-2">
                    <button
                        onClick={onCancel}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        title="Cancel"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-full font-medium transition-all"
                    >
                        <Check className="w-4 h-4" /> Save
                    </button>
                </div>
            </div>

            {/* Main Area */}
            <div className="relative flex-1 bg-black/80 flex items-center justify-center overflow-auto p-4 md:p-8">
                <ReactCrop
                    crop={crop}
                    onChange={(_, percentCrop) => setCrop(percentCrop)}
                    onComplete={(c) => setCompletedCrop(c)}
                    aspect={aspect}
                    className="max-h-[70vh]" // Limit crop container height
                >
                    <canvas
                        ref={canvasRef}
                        style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
                    />
                </ReactCrop>
            </div>

            {/* Controls */}
            <div className="p-6 bg-black/50 backdrop-blur-md border-t border-white/10 space-y-6 max-w-2xl mx-auto w-full pb-12 md:pb-6">

                {/* Auto Fix Button */}
                <div className="flex justify-end">
                    <button
                        onClick={handleAutoFix}
                        disabled={isAnalyzing || !apiKey}
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/30 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                        title="Auto-detect rotation and crop"
                    >
                        {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Auto Fix
                    </button>
                </div>

                {/* Rotation */}
                <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium text-white/50 uppercase tracking-wider">
                        <span className="flex items-center gap-1"><RotateCw className="w-3 h-3" /> Rotate</span>
                        <span>{rotation}°</span>
                    </div>
                    <input
                        type="range"
                        value={rotation}
                        min={0}
                        max={360}
                        step={1}
                        aria-labelledby="Rotation"
                        onChange={(e) => setRotation(Number(e.target.value))}
                        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer range-sm accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-white/40 px-1">
                        <span>0°</span>
                        <span>90°</span>
                        <span>180°</span>
                        <span>270°</span>
                        <span>360°</span>
                    </div>
                </div>

                {/* Aspect Ratios */}
                <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium text-white/50 uppercase tracking-wider">
                        <span className="flex items-center gap-1"><Ratio className="w-3 h-3" /> Aspect Ratio</span>
                    </div>
                    <div className="flex gap-2 text-xs overflow-x-auto pb-2 scrollbar-none">
                        <button
                            onClick={() => handleAspectChange(undefined)}
                            className={`px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap ${aspect === undefined ? 'bg-white text-black border-white' : 'bg-transparent border-white/20 text-white/70 hover:bg-white/10'}`}
                        >
                            Free
                        </button>
                        <button
                            onClick={() => handleAspectChange(1)}
                            className={`px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap ${aspect === 1 ? 'bg-white text-black border-white' : 'bg-transparent border-white/20 text-white/70 hover:bg-white/10'}`}
                        >
                            Square (1:1)
                        </button>
                        <button
                            onClick={() => handleAspectChange(4 / 3)}
                            className={`px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap ${aspect === 4 / 3 ? 'bg-white text-black border-white' : 'bg-transparent border-white/20 text-white/70 hover:bg-white/10'}`}
                        >
                            4:3
                        </button>
                        <button
                            onClick={() => handleAspectChange(16 / 9)}
                            className={`px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap ${aspect === 16 / 9 ? 'bg-white text-black border-white' : 'bg-transparent border-white/20 text-white/70 hover:bg-white/10'}`}
                        >
                            16:9
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};
